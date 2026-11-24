"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { brl } from "@/lib/format";

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
type Treino = { exercicios: Exercicio[]; plano: { dia: string; treino: string }[] };
type Dados = { comidas: { at: string; kcal: number; texto: string }[]; treino: Treino; numeros: Numeros; pesos: { at: string; value: number }[]; meta: number | null; academia7: number; semanas: Semana[] };

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

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: 10 }}>
        <Kpi titulo="Peso" valor={ult ? `${n(ult.value, 1)} kg` : "—"} dica={ult ? `em ${dia(ult.at)}` : "mande: peso 108,5"} />
        <Kpi titulo="Desde o começo" valor={ult && primeiro && d.pesos.length > 1 ? `${ult.value - primeiro.value > 0 ? "+" : ""}${n(ult.value - primeiro.value, 1)} kg` : "—"} dica={primeiro ? `desde ${dia(primeiro.at)}` : ""} />
        <Kpi titulo="Meta" valor={d.meta != null ? `${n(d.meta, 1)} kg` : "—"} dica={falta == null ? "mande: meta de peso 95" : falta > 0 ? `faltam ${n(falta, 1)} kg` : "🏆 alcançada"} />
        <Kpi titulo="Academia" valor={`${d.academia7} dia(s)`} dica="nos últimos 7 dias" />
        <Kpi titulo="Ritmo" valor={d.numeros.porSemana != null ? `${d.numeros.porSemana > 0 ? "+" : ""}${n(d.numeros.porSemana, 1)} kg/sem` : "—"}
          dica={d.numeros.previsao ? `meta por volta de ${new Date(d.numeros.previsao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}` : "precisa de 3 pesos em 1 semana"} />
        <Kpi titulo="IMC" valor={d.numeros.imc ? n(d.numeros.imc.valor, 1) : "—"} dica={d.numeros.imc ? d.numeros.imc.faixa : "mande: perfil 1,78 m 38 anos homem"} />
        <Kpi titulo="Calorias por dia" valor={d.numeros.kcal ? `~${n(d.numeros.kcal.meta)} kcal` : "—"}
          dica={d.numeros.kcal ? `para perder ~0,5 kg/sem · seu corpo gasta ~${n(d.numeros.kcal.gasto)}` : "precisa do perfil e do peso"} />
        <Kpi titulo="Comprado por dia" valor={kcalDia != null ? `~${n(kcalDia)} kcal` : "—"}
          dica={kcalDia != null ? `média das últimas 4 semanas, pelas notas${d.numeros.kcal ? ` · sua meta ~${n(d.numeros.kcal.meta)}` : ""}` : "aparece com as notas de mercado"} />
        <Kpi titulo="Besteira e delivery" valor={comidaSemana ? brl(comidaSemana.besteira + comidaSemana.delivery) : "—"} dica={mediaComida != null ? `esta semana · média ${brl(mediaComida)}` : "esta semana"} />
      </div>
      <GraficoPeso pesos={d.pesos} meta={d.meta} previsao={d.numeros.previsao} />
      {d.numeros.kcal && (
        <div style={{ ...muted, fontSize: 12, lineHeight: 1.5 }}>
          Contas: gasto em repouso (fórmula de Mifflin-St Jeor) {n(d.numeros.kcal.tmb)} kcal × {n(d.numeros.kcal.fator, 3)} de atividade
          ({n(d.numeros.academiaPorSemana, 1)} dia(s) de academia por semana nas últimas 4) = {n(d.numeros.kcal.gasto)} kcal. A meta tira 500 kcal por dia. São estimativas: o ritmo real do peso é quem confirma.
        </div>
      )}
      <Comidas c={d.comidas} meta={d.numeros.kcal?.meta ?? null} />
      <Treinos t={d.treino} semanas={d.semanas} />
      <GraficoSemanas semanas={d.semanas} />
    </>
  );
}

function Kpi({ titulo, valor, dica }: { titulo: string; valor: string; dica: string }) {
  return (
    <div style={{ ...card, display: "grid", gap: 2 }}>
      <span style={muted}>{titulo}</span>
      <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{dica}</span>
    </div>
  );
}

/** Linha do peso, com a meta tracejada. */
function GraficoPeso({ pesos, meta, previsao }: { pesos: Dados["pesos"]; meta: number | null; previsao: string | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  if (pesos.length < 2) {
    return <div style={{ ...card, ...muted, fontSize: 13 }}>📈 O gráfico do peso aparece a partir do 2º registro. Dica: pese-se sempre no mesmo horário (de manhã, em jejum).</div>;
  }
  const h = 220, left = 40, right = 12, top = 16, base = h - 26;
  const vals = [...pesos.map((p) => p.value), ...(meta != null ? [meta] : [])];
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  // Com previsão, o eixo vai até a data em que chega na meta (linha pontilhada do último peso até lá).
  const t0 = new Date(pesos[0].at).getTime(), t1 = previsao && meta != null ? new Date(previsao + "T12:00:00").getTime() : new Date(pesos.at(-1)!.at).getTime();
  const x = (s: string) => left + ((new Date(s).getTime() - t0) / Math.max(1, t1 - t0)) * (w - left - right);
  const y = (v: number) => top + ((max - v) / (max - min)) * (base - top);
  const linha = pesos.map((p) => `${x(p.at)},${y(p.value)}`).join(" ");
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Peso</h2>
        {meta != null && <span style={muted}><span style={{ color: "var(--success)" }}>- - -</span> meta {n(meta, 1)} kg</span>}
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Peso ao longo do tempo">
          {[min, (min + max) / 2, max].map((v) => (
            <g key={v}>
              <line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="var(--border)" opacity={0.6} />
              <text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{n(v)}</text>
            </g>
          ))}
          {meta != null && <line x1={left} x2={w - right} y1={y(meta)} y2={y(meta)} stroke="var(--success)" strokeDasharray="5 4" />}
          <polyline points={linha} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
          {previsao && meta != null && (
            <line x1={x(pesos.at(-1)!.at)} y1={y(pesos.at(-1)!.value)} x2={x(previsao + "T12:00:00")} y2={y(meta)} stroke="var(--accent)" strokeDasharray="2 5" strokeWidth={2} opacity={0.7} />
          )}
          {pesos.map((p) => <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r={3.5} fill="var(--accent)" />)}
          <text x={left} y={h - 6} fontSize={10} fill="var(--text-muted)">{dia(pesos[0].at)}</text>
          <text x={w - right} y={h - 6} textAnchor="end" fontSize={10} fill="var(--text-muted)">{previsao && meta != null ? `meta ~${dia(previsao + "T12:00:00")}` : dia(pesos.at(-1)!.at)}</text>
        </svg>
      </div>
    </div>
  );
}

/** Por semana: dias de academia e R$ de besteira/bebida e delivery. */
function GraficoSemanas({ semanas }: { semanas: Semana[] }) {
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
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🍔 Semanas: besteira, delivery e academia</h2>
        <span style={muted}>
          <span style={{ color: "var(--warning)" }}>■</span> besteira e bebida · <span style={{ color: "var(--accent)" }}>■</span> delivery · 🏋️ dias de academia
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
                {s.academia > 0 && <text x={cx} y={yR(s.besteira + s.delivery) - 5} textAnchor="middle" fontSize={11} fill="var(--text)">🏋️{s.academia}</text>}
                <text x={cx} y={h - 6} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"}>{passo < 44 ? dia(s.inicio).slice(0, 2) : dia(s.inicio)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-hover)", fontSize: 13 }}>
        {atual ? (
          <>
            <strong>Semana de {dia(atual.inicio)}</strong>: besteira e bebida {brl(atual.besteira)} · delivery {brl(atual.delivery)} · academia {atual.academia} dia(s)
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

/** Plano da semana, exercícios (última carga, recorde, evolução) e o mapa dos dias de academia. */
function Treinos({ t, semanas }: { t: Treino; semanas: Semana[] }) {
  const vazio = !t.exercicios.length && !t.plano.length;
  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>🏋️ Treinos</h2>
      {vazio && (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No WhatsApp: <em>supino 3x10 40kg</em> (uma linha por exercício) · <em>plano seg peito, ter costas, qua perna</em> · <em>treino de hoje?</em> · <em>meus recordes</em>
        </p>
      )}
      {t.plano.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {t.plano.map((p) => (
            <span key={p.dia} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, background: "var(--bg-hover)" }}><strong>{p.dia}</strong> · {p.treino}</span>
          ))}
        </div>
      )}
      {t.exercicios.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {t.exercicios.map((e) => (
            <div key={e.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 14, textTransform: "capitalize" }}>{e.nome}</strong>
                <div style={muted}>última: {e.ultima.desc} em {dia(e.ultima.at)} · {e.vezes} vez(es){e.recorde != null && ` · 🏆 força ~${n(e.recorde)} kg`}</div>
              </div>
              <Mini pontos={e.historico.map((h) => h.rm).filter((v): v is number => v != null)} />
            </div>
          ))}
        </div>
      )}
      <Mapa semanas={semanas} />
    </div>
  );
}

/** Linha pequena da força estimada (precisa de 2 pontos). */
function Mini({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) return <span style={muted}>—</span>;
  const w = 90, h = 28, min = Math.min(...pontos), max = Math.max(...pontos);
  const pts = pontos.map((v, i) => `${(i / (pontos.length - 1)) * w},${h - 3 - ((v - min) / Math.max(1, max - min)) * (h - 6)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Evolução da força"><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} /></svg>;
}

/** Semanas × dias de academia, em quadradinhos (mais escuro = mais dias). */
function Mapa({ semanas }: { semanas: Semana[] }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={muted}>Dias de academia por semana (últimas {semanas.length})</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {semanas.map((s) => (
          <span key={s.inicio} title={`Semana de ${dia(s.inicio)}: ${s.academia} dia(s)`}
            style={{ width: 22, height: 22, borderRadius: 5, background: s.academia ? "var(--accent)" : "var(--bg-hover)", opacity: s.academia ? 0.35 + Math.min(1, s.academia / 5) * 0.65 : 1, display: "grid", placeItems: "center", fontSize: 10, color: s.academia ? "var(--bg-card)" : "var(--text-muted)" }}>
            {s.academia || ""}
          </span>
        ))}
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

