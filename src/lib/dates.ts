/**
 * "2026-07-31" (data pura, sem hora) vira meia-noite UTC quando passada pro
 * construtor nativo de Date, o que em fusos negativos (ex: Brasil, UTC-3)
 * pode exibir/filtrar como o dia ANTERIOR — e até jogar o lançamento pro mês
 * errado se cair no dia 1. Extrai os componentes Y-M-D manualmente e monta a
 * data no fuso local do processo, tanto pra strings puras quanto pra ISO
 * completas (ignora a hora nesse caso).
 */
export function parseLocalDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(dateStr);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
