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
      {(t.grupos.feitos.length > 0 || t.exercicios.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={muted}>Esta semana:</span>
          {t.grupos.feitos.map(([g, v]) => (
            <span key={g} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, background: "var(--accent-dim)", color: "var(--text)" }}>{g} {v}×</span>
          ))}
          {t.grupos.faltam.map((g) => (
            <span key={g} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 999, border: "1px dashed var(--border)", color: "var(--text-muted)" }}>{g} 0×</span>
          ))}
        </div>
      )}
      {t.exercicios.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {t.exercicios.map((e) => (
            <div key={e.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 12, alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 15, textTransform: "capitalize" }}>{e.nome}</strong>
                <span style={muted}>{e.ultima.desc} · {dia(e.ultima.at)}</span>
              </div>
              <Mini pontos={e.historico.map((h) => h.rm).filter((v): v is number => v != null)} />
              <div style={{ textAlign: "right", minWidth: 64 }} title="Força: carga máxima estimada para 1 repetição">
                <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{e.recorde != null ? `${n(e.recorde)} kg` : "—"}</strong>
                <div style={{ ...muted, fontSize: 11 }}>{e.recorde != null ? "🏆 força" : `${e.vezes} vez(es)`}</div>
              </div>
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
  if (pontos.length < 2) return <span style={{ width: 72 }} />;
  const w = 72, h = 28, min = Math.min(...pontos), max = Math.max(...pontos);
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

