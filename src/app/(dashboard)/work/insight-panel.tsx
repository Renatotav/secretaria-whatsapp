"use client";

import { useEffect, useRef, useState } from "react";

// Produtividade que agrega: clicar numa barra mostra o resumo do recorte
// (só banco) e como ele resolveu das outras vezes; a caixa de pergunta deixa
// perguntar qualquer coisa sobre os chamados (a IA só traduz em filtros).

type Links = { ticket: string; redmine: string };
type Chamado = { ticketId: string; status: string; tipo?: string; grupo?: string; redmine?: string; redmineStatus?: string; dias: number | null };
export type Selecao = { recorte: "grupo" | "tipo" | "origem"; valor: string } | null;
type Insight = {
  criterio: string;
  total: number;
  fechados: number;
  abertos: number;
  redmine: number;
  tempoMedioDias: number | null;
  chamados: Chamado[];
  resolucoes: { ticketId: string; tipo: string; quando: string | null; texto: string }[];
};

const box = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 } as const;
const STATUS: Record<string, { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "var(--warning)" },
  pendente: { label: "Pendente", color: "var(--text-muted)" },
  resolvido: { label: "Resolvido", color: "var(--success)" },
  escalado: { label: "Redmine", color: "var(--accent)" },
};
const tempo = (d: number | null) => (d === null ? "—" : d < 2 ? `${Math.round(d * 24)} h` : `${d.toFixed(1).replace(".", ",")} dias`);

function Link({ id, links }: { id: string; links: Links }) {
  if (!links.ticket) return <strong>{id}</strong>;
  return (
    <a href={links.ticket.replace("{n}", encodeURIComponent(id))} target="_blank" rel="noreferrer" style={{ color: "#60a5fa", textDecoration: "underline", fontWeight: 600 }}>
      {id}
    </a>
  );
}

function Lista({ chamados, links }: { chamados: Chamado[]; links: Links }) {
  if (!chamados.length) return null;
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
      {chamados.map((c) => (
        <div key={c.ticketId} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border-light)" }}>
          <Link id={c.ticketId} links={links} />
          <span style={{ color: STATUS[c.status]?.color || "var(--text-muted)" }}>{STATUS[c.status]?.label || c.status}</span>
          {c.dias !== null && <span style={{ color: "var(--text-muted)" }}>{c.dias}d</span>}
          <span style={{ color: "var(--text-muted)", flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tipo || c.grupo || ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Resumo de uma barra clicada. */
export function InsightPanel({ sel, onClose, links }: { sel: Selecao; onClose: () => void; links: Links }) {
  const [d, setD] = useState<Insight | null>(null);
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sel) return;
    // No celular o resumo fica abaixo dos gráficos: rola até ele.
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    setD(null);
    setErro("");
    fetch(`/api/work/insight?recorte=${sel.recorte}&valor=${encodeURIComponent(sel.valor)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErro(j.error) : setD(j)))
      .catch(() => setErro("Não consegui carregar."));
  }, [sel]);
  if (!sel) return null;
  const num = (label: string, v: string | number, cor?: string) => (
    <div style={{ flex: "1 1 90px", background: "var(--bg-hover)", borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );
  return (
    <div ref={ref} style={{ ...box, marginBottom: 16, borderColor: "var(--accent-border)", scrollMarginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>🔎 {sel.valor}</div>
        <button type="button" onClick={onClose} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", padding: "2px 10px", cursor: "pointer" }}>
          Fechar
        </button>
      </div>
      {erro && <div style={{ color: "var(--danger)", fontSize: 13 }}>{erro}</div>}
      {!d && !erro && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</div>}
      {d && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {num("Chamados no mês", d.total)}
            {num("Fechados", d.fechados, "var(--success)")}
            {num("Em aberto", d.abertos, d.abertos ? "var(--warning)" : undefined)}
            {num("Viraram Redmine", d.redmine, "var(--accent)")}
            {num("Tempo médio", tempo(d.tempoMedioDias))}
          </div>
          {!!d.resolucoes.length && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>💡 Como você resolveu das outras vezes</div>
              <div style={{ display: "grid", gap: 8 }}>
                {d.resolucoes.map((r) => (
                  <div key={r.ticketId} style={{ background: "var(--bg-hover)", borderRadius: 10, padding: "8px 10px", fontSize: 12.5 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Link id={r.ticketId} links={links} />
                      {r.quando && <span style={{ color: "var(--text-muted)" }}> · {new Date(r.quando).toLocaleDateString("pt-BR")}</span>}
                      {r.tipo && <span style={{ color: "var(--text-muted)" }}> · {r.tipo.slice(0, 60)}</span>}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{r.texto}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>Chamados</div>
          <Lista chamados={d.chamados} links={links} />
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>De onde veio: {d.criterio}.</div>
        </>
      )}
    </div>
  );
}

const SUGESTOES = ["Quantos chamados eu fechei este mês?", "Qual o tempo médio de MNI?", "Liste os que viraram Redmine este mês", "Quantos fechei por semana este mês?"];

/** "💬 Pergunte aos seus chamados" */
export function AskBox({ links }: { links: Links }) {
  const [q, setQ] = useState("");
  const [r, setR] = useState<{ resposta: string; criterio?: string; chamados: Chamado[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const perguntar = async (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    setQ(t);
    setCarregando(true);
    setR(null);
    try {
      const j = await (await fetch("/api/work/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pergunta: t }) })).json();
      setR(j.error ? { resposta: j.error, chamados: [] } : j);
    } catch {
      setR({ resposta: "Não consegui perguntar agora.", chamados: [] });
    } finally {
      setCarregando(false);
    }
  };
  return (
    <div style={{ ...box, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💬 Pergunte aos seus chamados</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          perguntar(q);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: quantos de MNI eu fechei em setembro?" style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" disabled={carregando} style={{ background: "var(--accent)", color: "#fff", border: 0, borderRadius: 8, padding: "0 14px", cursor: "pointer" }}>
          {carregando ? "…" : "Perguntar"}
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {SUGESTOES.map((s) => (
          <button key={s} type="button" onClick={() => perguntar(s)} style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--text)", borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
      </div>
      {r && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{r.resposta}</div>
          {r.chamados.length > 0 && <Lista chamados={r.chamados} links={links} />}
          {r.criterio && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>De onde veio: {r.criterio}. A IA só traduz a pergunta; a conta é feita nos seus chamados.</div>}
        </div>
      )}
    </div>
  );
}
