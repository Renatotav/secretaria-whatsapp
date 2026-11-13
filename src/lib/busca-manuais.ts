/**
 * Busca nos manuais do PJe (BM25, sem dependências).
 * Lê os trechos gerados das notas do Obsidian (trechos-plantao.json) e devolve os mais parecidos com a pergunta.
 * Não usa banco nem extensão do Postgres: o índice é montado em memória na primeira busca (~400 trechos hoje).
 */

export interface Trecho {
  id: string;
  nota: string;
  manual: string;
  arquivo: string;
  tipo: "visao" | "pagina" | "procedimento" | "regra" | "pergunta" | "incerto" | "tarefa";
  paginas: number[];
  titulo: string;
  texto: string;
}

export interface Achado {
  trecho: Trecho;
  pontos: number;
}

const STOP = new Set(
  (
    "a o e é de da do das dos em no na nos nas um uma uns umas para pra pro por pelo pela pelos pelas com sem se que " +
    "qual quais como quando onde porque por que ao aos à às ou mas mais menos muito já não nao sim eu me meu minha " +
    "você voce ele ela eles elas isso isto esse essa este esta aquele aquela lá la aqui ser foi era está esta estou " +
    "tem ter tenho há ha vai vou fazer faz feito pode posso consigo consegue preciso precisa deve devo sobre entre " +
    "depois antes até ate também tambem só so seu sua seus suas nosso nossa dele dela isso então entao tá ta ai aí " +
    "pq q oq o que ja n nao"
  ).split(/\s+/)
);

/** minúsculas, sem acento, sem pontuação */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[º°ª]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Radical leve para português: plural e algumas terminações, depois corta em 5 letras. */
export function radical(p: string): string {
  if (/^\d+$/.test(p)) return p;
  let w = p;
  if (w.length > 4) {
    w = w
      .replace(/coes$/, "cao")
      .replace(/oes$/, "ao")
      .replace(/aes$/, "ao")
      .replace(/ais$/, "al")
      .replace(/eis$/, "el")
      .replace(/ns$/, "m")
      .replace(/([aeiou])s$/, "$1")
      .replace(/(mente)$/, "");
  }
  return w.length > 5 ? w.slice(0, 5) : w;
}

// Sinônimos do atendimento → palavras dos manuais.
const DOIS_GRAUS = /\b(1|primeiro)\s*(o\s*)?grau\b.*\b(2|segundo)\s*(o\s*)?grau\b|\b(2|segundo)\s*(o\s*)?grau\b.*\b(1|primeiro)\s*(o\s*)?grau\b/;

const SINONIMOS: [RegExp, string][] = [
  [/\btribunal\b/, " 2g segundo grau "],
  [/\bdesembargador/, " 2g segundo grau desembargador "],
  [/\bflagrante\b|\bapf\b/, " auto prisao flagrante "],
  [/\bmpu\b|maria da penha/, " medidas protetivas urgencia "],
  [/\bpeticao inicial\b|\bprocesso novo\b|\bnovo processo\b|\bprotocol(ar|ei|ou|o)\b/, " protocolar inicial novo processo atendimento plantao judiciario flag "],
  [/\bpeticion(ar|ei|ou|ando)\b|\bpeticao\b/, " peticao protocolo "],
  [/\bprocesso (ja )?existente\b|\bpeticao intermediaria\b|\bpeticionou\b/, " peticao intermediaria analisar peticao "],
  [/\badvogad|\bpeticionante\b|\busuario externo\b/, " usuarios externos peticionante "],
  [/\bmarcar\b|\bmarquei\b|\bselecionar\b|\bopcao\b/, " flag opcao selecionar "],
  [/\bvara de origem\b|\bunidade de origem\b|\bjuizo de origem\b/, " orgao origem orgao julgador "],
  [/\bdevolver\b|\bvoltar\b|\bretornar\b/, " remeter orgao origem retornar "],
  [/\bonde (ele |o processo )?(fica|esta|aparece|vai)\b/, " aparece tarefa aguardar retorno "],
  [/\bmand(ar|ei|ou|a)\b|\benvi(ar|ei|ou)\b|\bencaminh(ar|ei|ou)\b/, " remeter remessa encaminhar "],
  [/\bpop ?up\b|\balerta\b|\baviso\b/, " pop up alerta atencao atendimento plantao "],
  [/\bdelegado\b|\bdelegacia\b|\bpolicia\b/, " autoridade policial delegacia policia civil "],
  [/\bperfil\b|\bpapel\b/, " perfil perfis papel "],
  [/\boficial de justica\b/, " mandado ceman central mandados "],
  // O manual escreve "MP"; o usuário, "ministério público" ou "promotor" (13/11).
  [/\bministerio publico\b|\bpromotor/, " mp "],
  // "a vara não consegue movimentar" = processo esperando o plantão devolver (13/11).
  [/\bnao (consigo|consegue|conseguem|da para|deixa) (movimentar|mexer|tramitar|andar)\b/, " preso aguardar retorno plantao movimentar "],
  // "mandar para o plantão do 2º grau" = remessa por declínio de competência (13/11).
  [/\bplantao do (2|segundo)\s*(o\s*)?grau\b|\bdeclin/, " remeter plantao 2 grau declinio competencia "],
  // Revisão de sábado (13/11): jeito do usuário falar.
  [/\b(dois|2) lugares\b|\bao mesmo tempo\b|\bduas tarefas\b|\bduplicad/, " mesmo tempo aguardar retorno plantao triagem inicial copia "],
  [/\bvarias\b|\bvarios\b|\bde uma vez\b|\bem massa\b|\bem bloco\b/, " lote "],
  [/\bdefensoria\b|\bdefensor\b/, " dp intimar a dp "],
];

export function termos(s: string, expandir = false): string[] {
  let n = normalizar(s);
  if (expandir) {
    const orig = n;
    for (const [re, extra] of SINONIMOS) if (re.test(orig)) n += extra;
    // Pergunta que cita os dois graus é remessa entre graus (declínio); com um grau só, reforça o grau citado.
    if (DOIS_GRAUS.test(orig)) n += " declinio competencia remeter remessa ";
    else if (/\b(2|segundo)\s*(o\s*)?grau\b/.test(orig)) n += " 2g segundo grau ";
    else if (/\b(1|primeiro)\s*(o\s*)?grau\b|\bcomarca\b/.test(orig)) n += " 1g primeiro grau ";
  }
  return n
    .split(" ")
    .filter((w) => w && !STOP.has(w) && (w.length > 1 || /\d/.test(w)))
    .map(radical);
}

const PESO_TIPO: Record<Trecho["tipo"], number> = {
  tarefa: 1.25,
  pergunta: 1.25,
  procedimento: 1.15,
  pagina: 1.0,
  regra: 1.0,
  incerto: 0.6,
  visao: 0.7,
};

interface Indice {
  docs: { trecho: Trecho; tf: Map<string, number>; len: number }[];
  df: Map<string, number>;
  media: number;
}

let cache: Indice | null = null;

/** Texto que entra na busca: título conta 2x, e o nome do manual também entra (grau, interno/externo, cível/criminal). */
function textoDeBusca(t: Trecho): string {
  const manual = t.manual.replace(/1º Grau/, "1º grau primeiro grau 1g").replace(/2º Grau/, "2º grau segundo grau 2g");
  return `${t.titulo} ${t.titulo} ${manual} ${t.texto}`;
}

export function montarIndice(trechos: Trecho[]): Indice {
  const docs = trechos.map((trecho) => {
    const ws = termos(textoDeBusca(trecho));
    const tf = new Map<string, number>();
    for (const w of ws) tf.set(w, (tf.get(w) ?? 0) + 1);
    return { trecho, tf, len: ws.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const media = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  cache = { docs, df, media };
  return cache;
}

export function buscarManuais(pergunta: string, trechos: Trecho[], k = 6): Achado[] {
  const idx = cache && cache.docs.length === trechos.length ? cache : montarIndice(trechos);
  const q = [...new Set(termos(pergunta, true))];
  const N = idx.docs.length;
  const k1 = 1.2;
  const b = 0.6;
  const res: Achado[] = [];
  for (const d of idx.docs) {
    let s = 0;
    for (const w of q) {
      const f = d.tf.get(w);
      if (!f) continue;
      const n = idx.df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.media));
    }
    if (s > 0) res.push({ trecho: d.trecho, pontos: s * PESO_TIPO[d.trecho.tipo] });
  }
  res.sort((x, y) => y.pontos - x.pontos);
  const top = res.slice(0, k);
  // Divergência do manual sobre uma página que veio na busca vai junto, senão a IA afirma as duas versões como certas (13/11).
  const mesmaPagina = (t: Trecho) => top.some((a) => a.trecho.arquivo === t.arquivo && a.trecho.paginas.some((p) => t.paginas.includes(p)));
  const incertos = res.filter((a) => a.trecho.tipo === "incerto" && !top.includes(a) && mesmaPagina(a.trecho)).slice(0, 2);
  return [...top, ...incertos];
}

/** Monta o bloco de contexto para a IA: cada trecho com manual, arquivo e páginas. */
export function contextoParaIA(achados: Achado[]): string {
  return achados
    .map((a, i) => {
      const t = a.trecho;
      // O manual externo do 1º grau imprime "20 pág" no rodapé das págs. 20 a 23 do PDF (conferido nos PDFs em 13/11).
      const pag = (p: number) =>
        t.nota === "Plantao-1G-Usuarios-Externos_2026-08" && p >= 21 && p <= 23 ? `${p} do PDF (no rodapé impresso aparece "20")` : String(p);
      // Mapa de tarefas é resumo dos 5 manuais: as páginas dele são de manuais diferentes (ver "Onde ver" no texto) (13/11).
      const pags =
        t.tipo === "tarefa"
          ? "resumo sem página própria (cite os manuais e páginas do 'Onde ver')"
          : t.paginas.length ? `pág. ${t.paginas.map(pag).join(", ")}` : "sem página";
      return `[${i + 1}] ${t.manual} — arquivo ${t.arquivo} — ${pags} — ${t.tipo}: ${t.titulo}\n${t.texto}`;
    })
    .join("\n\n---\n\n");
}
