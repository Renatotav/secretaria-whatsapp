"use client";

import { useEffect, useState } from "react";

/** "🔍 Seus padrões": o que se repete nos dias difíceis, para se entender (nunca para cobrar). */
export function PadroesCard({ versao }: { versao: number }) {
  const [frases, setFrases] = useState<string[] | null>(null);
  useEffect(() => {
    fetch("/api/diary/padroes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { frases: string[] }) => setFrases(d.frases))
      .catch(() => setFrases([]));
  }, [versao]);
  if (!frases) return null;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🔍 Seus padrões</h2>
      {frases.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Ainda poucos registros para ver padrão. Escreva nos dias bons também, nem que seja uma linha.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.5 }}>
          {frases.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>Pistas do seu diário e dos gastos, sem IA. Servem para você se entender, não para cobrar nada.</p>
    </div>
  );
}
