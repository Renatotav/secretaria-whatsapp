"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Item = { nivel: "ok" | "atencao" | "problema"; titulo: string; detalhe: string };

// Aba "☰ Mais" do celular: o que não cabe nas 4 abas de baixo, com o sinal da Saúde no topo.
const TELAS = [
  { href: "/parcelas", icon: "📆", label: "Parcelas", dica: "quanto falta pagar" },
  { href: "/ar", icon: "❄️", label: "Ar-condicionado", dica: "gasto e conta de luz" },
  { href: "/diary", icon: "📓", label: "Diário", dica: "como foi o dia" },
  { href: "/wishlist", icon: "🛍️", label: "Desejos", dica: "cabe no mês?" },
  { href: "/daily-summary", icon: "📋", label: "Resumo do dia", dica: "o das 21h" },
  { href: "/weekly-report", icon: "📊", label: "Relatório semanal", dica: "todo domingo" },
];

export default function MaisPage() {
  const router = useRouter();
  const [itens, setItens] = useState<Item[] | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItens(d.itens))
      .catch(() => setItens([]));
  }, []);
  const ruins = (itens ?? []).filter((i) => i.nivel !== "ok");
  const tudoOk = itens !== null && itens.length > 0 && ruins.length === 0;

  async function sair() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h1>☰ Mais</h1>

        <Link
          href="/saude"
          style={{
            textDecoration: "none", color: "var(--text)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
            background: itens === null ? "var(--bg-card)" : tudoOk ? "rgba(74, 222, 128, 0.08)" : "rgba(248, 113, 113, 0.08)",
            border: `1px solid ${itens === null ? "var(--border)" : tudoOk ? "rgba(74, 222, 128, 0.35)" : "rgba(248, 113, 113, 0.4)"}`,
          }}
        >
          <span aria-hidden style={{ fontSize: 22 }}>🚦</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              {itens === null ? "Conferindo o sistema…" : tudoOk ? "Tudo funcionando" : itens.length === 0 ? "Não consegui conferir" : `${ruins.length} ${ruins.length === 1 ? "coisa precisa" : "coisas precisam"} de atenção`}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {ruins.length > 0 ? ruins.map((i) => i.titulo).join(" · ") : "WhatsApp, tomada, chave do ar e crédito da IA"}
            </span>
          </span>
          <span aria-hidden style={{ fontSize: 18, color: "var(--text-muted)" }}>›</span>
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: 8 }}>
          {TELAS.map((t) => (
            <Link key={t.href} href={t.href} style={{ textDecoration: "none", color: "var(--text)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              <span aria-hidden style={{ fontSize: 22 }}>{t.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</span>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.dica}</span>
            </Link>
          ))}
        </div>

        <Link href="/config" style={{ textDecoration: "none", color: "var(--text)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden style={{ fontSize: 20 }}>⚙️</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Configurações</span>
          <span aria-hidden style={{ fontSize: 18, color: "var(--text-muted)" }}>›</span>
        </Link>
        <button type="button" onClick={sair} className="btn-ghost" style={{ alignSelf: "flex-start", padding: "8px 12px" }}>🚪 Sair do painel</button>
      </div>
    </div>
  );
}
