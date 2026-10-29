"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brl } from "@/lib/format";

/** Faixa do topo da aba "Hoje": gasto do dia, folga da scooter e ar de hoje (dados das telas de cada um). */
export function HojeStrip() {
  const [gasto, setGasto] = useState<number | null>(null);
  const [folga, setFolga] = useState<number | null>(null);
  const [ar, setAr] = useState<number | null>(null);

  useEffect(() => {
    // "Hoje" do dono é horário de Brasília.
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    fetch(`/api/finance?month=${hoje.slice(0, 7)}&compra=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: { type: string; amount: number; purchaseDate?: string | null; date: string }[]) =>
        setGasto(list.filter((e) => e.type === "expense" && (e.purchaseDate ?? e.date).slice(0, 10) === hoje).reduce((s, e) => s + e.amount, 0)))
      .catch(() => {});
    fetch("/api/scooter/painel")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { safeKm?: number; kmSince?: number | null }) => { if (d.safeKm != null && d.kmSince != null) setFolga(d.safeKm - d.kmSince); })
      .catch(() => {});
    fetch("/api/aircon")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { empty?: boolean; hoje?: number; price?: number }) => { if (!d.empty && d.hoje != null && d.price != null) setAr(d.hoje * d.price); })
      .catch(() => {});
  }, []);

  const caixa: React.CSSProperties = { textDecoration: "none", color: "var(--text)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
  const rotulo: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };
  const valor: React.CSSProperties = { fontSize: 17, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const corFolga = folga == null ? "var(--text)" : folga <= 0 ? "var(--danger)" : folga <= 8 ? "var(--warning)" : "var(--success)";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
      <Link href="/finance" style={caixa}>
        <span style={rotulo}>💰 Gasto hoje</span>
        <span style={valor}>{gasto == null ? "…" : brl(gasto)}</span>
      </Link>
      <Link href="/scooter" style={caixa}>
        <span style={rotulo}>🛵 Folga</span>
        <span style={{ ...valor, color: corFolga }}>{folga == null ? "—" : folga <= 0 ? "carregar" : `~${Math.round(folga)} km`}</span>
      </Link>
      <Link href="/ar" style={caixa}>
        <span style={rotulo}>❄️ Ar hoje</span>
        <span style={valor}>{ar == null ? "—" : brl(ar)}</span>
      </Link>
    </div>
  );
}
