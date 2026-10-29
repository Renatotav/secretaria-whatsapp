"use client";

import { useEffect, useRef, useState } from "react";

type Aba = "ar" | "scooter" | "finance" | "parcelas";
export type Grafico = { titulo: string; dados: unknown };
type Conta = { sql?: string; linhas?: unknown[]; dados?: unknown };

/** Tabela simples das linhas usadas na resposta (as 20 primeiras). */
function Tabela({ linhas }: { linhas: unknown[] }) {
  const objs = linhas.filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && !Array.isArray(l)).slice(0, 20);
  if (!objs.length) return <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(linhas.slice(0, 20), null, 1)}</pre>;
  const cols = [...new Set(objs.flatMap((o) => Object.keys(o)))].slice(0, 6);
  const fmt = (v: unknown) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleDateString("pt-BR") : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead><tr>{cols.map((c) => <th key={c} style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{c}</th>)}</tr></thead>
        <tbody>{objs.map((o, i) => <tr key={i}>{cols.map((c) => <td key={c} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border-light)", whiteSpace: "nowrap" }}>{fmt(o[c])}</td>)}</tr>)}</tbody>
      </table>
      {linhas.length > 20 && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>e mais {linhas.length - 20} linha(s)</div>}
    </div>
  );
}

/** "🔍 Ver a conta": a consulta que rodou e as linhas que voltaram (ou os números do gráfico). */
function VerConta({ conta }: { conta: Conta }) {
  const linhas = conta.linhas ?? (Array.isArray(conta.dados) ? conta.dados : conta.dados != null ? [conta.dados] : []);
  return (
    <details style={{ fontSize: 13 }}>
      <summary style={{ cursor: "pointer", color: "var(--accent)" }}>🔍 Ver a conta</summary>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {conta.sql ? (
          <>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Consulta que rodou no banco (só leitura):</div>
            <pre style={{ margin: 0, padding: 10, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{conta.sql}</pre>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>A IA só recebeu estes números do gráfico:</div>
        )}
        <Tabela linhas={linhas} />
      </div>
    </details>
  );
}

/** Caixa "Pergunte" das abas: a IA responde com os números da própria aba (ou de um gráfico). */
export function PerguntaIA({ aba, exemplos, grafico, titulo = "💬 Pergunte", autoFocus }: { aba: Aba; exemplos: string[]; grafico?: Grafico; titulo?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const perguntar = async (texto: string) => {
    if (texto.trim().length < 3 || carregando) return;
    setQ(texto);
    setCarregando(true);
    setResp(null);
    setConta(null);
    try {
      const r = await fetch("/api/painel/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aba, pergunta: texto, ...(grafico ? { grafico } : {}) }) });
      const j = await r.json();
      setResp(r.ok ? j.resposta : j.error || "Não consegui responder agora.");
      if (r.ok && (j.conta || j.dados !== undefined)) setConta(j.conta ?? { dados: j.dados });
    } catch {
      setResp("Sem conexão. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  };
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>{titulo}</h2>
      <form onSubmit={(e) => { e.preventDefault(); perguntar(q); }} style={{ display: "flex", gap: 8 }}>
        <input id={`pergunta-${aba}${grafico ? "-g" : ""}`} autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Escreva sua pergunta…" aria-label="Pergunta"
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
      {!carregando && conta && <VerConta conta={conta} />}
    </div>
  );
}

/** Botão 💬 no canto de um gráfico: abre a caixa de pergunta já com os números dele. */
export function PergunteGrafico({ aba, grafico, exemplos }: { aba: Aba; grafico: Grafico; exemplos?: string[] }) {
  const [aberto, setAberto] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label={`Perguntar sobre ${grafico.titulo}`} title="Perguntar sobre este gráfico" className="btn-ghost"
        style={{ fontSize: 12, padding: "3px 8px", lineHeight: 1.4 }}>
        💬 Perguntar
      </button>
      {aberto && (
        <div role="dialog" aria-modal="true" aria-label={`Perguntar sobre ${grafico.titulo}`} onClick={() => setAberto(false)} className="pg-fundo">
          <div onClick={(e) => e.stopPropagation()} className="pg-folha">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 0 }}>Sobre: <strong style={{ color: "var(--text)" }}>{grafico.titulo}</strong></div>
              <button ref={fechar} type="button" onClick={() => setAberto(false)} className="btn-ghost" aria-label="Fechar" style={{ padding: "4px 10px" }}>✕</button>
            </div>
            <PerguntaIA aba={aba} grafico={grafico} titulo="💬 Pergunte a este gráfico" autoFocus
              exemplos={exemplos ?? ["O que chama atenção aqui?", "Qual é o maior e por quê?", "Isso está melhor ou pior que antes?"]} />
          </div>
        </div>
      )}
    </>
  );
}
