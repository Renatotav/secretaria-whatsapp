"use client";

import { useEffect, useState } from "react";

// 📊 Minha produtividade — portfólio do trabalho no suporte do PJe.
// Só números agregados (sem nome, CPF, descrição ou número de chamado).

type Data = {
  geradoEm: string;
  desde: string | null;
  kpis: {
    fechados: number;
    porSemana: number;
    tempoMedioDias: number | null;
    tempoMedianoDias: number | null;
    ateUmDiaPct: number | null;
    tempoFonte: "tmr" | "datas";
    tempoBase: number;
    semRedminePct: number | null;
    emAberto: number;
  };
  meses: { mes: string; direto: number; redmine: number; tempoMedio: number | null }[];
  heat: number[][];
  grupos: { nome: string; n: number }[];
  gruposSem: number;
  origem: { nome: string; n: number }[];
  origemSem: number;
  equipes: { nome: string; n: number }[];
};

const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 } as const;
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmtDias = (d: number | null) => (d === null ? "—" : d < 2 ? `${Math.round(d * 24)} h` : `${d.toFixed(1).replace(".", ",")} dias`);

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ ...card, flex: "1 1 140px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** Barras empilhadas por mês (direto × com Redmine) e linha do tempo médio. */
function MonthlyChart({ meses }: { meses: Data["meses"] }) {
  const W = 640, H = 200, pad = { l: 30, r: 44, t: 12, b: 26 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...meses.map((m) => m.direto + m.redmine));
  const maxT = Math.max(1, ...meses.map((m) => m.tempoMedio ?? 0));
  const bw = iw / Math.max(1, meses.length);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const yt = (v: number) => pad.t + ih - (v / maxT) * ih;
  const line = meses
    .map((m, i) => (m.tempoMedio === null ? null : `${pad.l + i * bw + bw / 2},${yt(m.tempoMedio)}`))
    .filter(Boolean)
    .join(" ");
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chamados fechados por mês e tempo médio">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill="var(--text-muted)">
            {t}
          </text>
        </g>
      ))}
      {meses.map((m, i) => {
        const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64;
        return (
          <g key={m.mes}>
            <title>{`${m.mes}: ${m.direto} resolvidos direto, ${m.redmine} com Redmine · tempo médio ${fmtDias(m.tempoMedio)}`}</title>
            <rect x={x} y={y(m.direto)} width={w} height={pad.t + ih - y(m.direto)} rx={3} fill="var(--success)" />
            <rect x={x} y={y(m.direto + m.redmine)} width={w} height={y(m.direto) - y(m.direto + m.redmine)} rx={3} fill="var(--accent)" />
            <text x={x + w / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--text-muted)">
              {m.mes}
            </text>
          </g>
        );
      })}
      {line && <polyline points={line} fill="none" stroke="var(--warning)" strokeWidth={2} />}
      {meses.map((m, i) =>
        m.tempoMedio === null ? null : <circle key={m.mes} cx={pad.l + i * bw + bw / 2} cy={yt(m.tempoMedio)} r={3.5} fill="var(--warning)" />
      )}
      <text x={W - pad.r + 6} y={pad.t + 10} fontSize={10} fill="var(--warning)">
        {fmtDias(maxT)}
      </text>
      <text x={W - pad.r + 6} y={pad.t + ih} fontSize={10} fill="var(--warning)">
        0
      </text>
    </svg>
  );
}

/** Mapa de calor: dia da semana × hora em que os chamados foram fechados. */
function Heatmap({ heat }: { heat: number[][] }) {
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7h às 21h
  const max = Math.max(1, ...heat.flatMap((r) => hours.map((h) => r[h])));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 10, color: "var(--text-muted)" }}>
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} style={{ fontWeight: 400 }}>
                {h}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((d) => (
            <tr key={d}>
              <td style={{ paddingRight: 6 }}>{DIAS[d]}</td>
              {hours.map((h) => {
                const v = heat[d][h];
                return (
                  <td
                    key={h}
                    title={`${DIAS[d]} ${h}h: ${v} fechado(s)`}
                    style={{ width: 26, height: 20, borderRadius: 4, background: v ? `rgba(34,197,94,${0.15 + 0.85 * (v / max)})` : "var(--bg-hover)" }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ rows, color }: { rows: { nome: string; n: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((r) => (
        <div key={r.nome} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(48px, 1fr) auto", gap: 8, alignItems: "center", fontSize: 12 }}>
          <span title={r.nome} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
          <span style={{ height: 10, background: "var(--bg-hover)", borderRadius: 5 }}>
            <span style={{ display: "block", height: "100%", width: `${(r.n / max) * 100}%`, background: color, borderRadius: 5 }} />
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>
            {r.n} · {Math.round((r.n / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

const Empty = () => <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Ainda sem dados.</div>;
const Note = ({ n, what }: { n: number; what: string }) => (
  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
    + {n} chamado(s) {what}
  </div>
);

export default function PortfolioPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/work/portfolio")
      .then(async (r) => (r.ok ? setData(await r.json()) : setError("Não consegui carregar.")))
      .catch(() => setError("Não consegui carregar."));
  }, []);

  const best = data
    ? data.heat
        .map((row, d) => ({ d, n: row.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.n - a.n)[0]
    : null;

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {/* minmax(0, 1fr): o mapa de calor rola por dentro em vez de alargar a página no celular. */}
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>📊 Minha produtividade</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Atendimento especializado de suporte ao PJe{data?.desde ? ` · desde ${data.desde.split("-").reverse().join("/")}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/work" className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }}>
              ← Trabalho
            </a>
            <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => window.print()}>
              🖨️ Imprimir / PDF
            </button>
          </div>
        </div>

        {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
        {!data && !error && <div style={{ color: "var(--text-muted)" }}>Carregando…</div>}

        {data && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Kpi label="Chamados fechados" value={String(data.kpis.fechados)} hint={`${String(data.kpis.porSemana).replace(".", ",")} por semana`} />
              <Kpi
                label={data.kpis.tempoFonte === "tmr" ? "Tempo médio com você" : "Tempo médio"}
                value={fmtDias(data.kpis.tempoMedioDias)}
                hint={data.kpis.ateUmDiaPct !== null ? `${data.kpis.ateUmDiaPct}% em até 1 dia · base ${data.kpis.tempoBase}` : undefined}
              />
              <Kpi label="Resolvidos sem Redmine" value={data.kpis.semRedminePct === null ? "—" : `${data.kpis.semRedminePct}%`} hint="sem precisar escalar" />
              <Kpi label="Dia mais produtivo" value={best && best.n ? DIAS[best.d] : "—"} hint={best && best.n ? `${best.n} fechados` : undefined} />
              <Kpi label="Em aberto agora" value={String(data.kpis.emAberto)} />
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Fechados por mês</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                <span style={{ color: "var(--success)" }}>■</span> resolvidos direto · <span style={{ color: "var(--accent)" }}>■</span> com Redmine ·{" "}
                <span style={{ color: "var(--warning)" }}>●</span> tempo médio (eixo da direita)
              </div>
              <MonthlyChart meses={data.meses} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 16 }}>
              <div style={{ ...card, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Por equipe / fila</div>
                {data.equipes.length ? <Bars rows={data.equipes} color="var(--warning)" /> : <Empty />}
              </div>
              <div style={{ ...card, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>O que mais aparece (grupos de erro)</div>
                {data.grupos.length ? <Bars rows={data.grupos} color="var(--success)" /> : <Empty />}
                {data.gruposSem > 0 && <Note n={data.gruposSem} what="sem descrição para classificar" />}
              </div>
              <div style={{ ...card, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Quem pede</div>
                {data.origem.length ? <Bars rows={data.origem} color="var(--accent)" /> : <Empty />}
                {data.origemSem > 0 && <Note n={data.origemSem} what="sem origem informada (vem da planilha)" />}
              </div>
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Quando eu fecho chamados (dia × hora)</div>
              <Heatmap heat={data.heat} />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              <b>Metodologia.</b> Dados do sistema de escala (chamados atribuídos e produtividade) e da planilha de controle, consolidados pela secretária.
              Tempo = TMR exclusivo do escala (horas em que o chamado ficou com o atendente); sem ele, do recebimento até o fechamento. Grupos de erro classificados por um modelo de decisão (certeza mínima de 60%).
              Só números agregados: sem nomes, CPF, descrições ou números de chamado. Gerado em {new Date(data.geradoEm).toLocaleString("pt-BR")}.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
