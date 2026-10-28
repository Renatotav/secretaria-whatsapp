"use client";

// Gráfico de produtividade (resolvidos e Redmine por dia). Saiu de work/page.tsx (28/10/2026).

import { useWidth } from "@/lib/use-width";

export type Prod = { dias: { dia: string; resolvidos: number; redmine: number }[]; total: number; tmrHoras: number | null };

/** Barras dos últimos 30 dias (resolvidos + Redmine), com o tempo médio. */
export function ProductivityChart({ p }: { p: Prod }) {
  const max = Math.max(1, ...p.dias.map((d) => d.resolvidos + d.redmine));
  // viewBox = largura real: letras do mesmo tamanho em qualquer tela.
  const [chartRef, W] = useWidth<SVGSVGElement>(900);
  const H = 120, bw = W / p.dias.length;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>📈 Sua produtividade — últimos 30 dias</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {p.total} fechado(s){p.tmrHoras !== null ? ` · tempo médio com você ${p.tmrHoras < 48 ? `${p.tmrHoras.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h` : `${Math.round(p.tmrHoras / 24)} dias`}` : ""}
        </div>
      </div>
      <svg ref={chartRef} viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Chamados fechados por dia">
        {p.dias.map((d, i) => {
          const hr = (d.resolvidos / max) * H, hm = (d.redmine / max) * H;
          return (
            <g key={d.dia}>
              <title>{`${d.dia.split("-").reverse().slice(0, 2).join("/")}: ${d.resolvidos} resolvido(s), ${d.redmine} Redmine`}</title>
              <rect x={i * bw + 2} y={H - hr} width={bw - 4} height={hr} rx={2} fill="var(--success)" />
              <rect x={i * bw + 2} y={H - hr - hm} width={bw - 4} height={hm} rx={2} fill="var(--accent)" />
              {i % 5 === 0 && (
                <text x={i === 0 ? 2 : i * bw + bw / 2} y={H + 14} fontSize={11} textAnchor={i === 0 ? "start" : "middle"} fill="var(--text-muted)">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ color: "var(--success)" }}>■</span> resolvidos · <span style={{ color: "var(--accent)" }}>■</span> viraram Redmine
      </div>
    </div>
  );
}
