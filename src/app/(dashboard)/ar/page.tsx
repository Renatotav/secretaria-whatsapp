"use client";

import { useEffect, useState } from "react";

type Dia = { dia: string; kwh: number; ate: string | null };
type Dados =
  | { empty: true; price: number; temToken: boolean }
  | {
      empty: false;
      price: number;
      hoje: number;
      mes: number;
      desde: string;
      agoraW: number | null;
      lidoEm: string;
      totalKwh: number;
      chaveVencida: boolean;
      enel: { valor: number; data: string } | null;
      dias: Dia[];
    };

const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/** Painel do ar-condicionado: gasto de energia lido do SmartThings (só leitura), no estilo da aba Scooter. */
export default function ArPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    fetch("/api/aircon")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErro(true));
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>❄️ Ar-condicionado</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Gasto lido de hora em hora no SmartThings (só leitura: ligar e desligar continua na Alexa). A chave vence em 24 h: mande no WhatsApp <em>chave smartthings</em> + a chave nova.
          </p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d?.empty && (
          <div style={{ color: "var(--text-muted)" }}>
            Ainda sem leitura. Gere uma chave em account.smartthings.com/tokens e mande no WhatsApp: <em>chave smartthings</em> + a chave.
          </div>
        )}
        {d && !d.empty && <Painel d={d} />}
      </div>
    </div>
  );
}

function Painel({ d }: { d: Extract<Dados, { empty: false }> }) {
  const lido = new Date(d.lidoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const ligado = d.agoraW != null && d.agoraW > 30;
  const fechados = d.dias.filter((x) => x.dia < d.dias.at(-1)!.dia && !x.ate);
  const mediaDia = fechados.length ? fechados.reduce((a, x) => a + x.kwh, 0) / fechados.length : null;
  return (
    <>
      {d.chaveVencida && (
        <div style={{ ...card, borderColor: "var(--warning)", color: "var(--warning)" }}>
          🔑 A chave do SmartThings venceu. Mande uma nova no WhatsApp (<em>chave smartthings</em> + a chave); o gasto até lá não se perde.
        </div>
      )}

      <div style={{ ...card, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 22, color: ligado ? "var(--accent)" : "var(--text-muted)" }}>{ligado ? `Ligado · ${n(d.agoraW!)} W` : "Desligado"}</strong>
          <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{brl(d.mes * d.price)}</span>
        </div>
        <div style={muted}>
          {n(d.mes, 1)} kWh no mês{d.desde > new Date().toISOString().slice(0, 8) + "01" ? ` (medindo desde ${ddmm(d.desde)})` : ""} · última leitura {lido}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
        <Kpi titulo="Hoje" valor={brl(d.hoje * d.price)} dica={`${n(d.hoje, 1)} kWh`} explica="Do primeiro registro de hoje até a última leitura." />
        <Kpi titulo="Média por dia" valor={mediaDia != null ? brl(mediaDia * d.price) : "—"} dica={mediaDia != null ? `${n(mediaDia, 1)} kWh · ≈ ${brl(mediaDia * d.price * 30)} por mês` : "precisa de 1 dia completo"}
          explica="Média dos dias já fechados (sem hoje e sem intervalos em que a chave estava vencida)." />
        <Kpi titulo="Na conta da Enel" valor={d.enel && mediaDia != null ? `~${n(Math.min(100, (mediaDia * 30 * d.price * 100) / d.enel.valor))}%` : "—"}
          dica={!d.enel ? "sem conta da Enel lançada" : mediaDia == null ? "precisa de 1 dia completo" : `última conta ${brl(d.enel.valor)}`}
          explica="Gasto do ar em 30 dias (pela média por dia) dividido pela última conta da Enel lançada no financeiro. É uma estimativa: a conta tem outro período." />
        <Kpi titulo="Tarifa" valor={`${brl(d.price)}/kWh`} dica="a mesma da scooter" explica="Para mudar, mande no WhatsApp: tarifa da luz 0,92." />
        <Kpi titulo="Contador do aparelho" valor={`${n(d.totalKwh)} kWh`} dica="desde que foi instalado" explica="Total que o próprio ar mediu na vida toda. É dele que sai a conta por dia." />
      </div>

      <Grafico dias={d.dias} price={d.price} />
    </>
  );
}

/** Cartão de número: tocar mostra como a conta é feita (igual à aba Scooter). */
function Kpi({ titulo, valor, dica, explica }: { titulo: string; valor: string; dica: string; explica: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
      style={{ ...card, display: "grid", gap: 2, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", borderColor: aberto ? "var(--accent-border)" : "var(--border)" }}>
      <span style={{ ...muted, display: "flex", justifyContent: "space-between", gap: 4 }}>{titulo}<span aria-hidden>{aberto ? "▴" : "ⓘ"}</span></span>
      <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{dica}</span>
      {aberto && <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.4 }}>{explica}</span>}
    </button>
  );
}

/** Barras de R$ por dia (últimos 31 registros). */
function Grafico({ dias, price }: { dias: Dia[]; price: number }) {
  const max = Math.max(0.01, ...dias.map((x) => x.kwh));
  return (
    <div style={{ ...card, display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Gasto por dia</h2>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150, overflowX: "auto" }} role="img" aria-label="Gasto do ar por dia">
        {dias.map((x) => (
          <div key={x.dia} title={`${ddmm(x.dia)}${x.ate ? `–${ddmm(x.ate)}` : ""}: ${n(x.kwh, 1)} kWh · ${brl(x.kwh * price)}`}
            style={{ flex: "1 0 28px", display: "grid", gap: 4, justifyItems: "center", alignContent: "end", height: "100%" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{brl(x.kwh * price).replace("R$", "").trim()}</span>
            <div style={{ width: "70%", height: `${Math.max(2, (x.kwh / max) * 100)}px`, background: x.ate ? "var(--warning)" : "var(--accent)", borderRadius: 4 }} />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{ddmm(x.dia)}</span>
          </div>
        ))}
      </div>
      <div style={muted}>Valores em reais. Barra amarela = junta mais de um dia (a chave estava vencida).</div>
    </div>
  );
}
