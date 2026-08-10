"use client";
import { useState, useEffect, useCallback } from "react";

interface FinanceEntry {
  id: string;
  type: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  source: string;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EMPTY_FORM = { type: "expense", amount: "", category: "", description: "", date: "" };

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/finance?month=${month}`);
    const data = await res.json();
    setEntries(data);
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount) return;
    setSaving(true);
    await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        date: form.date ? new Date(form.date).toISOString() : undefined,
      }),
    });
    setForm(EMPTY_FORM);
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/finance?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>💰 Financeiro</h1>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ width: 160 }}
          />
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Receitas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{formatMoney(income)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Despesas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{formatMoney(expense)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Saldo</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: balance >= 0 ? "var(--accent)" : "var(--danger)" }}>
              {formatMoney(balance)}
            </p>
          </div>
        </div>

        {/* Add form */}
        <form
          onSubmit={addEntry}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "110px 120px 1fr 1fr 140px auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Tipo</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Valor</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Categoria</label>
            <input
              list="finance-categories"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Alimentação"
            />
            <datalist id="finance-categories">
              <option value="Alimentação" />
              <option value="Transporte" />
              <option value="Moradia" />
              <option value="Saúde" />
              <option value="Lazer" />
              <option value="Salário" />
              <option value="Contas" />
              <option value="Outros" />
            </datalist>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Descrição</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "..." : "Adicionar"}
          </button>
        </form>

        {/* Table */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>}
          {!loading && entries.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
              Nenhum lançamento neste mês
            </div>
          )}
          {!loading && entries.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Data</th>
                  <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Categoria</th>
                  <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Descrição</th>
                  <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Origem</th>
                  <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500, textAlign: "right" }}>Valor</th>
                  <th style={{ padding: "10px 16px" }} />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "10px 16px" }}>{new Date(e.date).toLocaleDateString("pt-BR")}</td>
                    <td style={{ padding: "10px 16px" }}>{e.category || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{e.description || "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-dim)" }}>
                      {e.source === "whatsapp" ? "📱 WhatsApp" : "🖥️ Painel"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: e.type === "income" ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {e.type === "income" ? "+" : "-"} {formatMoney(e.amount)}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => deleteEntry(e.id)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
