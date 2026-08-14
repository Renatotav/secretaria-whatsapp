"use client";

import { useEffect, useState } from "react";

type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  color: string;
};

export function GoalsSection() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", targetAmount: "", deadline: "", color: "#7c6dff" });
  const [addAmounts, setAddAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    loadGoals();
  }, []);

  async function loadGoals() {
    setLoading(true);
    const res = await fetch("/api/finance/goals");
    if (res.ok) {
      setGoals(await res.json());
    }
    setLoading(false);
  }

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", targetAmount: "", deadline: "", color: "#7c6dff" });
    setShowForm(false);
    loadGoals();
  }

  async function addMoney(id: string) {
    const amount = Number(addAmounts[id]);
    if (!amount) return;
    await fetch("/api/finance/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, addAmount: amount }),
    });
    setAddAmounts((prev) => ({ ...prev, [id]: "" }));
    loadGoals();
  }

  async function deleteGoal(id: string) {
    if (!confirm("Excluir esta meta?")) return;
    await fetch("/api/finance/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadGoals();
  }

  if (loading) return <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 20 }}>Carregando metas...</div>;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>🎯 Metas de Economia</h2>
        <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Nova Meta"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createGoal} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", background: "var(--bg-hover)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Nome (ex: Carro)</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "6px 8px" }} />
            </div>
            <div style={{ width: 100 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Alvo (R$)</label>
              <input required type="number" min="1" step="0.01" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} style={{ width: "100%", padding: "6px 8px" }} />
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
             <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Prazo (Opcional)</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} style={{ width: "100%", padding: "6px 8px" }} />
            </div>
            <div style={{ width: 60 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Cor</label>
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: "100%", height: 32, padding: 0, border: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="submit" className="btn-primary" style={{ padding: "6px 16px", height: 32 }}>Salvar</button>
            </div>
          </div>
        </form>
      )}

      {goals.length === 0 && !showForm && (
        <div style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: 12 }}>
          Nenhuma meta definida. Comece a guardar para um sonho!
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {goals.map((g) => {
          const percent = Math.min((g.currentAmount / g.targetAmount) * 100, 100);
          return (
            <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, position: "relative" }}>
              <button onClick={() => deleteGoal(g.id)} style={{ position: "absolute", top: 4, right: 4, background: "transparent", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14 }}>×</button>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: g.color }}>{g.name}</h3>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>R$ {g.currentAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span>R$ {g.targetAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ height: 6, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", background: g.color, width: `${percent}%`, transition: "width 0.3s" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  placeholder="Adicionar R$"
                  style={{ fontSize: 11, padding: "4px 6px", width: 100 }}
                  value={addAmounts[g.id] || ""}
                  onChange={(e) => setAddAmounts((prev) => ({ ...prev, [g.id]: e.target.value }))}
                />
                <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => addMoney(g.id)}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
