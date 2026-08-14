"use client";

import { useState, useEffect } from "react";

export function InsightsModal({
  month,
  onClose,
}: {
  month: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/finance/analysis?month=${month}`);
        if (res.ok) {
          const data = await res.json();
          setInsight(data.analysis || "Não foi possível gerar insights.");
        } else {
          setInsight("Erro ao gerar insights.");
        }
      } catch (err) {
        setInsight("Erro de conexão ao gerar insights.");
      }
      setLoading(false);
    }
    load();
  }, [month]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          maxWidth: 600,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span>✨</span> Insights IA
          </h2>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
            Analisando seus gastos do mês... 🧠
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap", color: "var(--text)", lineHeight: 1.6, fontSize: 14 }}>
            {insight}
          </div>
        )}
      </div>
    </div>
  );
}
