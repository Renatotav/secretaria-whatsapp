"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { brl } from "@/lib/format";
import { PerguntaIA } from "../pergunta-ia";

type Semana = { inicio: string; besteira: number; delivery: number; academia: number; peso: number | null; kcal: number; proteina: number; cobertura: number | null };
type Numeros = {
  perfil: { altura: number; idade: number; sexo: "M" | "F" } | null;
  imc: { valor: number; faixa: string } | null;
  kcal: { tmb: number; fator: number; gasto: number; meta: number } | null;
  porSemana: number | null;
  previsao: string | null;
  academiaPorSemana: number;
};
type Exercicio = { nome: string; vezes: number; recorde: number | null; ultima: { at: string; rm: number | null; desc: string }; historico: { at: string; rm: number | null; desc: string }[] };
type Treino = { grupos: { feitos: [string, number][]; faltam: string[] }; exercicios: Exercicio[]; plano: { dia: string; treino: string }[] };
type Dados = { academiaDias: string[]; hoje: string; cardioHoje: number; comidas: { at: string; kcal: number; texto: string }[]; treino: Treino; numeros: Numeros; pesos: { at: string; value: number }[]; meta: number | null; academia7: number; semanas: Semana[] };

const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const TZ = { timeZone: "America/Sao_Paulo" } as const;
const dia = (s: string) => new Date(s).toLocaleDateString("pt-BR", { ...TZ, day: "2-digit", month: "2-digit" });
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/**
 * Corpo (pedido dele, 24/11/2026): peso e meta, dias de academia e quanto foi para
 * besteira/bebida e delivery por semana (das notas e lançamentos). Tudo chega pelo WhatsApp.
 */
export default function CorpoPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/corpo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErro(true));
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>💪 Corpo</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No WhatsApp: <em>peso 108,5</em> · <em>fui na academia</em> · <em>meta de peso 95</em> · <em>como está meu peso?</em>
          </p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d && <Painel d={d} />}
      </div>
    </div>
  );
}

function Painel({ d }: { d: Dados }) {
  const ult = d.pesos.at(-1);
  const primeiro = d.pesos[0];
  const falta = ult && d.meta != null ? ult.value - d.meta : null;
  const comidaSemana = d.semanas.at(-1);
  const anteriores = d.semanas.slice(0, -1).filter((s) => s.besteira + s.delivery > 0);
  // Calorias compradas por dia: média das últimas 4 semanas que tiveram nota (o que entrou em casa, não o que comeu).
  const comNota = d.semanas.slice(-4).filter((s) => s.kcal > 0);
  const kcalDia = comNota.length ? comNota.reduce((t, s) => t + s.kcal, 0) / (comNota.length * 7) : null;
  const mediaComida = anteriores.length ? anteriores.reduce((t, s) => t + s.besteira + s.delivery, 0) / anteriores.length : null;

  const perdeu = ult && primeiro ? primeiro.value - ult.value : 0;
  const caminho = ult && primeiro && d.meta != null && primeiro.value > d.meta ? Math.max(0, Math.min(1, perdeu / (primeiro.value - d.meta))) : null;
  const prev = d.numeros.previsao ? new Date(d.numeros.previsao + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : null;
  const hoje = d.comidas.filter((c) => dia(c.at) === dia(new Date().toISOString())).reduce((t, c) => t + c.kcal, 0);
  const metaK = d.numeros.kcal?.meta ?? null;
  const semanaAtual = d.semanas.at(-1);
  const big: React.CSSProperties = { fontSize: 44, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" };
  const barra = (pct: number, cor: string) => (
    <div style={{ height: 10, borderRadius: 5, background: "var(--bg-hover)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, height: "100%", background: cor, borderRadius: 5 }} />
    </div>
  );

  return (
    <>
      {!ult && (
        <div style={{ ...card, display: "grid", gap: 10, borderColor: "var(--accent-border)" }}>
          <strong style={{ fontSize: 18 }}>Comece em 3 mensagens no WhatsApp</strong>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 14 }}>
            <li><em>peso 110</em> — de manhã, em jejum</li>
            <li><em>meta de peso 95</em></li>
            <li><em>perfil 1,78 m 38 anos homem</em> — para IMC e calorias</li>
          </ol>
          <span style={muted}>Depois: <em>comi 2 coxinhas</em>, <em>supino 3x10 40kg</em>, <em>corri 5 km</em>, <em>calorias da banana</em>.</span>
        </div>
      )}
      {/* O número que importa: o peso, e o caminho até a meta. */}
      {ult && <div style={{ ...card, display: "grid", gap: 12, borderColor: "var(--accent-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={muted}>Peso {ult ? `em ${dia(ult.at)}` : ""}</span>
            <span style={big}>{ult ? `${n(ult.value, 1)} kg` : "—"}</span>
          </div>
          <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
            {d.pesos.length > 1 && <strong style={{ fontSize: 18, color: perdeu > 0 ? "var(--success)" : "var(--warning)", fontVariantNumeric: "tabular-nums" }}>{perdeu > 0 ? "−" : "+"}{n(Math.abs(perdeu), 1)} kg</strong>}
            <span style={muted}>{primeiro && d.pesos.length > 1 ? `desde ${dia(primeiro.at)}` : "mande: peso 108,5"}</span>
          </div>
        </div>
        {caminho != null && d.meta != null && (
          <div style={{ display: "grid", gap: 6 }}>
            {barra(caminho, "var(--accent)")}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              <span>{n(primeiro!.value, 1)} kg</span>
              <span style={{ color: "var(--text)" }}>{n(caminho * 100)}% do caminho · faltam {n(ult!.value - d.meta, 1)} kg</span>
              <span>meta {n(d.meta, 1)} kg</span>
            </div>
          </div>
        )}
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {d.numeros.porSemana != null ? <>Ritmo <strong style={{ color: "var(--text)" }}>{d.numeros.porSemana > 0 ? "+" : "−"}{n(Math.abs(d.numeros.porSemana), 1)} kg/semana</strong>{prev && <> · chega na meta por volta de <strong style={{ color: "var(--text)" }}>{prev}</strong></>}</> : d.meta == null ? "Mande a meta: meta de peso 95" : "O ritmo aparece com 3 pesos em 1 semana."}
        </div>
      </div>}

      {/* Hoje e esta semana, lado a lado no computador. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
        <div style={{ ...card, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>🍽️ Hoje</h2>
            <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{n(hoje)}<span style={{ ...muted, fontSize: 13 }}>{metaK ? ` / ${n(metaK)} kcal` : " kcal"}</span></span>
          </div>
          {metaK != null && barra(hoje / metaK, hoje <= metaK ? "var(--success)" : "var(--warning)")}
          <span style={muted}>{metaK == null ? "Mande o perfil para ter a meta: perfil 1,78 m 38 anos homem" : hoje <= metaK ? `sobram ~${n(metaK - hoje)} kcal` : `passou ~${n(hoje - metaK)} kcal`}{d.cardioHoje > 0 ? ` · 🏃 queimou ~${n(d.cardioHoje)} no cardio` : ""} · anote com: comi 2 coxinhas</span>
        </div>
        <div style={{ ...card, display: "grid", gap: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>📅 Esta semana</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }} aria-label={`${d.academia7} dias de academia nos últimos 7`}>
            {Array.from({ length: 7 }, (_, i) => {
              const dt = new Date(new Date(d.hoje + "T12:00:00").getTime() - (6 - i) * 86_400_000);
              const iso = dt.toISOString().slice(0, 10);
              const foi = d.academiaDias.includes(iso);
              return (
                <div key={iso} style={{ display: "grid", gap: 4, justifyItems: "center" }} title={`${dia(iso + "T12:00:00")}: ${foi ? "academia" : "sem academia"}`}>
                  <span style={{ width: "100%", height: 28, borderRadius: 6, background: foi ? "var(--accent)" : "var(--bg-hover)", outline: i === 6 ? "1px solid var(--border)" : "none" }} />
                  <span style={{ fontSize: 11, color: i === 6 ? "var(--text)" : "var(--text-muted)", fontWeight: i === 6 ? 600 : 400 }}>{"DSTQQSS"[dt.getDay()]}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
            <span>🏋️ <strong>{d.academia7}</strong> de 7 dias</span>
            <span>🍔 {semanaAtual ? brl(semanaAtual.besteira + semanaAtual.delivery) : "—"}{mediaComida != null && <span style={muted}> (média {brl(mediaComida)})</span>}</span>
            <span>🛒 {kcalDia != null ? `~${n(kcalDia)} kcal/dia` : "—"}</span>
          </div>
        </div>
      </div>

      {(d.numeros.imc || d.numeros.kcal) && (
        <details style={{ fontSize: 13, color: "var(--text-muted)" }}>
          <summary style={{ cursor: "pointer" }}>
            {d.numeros.imc && <>IMC <strong style={{ color: "var(--text)" }}>{n(d.numeros.imc.valor, 1)}</strong> ({d.numeros.imc.faixa})</>}
            {d.numeros.kcal && <> · seu corpo gasta ~<strong style={{ color: "var(--text)" }}>{n(d.numeros.kcal.gasto)}</strong> kcal · meta <strong style={{ color: "var(--text)" }}>{n(d.numeros.kcal.meta)}</strong></>} · como calculo
          </summary>
          {d.numeros.kcal && <p style={{ marginTop: 6, lineHeight: 1.5 }}>Gasto em repouso (Mifflin-St Jeor) {n(d.numeros.kcal.tmb)} kcal × {n(d.numeros.kcal.fator, 3)} de atividade ({n(d.numeros.academiaPorSemana, 1)} dia(s) de academia por semana) = {n(d.numeros.kcal.gasto)} kcal. A meta tira 500 kcal por dia. São estimativas: o ritmo do peso é quem confirma.</p>}
        </details>
      )}
      <PerguntaIA aba="corpo" titulo="💬 Pergunte à treinadora" exemplos={["O que eu janto hoje para fechar a meta?", "Monta meu treino de perna com o que eu já faço", "Estou no ritmo certo para a meta?"]} />
      <GraficoPeso pesos={d.pesos} meta={d.meta} previsao={d.numeros.previsao} />
      <Comidas c={d.comidas} meta={d.numeros.kcal?.meta ?? null} />
      {/* Treino tem aba própria (24/11: "ficou confuso a parte do treino"). Aqui só o atalho. */}
      <a href="/treino" style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--text)" }}>
        <span><strong style={{ fontSize: 15 }}>🏋️ Treino</strong><br /><span style={muted}>treino guiado, rotinas, cargas e evolução</span></span>
        <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 600 }}>Abrir ›</span>
      </a>
      <GraficoSemanas semanas={d.semanas} />
      <Relogio />
    </>
  );
}

/** Linha do peso, com a meta tracejada. */
function GraficoPeso({ pesos, meta, previsao }: { pesos: Dados["pesos"]; meta: number | null; previsao: string | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  if (pesos.length < 2) {
    return <div style={{ ...card, ...muted, fontSize: 13 }}>📈 O gráfico do peso aparece a partir do 2º registro. Dica: pese-se sempre no mesmo horário (de manhã, em jejum).</div>;
  }
  const h = 220, left = 40, right = 12, top = 16, base = h - 26;
  const vals = pesos.map((p) => p.value); // escala do período (a meta longe achatava a curva)
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  // Com previsão, o eixo vai até a data em que chega na meta (linha pontilhada do último peso até lá).
  const t0 = new Date(pesos[0].at).getTime(), t1 = new Date(pesos.at(-1)!.at).getTime();
  const x = (s: string) => left + ((new Date(s).getTime() - t0) / Math.max(1, t1 - t0)) * (w - left - right);
  const y = (v: number) => top + ((max - v) / (max - min)) * (base - top);
  const linha = pesos.map((p) => `${x(p.at)},${y(p.value)}`).join(" ");
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Peso</h2>
        {meta != null && <span style={muted}>meta {n(meta, 1)} kg{previsao ? ` · ~${new Date(previsao + "T12:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}` : ""}</span>}
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Peso ao longo do tempo">
          {[min, (min + max) / 2, max].map((v) => (
            <g key={v}>
              <line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="var(--border)" opacity={0.6} />
              <text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{n(v)}</text>
            </g>
          ))}
          {meta != null && meta >= min && <line x1={left} x2={w - right} y1={y(meta)} y2={y(meta)} stroke="var(--success)" strokeDasharray="5 4" />}
          <polyline points={linha} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
          {pesos.map((p) => <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r={3.5} fill="var(--accent)" />)}
          <text x={left} y={h - 6} fontSize={10} fill="var(--text-muted)">{dia(pesos[0].at)}</text>
          <text x={w - right} y={h - 6} textAnchor="end" fontSize={10} fill="var(--text-muted)">{dia(pesos.at(-1)!.at)}</text>
        </svg>
      </div>
    </div>
  );
}

/** Por semana: dias de academia e R$ de besteira/bebida e delivery. */
function GraficoSemanas({ semanas: todas }: { semanas: Semana[] }) {
  // Começa na primeira semana com gasto (as vazias do começo só espremiam as barras); no mínimo 4.
  const primeira = todas.findIndex((s) => s.besteira + s.delivery + s.kcal > 0);
  const semanas = todas.slice(Math.max(0, Math.min(primeira < 0 ? todas.length - 4 : primeira, todas.length - 4)));
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const [sel, setSel] = useState<number | null>(null);
  const h = 200, left = 8, base = h - 24, top = 18;
  const passo = (w - left * 2) / semanas.length;
  const bw = Math.min(30, passo * 0.6);
  const maxR = Math.max(1, ...semanas.map((s) => s.besteira + s.delivery));
  const yR = (v: number) => base - (v / maxR) * (base - top);
  const atual = sel != null ? semanas[sel] : null;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🍔 Besteira e delivery por semana</h2>
        <span style={muted}>
          <span style={{ color: "var(--warning)" }}>■</span> besteira e bebida · <span style={{ color: "var(--accent)" }}>■</span> delivery
        </span>
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Besteira, delivery e academia por semana">
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
          {semanas.map((s, i) => {
            const cx = left + passo * i + passo / 2;
            const on = sel === i;
            return (
              <g key={s.inicio} onClick={() => setSel(on ? null : i)} style={{ cursor: "pointer" }}>
                <rect x={cx - passo / 2} y={0} width={passo} height={h} fill={on ? "var(--bg-hover)" : "transparent"} rx={6} />
                <rect x={cx - bw / 2} y={yR(s.besteira)} width={bw} height={base - yR(s.besteira)} rx={3} fill="var(--warning)" opacity={0.85} />
                <rect x={cx - bw / 2} y={yR(s.besteira + s.delivery)} width={bw} height={yR(s.besteira) - yR(s.besteira + s.delivery)} rx={3} fill="var(--accent)" opacity={0.85} />
                {s.besteira + s.delivery > 0 && <text x={cx} y={yR(s.besteira + s.delivery) - 5} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{n(s.besteira + s.delivery)}</text>}
                <text x={cx} y={h - 6} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"}>{passo < 44 ? dia(s.inicio).slice(0, 2) : dia(s.inicio)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-hover)", fontSize: 13 }}>
        {atual ? (
          <>
            <strong>Semana de {dia(atual.inicio)}</strong>: besteira e bebida {brl(atual.besteira)} · delivery {brl(atual.delivery)}
            {atual.peso != null && ` · peso médio ${n(atual.peso, 1)} kg`}
            {atual.kcal > 0 && ` · comprou ~${n(atual.kcal)} kcal e ${n(atual.proteina)} g de proteína${atual.cobertura != null ? ` (${atual.cobertura}% dos itens contados)` : ""}`}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Toque numa semana para ver os números. Os valores vêm das notas fiscais e dos lançamentos (pela data da compra).</span>
        )}
      </div>
    </div>
  );
}

/** O que ele anotou que comeu ("comi …" ou foto), por dia, contra a meta. */
function Comidas({ c, meta }: { c: Dados["comidas"]; meta: number | null }) {
  const porDia = new Map<string, { kcal: number; textos: string[] }>();
  for (const x of c) {
    const k = dia(x.at);
    const d = porDia.get(k) ?? { kcal: 0, textos: [] };
    d.kcal += x.kcal;
    d.textos.push(x.texto);
    porDia.set(k, d);
  }
  const dias = [...porDia.entries()].reverse();
  return (
    <div style={{ ...card, display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>🍽️ O que comi</h2>
      {!dias.length && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No WhatsApp: <em>comi 2 coxinhas e uma coca</em> · foto do prato com a legenda <em>comi isso</em> · <em>quanto comi hoje?</em> · <em>monta meu cardápio</em> · <em>o que cozinho hoje?</em>
        </p>
      )}
      {dias.map(([d, v]) => (
        <div key={d} style={{ display: "grid", gap: 2, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{d}</strong>
            <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums", color: meta != null ? (v.kcal <= meta ? "var(--success)" : "var(--warning)") : "var(--text)" }}>
              ~{n(v.kcal)} kcal{meta != null && ` de ${n(meta)}`}
            </span>
          </div>
          <span style={muted}>{v.textos.join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}

type StravaStatus = { configurado: boolean; autorizado: boolean; atleta: string | null; ultimaSync: number | null; erro: string | null; dominio?: string };

/** Relógio (Amazfit → Zepp → Strava): passo a passo até ligar; depois, status e "sincronizar agora". */
function Relogio() {
  const [st, setSt] = useState<StravaStatus | null>(null);
  const [id, setId] = useState("");
  const [sec, setSec] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const chamar = async (body: object) => {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch("/api/strava/oauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { ok: r.ok, j: await r.json() };
    } finally {
      setOcupado(false);
    }
  };
  useEffect(() => {
    chamar({ acao: "status" }).then(({ j }) => setSt(j)).catch(() => {});
    const q = new URLSearchParams(window.location.search).get("strava");
    if (q) setMsg(q === "ok" ? "✅ Strava ligado! As atividades entram sozinhas de hora em hora." : "❌ Não deu certo. Confira o Client ID/Secret e o domínio no Strava e tente de novo.");
  }, []);
  if (!st) return null;
  const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", font: "inherit" };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", font: "inherit" };
  return (
    <div style={{ ...card, display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>⌚ Relógio (Strava)</h2>
      {st.autorizado ? (
        <>
          <span style={{ fontSize: 14 }}>✅ Ligado{st.atleta ? ` à conta de ${st.atleta}` : ""}. Corridas, caminhadas, bike e treinos do relógio entram sozinhos (de hora em hora){st.ultimaSync ? ` · última conferida ${new Date(st.ultimaSync).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}.</span>
          {st.erro && <span style={{ fontSize: 13, color: "var(--danger)" }}>{st.erro}</span>}
          <div>
            <button type="button" style={btn} disabled={ocupado} onClick={async () => {
              const { j } = await chamar({ acao: "sync" });
              setMsg(j.erro ? `❌ ${j.erro}` : j.novas?.length ? `✅ ${j.novas.length} atividade(s) nova(s). Atualize a página.` : "Nenhuma atividade nova.");
            }}>{ocupado ? "Conferindo…" : "Sincronizar agora"}</button>
          </div>
        </>
      ) : (
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, fontSize: 14 }}>
          <li>No app <strong>Zepp</strong> (do relógio): Perfil → Adicionar contas → <strong>Strava</strong>.</li>
          <li>
            Em <strong>strava.com/settings/api</strong>, crie o app (nome: Secretária; site: o endereço do painel) e em <em>Authorization Callback Domain</em> coloque:
            <div style={{ marginTop: 4, padding: "6px 10px", borderRadius: 8, background: "var(--bg-hover)", fontFamily: "monospace", fontSize: 13, overflowWrap: "anywhere" }}>{st.dominio}</div>
          </li>
          <li style={{ display: "grid", gap: 6 }}>
            Cole aqui o <strong>Client ID</strong> e o <strong>Client Secret</strong> do app:
            {st.configurado && <span style={muted}>Já guardado. Cole de novo só se trocar.</span>}
            <input style={input} inputMode="numeric" placeholder="Client ID (número)" value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" />
            <input style={input} type="password" placeholder="Client Secret" value={sec} onChange={(e) => setSec(e.target.value)} autoComplete="new-password" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(id || sec) && (
                <button type="button" style={btn} disabled={ocupado} onClick={async () => {
                  const { ok, j } = await chamar({ acao: "app", clientId: id, clientSecret: sec });
                  if (!ok) setMsg(`❌ ${j.error}`);
                  else { setSt({ ...st, ...j }); setId(""); setSec(""); setMsg("Guardado. Agora toque em Autorizar no Strava."); }
                }}>Guardar</button>
              )}
              {st.configurado && (
                <button type="button" style={btn} disabled={ocupado} onClick={async () => {
                  const { j } = await chamar({ acao: "autorizar" });
                  if (j.url) window.location.href = j.url;
                  else setMsg(`❌ ${j.error}`);
                }}>Autorizar no Strava</button>
              )}
            </div>
          </li>
        </ol>
      )}
      {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

