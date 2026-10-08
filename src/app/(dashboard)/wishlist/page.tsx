"use client";

import { useCallback, useEffect, useState } from "react";
import { FINANCE_TAXONOMY_DATA } from "@/lib/finance-taxonomy";

type Verdict = { level: "green" | "yellow" | "red"; text: string };
type Wish = {
  id: string;
  name: string;
  amount: number;
  installments: number;
  paymentMethod: string;
  category: string;
  status: "wish" | "bought" | "dropped";
  verdict: Verdict | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = { green: "var(--success)", yellow: "var(--warning)", red: "var(--danger)" };
const ICONS = { green: "🟢", yellow: "🟡", red: "🔴" };
const EMPTY = { name: "", amount: "", installments: "1", paymentMethod: "cartão", category: "Compras" };

/**
 * Lista de desejos: o que ele quer comprar e se cabe agora (🟢 cabe ·
 * 🟡 aperta/estoura o teto · 🔴 deixaria o mês no vermelho). A secretária
 * avisa no WhatsApp quando um desejo passa a caber.
 */
export default function WishlistPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/wishlist");
    if (res.ok) setWishes(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !Number(form.amount)) return;
    setSaving(true);
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount), installments: Number(form.installments) }),
    });
    setForm(EMPTY);
    setSaving(false);
    load();
  }

  async function setStatus(id: string, status: Wish["status"]) {
    await fetch("/api/wishlist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Apagar este desejo?")) return;
    await fetch("/api/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  const active = wishes.filter((w) => w.status === "wish");
  const done = wishes.filter((w) => w.status !== "wish");

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🛍️ Lista de desejos</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Anote o que quer comprar. A secretária confere se cabe no mês e no teto, e avisa no WhatsApp quando passar a caber.
      </p>

      <form onSubmit={add} style={{ display: "flex", flexWrap: "wrap", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 20 }}>
        <input placeholder="O que (ex: Tênis)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ flex: "2 1 160px" }} />
        <input type="number" step="0.01" placeholder="Valor total" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={{ flex: "1 1 110px" }} />
        <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} style={{ flex: "1 1 110px" }}>
          <option value="cartão">Cartão</option>
          <option value="pix">Pix</option>
          <option value="débito">Débito</option>
          <option value="ticket">VR</option>
        </select>
        {form.paymentMethod === "cartão" && (
          <select value={form.installments} onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))} style={{ flex: "1 1 90px" }}>
            {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
              <option key={n} value={n}>{n === 1 ? "à vista" : `${n}×`}</option>
            ))}
          </select>
        )}
        <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ flex: "1 1 130px" }}>
          {Object.keys(FINANCE_TAXONOMY_DATA.expense).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className="btn-primary" disabled={saving} style={{ flex: "1 1 100px" }}>Adicionar</button>
      </form>

      {loading && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
      {!loading && active.length === 0 && <div style={{ color: "var(--text-muted)" }}>Nenhum desejo na lista. No WhatsApp: &quot;quero comprar um tênis de 300 em 3x&quot;.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {active.map((w) => (
          <div key={w.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 15 }}>{w.name}</strong>
              <strong style={{ fontSize: 15 }}>{brl(w.amount)}</strong>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {w.category} · {w.paymentMethod === "cartão" ? (w.installments > 1 ? `${w.installments}× de ${brl(w.amount / w.installments)}` : "cartão à vista") : w.paymentMethod === "ticket" ? "VR" : w.paymentMethod}
            </div>
            {w.verdict && (
              <div style={{ fontSize: 13, color: COLORS[w.verdict.level] }}>
                {ICONS[w.verdict.level]} {w.verdict.text.charAt(0).toUpperCase() + w.verdict.text.slice(1)}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setStatus(w.id, "bought")}>✅ Comprei</button>
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setStatus(w.id, "dropped")}>Desistir</button>
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px", marginLeft: "auto" }} onClick={() => remove(w.id)}>Apagar</button>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 }}>Já resolvidos</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {done.map((w) => (
              <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text-muted)" }}>
                <span>{w.status === "bought" ? "✅ Comprado" : "✖️ Desisti"}</span>
                <span>· {w.name} — {brl(w.amount)}</span>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 6px", marginLeft: "auto" }} onClick={() => setStatus(w.id, "wish")}>Voltar pra lista</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
