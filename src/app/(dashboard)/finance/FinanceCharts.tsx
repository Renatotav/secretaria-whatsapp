"use client";

// Gráficos da tela do Financeiro: rosca de categorias, barras receitas x despesas
// e linha do caixa acumulado. Saiu de finance/page.tsx (28/10/2026).

import { useState, useMemo } from "react";
import { useWidth } from "@/lib/use-width";
import { CATEGORY_COLORS, MONTH_LABELS, OTHER_COLOR, formatCompact, formatMoney, niceMax } from "./finance-utils";
import type { FinanceEntry } from "./finance-utils";

/* ── Gráfico de pizza: gastos por categoria ─────────────────────────── */
export function CategoryDonut({
  entries,
  budgets,
  selectedCategory,
  onSelectCategory,
}: {
  entries: FinanceEntry[];
  budgets: {id: string, category: string, amount: number}[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null, matchNames: string[]) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const segments = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of entries) {
      if (e.type !== "expense") continue;
      const key = e.category || "Outros";
      totals.set(key, (totals.get(key) ?? 0) + e.amount);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const restTotal = rest.reduce((s, [, v]) => s + v, 0);
    const result = top.map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i], matchNames: [name] }));
    // "Outros" aqui pode juntar VÁRIAS categorias reais (tudo além do top 7) —
    // guarda os nomes reais que compõem a fatia pra filtrar a tabela certo.
    if (restTotal > 0) result.push({ name: "Demais", value: restTotal, color: OTHER_COLOR, matchNames: rest.map(([name]) => name) });
    return result;
  }, [entries]);

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        Sem despesas neste mês ainda.
      </div>
    );
  }

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;
  const gap = 3;

  let acc = 0;
  const arcs = segments.map((seg, i) => {
    const segLen = (seg.value / total) * circumference;
    const dash = Math.max(segLen - gap, 0);
    const isSelected = selectedCategory === seg.name;
    const isDimmed = selectedCategory !== null && !isSelected;
    const el = (
      <circle
        key={seg.name}
        r={radius}
        cx={cx}
        cy={cy}
        fill="none"
        stroke={seg.color}
        strokeWidth={hovered === i || isSelected ? stroke + 4 : stroke}
        strokeOpacity={isDimmed ? 0.35 : 1}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={-acc}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-width 0.1s, stroke-opacity 0.1s", cursor: "pointer" }}
        onMouseEnter={() => setHovered(i)}
        onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
        onClick={() => onSelectCategory(isSelected ? null : seg.name, isSelected ? [] : seg.matchNames)}
      />
    );
    acc += segLen;
    return el;
  });

  const hoveredSeg = hovered !== null ? segments[hovered] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={size} height={size}>
          {arcs}
        </svg>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {hoveredSeg ? (
            <>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{hoveredSeg.name}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{formatMoney(hoveredSeg.value)}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Total</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{formatCompact(total)}</div>
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 180 }}>
        {segments.map((seg, i) => {
          const isSelected = selectedCategory === seg.name;
          const budget = budgets.find((b) => b.category === seg.name);
          const percent = budget ? Math.min((seg.value / budget.amount) * 100, 100) : 0;
          return (
            <div
              key={seg.name}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => onSelectCategory(isSelected ? null : seg.name, isSelected ? [] : seg.matchNames)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                cursor: "pointer",
                borderRadius: 6,
                padding: "4px",
                background: isSelected ? "var(--accent-dim)" : "transparent",
                opacity: selectedCategory === null || isSelected ? 1 : 0.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                <span style={{ color: "var(--text)", flex: 1 }}>{seg.name}</span>
                {!budget && <span style={{ color: "var(--text-muted)" }}>{((seg.value / total) * 100).toFixed(0)}%</span>}
                <span style={{ minWidth: 70, textAlign: "right", fontWeight: budget && seg.value >= budget.amount ? 700 : 400, color: budget && seg.value >= budget.amount ? "var(--danger)" : "var(--text-muted)" }}>{formatMoney(seg.value)}</span>
              </div>
              {budget && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: "var(--bg-hover)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${percent}%`, background: percent >= 90 ? "var(--danger)" : percent >= 75 ? "var(--warning)" : "var(--success)" }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>de {formatMoney(budget.amount)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Gráfico de barras: receitas x despesas por mês ─────────────────── */
export function MonthlyBarChart({
  monthly,
  selectedMonth,
  selectedType,
  onSelectMonth,
}: {
  monthly: { income: number; expense: number }[];
  selectedMonth: number;
  selectedType: "income" | "expense" | null;
  onSelectMonth: (monthIndex: number, type: "income" | "expense" | null) => void;
}) {
  const [hover, setHover] = useState<{ month: number; type: "income" | "expense" } | null>(null);
  const [chartRef, width] = useWidth<SVGSVGElement>(640);
  const height = 220;
  const padding = { top: 10, right: 10, bottom: 24, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const max = niceMax(Math.max(1, ...monthly.map((m) => Math.max(m.income, m.expense))));
  const groupW = chartW / 12;
  const barW = Math.min(14, groupW / 2 - 4);

  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--success)" }} /> Receita
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--danger)" }} /> Despesa
        </span>
      </div>
      <svg ref={chartRef} width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {yTicks.map((t, i) => {
          const y = padding.top + chartH - (t / max) * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border-light)" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-dim)">
                {formatCompact(t)}
              </text>
            </g>
          );
        })}
        {monthly.map((m, i) => {
          const gx = padding.left + i * groupW;
          const incomeH = (m.income / max) * chartH;
          const expenseH = (m.expense / max) * chartH;
          const isSelected = i === selectedMonth;
          return (
            <g key={i} style={{ cursor: "pointer" }} onClick={() => onSelectMonth(i, null)}>
              {isSelected && (
                <rect
                  x={gx + 1}
                  y={padding.top}
                  width={groupW - 2}
                  height={chartH}
                  rx={4}
                  fill="var(--accent-dim)"
                  stroke="var(--accent-border)"
                  strokeWidth={1}
                />
              )}
              <rect
                x={gx}
                y={padding.top}
                width={groupW}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHover({ month: i, type: "expense" })}
                onMouseLeave={() => setHover(null)}
              />
              <rect
                x={gx + groupW / 2 - barW - 2}
                y={padding.top + chartH - incomeH}
                width={barW}
                height={incomeH}
                rx={3}
                fill="var(--success)"
                opacity={hover && hover.month === i && hover.type !== "income" ? 0.4 : (isSelected && selectedType && selectedType !== "income" ? 0.4 : 1)}
                onMouseEnter={() => setHover({ month: i, type: "income" })}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); onSelectMonth(i, isSelected && selectedType === "income" ? null : "income"); }}
              />
              <rect
                x={gx + groupW / 2 + 2}
                y={padding.top + chartH - expenseH}
                width={barW}
                height={expenseH}
                rx={3}
                fill="var(--danger)"
                opacity={hover && hover.month === i && hover.type !== "expense" ? 0.4 : (isSelected && selectedType && selectedType !== "expense" ? 0.4 : 1)}
                onMouseEnter={() => setHover({ month: i, type: "expense" })}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => { e.stopPropagation(); onSelectMonth(i, isSelected && selectedType === "expense" ? null : "expense"); }}
              />
              <text
                x={gx + groupW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--text-dim)"
              >
                {MONTH_LABELS[i]}
              </text>
              {hover && hover.month === i && (
                <text
                  x={gx + groupW / 2}
                  y={padding.top + chartH - Math.max(incomeH, expenseH) - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={hover.type === "income" ? "var(--success)" : "var(--danger)"}
                >
                  {formatMoney(hover.type === "income" ? m.income : m.expense)}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartH}
          y2={padding.top + chartH}
          stroke="var(--border)"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}

/* ── Linha: fluxo de caixa acumulado ─────────────────────────────────── */
export function CashFlowLine({ monthly, selectedType, selectedMonth, onSelectMonth }: { monthly: { income: number; expense: number }[], selectedType: "income" | "expense" | null, selectedMonth: number, onSelectMonth: (m: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [chartRef, width] = useWidth<SVGSVGElement>(640);
  const height = 180;
  const padding = { top: 16, right: 10, bottom: 24, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let running = 0;
  const cumulative = monthly.map((m) => {
    if (selectedType === "income") running += m.income;
    else if (selectedType === "expense") running += m.expense;
    else running += m.income - m.expense;
    return running;
  });
  const minV = Math.min(0, ...cumulative);
  const maxV = niceMax(Math.max(1, ...cumulative));
  const range = maxV - minV || 1;

  const points = cumulative.map((v, i) => {
    const x = padding.left + (i / 11) * chartW;
    const y = padding.top + chartH - ((v - minV) / range) * chartH;
    return { x, y, v };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${path} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  return (
    <svg ref={chartRef} width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top + chartH - ((0 - minV) / range) * chartH}
        y2={padding.top + chartH - ((0 - minV) / range) * chartH}
        stroke="var(--border-light)"
        strokeWidth={1}
      />
      <path d={areaPath} fill="var(--accent)" opacity={0.1} stroke="none" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={hover === i || selectedMonth === i ? 5 : 4}
            fill={selectedMonth === i ? "var(--bg-card)" : "var(--accent)"}
            stroke="var(--accent)"
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectMonth(i)}
          />
          <text x={p.x} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-dim)">
            {MONTH_LABELS[i]}
          </text>
          {hover === i && (
            <text
              x={p.x}
              y={p.y - 10}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill="var(--text)"
            >
              {formatMoney(p.v)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
