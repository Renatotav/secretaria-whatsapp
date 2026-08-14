"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { GoalsSection } from "./GoalsSection";
import { BudgetsManager } from "./BudgetsManager";
import { CreditCardsSection } from "./CreditCardsSection";
import { InsightsModal } from "./InsightsModal";

interface FinanceEntry {
  id: string;
  type: string;
  amount: number;
  category: string;
  subcategory: string;
  description: string;
  date: string;
  purchaseDate?: string;
  paymentMethod: string;
  account: string;
  status: "paid" | "pending";
  source: string;
}

type FormState = {
  type: string;
  amount: string;
  category: string;
  subcategory: string;
  description: string;
  date: string;
  purchaseDate: string;
  paymentMethod: string;
  account: string;
  status: "paid" | "pending";
  recurring: boolean;
};

const EMPTY_FORM: FormState = {
  type: "expense",
  amount: "",
  category: "",
  subcategory: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
  purchaseDate: "",
  paymentMethod: "pix",
  account: "Principal",
  status: "paid",
  recurring: false,
};

type EditForm = Omit<FormState, "recurring">;

// Paleta categórica validada (modo escuro) — ordem fixa, nunca reciclada.
// Ver skill de dataviz: node scripts/validate_palette.js ... --mode dark --surface #13131f
const CATEGORY_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];
const OTHER_COLOR = "#5a5a7a"; // var(--text-dim), pro grupo "Outros"

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Categoria/subcategoria padrão por tipo, baseado na planilha antiga do usuário.
const DEFAULT_TAXONOMY: Record<"income" | "expense", Record<string, string[]>> = {
  income: {
    "Salário": ["Salário fixo", "Vale Alimentação", "Bônus"],
    "Renda Extra": ["Freelance", "Comissões", "Venda de produtos"],
    "Renda Passiva": ["Dividendos"],
    "Dinheiro em Conta": ["Nubank"],
    "Outros": ["Reembolso", "Restituição IR"],
  },
  expense: {
    "Moradia": ["Aluguel", "Financiamento", "Condomínio", "Energia elétrica", "Água/Esgoto", "Internet", "Gás"],
    "Alimentação": ["Supermercado", "Restaurantes", "Delivery"],
    "Transporte": ["Combustível", "Manutenção veículo", "Seguro", "Transporte público", "Uber/Taxi"],
    "Saúde": ["Plano de saúde", "Medicamentos"],
    "Imposto": ["IR", "INSS", "IPVA", "IOF"],
    "Educação": ["Cursos", "Mensalidade", "Livros"],
    "Assinaturas": ["Streaming", "Apps/Softwares", "Academia"],
    "Pessoal": ["Roupas", "Beleza", "Lazer"],
    "Financeiro": ["Cartão de crédito", "Parcelas no cartão", "Tarifas bancárias", "Empréstimos"],
    "Família": ["Mesada", "Gastos com filhos"],
    "Outros": ["Imprevistos", "Manutenção", "Presentes"],
  },
};

function categoriesForType(type: string): string[] {
  return Object.keys(DEFAULT_TAXONOMY[type === "income" ? "income" : "expense"]);
}

function subcategoriesFor(type: string, category: string): string[] {
  const map = DEFAULT_TAXONOMY[type === "income" ? "income" : "expense"];
  return map[category] ?? [];
}

const CATEGORIES_STORAGE_KEY = "finance_custom_categories";
const SUBCATEGORIES_STORAGE_KEY = "finance_custom_subcategories_v2";

function loadFromStorage(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function loadSubcategoriesFromStorage(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SUBCATEGORIES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

/** Tick "redondo" pra eixo Y: arredonda o máximo pra um valor limpo. */
function niceMax(max: number): number {
  if (max <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function currentDay() {
  return new Date().toISOString().split("T")[0];
}



/* ── Gráfico de pizza: gastos por categoria ─────────────────────────── */
function CategoryDonut({
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
    if (restTotal > 0) result.push({ name: "Outros", value: restTotal, color: OTHER_COLOR, matchNames: rest.map(([name]) => name) });
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
function MonthlyBarChart({
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
  const width = 640;
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
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
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
function CashFlowLine({ monthly, selectedType, selectedMonth, onSelectMonth }: { monthly: { income: number; expense: number }[], selectedType: "income" | "expense" | null, selectedMonth: number, onSelectMonth: (m: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
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
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
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

/* ── Painel de gerenciar categorias/subcategorias personalizadas ────── */
function CategoryManager({
  categories,
  allCategoryNames,
  subcategoriesByCategory,
  onAddCategory,
  onRemoveCategory,
  onAddSubcategory,
  onRemoveSubcategory,
  onClose,
}: {
  categories: string[];
  allCategoryNames: string[];
  subcategoriesByCategory: Record<string, string[]>;
  onAddCategory: (v: string) => void;
  onRemoveCategory: (v: string) => void;
  onAddSubcategory: (category: string, v: string) => void;
  onRemoveSubcategory: (category: string, v: string) => void;
  onClose: () => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [subcategoryTarget, setSubcategoryTarget] = useState(allCategoryNames[0] ?? "");

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 6,
        width: 280,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>Categorias personalizadas</strong>
        <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onClose}>
          Fechar
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Categorias</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nova categoria"
            style={{ fontSize: 12, padding: "6px 8px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategory.trim()) {
                onAddCategory(newCategory.trim());
                setNewCategory("");
              }
            }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: "6px 10px" }}
            onClick={() => {
              if (newCategory.trim()) {
                onAddCategory(newCategory.trim());
                setNewCategory("");
              }
            }}
          >
            +
          </button>
        </div>
        {categories.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Nenhuma categoria extra ainda.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {categories.map((c) => (
              <span
                key={c}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 999, padding: "3px 4px 3px 10px",
                }}
              >
                {c}
                <button
                  onClick={() => onRemoveCategory(c)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", fontSize: 12 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Subcategorias</div>
        <select
          value={subcategoryTarget}
          onChange={(e) => setSubcategoryTarget(e.target.value)}
          style={{ fontSize: 12, padding: "6px 8px", width: "100%", marginBottom: 6 }}
        >
          {allCategoryNames.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={newSubcategory}
            onChange={(e) => setNewSubcategory(e.target.value)}
            placeholder={`Nova subcategoria de ${subcategoryTarget}`}
            style={{ fontSize: 12, padding: "6px 8px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSubcategory.trim()) {
                onAddSubcategory(subcategoryTarget, newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: "6px 10px" }}
            onClick={() => {
              if (newSubcategory.trim()) {
                onAddSubcategory(subcategoryTarget, newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          >
            +
          </button>
        </div>
        {(subcategoriesByCategory[subcategoryTarget] ?? []).length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Nenhuma subcategoria extra em {subcategoryTarget} ainda.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(subcategoriesByCategory[subcategoryTarget] ?? []).map((s) => (
              <span
                key={s}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 999, padding: "3px 4px 3px 10px",
                }}
              >
                {s}
                <button
                  onClick={() => onRemoveSubcategory(subcategoryTarget, s)}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", fontSize: 12 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [selectedAccount, setSelectedAccount] = useState<string>("Principal");
  const [selectedType, setSelectedType] = useState<"income" | "expense" | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategoryMatch, setSelectedCategoryMatch] = useState<string[]>([]);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<FinanceEntry[]>([]);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customSubcategories, setCustomSubcategories] = useState<Record<string, string[]>>({});
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [budgets, setBudgets] = useState<{id: string, category: string, amount: number, month: string}[]>([]);
  const [showBudgetsManager, setShowBudgetsManager] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  useEffect(() => {
    setCustomCategories(loadFromStorage(CATEGORIES_STORAGE_KEY));
    setCustomSubcategories(loadSubcategoriesFromStorage());
  }, []);

  function addCustomCategory(value: string) {
    setCustomCategories((prev) => {
      const isDefault = categoriesForType("income").includes(value) || categoriesForType("expense").includes(value);
      if (prev.includes(value) || isDefault) return prev;
      const next = [...prev, value];
      window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function removeCustomCategory(value: string) {
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c !== value);
      window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function addCustomSubcategory(category: string, value: string) {
    if (!category) return;
    setCustomSubcategories((prev) => {
      const existing = prev[category] ?? [];
      if (existing.includes(value)) return prev;
      const next = { ...prev, [category]: [...existing, value] };
      window.localStorage.setItem(SUBCATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function removeCustomSubcategory(category: string, value: string) {
    setCustomSubcategories((prev) => {
      const next = { ...prev, [category]: (prev[category] ?? []).filter((s) => s !== value) };
      window.localStorage.setItem(SUBCATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const categoryOptions = [...new Set([...categoriesForType(form.type), ...customCategories])];
  const subcategoryOptions = [...new Set([...subcategoriesFor(form.type, form.category), ...(customSubcategories[form.category] ?? [])])];
  const editCategoryOptions = [...new Set([...categoriesForType(editForm.type), ...customCategories])];
  const editSubcategoryOptions = [...new Set([...subcategoriesFor(editForm.type, editForm.category), ...(customSubcategories[editForm.category] ?? [])])];
  const allCategoryNames = [...new Set([...categoriesForType("income"), ...categoriesForType("expense"), ...customCategories])];
  const allExpenseCategoryNames = [...new Set([...categoriesForType("expense"), ...customCategories])];

  const year = month.split("-")[0];

  async function saveBudget(category: string, amount: number, applyToAll: boolean) {
    await fetch("/api/finance/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, amount, month: applyToAll ? "default" : month }),
    });
    load();
  }

  async function deleteBudget(id: string) {
    if (!confirm("Remover este orçamento?")) return;
    await fetch("/api/finance/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monthRes, yearRes, budgetsRes, balanceRes] = await Promise.all([
        fetch(`/api/finance?month=${month}&account=${selectedAccount}`),
        fetch(`/api/finance?year=${year}&account=${selectedAccount}`),
        fetch(`/api/finance/budgets?month=${month}`),
        fetch(`/api/finance/balance?month=${month}&account=${selectedAccount}`),
      ]);
      const mData = await monthRes.json();
      const yData = await yearRes.json();
      const bData = await budgetsRes.json();
      const balData = await balanceRes.json();
      setEntries(Array.isArray(mData) ? mData : []);
      setYearEntries(Array.isArray(yData) ? yData : []);
      setBudgets(Array.isArray(bData) ? bData : []);
      setPreviousBalance(balData.previousBalance || 0);
    } catch (err) {
      console.error(err);
      setEntries([]);
      setYearEntries([]);
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, [month, year, selectedAccount]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedCategory(null); setSelectedCategoryMatch([]); setSelectedType(null); }, [month]);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const monthBalance = income - expense;
  const accumulatedBalance = previousBalance + monthBalance;

  let visibleEntries = entries;
  if (selectedType) {
    visibleEntries = visibleEntries.filter((e) => e.type === selectedType);
  }
  if (selectedCategory) {
    visibleEntries = visibleEntries.filter((e) => selectedCategoryMatch.includes(e.category || "Outros"));
  }

  function selectCategory(category: string | null, matchNames: string[]) {
    setSelectedCategory(category);
    setSelectedCategoryMatch(matchNames);
  }

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
    for (const e of yearEntries) {
      const m = new Date(e.date).getMonth();
      if (e.type === "income") buckets[m].income += e.amount;
      else buckets[m].expense += e.amount;
    }
    return buckets;
  }, [yearEntries]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount) return;
    setSaving(true);
    const description = form.recurring ? `${form.description} (recorrente)`.trim() : form.description;
    await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        amount: Number(form.amount),
        category: form.category,
        subcategory: form.subcategory,
        description,
        date: form.date ? new Date(form.date).toISOString() : undefined,
        purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
        paymentMethod: form.paymentMethod,
        account: form.account,
        status: form.status,
      }),
    });
    setForm(EMPTY_FORM);
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/finance?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function deleteMonth() {
    const label = new Date(Number(month.split("-")[0]), Number(month.split("-")[1]) - 1, 1)
      .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    if (!confirm(`Tem certeza que deseja excluir todos os lançamentos de ${label}? Essa ação não pode ser desfeita.`)) return;
    await fetch(`/api/finance?month=${month}`, { method: "DELETE" });
    load();
  }

  async function deleteAll() {
    if (!confirm("Tem certeza que deseja excluir TODOS os lançamentos financeiros? Essa ação não pode ser desfeita.")) return;
    await fetch(`/api/finance?all=true`, { method: "DELETE" });
    load();
  }

  function startEdit(entry: FinanceEntry) {
    setEditingId(entry.id);
    setEditForm({
      type: entry.type,
      amount: String(entry.amount),
      category: entry.category,
      subcategory: entry.subcategory,
      description: entry.description,
      date: entry.date.slice(0, 10),
      purchaseDate: entry.purchaseDate ? entry.purchaseDate.slice(0, 10) : "",
      paymentMethod: entry.paymentMethod || "pix",
      account: entry.account || "Principal",
      status: entry.status,
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/finance?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: editForm.type,
        amount: Number(editForm.amount),
        category: editForm.category,
        subcategory: editForm.subcategory,
        description: editForm.description,
        date: new Date(editForm.date).toISOString(),
        purchaseDate: editForm.purchaseDate ? new Date(editForm.purchaseDate).toISOString() : null,
        paymentMethod: editForm.paymentMethod,
        account: editForm.account,
        status: editForm.status,
      }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }} className="p-4 md:p-6">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>💰 Financeiro</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: "6px 12px", background: "var(--accent)" }} onClick={() => setShowInsights(true)}>
              ✨ Insights IA
            </button>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteMonth}>
              Apagar mês
            </button>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteAll}>
              Apagar tudo
            </button>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ width: 160 }}
            >
              <option value="all">💳 Todas as Contas</option>
              <option value="Principal">🏦 Conta Principal</option>
              <option value="Ticket Alimentação">🍔 Ticket Alimentação</option>
            </select>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: 170 }}
            />
          </div>
        </div>

        {showInsights && <InsightsModal month={month} onClose={() => setShowInsights(false)} />}

        {/* Summary cards */}
        <div style={{ display: "grid", gap: 12, marginBottom: 20 }} className="grid-cols-1 sm:grid-cols-3">
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Receitas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{formatMoney(income)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Despesas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{formatMoney(expense)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Saldo Acumulado</p>
              {previousBalance !== 0 && (
                <p style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "right" }}>
                  Mês: {monthBalance >= 0 ? "+" : ""}{formatMoney(monthBalance)}
                </p>
              )}
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: accumulatedBalance >= 0 ? "var(--accent)" : "var(--danger)" }}>
              {formatMoney(accumulatedBalance)}
            </p>
          </div>
        </div>

        {/* Metas de Economia */}
        <GoalsSection />

        {/* Faturas de Cartão de Crédito */}
        <CreditCardsSection />

        {/* Charts */}
        <div style={{ display: "grid", gap: 12, marginBottom: 12 }} className="grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600 }}>Gastos por categoria — {MONTH_LABELS[Number(month.split("-")[1]) - 1]}</h2>
              <div style={{ position: "relative" }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setShowBudgetsManager(!showBudgetsManager)}>
                  🎯 Orçamentos
                </button>
                {showBudgetsManager && (
                  <BudgetsManager
                    budgets={budgets}
                    categories={allExpenseCategoryNames}
                    currentMonth={month}
                    onClose={() => setShowBudgetsManager(false)}
                    onSave={saveBudget}
                    onDelete={deleteBudget}
                  />
                )}
              </div>
            </div>
            <CategoryDonut entries={entries} budgets={budgets} selectedCategory={selectedCategory} onSelectCategory={selectCategory} />
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Receitas x despesas — {year}</h2>
            <MonthlyBarChart
              monthly={monthly}
              selectedMonth={Number(month.split("-")[1]) - 1}
              selectedType={selectedType}
              onSelectMonth={(i, type) => {
                setMonth(`${year}-${String(i + 1).padStart(2, "0")}`);
                setSelectedType(type);
              }}
            />
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            {selectedType === "income" ? "Receitas acumuladas" : selectedType === "expense" ? "Despesas acumuladas" : "Fluxo de caixa acumulado"} — {year}
          </h2>
          <CashFlowLine 
            monthly={monthly} 
            selectedType={selectedType} 
            selectedMonth={Number(month.split("-")[1]) - 1}
            onSelectMonth={(i) => setMonth(`${year}-${String(i + 1).padStart(2, "0")}`)}
          />
        </div>

        {/* Add form */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => setShowCategoryManager((v) => !v)}
              >
                ⚙️ Categorias
              </button>
              {showCategoryManager && (
                <CategoryManager
                  categories={customCategories}
                  allCategoryNames={allCategoryNames}
                  subcategoriesByCategory={customSubcategories}
                  onAddCategory={addCustomCategory}
                  onRemoveCategory={removeCustomCategory}
                  onAddSubcategory={addCustomSubcategory}
                  onRemoveSubcategory={removeCustomSubcategory}
                  onClose={() => setShowCategoryManager(false)}
                />
              )}
            </div>
          </div>
          <form
            onSubmit={addEntry}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 8,
              alignItems: "end",
            }}
            className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-[115px_110px_1fr_1fr_1fr_130px_130px_110px_auto]"
          >
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Tipo</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Valor</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Categoria</label>
              <input
                list="finance-categories-add"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Alimentação"
              />
              <datalist id="finance-categories-add">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="finance-subcategories-add">
                {subcategoryOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Subcategoria</label>
              <input
                list="finance-subcategories-add"
                value={form.subcategory}
                onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                placeholder="Mercado"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Descrição</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Data (Venc.)</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Data (Compra)</label>
              <input type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} title="Opcional: Data real da compra" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "paid" | "pending" }))}>
                <option value="paid">{form.type === "income" ? "Recebido" : "Pago"}</option>
                <option value="pending">{form.type === "income" ? "A receber" : "Pendente"}</option>
              </select>
            </div>
            <div>
              <label
                title="Repete todo mês automaticamente (ex: salário, aluguel)"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", height: 38, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
                  style={{ width: "auto" }}
                />
                🔁 Recorrente
              </label>
            </div>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? "..." : "Adicionar"}
            </button>
          </form>
        </div>

        {(selectedCategory || selectedType) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "var(--text-muted)" }}>
            Filtrando por: 
            {selectedType && <strong style={{ color: selectedType === "income" ? "var(--success)" : "var(--danger)" }}>{selectedType === "income" ? "Receitas" : "Despesas"}</strong>}
            {selectedType && selectedCategory && <span> e </span>}
            {selectedCategory && <strong style={{ color: "var(--text)" }}>{selectedCategory}</strong>}
            <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => { selectCategory(null, []); setSelectedType(null); }}>
              Limpar
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>}
          {!loading && visibleEntries.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
              {selectedCategory ? "Nenhum lançamento nessa categoria" : "Nenhum lançamento neste mês"}
            </div>
          )}
          {!loading && visibleEntries.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <datalist id="finance-categories-edit">
                {editCategoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <datalist id="finance-subcategories-edit">
                {editSubcategoryOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Data</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Categoria</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Subcategoria</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Descrição</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Forma</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500 }}>Origem</th>
                    <th style={{ padding: "10px 16px", color: "var(--text-muted)", fontWeight: 500, textAlign: "right" }}>Valor</th>
                    <th style={{ padding: "10px 16px" }} />
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((e) => {
                    if (editingId === e.id) {
                      return (
                        <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)", background: "var(--bg-hover)" }}>
                          <td style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                            <input type="date" value={editForm.date} onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))} style={{ width: 130, padding: "8px 6px" }} title="Vencimento" />
                            <input type="date" value={editForm.purchaseDate} onChange={(ev) => setEditForm((f) => ({ ...f, purchaseDate: ev.target.value }))} style={{ width: 130, padding: "8px 6px" }} title="Data da Compra" />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              list="finance-categories-edit"
                              value={editForm.category}
                              onChange={(ev) => setEditForm((f) => ({ ...f, category: ev.target.value }))}
                              style={{ width: 90, padding: "8px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              list="finance-subcategories-edit"
                              value={editForm.subcategory}
                              onChange={(ev) => setEditForm((f) => ({ ...f, subcategory: ev.target.value }))}
                              style={{ width: 90, padding: "8px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              value={editForm.description}
                              onChange={(ev) => setEditForm((f) => ({ ...f, description: ev.target.value }))}
                              style={{ width: 160, padding: "8px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select value={editForm.paymentMethod} onChange={(ev) => setEditForm((f) => ({ ...f, paymentMethod: ev.target.value }))} style={{ width: 90, padding: "8px 6px" }}>
                              <option value="pix">Pix</option>
                              <option value="cartão">Cartão</option>
                              <option value="boleto">Boleto</option>
                              <option value="dinheiro">Dinheiro</option>
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select value={editForm.status} onChange={(ev) => setEditForm((f) => ({ ...f, status: ev.target.value as "paid" | "pending" }))} style={{ width: 90, padding: "8px 6px" }}>
                              <option value="paid">{editForm.type === "income" ? "Recebido" : "Pago"}</option>
                              <option value="pending">{editForm.type === "income" ? "A receber" : "Pendente"}</option>
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px", color: "var(--text-dim)", whiteSpace: "nowrap", textAlign: "center" }} title={e.source === "whatsapp" ? "WhatsApp" : "Painel"}>
                            {e.source === "whatsapp" ? "📱" : "🖥️"}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <select value={editForm.type} onChange={(ev) => setEditForm((f) => ({ ...f, type: ev.target.value }))} style={{ width: 88, padding: "8px 4px" }}>
                                <option value="expense">Despesa</option>
                                <option value="income">Receita</option>
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.amount}
                                onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                                style={{ width: 70, padding: "8px 6px", textAlign: "right" }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="btn-primary" style={{ fontSize: 11, padding: "4px 6px" }} disabled={saving} onClick={() => saveEdit(e.id)}>
                              Salvar
                            </button>{" "}
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 6px" }} onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          <div>{new Date(e.date).toLocaleDateString("pt-BR")}</div>
                          {e.purchaseDate && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Compra: {new Date(e.purchaseDate).toLocaleDateString("pt-BR")}</div>}
                        </td>
                        <td style={{ padding: "10px 16px" }}>{e.category || "—"}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{e.subcategory || "—"}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{e.description || "—"}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                          {e.paymentMethod || "Pix"}
                        </td>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: e.status === "paid" ? "var(--success-dim)" : "var(--warning-dim)", color: e.status === "paid" ? "var(--success)" : "var(--warning)", border: `1px solid ${e.status === "paid" ? "var(--success)" : "var(--warning)"}` }}>
                            {e.type === "income" 
                              ? (e.status === "paid" ? "Recebido" : "A receber") 
                              : (e.status === "paid" ? "Pago" : "Pendente")}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                          {e.source === "whatsapp" ? "📱 WhatsApp" : "🖥️ Painel"}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            textAlign: "right",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            color: e.type === "income" ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {e.type === "income" ? "+" : "-"} {formatMoney(e.amount)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => startEdit(e)}>
                            Editar
                          </button>{" "}
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => deleteEntry(e.id)}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
