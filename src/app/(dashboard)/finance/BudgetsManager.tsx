"use client";

import { useState } from "react";

type Budget = {
  id: string;
  category: string;
  amount: number;
  month: string;
};

export function BudgetsManager({
  budgets,
  categories,
  currentMonth,
  onClose,
  onSave,
  onDelete
}: {
  budgets: Budget[];
  categories: string[];
  currentMonth: string;
  onClose: () => void;
  onSave: (category: string, amount: number, applyToAllMonths: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || "");
  const [amount, setAmount] = useState("");
  const [applyToAll, setApplyToAll] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategory || !amount) return;
    setLoading(true);
    await onSave(selectedCategory, Number(amount), applyToAll);
    setAmount("");
    setLoading(false);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 8,
        width: 320,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Definir Orçamentos (Limites)</strong>
        <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onClose}>
          Fechar
        </button>
      </div>

      <form onSubmit={handleSave} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Categoria</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Limite (R$)</label>
          <input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
            placeholder="Ex: 800"
          />
        </div>
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            id="applyAll"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          <label htmlFor="applyAll" style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Aplicar para todos os meses (Padrão)
          </label>
        </div>
        <button type="submit" className="btn-primary" style={{ width: "100%", padding: "6px", fontSize: 12 }} disabled={loading}>
          {loading ? "Salvando..." : "Salvar Orçamento"}
        </button>
      </form>

      {budgets.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Orçamentos Atuais</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {budgets.map((b) => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-hover)", padding: "6px 8px", borderRadius: 6 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{b.category}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    R$ {b.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} 
                    {b.month === "default" ? " (Fixo)" : ` (${b.month})`}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(b.id)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
