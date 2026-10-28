"use client";

import { useEffect, useState } from "react";
import { PerguntaIA } from "../pergunta-ia";

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
      historico: { ref: string; kwh: number; valor: number; ar: number | null }[];
      semanas: { de: string; ate: string; kwh: number }[];
      instalado: string | null;
      arMediaMesKwh: number | null;
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
            Gasto lido de hora em hora no SmartThings. Ligar e desligar continua na Alexa.
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
  const ult = d.historico.at(-1);
  const tarifaReal = ult ? ult.valor / ult.kwh : null;
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
          <span style={{ display: "grid", justifyItems: "end" }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{brl(d.mes * d.price)}</span>
            <span style={muted}>no mês</span>
          </span>
        </div>
        <div style={muted}>
          {n(d.mes, 1)} kWh no mês{d.desde > new Date().toISOString().slice(0, 8) + "01" ? ` (medindo desde ${ddmm(d.desde)})` : ""} · última leitura {lido}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(130px, 100%), 1fr))", gap: 10, alignItems: "start" }}>
        <Kpi titulo="Hoje" valor={brl(d.hoje * d.price)} dica={`${n(d.hoje, 1)} kWh`} explica="Do primeiro registro de hoje até a última leitura." />
        <Kpi titulo="Média por dia" valor={mediaDia != null ? brl(mediaDia * d.price) : "—"} dica={mediaDia != null ? `${n(mediaDia, 1)} kWh · ≈ ${brl(mediaDia * d.price * 30)} por mês` : "precisa de 1 dia completo"}
          explica="Média dos dias já fechados (sem hoje e sem intervalos em que a chave estava vencida)." />
        <Kpi titulo="Na conta da Enel" valor={d.enel && mediaDia != null ? `~${n(Math.min(100, (mediaDia * 30 * d.price * 100) / d.enel.valor))}%` : "—"}
          dica={!d.enel ? "sem conta da Enel lançada" : mediaDia == null ? "precisa de 1 dia completo" : `última conta ${brl(d.enel.valor)}`}
          explica="Gasto do ar em 30 dias (pela média por dia) dividido pela última conta da Enel lançada no financeiro. É uma estimativa: a conta tem outro período." />
        <Kpi titulo="Tarifa" valor={`${brl(d.price)}/kWh`} dica={tarifaReal ? `conta real: ${brl(tarifaReal)}` : "a mesma da scooter"}
          explica={`É a tarifa usada aqui e na scooter.${tarifaReal ? ` Pela última conta da Enel (com impostos) dá ${brl(tarifaReal)}/kWh.` : ""} Para mudar, mande no WhatsApp: tarifa da luz ${tarifaReal ? n(tarifaReal, 2) : "0,92"}.`} />
        <Kpi titulo="Contador do aparelho" valor={`${n(d.totalKwh)} kWh`} dica="desde que foi instalado" explica="Total que o próprio ar mediu na vida toda. É dele que sai a conta por dia." />
      </div>

      <PerguntaIA aba="ar" exemplos={["Quanto gastei esta semana?", "Qual mês o ar gastou mais?", "Quanto vou pagar de ar este mês?"]} />
      <Grafico dias={d.dias} price={d.price} />
      {d.semanas.length > 0 && <Semanas s={d.semanas} price={d.price} />}
      {d.historico.length > 0 && <Contas h={d.historico} instalado={d.instalado} />}
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
            style={{ flex: "1 1 0", minWidth: 28, maxWidth: 56, display: "grid", gap: 4, justifyItems: "center", alignContent: "end", height: "100%" }}>
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

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Contas da Enel por mês (casa toda) e a média do ar desde que foi instalado. */
function Contas({ h, instalado }: { h: { ref: string; kwh: number; valor: number; ar: number | null }[]; instalado: string | null }) {
  const max = Math.max(...h.map((x) => x.kwh));
  const ultima = h.at(-1)!;
  const tarifa = ultima.valor / ultima.kwh;
  // Conta sem o ar = média dos meses antes dele; o que passa disso nos meses com ar é (quase todo) o ar.
  // Meses com o gasto do ar medido pelo app (sem o 1º, parcial): parte média do ar na conta.
  const medidos = h.filter((x) => x.ar != null && x.ar > 50);
  const arMedio = medidos.length ? medidos.reduce((a, x) => a + x.ar!, 0) / medidos.length : null;
  const parte = medidos.length ? medidos.reduce((a, x) => a + x.ar! / x.kwh, 0) / medidos.length : null;
  return (
    <div style={{ ...card, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🧾 Conta da Enel por mês</h2>
        <span style={muted}>casa toda · tarifa real {brl(tarifa)}/kWh</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {h.map((x) => {
          const depois = instalado != null && x.ref >= instalado.slice(0, 7);
          return (
            <div key={x.ref} style={{ display: "grid", gap: 4, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--text-muted)" }}>{MES[Number(x.ref.slice(5, 7)) - 1]}/{x.ref.slice(2, 4)}</span> · {x.kwh} kWh
                  {x.ar != null && <span style={{ color: "var(--accent)" }}> · ar {n(x.ar)} ({n((x.ar / x.kwh) * 100)}%)</span>}
                </span>
                <strong>{brl(x.valor)}</strong>
              </div>
              <div style={{ position: "relative", height: 8, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden" }} aria-hidden>
                <div style={{ position: "absolute", inset: 0, width: `${(x.kwh / max) * 100}%`, background: depois ? "var(--accent-border)" : "var(--text-muted)", borderRadius: 4 }} />
                {x.ar != null && <div style={{ position: "absolute", inset: 0, width: `${(x.ar / max) * 100}%`, background: "var(--accent)", borderRadius: 4 }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
        {arMedio != null && parte != null && (
          <strong style={{ display: "block", fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
            O ar é ~{n(parte * 100)}% da conta: em média {n(arMedio)} kWh por mês ≈ {brl(arMedio * tarifa)}.
          </strong>
        )}
        Barra lilás = o que o ar gastou (app SmartThings) no mês anterior, que é o período que a conta mede.
        {instalado && ` O ar começou em ${MES[Number(instalado.slice(5, 7)) - 1]}/${instalado.slice(2, 4)}.`}
      </div>
    </div>
  );
}

/** Gasto por semana (app SmartThings): total e média por dia, para comparar semanas curtas e cheias. */
function Semanas({ s, price }: { s: { de: string; ate: string; kwh: number }[]; price: number }) {
  const dias = (x: { de: string; ate: string }) => Math.round((new Date(x.ate).getTime() - new Date(x.de).getTime()) / 86_400_000) + 1;
  const max = Math.max(...s.map((x) => x.kwh / dias(x)));
  return (
    <div style={{ ...card, display: "grid", gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>🗓️ Por semana</h2>
      {s.map((x) => {
        const porDia = x.kwh / dias(x);
        return (
          <div key={x.de} style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 92px", gap: 8, alignItems: "center", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--text-muted)" }}>{ddmm(x.de)}–{ddmm(x.ate)}</span>
            <div style={{ height: 16, background: "var(--bg-hover)", borderRadius: 4, overflow: "hidden" }} title={`${n(porDia, 1)} kWh por dia`}>
              <div style={{ width: `${(porDia / max) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
            </div>
            <span style={{ textAlign: "right" }}>{brl(x.kwh * price)}</span>
          </div>
        );
      })}
      <div style={muted}>Barra = gasto por dia daquela semana (assim a semana incompleta compara certo). Valor = total da semana.</div>
    </div>
  );
}
