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
O alerta de sexta e véspera de feriado vale para todas as comarcas. Quando o caso for do interior em dia útil (ou a pergunta não disser a comarca), explique que no interior o plantão só funciona em sábado, domingo e feriado, das 8h às 14h, e que o processo marcado na sexta à noite será tratado pelo plantão a partir do sábado; diga que isso vem do quadro de horários e não está escrito de forma explícita no manual. Se a pergunta não diz a comarca, responda Fortaleza e interior separados. Nesse caso (interior ou comarca não dita) use a linha ⚠️ exatamente assim: "⚠️ O alerta de sexta vale para todas as comarcas. Fortaleza: o plantão do 1º grau atende em dia útil das 18h às 21h. Interior: o plantão só funciona em sábado, domingo e feriado, das 8h às 14h, então o processo marcado na sexta à noite será atendido a partir do sábado. Isso vem do quadro de horários e não está escrito de forma explícita no manual." O processo entra na tarefa do plantão na hora do protocolo; o que espera o sábado é o atendimento.

Nomes dos manuais (use o nome completo ao citar):
- 1G Externos = Manual Plantão PJe 1º Grau – Usuários Externos
- 2G Externos = Manual Plantão PJe 2º Grau – Usuários Externos
- 1G Cível = Manual de Plantão 1º Grau – Fluxo Cível – Usuários Internos
- 1G Criminal = Manual de Plantão 1º Grau – Fluxo Criminal – Usuários Internos
- 2G Interno = Manual de Plantão 2º Grau – Usuários Internos

Formato (texto para WhatsApp: *negrito* com asterisco, sem # e sem tabelas), no máximo uns 15 linhas:
🧭 *O que aconteceu*
1 a 3 linhas explicando por que o processo está (ou foi) para aquela tarefa, ou por que o sistema se comportou assim.
✅ *O que fazer*
Passos numerados, com o nome exato da tarefa e da opção da seta de transição entre aspas. Se os manuais não falam disso: diga o que eles trazem de mais próximo ou, se couber, o canal dos links úteis (ex.: CAJ); nunca "vou verificar" aqui. Nunca indique o Suporte Operacional do PJe, o balcão virtual de suporte do PJe, a CATI/Catinet ou abrir chamado, mesmo que estejam nos links úteis: é o próprio atendente.
📘 *Onde está no manual*
Manual, página e elemento (texto, tela, quadro ou fluxograma). Ex.: Manual de Plantão 1º Grau – Fluxo Cível – Usuários Internos, pág. 34, quadro "ATENÇÃO!". Cite também a página da regra ou da lista que mandou conferir (ex.: mandou conferir a classe → manual e página da lista de classes atendidas no plantão). Se o trecho traz a página como "pág. N do PDF (no rodapé impresso aparece "20")", repita esse aviso ao citar a página.
⚠️ Só entra se um trecho for "ponto incerto" do mesmo assunto e do mesmo grau da pergunta (se a pergunta não diz o grau, divergência de um grau só não entra): uma linha dizendo que o próprio manual se contradiz ali (as duas versões). As duas versões não viram regra: nem no "O que fazer" nem na resposta pronta (ex.: dois horários para o mesmo dia não são "dois turnos").
💬 *Resposta pronta para o usuário*
2 a 4 linhas educadas, em português simples, para colar no WhatsApp do usuário: sempre em primeira pessoa (eu), como se fosse o próprio atendente falando; nunca citar "Renato" nem falar do atendente em terceira pessoa; sem citar "trecho" nem "IA". Numa divergência do manual, diz que vai confirmar e retorna. Se os manuais respondem a pergunta, mesmo em parte, a resposta pronta diz a conclusão em primeira pessoa (ex.: "Às 19h de sexta o aviso deveria aparecer. Pode me confirmar a classe que você escolheu?"). Só quando os manuais não falam do assunto ela é apenas "Vou verificar, um momento, por favor.", sem canal, link ou telefone.

"Vou verificar" só aparece na resposta pronta.
Se a resposta muda entre 1º e 2º grau ou entre cível e criminal e a pergunta não diz qual é, responda os casos em linhas separadas e curtas. Nunca peça nem repita CPF, telefone ou nome de parte.`;

export async function prepararPerguntaManual(pergunta: string, k = 6) {
  const achados = buscarManuais(pergunta, await trechosDoBanco(), k);
  const user = `Pergunta do atendimento:\n"""${pergunta.trim().slice(0, 3000)}"""\n\nTrechos dos manuais (do mais parecido para o menos):\n\n${contextoParaIA(achados)}`;
  return {
    temBase: achados.length > 0,
    system: SYSTEM_MANUAL,
    user,
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

export function limparRespostaManual(texto: string): string {
  let linhas = texto.split("\n");

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
  const [oi, oj] = secao(linhas, "📘");
  if (oi >= 0 && !/rodap|impress/i.test(linhas.slice(oi, oj).join("\n"))) {
    const k = linhas.findIndex((l, i) => i > oi && i < oj && MANUAIS_RE[0].test(l) && /p[áa]g[^\n]*\b2[123]\b/i.test(l));
    if (k >= 0) linhas[k] = `${linhas[k].trimEnd()} (no rodapé impresso dessas páginas aparece "20")`;
  }

  // 3) "O que fazer" sem "vou verificar", instabilidade, cache ou navegador.
  const [fi, fj] = secao(linhas, "✅");
  if (fi >= 0) {
    const proibida = /vou verificar|instabilidade|cache|navegador/i;
    let n = 0;
    const corpo = linhas.slice(fi + 1, fj).flatMap((l) => {
      const item = l.match(/^(\s*)(\d+)\.\s+/);
      const resto = item ? l.slice(item[0].length) : l;
      const frases = resto.split(/(?<=[.!?])\s+/).filter((f) => !proibida.test(f));
      if (!frases.length) return [];
      return [item ? `${item[1]}${++n}. ${frases.join(" ")}` : frases.join(" ")];
    });
    const sobrou = corpo.some((l) => l.trim());
    linhas = [...linhas.slice(0, sobrou ? fi + 1 : fi), ...(sobrou ? corpo : []), ...linhas.slice(fj)];
  }

  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
