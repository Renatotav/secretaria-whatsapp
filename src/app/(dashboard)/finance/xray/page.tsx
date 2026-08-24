"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

function XRayContent() {
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => {
    const param = searchParams.get("month");
    if (param && /^\d{4}-\d{2}$/.test(param)) return param;
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
    <div style={{ height: "100%", overflowY: "auto" }}>
    <div style={{ padding: "16px", maxWidth: 1200, margin: "0 auto", paddingBottom: 60 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href="/finance" style={{ color: "var(--accent)", textDecoration: "none", fontSize: 13, marginBottom: 6, display: "inline-block" }}>
            ← Voltar para Finanças
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🔍 Raio-X Universal</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Itens detalhados das notas fiscais do mês.</p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", fontSize: 14 }}
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
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 20 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Total (Raio-X)</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>R$ {total.toFixed(2)}</p>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Itens</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{items.length}</p>
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Gargalo</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)" }}>
                {byCategory.length > 0 ? byCategory[0][0] : "—"}
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>💰 Gastos por Subcategoria</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {byCategory.map(([cat, val]) => (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                      <span>{cat}</span>
                      <span style={{ fontWeight: 600 }}>R$ {val.toFixed(2)}</span>
                    </div>
                    <div style={{ width: "100%", height: 6, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(val / total) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🏆 Ranking de Produtos (Top 50)</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {byProduct.map((prod, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {prod.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{prod.quantity} un.</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>R$ {prod.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

export default function XRayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>}>
      <XRayContent />
    </Suspense>
  );
}
