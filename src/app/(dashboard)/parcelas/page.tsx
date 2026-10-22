"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";

type Serie = { nome: string; categoria: string; cartao: string; total: number; valor: number; proxima: number; proximaMes: string; faltam: number; restante: number; ultima: string };
type Mes = { mes: string; total: number; acabam: string[] };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => { const [y, mm] = m.split("-").map(Number); return `${MESES[mm - 1]}/${String(y).slice(2)}`; };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/** 📆 Parcelas: quando cada compra parcelada acaba e quanto as parcelas pesam em cada mês. */
export default function ParcelasPage() {
  const [d, setD] = useState<{ series: Serie[]; meses: Mes[] } | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/finance/parcelas").then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErro(true));
  }, []);
  const totalRestante = d?.series.reduce((a, s) => a + s.restante, 0) ?? 0;
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>📆 Parcelas</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Quando cada compra parcelada acaba e quanto sobra a mais em cada mês conforme elas terminam.</p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d && !d.series.length && <div style={{ color: "var(--text-muted)" }}>Nenhuma compra parcelada em aberto. 🎉</div>}
        {d && d.series.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(160px, 100%), 1fr))", gap: 10 }}>
              <div style={{ ...card, display: "grid", gap: 2 }}>
                <span style={muted}>Ainda falta pagar</span>
                <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{brl(totalRestante)}</strong>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>em {d.series.length} compras</span>
              </div>
              {d.meses.length > 0 && (
                <div style={{ ...card, display: "grid", gap: 2 }}>
                  <span style={muted}>Parcelas em {mesCurto(d.meses[0].mes)}</span>
                  <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{brl(d.meses[0].total)}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>o mês mais pesado daqui para a frente</span>
                </div>
              )}
              {d.meses.length > 5 && (
                <div style={{ ...card, display: "grid", gap: 2 }}>
                  <span style={muted}>Respiro em {mesCurto(d.meses[4].mes)}</span>
                  <strong style={{ fontSize: 20, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>+{brl(d.meses[0].total - d.meses[4].total)}</strong>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>a mais por mês, comparado com {mesCurto(d.meses[0].mes)}</span>
                </div>
              )}
            </div>
            <Grafico meses={d.meses} />
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Compras parceladas · da que acaba primeiro para a última</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
                {d.series.map((s) => (
                  <div key={s.nome + s.total + s.cartao} style={{ ...card, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ minWidth: 0, overflowWrap: "anywhere" }} title={s.nome}>{s.nome.replace(/\s*\(pedido[^)]*\)/, "")}</strong>
                      <strong style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.total}× {brl(s.valor)}</strong>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "var(--bg-hover)", overflow: "hidden" }} title={`${s.total - s.faltam} de ${s.total} pagas`}>
                      <div style={{ width: `${((s.total - s.faltam) / s.total) * 100}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                    <div style={{ ...muted, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                      <span>próxima: {s.proxima} de {s.total} em {mesCurto(s.proximaMes)}</span>
                      <span>faltam {brl(s.restante)}</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      Acaba em <strong>{mesCurto(s.ultima)}</strong>
                      <span style={{ ...muted, marginLeft: 6 }}>{s.categoria}{s.cartao ? ` · ${s.cartao}` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Barras: quanto as parcelas somam em cada mês; marca quando alguma termina. */
function Grafico({ meses }: { meses: Mes[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const [sel, setSel] = useState<number | null>(null);
  if (!meses.length) return null;
  const h = 190, top = 24, base = h - 26, left = 8;
  const max = Math.max(...meses.map((m) => m.total)) * 1.15 || 1;
  const passo = (w - left * 2) / meses.length;
  const bw = Math.min(34, passo * 0.62);
  const y = (v: number) => base - (v / max) * (base - top);
  const atual = sel != null ? meses[sel] : null;
  return (
    <div style={card}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>📉 Quanto as parcelas pesam por mês</h2>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Total de parcelas por mês">
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
          {meses.map((m, i) => {
            const cx = left + passo * i + passo / 2;
            const on = sel === i;
            return (
              <g key={m.mes} onClick={() => setSel(on ? null : i)} style={{ cursor: "pointer" }}>
                <rect x={cx - passo / 2} y={0} width={passo} height={h} fill={on ? "var(--bg-hover)" : "transparent"} rx={6} />
                <rect x={cx - bw / 2} y={y(m.total)} width={bw} height={base - y(m.total)} rx={4} fill="var(--accent)" opacity={0.85} stroke={on ? "var(--text)" : "none"} />
                {passo >= 38 && <text x={cx} y={y(m.total) - 6} textAnchor="middle" fontSize={10} fill="var(--text)">{Math.round(m.total)}</text>}
                <text x={cx} y={h - 9} textAnchor="middle" fontSize={10} fill={m.acabam.length ? "var(--success)" : "var(--text-muted)"}>{m.acabam.length ? "✓" : ""}{passo < 44 ? MESES[Number(m.mes.slice(5)) - 1].slice(0, 1) : mesCurto(m.mes)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {atual ? (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-hover)", fontSize: 13, display: "grid", gap: 3 }}>
          <strong>{mesCurto(atual.mes)}: {brl(atual.total)} de parcelas</strong>
          {atual.acabam.length > 0 && <span style={muted}>✓ Última parcela: {atual.acabam.map((n) => n.replace(/\s*\(pedido[^)]*\)/, "")).join(", ")}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>👆 Toque num mês para ver o total e o que termina nele. ✓ verde = alguma parcela acaba nesse mês.</div>
      )}
    </div>
  );
}
