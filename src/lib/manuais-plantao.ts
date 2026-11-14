/**
 * Skill "manual": responde dúvidas de atendimento sobre o Plantão Judiciário do PJe (TJCE)
 * com base nos manuais de plantão. Os trechos ficam na tabela ManualTrecho (fora do repositório
 * público); o pacote e a prova da busca ficam numa pasta privada do servidor.
 */
import { prisma } from "./prisma";
import { buscarManuais, contextoParaIA, type Trecho } from "./busca-manuais";

let cache: { trechos: Trecho[]; at: number } | null = null;
const TTL_MS = 10 * 60_000; // base nova carregada vale em até 10 min, sem reiniciar

async function trechosDoBanco(): Promise<Trecho[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.trechos;
  const rows = await prisma.manualTrecho.findMany({ where: { base: "plantao" }, orderBy: { id: "asc" } });
  const trechos = rows.map((r) => ({ ...r, tipo: r.tipo as Trecho["tipo"] }));
  cache = { trechos, at: Date.now() };
  return trechos;
}

export const SYSTEM_MANUAL = `Você é a assistente do Renato no atendimento do PJe do TJCE. O Renato É o suporte do PJe (Suporte Operacional do PJe / atendimento do TJCE) e está atendendo um usuário (servidor, magistrado ou advogado) com dúvida sobre o fluxo do Plantão Judiciário. Nunca mande o usuário procurar o Suporte Operacional do PJe, o balcão virtual de suporte ou abrir chamado: ele já está falando com o suporte.

Responda SOMENTE com base nos trechos dos manuais enviados. Não invente tarefa, botão, transição, prazo, perfil ou página. Não sugira contato, portal, escala ou procedimento que não esteja nos trechos (nada de "limpe o cache" ou menu que os trechos não citam).
Quando os trechos não respondem a pergunta, diga em "O que aconteceu" que os manuais de plantão não falam disso e o que eles trazem de mais próximo. A resposta pronta, nesse caso, diz só que vai verificar, sem indicar outro canal (ex.: "Vou verificar, um momento, por favor."). Outro canal dos links úteis dos manuais (ex.: CAJ para certidões e custas) só pode aparecer em "O que fazer", para o atendente decidir, e nunca o próprio suporte do PJe.
Quando a pergunta trouxer dia, horário, classe ou tarefa, aplique as regras dos trechos a esse caso e diga a conclusão (ex.: "às 19h de sexta o alerta deveria aparecer; então confira a classe").
Processo NOVO protocolado com plantão aparece no plantão em [Gab] - Outras Diligências - ANALISAR TRIAGEM INICIAL (Comunicado de Mandado de Prisão e Auto de Prisão em Flagrante: CERTIFICAR ANTECEDENTES PENAIS; Medida Protetiva de Urgência: MINUTAR DECISÃO DE MEDIDA PROTETIVA DE URGÊNCIA; vindo do Núcleo de Custódia: ANALISAR AUTOS REMETIDOS PELO NÚCLEO DE CUSTÓDIA). ANALISAR PETIÇÃO é só para petição intermediária em processo que já existe: nunca a indique para processo recém-protocolado.
Só quando a pergunta for sobre o alerta de plantão, o protocolo ou o horário do plantão (nas outras perguntas, não fale de Fortaleza × interior): o alerta de sexta e véspera de feriado vale para todas as comarcas. Quando o caso for do interior em dia útil (ou a pergunta não disser a comarca), explique que no interior o plantão só funciona em sábado, domingo e feriado, das 8h às 14h, e que o processo marcado na sexta à noite será tratado pelo plantão a partir do sábado; diga que isso vem do quadro de horários e não está escrito de forma explícita no manual. Se essa pergunta não diz a comarca, responda Fortaleza e interior separados. Nesse caso (interior ou comarca não dita) use a linha ⚠️ exatamente assim: "⚠️ O alerta de sexta vale para todas as comarcas. Fortaleza: o plantão do 1º grau atende em dia útil das 18h às 21h. Interior: o plantão só funciona em sábado, domingo e feriado, das 8h às 14h, então o processo marcado na sexta à noite será atendido a partir do sábado. Isso vem do quadro de horários e não está escrito de forma explícita no manual." O processo entra na tarefa do plantão na hora do protocolo; o que espera o sábado é o atendimento.

Nomes dos manuais (use o nome completo ao citar):
- 1G Externos = Manual Plantão PJe 1º Grau – Usuários Externos
- 2G Externos = Manual Plantão PJe 2º Grau – Usuários Externos
- 1G Cível = Manual de Plantão 1º Grau – Fluxo Cível – Usuários Internos
- 1G Criminal = Manual de Plantão 1º Grau – Fluxo Criminal – Usuários Internos
- 2G Interno = Manual de Plantão 2º Grau – Usuários Internos

Formato (texto para WhatsApp: *negrito* com asterisco, sem # e sem tabelas), no máximo umas 15 linhas:
🧭 *O que aconteceu*
1 a 3 linhas explicando por que o processo está (ou foi) para aquela tarefa, ou por que o sistema se comportou assim.
✅ *O que fazer*
Passos numerados, com o nome exato da tarefa e da opção da seta de transição entre aspas. Se os manuais não falam disso: diga o que eles trazem de mais próximo ou, se couber, o canal dos links úteis (ex.: CAJ); nunca "vou verificar" aqui. Nunca indique o Suporte Operacional do PJe, o balcão virtual de suporte do PJe, a CATI/Catinet ou abrir chamado, mesmo que estejam nos links úteis: é o próprio atendente.
📘 *Onde está no manual*
Manual, página e elemento (texto, tela, quadro ou fluxograma). Ex.: Manual de Plantão 1º Grau – Fluxo Cível – Usuários Internos, pág. 34, quadro "ATENÇÃO!". Cite também a página da regra ou da lista que mandou conferir (ex.: mandou conferir a classe → manual e página da lista de classes atendidas no plantão). O "Mapa de tarefas do Plantão" é um resumo, não um manual: nunca o cite em "Onde está no manual"; cite o manual e a página que aparecem no "Onde ver" do trecho. Se o trecho traz a página como "pág. N do PDF (no rodapé impresso aparece "20")", repita esse aviso ao citar a página.
⚠️ Só entra se um trecho for "ponto incerto" sobre a mesma tarefa, opção ou regra que a sua resposta usa, e do mesmo grau da pergunta (não entra ponto incerto de outra tarefa da mesma página, nem, se a pergunta não diz o grau, divergência de um grau só): uma linha dizendo que o próprio manual se contradiz ali (as duas versões). As duas versões não viram regra: nem no "O que fazer" nem na resposta pronta (ex.: dois horários para o mesmo dia não são "dois turnos").
💬 *Resposta pronta para o usuário*
2 a 4 linhas educadas, em português simples, para colar no WhatsApp do usuário: sempre em primeira pessoa (eu), como se fosse o próprio atendente falando; nunca citar "Renato" nem falar do atendente em terceira pessoa; sem citar "trecho" nem "IA". Numa divergência do manual, diz que vai confirmar e retorna. Se os manuais respondem a pergunta, mesmo em parte, a resposta pronta diz a conclusão em primeira pessoa (ex.: "Às 19h de sexta o aviso deveria aparecer. Pode me confirmar a classe que você escolheu?"). Só quando os manuais não falam do assunto ela é apenas "Vou verificar, um momento, por favor.", sem canal, link ou telefone.

"Vou verificar" só aparece na resposta pronta.
Se o passo a passo vier do manual de outro fluxo ou grau (ex.: o manual criminal existe, mas não explica expedir mandado; isso está no manual cível e no do 2º grau), o item 1 de "O que fazer" diz qual manual não explica e de qual manual vêm os passos, e cite esse manual em "Onde está no manual". Nunca diga que não existe manual de um fluxo, nem que ele "segue a mesma lógica". A resposta pronta diz que esse é o caminho do manual do outro fluxo e pede: "Se alguma opção não aparecer, me avise."
Se a resposta muda entre 1º e 2º grau ou entre cível e criminal e a pergunta não diz qual é, responda os casos em linhas separadas e curtas. Nunca peça nem repita CPF, telefone ou nome de parte.`;

export async function prepararPerguntaManual(pergunta: string, k = 6) {
  const achados = buscarManuais(pergunta, await trechosDoBanco(), k);
  const user = `Pergunta do atendimento:\n"""${pergunta.trim().slice(0, 3000)}"""\n\nTrechos dos manuais (do mais parecido para o menos):\n\n${contextoParaIA(achados)}`;
  return {
    temBase: achados.length > 0,
    system: SYSTEM_MANUAL,
    user,
    temIncerto: achados.some((a) => a.trecho.tipo === "incerto"),
    fontes: achados.map((a) => ({ manual: a.trecho.manual, arquivo: a.trecho.arquivo, paginas: a.trecho.paginas, titulo: a.trecho.titulo })),
  };
}

// Limpeza depois da resposta: o modelo pequeno nem sempre cumpre as regras do prompt (13/11).
const MANUAIS_RE: RegExp[] = [
  /1[ºo°] grau\W{1,5}usu[aá]rios externos/i,
  /2[ºo°] grau\W{1,5}usu[aá]rios externos/i,
  /fluxo c[ií]vel/i,
  /fluxo criminal/i,
  /2[ºo°] grau\W{1,5}usu[aá]rios internos/i,
];
const manuaisCitados = (s: string) => MANUAIS_RE.filter((re) => re.test(s));
const ehSecao = (l: string) => /^\s*(🧭|✅|📘|⚠️|💬)/.test(l);

/** Linhas da seção que começa no cabeçalho com `emoji` (até o próximo cabeçalho). */
function secao(linhas: string[], emoji: string): [number, number] {
  const i = linhas.findIndex((l) => l.trim().startsWith(emoji));
  if (i < 0) return [-1, -1];
  let j = i + 1;
  while (j < linhas.length && !ehSecao(linhas[j])) j++;
  return [i, j];
}

// A linha fixa de Fortaleza × interior só faz sentido em pergunta de alerta, protocolo ou horário (13/11).
const SOBRE_ALERTA = /alerta|aviso|pop.?up|protocol|sexta|v[ée]spera|interior|comarca|feriado|hor[áa]rio|\b\d{1,2}\s*h\b/i;

export function limparRespostaManual(texto: string, pergunta?: string, temIncerto = true): string {
  // O modelo às vezes troca o ícone do título: "⚠️ *Onde está no manual*" (13/11).
  let linhas = texto.split("\n").map((l) => l.replace(/^\s*⚠️\s*(\*?Onde está no manual)/i, "📘 $1"));

  // Sem nenhum "ponto incerto" entre os trechos enviados, um ⚠️ de divergência foi inventado: sai (fica só a linha fixa) (13/11).
  if (!temIncerto)
    linhas = linhas.filter((l, i, a) => {
      const aviso = (k: number) => a[k].trim().startsWith("⚠️") && !/vale para todas as comarcas/i.test(a[k]);
      if (aviso(i)) return false;
      // continuação do aviso nas linhas de baixo, até a linha em branco
      for (let k = i - 1; k >= 0 && a[k].trim() && !(ehSecao(a[k]) && !aviso(k)); k--) if (aviso(k)) return false;
      return true;
    });

  // 0) Linha fixa de Fortaleza × interior em pergunta que não é de alerta/protocolo/horário: sai.
  if (pergunta !== undefined && !SOBRE_ALERTA.test(pergunta)) {
    const i = linhas.findIndex((l) => l.trim().startsWith("⚠️") && /vale para todas as comarcas/i.test(l));
    if (i >= 0) linhas.splice(i, 1);
  }

  // 0b) ⚠️ que cita tarefa ([Sec]/[Gab]) ou transição numerada ("10 - …") que a resposta não usa é de outro assunto: sai (13/11, noite).
  {
    const norm = (x: string) => x.toLowerCase().replace(/[*"“”]/g, "").replace(/\s+/g, " ").trim();
    linhas = linhas.filter((l, i, a) => {
      if (!l.trim().startsWith("⚠️") || /vale para todas as comarcas/i.test(l)) return true;
      const nomes = [...l.matchAll(/["“]((?:\d{1,2} - |\[(?:Sec|Gab|SEC|GAB)\])[^"”]{3,})["”]/g)].map((m) => norm(m[1]));
      if (!nomes.length) return true;
      const resto = norm(a.filter((_, k) => k !== i).join(" "));
      return nomes.some((n) => resto.includes(n));
    });
  }

  // 1) No máximo uma linha ⚠️: a fixa de Fortaleza × interior ganha; senão, sai a de manual que não foi citado.
  const avisos = linhas.map((l, i) => (l.trim().startsWith("⚠️") ? i : -1)).filter((i) => i >= 0);
  if (avisos.length) {
    const [oi, oj] = secao(linhas, "📘");
    const onde = oi < 0 ? "" : linhas.slice(oi, oj).join("\n");
    const fixa = avisos.find((i) => /vale para todas as comarcas/i.test(linhas[i]));
    const fica =
      fixa ??
      avisos.find((i) => {
        const deles = manuaisCitados(linhas[i]);
        return !deles.length || deles.some((re) => re.test(onde));
      });
    // O aviso pode continuar nas linhas de baixo ("⚠️ *Nota:*" e o texto embaixo): sai até a linha em branco.
    const sai = new Set<number>();
    for (const i of avisos.filter((i) => i !== fica))
      for (let j = i; j < linhas.length && (j === i || (linhas[j].trim() && !ehSecao(linhas[j]))); j++) sai.add(j);
    linhas = linhas.filter((_, i) => !sai.has(i));
  }

  // 2) Págs. 21 a 23 do manual externo de 1º grau: no rodapé impresso aparece "20".
  // O aviso vai logo depois da página (no fim da linha parecia valer também para as págs. 3-4).
  const [oi, oj] = secao(linhas, "📘");
  for (let i = oi + 1; oi >= 0 && i < oj; i++) {
    if (!MANUAIS_RE[0].test(linhas[i])) continue;
    // O modelo às vezes troca: "21 (pág. 20 do PDF)" — o 20 é o rodapé impresso, não o PDF.
    linhas[i] = linhas[i].replace(/\((?:p[áa]g(?:ina|\.)?\s*)?20 do PDF\)/gi, '(no rodapé impresso aparece "20")');
    // Só número de PÁGINA ("pág. 21", "págs. 3, 4, 21 e 22"): horário como "21h" ou "23h59" não é tocado (13/11).
    if (!/rodap|impress/i.test(linhas[i]))
      linhas[i] = linhas[i].replace(/(p[áa]g(?:ina)?s?\.?\s*)(\d+(?:\s*(?:,|e|a|-|–|\/)\s*\d+)*)\b(?!\s*\()(?![hH:])/g, (m, pre: string, lista: string) =>
        /\b2[123]\b/.test(lista) ? `${pre}${lista} (no rodapé impresso: "20")` : m);
  }

  // "segue a mesma lógica" é dedução do modelo, não está no manual: sai do "Onde está" (13/11, noite).
  {
    const [oi3, oj3] = secao(linhas, "📘");
    for (let k = oi3 + 1; oi3 >= 0 && k < oj3; k++) linhas[k] = linhas[k].replace(/\s*\([^)]*l[oó]gica[^)]*\)/gi, "");
  }

  // 2b) Pergunta do fluxo criminal respondida só com manual cível/2º grau: o item 1 avisa de onde vêm os passos.
  // O modelo pequeno não cumpre essa regra do prompt sozinho (13/11, noite).
  const [oi2, oj2] = secao(linhas, "📘");
  const onde2 = oi2 < 0 ? "" : linhas.slice(oi2, oj2).join("\n");
  // Não vale para pergunta do 2º grau (o manual do 2º grau é o certo para cível e criminal), nem para alerta,
  // protocolo ou horário (o manual criminal fala disso; a resposta costuma citar o de usuários externos) (13/11, noite).
  const doSegundoGrau = /\b2\s*[ºo°]?\s*grau|segundo grau|tribunal|desembargad/i;
  if (pergunta && /criminal|flagrante|cust[oó]dia|\bpris[aã]o\b|medida protetiva|\bmpu\b/i.test(pergunta) && !MANUAIS_RE[3].test(onde2)
    && !doSegundoGrau.test(pergunta) && !SOBRE_ALERTA.test(pergunta) && !MANUAIS_RE[0].test(onde2)) {
    const outros = [[MANUAIS_RE[2], "cível"], [MANUAIS_RE[4], "do 2º grau"]].filter(([re]) => (re as RegExp).test(onde2)).map(([, n]) => n);
    const [fi2, fj2] = secao(linhas, "✅");
    // Se o "O que fazer" já fala do manual criminal, não repete.
    if (outros.length && fi2 >= 0 && !/criminal/i.test(linhas.slice(fi2 + 1, fj2).join(" "))) {
      linhas.splice(fi2 + 1, 0, `1. O manual criminal não explica esse passo; os passos abaixo são do manual ${outros.join(" e do manual ")}.`);
      for (let k = fi2 + 2; k < linhas.length && !ehSecao(linhas[k]); k++) linhas[k] = linhas[k].replace(/^(\s*)(\d+)\./, (_m, sp: string, d: string) => `${sp}${Number(d) + 1}.`);
      const pi = linhas.findIndex((l) => l.trim().startsWith("💬"));
      if (pi >= 0 && !/me avise/i.test(linhas.slice(pi).join(" "))) {
        let fim = linhas.length - 1;
        while (fim > pi && !linhas[fim].trim()) fim--;
        linhas[fim] = `${linhas[fim].trimEnd()} Se alguma opção não aparecer, me avise.`;
      }
    }
  }

  // 3) "O que fazer" sem "vou verificar", instabilidade, cache ou navegador.
  const [fi, fj] = secao(linhas, "✅");
  if (fi >= 0) {
    // Conselho genérico que não está nos manuais (visto nas respostas de 13/11): sai do "O que fazer".
    const proibida = /mesma l[oó]gica|segue a l[oó]gica|vou verificar|instabilidade|cache|navegador|escala|entre em contato|contato com a unidade|normas (de procedimento )?intern[oa]s?|legisla[cç][aã]o vigente/i;
    let n = 0;
    const corpo = linhas.slice(fi + 1, fj).flatMap((l) => {
      const item = l.match(/^(\s*)(\d+)\.\s+/);
      const resto = item ? l.slice(item[0].length) : l;
      const frases = resto.split(/(?<!\bp[áa]gs?\.)(?<=[.!?])\s+/).filter((f) => !proibida.test(f));
      if (!frases.length) return [];
      return [item ? `${item[1]}${++n}. ${frases.join(" ")}` : frases.join(" ")];
    });
    const sobrou = corpo.some((l) => l.trim());
    linhas = [...linhas.slice(0, sobrou ? fi + 1 : fi), ...(sobrou ? corpo : []), ...linhas.slice(fj)];
  }

  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
