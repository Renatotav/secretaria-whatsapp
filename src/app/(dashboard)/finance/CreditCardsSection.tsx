"use client";

import { useEffect, useState } from "react";

type Invoice = {
  month: string;
  total: number;
};

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function CreditCardsSection() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/finance/credit-cards");
      if (res.ok) {
        setInvoices(await res.json());
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return null;
  if (invoices.length === 0) return null; // Não mostra se não tiver fatura

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>💳 Faturas de Cartão de Crédito (Próximos Meses)</h2>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {invoices.map((inv) => {
          const [year, month] = inv.month.split("-");
          const monthName = MONTH_LABELS[Number(month) - 1];
          return (
            <div key={inv.month} style={{ minWidth: 140, background: "var(--bg-hover)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                Fatura de {monthName}/{year}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)" }}>
                R$ {inv.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
