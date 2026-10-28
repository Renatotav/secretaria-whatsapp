"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { nivel: "ok" | "atencao" | "problema"; titulo: string; detalhe: string };

const COR = { ok: "var(--success)", atencao: "var(--warning)", problema: "var(--danger)" } as const;
const ROTULO = { ok: "ok", atencao: "atenção", problema: "problema" } as const;
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };

/** 🚦 Saúde: WhatsApp, última mensagem, ponte da tomada, crédito da IA e há quanto tempo está no ar. */
export default function SaudePage() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [at, setAt] = useState("");
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(() => {
    setCarregando(true);
    setErro(false);
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setItens(d.itens); setAt(d.at); })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const problemas = itens?.filter((i) => i.nivel !== "ok").length ?? 0;
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 760, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🚦 Saúde do sistema</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              O WhatsApp é conferido a cada 5 min. Se cair, a Alexa avisa; quando voltar, chega uma mensagem. No WhatsApp: &quot;como está o sistema?&quot;.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={carregar} disabled={carregando}>{carregando ? "Conferindo..." : "Conferir de novo"}</button>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui conferir. Tente de novo.</div>}
        {!itens && !erro && <div style={{ color: "var(--text-muted)" }}>Conferindo...</div>}
        {itens && (
          <>
            <div style={{ ...card, borderColor: problemas ? "var(--danger)" : "var(--border)", fontWeight: 600 }}>
              {problemas ? `${problemas} ${problemas === 1 ? "item precisa" : "itens precisam"} de atenção` : "Tudo funcionando"}
              {at && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>conferido às {new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {itens.map((i) => (
                <div key={i.titulo} style={{ ...card, display: "flex", gap: 12, alignItems: "center" }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 5, background: COR[i.nivel], flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{i.titulo}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", overflowWrap: "anywhere" }}>{i.detalhe}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: COR[i.nivel], textTransform: "uppercase", letterSpacing: ".04em" }}>{ROTULO[i.nivel]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
