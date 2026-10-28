"use client";

import { useState } from "react";

/** Caixa "Pergunte" das abas: a IA responde com os números da própria aba. */
export function PerguntaIA({ aba, exemplos }: { aba: "ar" | "scooter"; exemplos: string[] }) {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const perguntar = async (texto: string) => {
    if (texto.trim().length < 3 || carregando) return;
    setQ(texto);
    setCarregando(true);
    setResp(null);
    try {
      const r = await fetch("/api/painel/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aba, pergunta: texto }) });
      const j = await r.json();
      setResp(r.ok ? j.resposta : j.error || "Não consegui responder agora.");
    } catch {
      setResp("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  };
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>💬 Pergunte</h2>
      <form onSubmit={(e) => { e.preventDefault(); perguntar(q); }} style={{ display: "flex", gap: 8 }}>
        <input id={`pergunta-${aba}`} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Escreva sua pergunta…" aria-label="Pergunta"
          style={{ flex: 1, minWidth: 0, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px", color: "var(--text)", font: "inherit", fontSize: 14 }} />
        <button type="submit" disabled={carregando || q.trim().length < 3}
          style={{ background: "var(--accent)", color: "#fff", border: 0, borderRadius: 8, padding: "0 14px", fontWeight: 600, cursor: "pointer", opacity: carregando || q.trim().length < 3 ? 0.5 : 1 }}>
          {carregando ? "…" : "Perguntar"}
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {exemplos.map((e) => (
          <button key={e} type="button" onClick={() => perguntar(e)} disabled={carregando}
            style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            {e}
          </button>
        ))}
      </div>
      {(carregando || resp) && (
        <div aria-live="polite" style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", color: carregando ? "var(--text-muted)" : "var(--text)" }}>
          {carregando ? "Pensando…" : resp}
        </div>
      )}
    </div>
  );
}
