// Idade do dinheiro (ideia do método YNAB, 09/11/2026): quantos dias, em média, o
// dinheiro que sai ficou parado desde que entrou. Cada saída paga com a entrada
// mais antiga ainda não usada; vale a média das últimas saídas, pesada pelo valor.
// Subindo = mais folga (gastando dinheiro de semanas atrás, não o do dia).

export type Movimento = { date: Date; amount: number; type: string };

/** Média em dias das últimas `ultimas` saídas (null se ainda não dá para calcular). */
export function idadeDoDinheiro(movs: Movimento[], ultimas = 10): number | null {
  const ordem = [...movs].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === "income" ? -1 : 1));
  const fila: { date: number; resta: number }[] = [];
  const idades: { dias: number; peso: number }[] = [];
  for (const m of ordem) {
    if (m.amount <= 0) continue;
    if (m.type === "income") { fila.push({ date: m.date.getTime(), resta: m.amount }); continue; }
    let falta = m.amount, soma = 0, coberto = 0;
    while (falta > 0.005 && fila.length) {
      const e = fila[0];
      const usa = Math.min(falta, e.resta);
      soma += usa * ((m.date.getTime() - e.date) / 86_400_000);
      coberto += usa;
      falta -= usa;
      e.resta -= usa;
      if (e.resta <= 0.005) fila.shift();
    }
    if (coberto > 0) idades.push({ dias: soma / coberto, peso: coberto });
  }
  const ult = idades.slice(-ultimas);
  if (ult.length < 3) return null;
  const peso = ult.reduce((a, x) => a + x.peso, 0);
  return Math.max(0, Math.round(ult.reduce((a, x) => a + x.dias * x.peso, 0) / peso));
}
