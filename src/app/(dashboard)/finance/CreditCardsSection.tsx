"use client";

import { useCallback, useEffect, useState } from "react";

type Invoice = {
  card: string;
  dueDate: string;
  total: number;
  count: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Faturas em aberto (uma por cartão e vencimento) com o botão "Marcar como
 * paga", que dá baixa em todas as compras da fatura de uma vez. onPaid
 * recarrega a lista de lançamentos da página.
 */
export function CreditCardsSection({ onPaid }: { onPaid?: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/finance/credit-cards");
    if (res.ok) setInvoices(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pay(inv: Invoice) {
    const name = inv.card ? `Cartão ${inv.card}` : "Seu cartão";
    if (!window.confirm(`Marcar como paga a fatura "${name}" de ${dayMonth(inv.dueDate)} (${inv.count} compras, ${brl(inv.total)})?`)) return;
    const key = `${inv.card}|${inv.dueDate}`;
    setPaying(key);
    try {
      const res = await fetch("/api/finance/credit-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: inv.card, dueDate: inv.dueDate }),
      });
      if (!res.ok) window.alert("Não consegui dar baixa na fatura. Tente de novo.");
      await load();
      onPaid?.();
    } finally {
      setPaying(null);
    }
  }

  if (loading || invoices.length === 0) return null; // Não mostra se não tiver fatura

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>💳 Faturas em aberto</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {invoices.map((inv) => {
          const key = `${inv.card}|${inv.dueDate}`;
          return (
            <div key={key} style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{inv.card ? `Cartão ${inv.card}` : "Seu cartão"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Vence {dayMonth(inv.dueDate)} · {inv.count} {inv.count === 1 ? "compra" : "compras"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--danger)" }}>{brl(inv.total)}</div>
              <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 8px", marginTop: 4 }} disabled={paying === key} onClick={() => pay(inv)}>
                {paying === key ? "Dando baixa…" : "✅ Marcar como paga"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
