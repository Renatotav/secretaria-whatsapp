// Conferência dos números de processo (padrão CNJ) da skill do Redmine — a
// mesma lógica do conferir_processos.py da skill, mas rodando aqui, em código:
// a IA não faz conta "de cabeça". Duas travas:
//   inicial → dígito verificador (módulo 97) e "sobra do modelo" (processo dos
//             itens 2/3 que não está no início do chamado);
//   final   → o revisado tem exatamente os mesmos processos do original.

// 7 dígitos, 2 DV, ano, J, TR, origem — com ou sem pontuação
const PADRAO = /(?<!\d)(\d{7})\s*[-.]?\s*(\d{2})\s*\.?\s*(\d{4})\s*\.?\s*(\d)\s*\.?\s*(\d{2})\s*\.?\s*(\d{4})(?!\d)/g;

/** {número normalizado (20 dígitos) → como apareceu no texto} */
export function extrairProcessos(texto: string): Map<string, string> {
  const achados = new Map<string, string>();
  for (const m of (texto || "").matchAll(PADRAO)) {
    const norm = m.slice(1, 7).join("");
    if (!achados.has(norm)) achados.set(norm, m[0].trim());
  }
  return achados;
}

export function dvValido(norm: string): boolean {
  const n = norm.slice(0, 7), dv = norm.slice(7, 9), resto = norm.slice(9);
  return Number(dv) === 98 - Number(BigInt(n + resto + "00") % BigInt(97));
}

export const formatarProcesso = (norm: string) => `${norm.slice(0, 7)}-${norm.slice(7, 9)}.${norm.slice(9, 13)}.${norm[13]}.${norm.slice(14, 16)}.${norm.slice(16)}`;
const semDv = (norm: string) => norm.slice(0, 7) + norm.slice(9);
const diferenca = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length;

const NOMES: Record<number, string> = { 1: "Situação Identificada", 2: "Testes e Verificações", 3: "Correção a Ser Aplicada" };
// Títulos dos itens do modelo, com ou sem número, negrito, acento ou dois-pontos
const TITULOS: [number, RegExp][] = [
  [1, /^[\s*#>_-]*(?:1\s*[.)\-–]\s*)?situa[cç][aã]o\b/i],
  [2, /^[\s*#>_-]*(?:2\s*[.)\-–]\s*)?(?:testes?|verifica[cç])/i],
  [3, /^[\s*#>_-]*(?:3\s*[.)\-–]\s*)?corre[cç][aã]o\b/i],
];

/** {0: cabeçalho+título+item 1, 2: item 2, 3: item 3}; null se o texto não segue o modelo. */
function secoes(texto: string): Record<number, string> | null {
  let atual = 0;
  const partes: Record<number, string[]> = { 0: [] };
  const achados = new Set<number>();
  for (const linha of texto.split(/\r?\n/)) {
    for (const [num, rx] of TITULOS) {
      if (rx.test(linha)) {
        achados.add(num);
        atual = num === 1 ? 0 : num;
        partes[atual] ??= [];
        break;
      }
    }
    partes[atual].push(linha);
  }
  if (!achados.has(1) || !(achados.has(2) || achados.has(3))) return null;
  return Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, v.join("\n")]));
}

export interface ConferenciaInicial {
  status: "SEM_PROCESSO" | "OK" | "INCONSISTENTE";
  processos: string[];
  problemas: string[];
}

export function conferirInicial(texto: string): ConferenciaInicial {
  const procs = extrairProcessos(texto);
  if (!procs.size) return { status: "SEM_PROCESSO", processos: [], problemas: [] };
  const problemas: string[] = [];
  for (const [norm, visto] of procs) {
    if (dvValido(norm)) continue;
    let msg = `${visto} → dígito verificador inválido (número provavelmente digitado errado)`;
    const parecidos = [...procs].filter(([o]) => o !== norm && dvValido(o) && diferenca(semDv(o), semDv(norm)) <= 2).map(([, v]) => v);
    if (parecidos.length) msg += `; parecido com ${parecidos.join(", ")}`;
    problemas.push(msg);
  }
  const partes = secoes(texto);
  if (partes) {
    const base = new Set(extrairProcessos(partes[0]).keys());
    for (const item of [2, 3]) {
      for (const [norm, visto] of extrairProcessos(partes[item] || "")) {
        if (base.has(norm)) continue;
        let msg = `${visto} aparece no item ${item} (${NOMES[item]}) mas não no item 1 (Situação Identificada) — possível sobra do modelo copiado`;
        if (base.size) msg += `; o item 1 cita ${[...base].sort().map(formatarProcesso).join(", ")}`;
        problemas.push(msg);
      }
    }
  }
  return { status: problemas.length ? "INCONSISTENTE" : "OK", processos: [...procs.keys()].map(formatarProcesso), problemas };
}

/** O revisado tem exatamente os mesmos processos do original? */
export function conferirFinal(original: string, revisado: string): { ok: boolean; faltando: string[]; sobrando: string[] } {
  const a = new Set(extrairProcessos(original).keys());
  const b = new Set(extrairProcessos(revisado).keys());
  const faltando = [...a].filter((x) => !b.has(x)).sort().map(formatarProcesso);
  const sobrando = [...b].filter((x) => !a.has(x)).sort().map(formatarProcesso);
  return { ok: !faltando.length && !sobrando.length, faltando, sobrando };
}
