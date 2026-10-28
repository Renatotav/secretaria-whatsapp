"use client";

import { useEffect, useMemo, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { brl } from "@/lib/format";

type Aberta = { n: number; mes: string; valor: number };
type Serie = { nome: string; categoria: string; cartao: string; total: number; valor: number; proxima: number; proximaMes: string; faltam: number; restante: number; ultima: string; abertas: Aberta[] };
type Mes = { mes: string; total: number; itens: { nome: string; n: number; de: number; valor: number; ultima: boolean }[] };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => { const [y, mm] = m.split("-").map(Number); return `${MESES[mm - 1]}/${String(y).slice(2)}`; };
const limpaNome = (n: string) => n.replace(/\s*\(pedido[^)]*\)/, "").replace(/\s*\((previsto|recorrente)\)/gi, "").trim();
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

type Ordem = "acaba" | "valor" | "restante";

/** Botão de filtro (toque liga/desliga). */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{ padding: "6px 12px", borderRadius: 999, fontSize: 13, whiteSpace: "nowrap", border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-dim)" : "transparent", color: on ? "var(--text)" : "var(--text-muted)", fontWeight: on ? 600 : 400 }}
    >
      {children}
    </button>
  );
}

/** 📆 Parcelas: quanto falta, quanto pesa cada mês e quando vem o respiro — com filtros. */
export default function ParcelasPage() {
  const [series, setSeries] = useState<Serie[] | null>(null);
  const [erro, setErro] = useState(false);
  const [cartao, setCartao] = useState<string | null>(null); // null = todos; "" = o dele
  const [categoria, setCategoria] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("acaba");
  useEffect(() => {
    fetch("/api/finance/parcelas").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setSeries(d.series)).catch(() => setErro(true));
  }, []);

  const cartoes = useMemo(() => [...new Set((series ?? []).map((s) => s.cartao))], [series]);
  const categorias = useMemo(() => [...new Set((series ?? []).map((s) => s.categoria))].sort(), [series]);
  const filtradas = useMemo(() => {
    const l = (series ?? []).filter((s) => (cartao === null || s.cartao === cartao) && (categoria === null || s.categoria === categoria));
    const ord = { acaba: (a: Serie, b: Serie) => a.ultima.localeCompare(b.ultima), valor: (a: Serie, b: Serie) => b.valor - a.valor, restante: (a: Serie, b: Serie) => b.restante - a.restante }[ordem];
    return [...l].sort(ord);
  }, [series, cartao, categoria, ordem]);

  // Peso de cada mês com os filtros (próximos 12 meses que têm parcela).
  const meses = useMemo<Mes[]>(() => {
    const m = new Map<string, Mes>();
    for (const s of filtradas)
      for (const p of s.abertas) {
        const x = m.get(p.mes) ?? { mes: p.mes, total: 0, itens: [] };
        x.total += p.valor;
        x.itens.push({ nome: limpaNome(s.nome), n: p.n, de: s.total, valor: p.valor, ultima: p.n === s.total });
        m.set(p.mes, x);
      }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(0, 12).map((x) => ({ ...x, total: Math.round(x.total * 100) / 100, itens: x.itens.sort((a, b) => b.valor - a.valor) }));
  }, [filtradas]);

  const totalRestante = filtradas.reduce((a, s) => a + s.restante, 0);
  // Respiro: o primeiro mês em que o peso cai pelo menos 20% em relação ao próximo mês.
  const respiro = meses.length > 1 ? meses.find((m) => m.total <= meses[0].total * 0.8) : undefined;

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ paddingBlock: 20, paddingInline: "max(16px, env(safe-area-inset-left, 0px))", maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>📆 Parcelas</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Quanto falta pagar, quanto cada mês pesa e quando sobra mais.</p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!series && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {series && !series.length && <div style={{ color: "var(--text-muted)" }}>Nenhuma compra parcelada em aberto. 🎉</div>}
        {series && series.length > 0 && (
          <>
            {/* Filtros */}
            <div style={{ ...card, display: "grid", gap: 10 }}>
              {cartoes.length > 1 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
                  <span style={{ ...muted, minWidth: 70, flexShrink: 0 }}>Cartão</span>
                  <Chip on={cartao === null} onClick={() => setCartao(null)}>Todos</Chip>
                  {cartoes.map((c) => (
                    <Chip key={c || "meu"} on={cartao === c} onClick={() => setCartao(cartao === c ? null : c)}>{c ? `💳 ${c}` : "💳 Meu cartão"}</Chip>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
                <span style={{ ...muted, minWidth: 70, flexShrink: 0 }}>Categoria</span>
                <Chip on={categoria === null} onClick={() => setCategoria(null)}>Todas</Chip>
                {categorias.map((c) => (
                  <Chip key={c} on={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>{c}</Chip>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
                <span style={{ ...muted, minWidth: 70, flexShrink: 0 }}>Ordem</span>
                <Chip on={ordem === "acaba"} onClick={() => setOrdem("acaba")}>Acaba primeiro</Chip>
                <Chip on={ordem === "valor"} onClick={() => setOrdem("valor")}>Maior parcela</Chip>
                <Chip on={ordem === "restante"} onClick={() => setOrdem("restante")}>Mais falta pagar</Chip>
              </div>
            </div>

            {/* Resumo */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(170px, 100%), 1fr))", gap: 10 }}>
              <div style={{ ...card, display: "grid", gap: 2 }}>
                <span style={muted}>Ainda falta pagar</span>
                <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{brl(totalRestante)}</strong>
                <span style={muted}>em {filtradas.length} {filtradas.length === 1 ? "compra" : "compras"}</span>
              </div>
              {meses[0] && (
                <div style={{ ...card, display: "grid", gap: 2 }}>
                  <span style={muted}>Próxima fatura ({mesCurto(meses[0].mes)})</span>
                  <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{brl(meses[0].total)}</strong>
                  <span style={muted}>{meses[0].itens.length} parcela(s)</span>
                </div>
              )}
              {respiro && (
                <div style={{ ...card, display: "grid", gap: 2, borderColor: "color-mix(in srgb, var(--success) 45%, transparent)" }}>
                  <span style={muted}>Respiro em {mesCurto(respiro.mes)}</span>
                  <strong style={{ fontSize: 22, color: "var(--success)", fontVariantNumeric: "tabular-nums" }}>+{brl(meses[0].total - respiro.total)}</strong>
                  <span style={muted}>a mais por mês do que em {mesCurto(meses[0].mes)}</span>
                </div>
              )}
            </div>

            {meses.length > 0 && <Grafico meses={meses} />}

            {/* Compras */}
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Compras parceladas ({filtradas.length})</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
                {filtradas.map((s) => {
                  const pagas = s.total - s.faltam;
                  const acabaLogo = s.faltam <= 2;
                  return (
                    <div key={s.nome + s.total + s.cartao} style={{ ...card, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <strong style={{ minWidth: 0, overflowWrap: "anywhere", fontSize: 14 }} title={s.nome}>{limpaNome(s.nome)}</strong>
                        <strong style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 14 }}>{brl(s.valor)}</strong>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg-hover)", color: "var(--text-muted)" }}>{s.categoria}</span>
                        {s.cartao && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--bg-hover)", color: "var(--text-muted)" }}>💳 {s.cartao}</span>}
                        {acabaLogo && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--success) 18%, transparent)", color: "var(--success)", fontWeight: 600 }}>{s.faltam === 1 ? "última parcela" : "faltam 2"}</span>}
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--bg-hover)", overflow: "hidden" }} title={`${pagas} de ${s.total} pagas`}>
                          <div style={{ width: `${(pagas / s.total) * 100}%`, height: "100%", background: acabaLogo ? "var(--success)" : "var(--accent)" }} />
                        </div>
                        <div style={{ ...muted, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <span>{pagas} de {s.total} pagas · próxima {s.proxima}/{s.total} em {mesCurto(s.proximaMes)}</span>
                          <span>acaba <b style={{ color: "var(--text)" }}>{mesCurto(s.ultima)}</b></span>
                        </div>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Falta <b style={{ fontVariantNumeric: "tabular-nums" }}>{brl(s.restante)}</b> <span style={muted}>({s.faltam}x)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!filtradas.length && <div style={{ ...muted, padding: 12 }}>Nada com esses filtros.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Barras: quanto as parcelas somam em cada mês; tocar mostra quais são. */
function Grafico({ meses }: { meses: Mes[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const [sel, setSel] = useState<number>(0);
  const h = 200, top = 26, base = h - 28, left = 6;
  const max = Math.max(...meses.map((m) => m.total)) * 1.15 || 1;
  const passo = (w - left * 2) / meses.length;
  const bw = Math.min(36, passo * 0.64);
  const y = (v: number) => base - (v / max) * (base - top);
  const atual = meses[Math.min(sel, meses.length - 1)];
  const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toString());
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📉 Quanto as parcelas pesam por mês</h2>
        <span style={muted}>toque num mês</span>
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Total de parcelas por mês">
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
          {meses.map((m, i) => {
            const cx = left + passo * i + passo / 2;
            const on = sel === i;
            const acaba = m.itens.some((x) => x.ultima);
            return (
              <g
                key={m.mes}
                onClick={() => setSel(i)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel(i)}
                tabIndex={0}
                role="button"
                aria-label={`${mesCurto(m.mes)}: ${brl(m.total)}`}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <rect x={cx - passo / 2} y={0} width={passo} height={h} fill={on ? "var(--bg-hover)" : "transparent"} rx={6} />
                <rect x={cx - bw / 2} y={y(m.total)} width={bw} height={Math.max(2, base - y(m.total))} rx={5} fill={on ? "var(--accent)" : "color-mix(in srgb, var(--accent) 65%, transparent)"} />
                {(passo >= 34 || on) && <text x={cx} y={y(m.total) - 7} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"} fontWeight={on ? 700 : 400}>{curto(m.total)}</text>}
                <text x={cx} y={h - 10} textAnchor="middle" fontSize={10} fill={acaba ? "var(--success)" : "var(--text-muted)"} fontWeight={on ? 700 : 400}>
                  {passo < 44 ? MESES[Number(m.mes.slice(5)) - 1].slice(0, 1) : MESES[Number(m.mes.slice(5)) - 1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ ...muted, marginTop: 2 }}>Mês em verde = alguma parcela acaba nele.</div>
      {atual && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "var(--bg-hover)", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>{mesCurto(atual.mes)}</strong>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{brl(atual.total)}</strong>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {atual.itens.map((x, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  {x.nome} <span style={muted}>{x.n}/{x.de}</span>
                  {x.ultima && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--success)", fontWeight: 600 }}>✓ última</span>}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{brl(x.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
