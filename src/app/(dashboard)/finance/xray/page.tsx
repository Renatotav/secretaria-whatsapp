"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface InvoiceItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  quantity: number;
  unitPrice: number;
  financeEntry: {
    date: string;
    category: string;
    description: string;
  }
}

export default function XRayPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finance/xray?month=${month}`)
      .then(res => res.json())
      .then(data => {
        setItems(data);
        setLoading(false);
      });
  }, [month]);

  const total = useMemo(() => items.reduce((acc, i) => acc + i.amount, 0), [items]);

  const byCategory = useMemo(() => {
    const groups: Record<string, number> = {};
    items.forEach(item => {
      groups[item.category] = (groups[item.category] || 0) + item.amount;
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const byProduct = useMemo(() => {
    const groups: Record<string, { amount: number, quantity: number, name: string }> = {};
    items.forEach(item => {
      const key = item.name.toUpperCase();
      if (!groups[key]) groups[key] = { amount: 0, quantity: 0, name: item.name };
      groups[key].amount += item.amount;
      groups[key].quantity += item.quantity;
    });
    return Object.values(groups).sort((a, b) => b.amount - a.amount).slice(0, 50); // Top 50
  }, [items]);

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Link href="/finance" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 13, marginBottom: 8, display: "inline-block" }}>
            ← Voltar para Finanças
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>🔍 Raio-X Universal</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Análise detalhada de todos os itens de notas fiscais do mês.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando dados estruturais...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)" }}>
          Nenhuma nota fiscal detalhada encontrada para este mês. Mande uma nota no WhatsApp com a legenda "mercado" ou "nota".
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginBottom: 24 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Total Identificado (Raio-X)</p>
              <p style={{ fontSize: 28, fontWeight: 700 }}>R$ {total.toFixed(2)}</p>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Itens Analisados</p>
              <p style={{ fontSize: 28, fontWeight: 700 }}>{items.length}</p>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Gargalo Principal</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "var(--danger)" }}>
                {byCategory.length > 0 ? byCategory[0][0] : "—"}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>💰 Gastos por Subcategoria</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {byCategory.map(([cat, val]) => (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 14 }}>
                      <span>{cat}</span>
                      <span style={{ fontWeight: 600 }}>R$ {val.toFixed(2)}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: \`\${(val / total) * 100}%\`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🏆 Ranking de Produtos (Top 50)</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 500, overflowY: "auto", paddingRight: 8 }}>
                {byProduct.map((prod, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: "1px solid var(--border-light)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{i + 1}. {prod.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{prod.quantity} unidades compradas</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>R$ {prod.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
