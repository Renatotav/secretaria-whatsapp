"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";

type Carga = { at: string; kwh: number | null; hours: number | null; odo: number | null; km: number | null; whKm: number | null; custo: number | null; picoW: number | null; auto: boolean };
type Leitura = { at: string; odo: number; volts: number | null; bars: number | null; carga: boolean };
type Dados = {
  empty?: boolean;
  whKm: number | null;
  rangeKm: number;
  safeKm: number;
  measured: number;
  kmSince: number | null;
  daysSince: number | null;
  odoNow: number | null;
  price: number;
  mesKwh: number;
  custoKm: number | null;
  kmDia: number | null;
  tireEvery: number;
  tirePsi: { front: number; rear: number };
  tireDays: number | null;
  cargas: Carga[];
  leituras: Leitura[];
  pneus: { at: string; front: number | null; rear: number | null }[];
};

const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TZ = { timeZone: "America/Sao_Paulo" } as const;
const dia = (s: string) => new Date(s).toLocaleDateString("pt-BR", { ...TZ, day: "2-digit", month: "2-digit" });
const hora = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { ...TZ, hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const duracao = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/**
 * Painel da scooter: folga até a próxima carga, consumo real e histórico de
 * cargas (a tomada Tapo manda sozinha) e de leituras do ODO (WhatsApp).
 */
export default function ScooterPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/scooter/painel")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErro(true));
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🛵 Scooter</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            As cargas chegam sozinhas pela tomada. O ODO você manda no WhatsApp (ex.: <em>scooter 70 km</em> ou o vídeo do painel).
          </p>
        </div>

        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d?.empty && <div style={{ color: "var(--text-muted)" }}>Ainda sem registros. No WhatsApp: <em>scooter 43 km 79v 6 barras</em>.</div>}
        {d && !d.empty && <Painel d={d} />}
      </div>
    </div>
  );
}

function Painel({ d }: { d: Dados }) {
  const folga = d.kmSince != null ? d.safeKm - d.kmSince : null;
  const cor = folga == null ? "var(--text-muted)" : folga <= 0 ? "var(--danger)" : folga <= 8 ? "var(--warning)" : "var(--success)";
  // Bateria estimada: a carga vai até o cheio, então sobra o que os km ainda não gastaram.
  const pct = d.kmSince != null ? Math.max(0, Math.min(1, 1 - d.kmSince / d.rangeKm)) : null;
  const ultima = d.cargas[0];
  const pneu = d.pneus[0];

  return (
    <>
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 22, color: cor }}>
            {folga == null ? "Sem carga registrada" : folga <= 0 ? "Recarregue hoje" : `Folga de ~${n(folga)} km`}
          </strong>
          {pct != null && <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{n(pct * 100)}%</span>}
        </div>
        {pct != null && (
          <div style={{ height: 12, borderRadius: 6, background: "var(--bg-hover)", overflow: "hidden" }} title="Bateria estimada pelos km desde a última carga">
            <div style={{ width: `${pct * 100}%`, height: "100%", background: cor, borderRadius: 6 }} />
          </div>
        )}
        <div style={muted}>
          {d.kmSince != null && `${n(d.kmSince)} km desde a carga${ultima ? ` de ${dia(ultima.at)}` : ""} · recarregar até ~${n(d.safeKm)} km`}
          {d.daysSince != null && d.daysSince > 0 && ` · faz ${d.daysSince} dia(s)`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(130px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
        <Kpi titulo="Consumo médio" valor={d.whKm ? `${n(d.whKm, 1)} Wh/km` : "—"} dica={d.whKm ? `${d.measured} ciclo(s) medido(s)` : "precisa de 2 cargas"}
          explica="Energia que cada carga repôs dividida pelos km rodados desde a carga anterior (das últimas 4 cargas). Já desconta a perda do carregador." />
        <Kpi titulo="Autonomia" valor={`~${n(d.rangeKm)} km`} dica="bateria cheia até o corte"
          explica={`Bateria de 2.304 Wh, usando 85% (a proteção corta antes do zero), dividida pelo consumo. Nunca passo de 60 km, o anunciado. Recarregar até ~${n(d.safeKm)} km (70%) deixa folga.`} />
        <Kpi titulo="Média por dia" valor={d.kmDia != null ? `${n(d.kmDia, 1)} km` : "—"} dica={d.kmDia != null ? `≈ ${n(d.kmDia * 7)} km por semana` : "poucos dias ainda"}
          explica="Km do primeiro ao último ODO, dividido pelos dias corridos — inclui fim de semana e dias parados." />
        <Kpi titulo="Custo a cada 100 km" valor={d.custoKm ? brl(d.custoKm * 100) : "—"} dica={`tarifa ${brl(d.price)}/kWh`}
          explica={`O que a tomada mede (com a perda do carregador) × a tarifa. Para mudar a tarifa, mande no WhatsApp: tarifa da luz 0,92.`} />
        <Kpi titulo="Este mês" valor={brl(d.mesKwh * d.price)} dica={`${n(d.mesKwh, 2)} kWh na conta de luz`}
          explica="Soma das cargas do mês × a tarifa. Já vem dentro da conta da Enel, não é gasto à parte." />
        <Kpi titulo="ODO" valor={d.odoNow != null ? `${n(d.odoNow)} km` : "—"} dica={d.leituras.length ? `última: ${dia(d.leituras.at(-1)!.at)}` : ""}
          explica="Último km que você mandou (texto ou vídeo do painel). Mande todo dia ao chegar para o gráfico ficar certo." />
      </div>

      <GraficoKm leituras={d.leituras} cargas={d.cargas} media={d.kmDia} />

      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>🔌 Carregamentos</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
          {d.cargas.map((c) => (
            <CargaCard key={c.at} c={c} price={d.price} />
          ))}
        </div>
      </div>
      {pneu && (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            🛞 Pneus calibrados em {dia(pneu.at)}
            {pneu.front != null && ` (${n(pneu.front)} / ${n(pneu.rear ?? pneu.front)} PSI)`}
          </span>
          <span style={{ fontSize: 13, color: (d.tireDays ?? 0) >= d.tireEvery ? "var(--warning)" : "var(--text-muted)" }}>
            {(d.tireDays ?? 0) >= d.tireEvery ? `calibrar: faz ${d.tireDays} dias` : `próxima em ${d.tireEvery - (d.tireDays ?? 0)} dia(s)`} · certo: {d.tirePsi.front} / {d.tirePsi.rear} PSI
          </span>
        </div>
      )}
    </>
  );
}

/** Cartão de número: tocar mostra como a conta é feita. */
function Kpi({ titulo, valor, dica, explica }: { titulo: string; valor: string; dica: string; explica: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
      style={{ ...card, display: "grid", gap: 2, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", borderColor: aberto ? "var(--accent-border)" : "var(--border)" }}>
      <span style={{ ...muted, display: "flex", justifyContent: "space-between", gap: 4 }}>{titulo}<span aria-hidden>{aberto ? "▴" : "ⓘ"}</span></span>
      <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{dica}</span>
      {aberto && <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>{explica}</span>}
    </button>
  );
}

/** Cartão da carga: tocar abre início/fim e o detalhe do ciclo. */
function CargaCard({ c, price }: { c: Carga; price: number }) {
  const [aberto, setAberto] = useState(false);
  const inicio = c.hours != null ? new Date(new Date(c.at).getTime() - c.hours * 3_600_000).toISOString() : null;
  return (
    <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
      style={{ ...card, display: "grid", gap: 6, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", borderColor: aberto ? "var(--accent-border)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{dia(c.at)} · {hora(c.at)}</strong>
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{c.kwh != null ? `${n(c.kwh, 2)} kWh` : "1ª carga"}</strong>
      </div>
      <div style={{ ...muted, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
        {c.custo != null && <span>💰 {brl(c.custo)}</span>}
        {c.hours != null && <span>⏱️ {duracao(c.hours)}</span>}
        {c.picoW != null && <span>⚡ pico {n(c.picoW)} W</span>}
        {c.odo != null && <span>📟 {n(c.odo)} km</span>}
      </div>
      {c.km != null && (
        <div style={{ fontSize: 13 }}>
          Repôs {n(c.km)} km rodados{c.whKm ? ` · ${n(c.whKm, 1)} Wh/km` : ""}
        </div>
      )}
      {aberto && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "grid", gap: 3, borderTop: "1px solid var(--border-light)", paddingTop: 8 }}>
          {inicio && <span>▶️ Começou: {dia(inicio)} às {hora(inicio)}</span>}
          <span>⏹️ Terminou: {dia(c.at)} às {hora(c.at)}</span>
          {c.kwh != null && <span>🔢 {n(c.kwh, 3)} kWh × {brl(price)} = {brl(c.kwh * price)}</span>}
          {c.whKm != null && c.km != null && <span>📐 {n(c.kwh! * 1000 * 0.88)} Wh entraram na bateria ÷ {n(c.km)} km = {n(c.whKm, 1)} Wh/km</span>}
          {c.kwh == null && <span>Sem kWh medido (antes da tomada inteligente). Serve de ponto de partida do ODO.</span>}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.auto ? "registrada pela tomada" : "anotada à mão"} · toque para {aberto ? "fechar" : "ver detalhes"}</div>
    </button>
  );
}

type Barra = { de: string; at: string; odoDe: number; odo: number; km: number; dias: number; cargas: Carga[] };

/** Km por dia entre uma leitura e a seguinte (barra), linha tracejada = média, ⚡ = carregou nesse intervalo. Tocar na barra mostra o detalhe. */
function GraficoKm({ leituras, cargas, media }: { leituras: Leitura[]; cargas: Carga[]; media: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const barras: Barra[] = [];
  let ini = leituras[0];
  // ⚡ marca as cargas desde o fim da barra anterior (a carga com ODO também
  // serve de ponto de partida dos km, mas sem virar barra de 0 km).
  let fimAnterior = new Date(leituras[0]?.at ?? 0).getTime();
  for (let i = 1; i < leituras.length; i++) {
    const b = leituras[i];
    const km = b.odo - ini.odo;
    if (km < 0) continue;
    if (km === 0) { ini = b; continue; }
    const t0 = new Date(ini.at).getTime(), t1 = new Date(b.at).getTime();
    const dias = Math.max(1, Math.round((t1 - t0) / 86_400_000));
    const noMeio = cargas.filter((c) => { const t = new Date(c.at).getTime(); return t > fimAnterior && t <= t1; });
    barras.push({ de: ini.at, at: b.at, odoDe: ini.odo, odo: b.odo, km, dias, cargas: noMeio });
    ini = b;
    fimAnterior = t1;
  }
  const [sel, setSel] = useState<number | null>(null);
  if (!barras.length) return null;
  const atual = sel != null ? barras[sel] : null;

  const h = 180, top = 22, base = h - 24, left = 8;
  const porDia = (b: { km: number; dias: number }) => b.km / b.dias;
  const max = Math.max(...barras.map(porDia), media ?? 0) * 1.15;
  const passo = (w - left * 2) / barras.length;
  const bw = Math.min(36, passo * 0.6);
  const y = (v: number) => base - (v / max) * (base - top);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Km por dia</h2>
        <span style={muted}>
          {media != null && <><span style={{ color: "var(--accent)" }}>- - -</span> média {n(media, 1)} km/dia (dias parados contam) · </>}⚡ carregou
        </span>
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Km por dia entre leituras">
          {media != null && <line x1={left} x2={w - left} y1={y(media)} y2={y(media)} stroke="var(--accent)" strokeDasharray="5 4" opacity={0.8} />}
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
          {barras.map((b, i) => {
            const cx = left + passo * i + passo / 2;
            const on = sel === i;
            return (
              <g key={b.at} onClick={() => setSel(on ? null : i)} style={{ cursor: "pointer" }}>
                {/* área de toque: a coluna inteira, não só a barra */}
                <rect x={cx - passo / 2} y={0} width={passo} height={h} fill={on ? "var(--bg-hover)" : "transparent"} rx={6} />
                <rect x={cx - bw / 2} y={y(porDia(b))} width={bw} height={base - y(porDia(b))} rx={4} fill="var(--accent)" opacity={b.dias > 1 ? 0.55 : 0.9} stroke={on ? "var(--text)" : "none"} strokeWidth={on ? 1.5 : 0} />
                <text x={cx} y={y(porDia(b)) - 6} textAnchor="middle" fontSize={11} fill="var(--text)" fontWeight={on ? 700 : 400}>{n(porDia(b))}</text>
                <text x={cx} y={h - 8} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"}>{b.cargas.length ? "⚡" : ""}{passo < 46 ? dia(b.at).slice(0, 2) : dia(b.at)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {atual ? (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-hover)", fontSize: 13, display: "grid", gap: 3 }}>
          <strong>
            {atual.dias > 1 ? `${dia(atual.de)} → ${dia(atual.at)}` : dia(atual.at)}: {n(atual.km)} km{atual.dias > 1 ? ` em ${atual.dias} dias (${n(porDia(atual), 1)} km/dia)` : ""}
          </strong>
          <span style={muted}>📟 ODO {n(atual.odoDe)} → {n(atual.odo)} km · leitura às {hora(atual.at)}</span>
          {media != null && (
            <span style={muted}>
              {porDia(atual) >= media ? `▲ ${n(porDia(atual) - media, 1)} km acima` : `▼ ${n(media - porDia(atual), 1)} km abaixo`} da média
            </span>
          )}
          {atual.cargas.map((c) => (
            <span key={c.at} style={muted}>⚡ Carregou em {dia(c.at)}{c.kwh != null ? `: ${n(c.kwh, 2)} kWh (${brl(c.custo ?? 0)})` : ""}</span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>👆 Toque numa barra para ver o detalhe. Barra mais clara = média de mais de um dia (o ODO não foi mandado no meio).</div>
      )}
    </div>
  );
}
