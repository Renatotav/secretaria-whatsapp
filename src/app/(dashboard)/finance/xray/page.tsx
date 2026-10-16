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
    paymentMethod?: string;
    account?: string;
  }
}

// Forma de pagamento da nota: VR (ticket), cartão de crédito ou o resto.
type Pag = "vr" | "cartao" | "outros";
const PAGS: { k: Pag; label: string; cor: string }[] = [
  { k: "vr", label: "🍽️ VR", cor: "var(--success)" },
  { k: "cartao", label: "💳 Cartão de crédito", cor: "var(--accent)" },
  { k: "outros", label: "💸 Pix, débito e outros", cor: "var(--warning)" },
];
function pagDe(e: InvoiceItem["financeEntry"]): Pag {
  const m = (e.paymentMethod || "").toLowerCase();
  if (m === "ticket" || /^vr$/i.test(e.account || "")) return "vr";
  if (m === "cartão" || m === "cartao" || m === "credito" || m === "crédito") return "cartao";
  return "outros";
}

function XRayContent() {
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => {
    const param = searchParams.get("month");
    if (param && /^\d{4}-\d{2}$/.test(param)) return param;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [todos, setTodos] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pag, setPag] = useState<Pag[]>([]); // vazio = tudo; pode marcar mais de um (ex.: VR + cartão)
  const somaPag = useMemo(() => {
    const s: Record<Pag, number> = { vr: 0, cartao: 0, outros: 0 };
    todos.forEach((i) => (s[pagDe(i.financeEntry)] += i.amount));
    return s;
  }, [todos]);
  const items = useMemo(() => (pag.length ? todos.filter((i) => pag.includes(pagDe(i.financeEntry))) : todos), [todos, pag]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/finance/xray?month=${month}`)
      .then(res => res.json())
      .then(data => {
        setTodos(Array.isArray(data) ? data : []);
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🔍 Raio-X Universal</h1>
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
      ) : todos.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", background: "var(--bg-card)", borderRadius: 12, border: "1px solid var(--border)" }}>
          Nenhuma nota fiscal detalhada encontrada para este mês. Mande uma nota no WhatsApp com a legenda "mercado" ou "nota".
        </div>
      ) : (
        <>
          {/* VR × cartão × outros: tocar marca/desmarca (dá para juntar dois); nenhum marcado = tudo */}
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", marginBottom: 12 }}>
            {PAGS.map((p) => {
              const ativo = pag.includes(p.k);
              return (
                <button
                  key={p.k}
                  type="button"
                  onClick={() => setPag((atual) => (atual.includes(p.k) ? atual.filter((x) => x !== p.k) : [...atual, p.k]))}
                  aria-pressed={ativo}
                  style={{ textAlign: "left", cursor: "pointer", background: ativo ? "var(--accent-dim)" : "var(--bg-card)", border: `1px solid ${ativo ? "var(--accent-border)" : "var(--border)"}`, borderLeft: `4px solid ${p.cor}`, borderRadius: 12, padding: "10px 12px", color: "var(--text)" }}
                >
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{ativo ? "☑ " : "☐ "}{p.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{somaPag[p.k].toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                </button>
              );
            })}
          </div>
          {pag.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Mostrando só: <b style={{ color: "var(--text)" }}>{PAGS.filter((p) => pag.includes(p.k)).map((p) => p.label).join(" + ")}</b> ·{" "}
              {items.reduce((a, i) => a + i.amount, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ·{" "}
              <button type="button" onClick={() => setPag([])} style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 13 }}>ver tudo</button>
            </div>
          )}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 20 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Total (Raio-X)</p>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
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

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", alignItems: "start" }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>💰 Gastos por Subcategoria</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {byCategory.map(([cat, val]) => (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                      <span>{cat}</span>
                      <span style={{ fontWeight: 600 }}>{val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
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
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{Number.isInteger(prod.quantity) ? `${prod.quantity} un.` : `${prod.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{prod.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
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
