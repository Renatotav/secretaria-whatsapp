"use client";
import { useState, useEffect, useCallback, useMemo } from "react";

interface FinanceEntry {
  id: string;
  type: string;
  amount: number;
  category: string;
  subcategory: string;
  description: string;
  date: string;
  source: string;
}

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
    "Imposto": ["IR", "INSS", "IPVA"],
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
const SUBCATEGORIES_STORAGE_KEY = "finance_custom_subcategories";

function loadFromStorage(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
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

const EMPTY_FORM = { type: "expense", amount: "", category: "", subcategory: "", description: "", date: "" };
type EditForm = { type: string; amount: string; category: string; subcategory: string; description: string; date: string };

/* ── Gráfico de pizza: gastos por categoria ─────────────────────────── */
function CategoryDonut({
  entries,
  selectedCategory,
  onSelectCategory,
}: {
  entries: FinanceEntry[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
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
    const restTotal = sorted.slice(7).reduce((s, [, v]) => s + v, 0);
    const result = top.map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i] }));
    if (restTotal > 0) result.push({ name: "Outros", value: restTotal, color: OTHER_COLOR });
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
        onClick={() => onSelectCategory(isSelected ? null : seg.name)}
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
          return (
            <div
              key={seg.name}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              onClick={() => onSelectCategory(isSelected ? null : seg.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                padding: "2px 4px",
                background: isSelected ? "var(--accent-dim)" : "transparent",
                opacity: selectedCategory === null || isSelected ? 1 : 0.5,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
              <span style={{ color: "var(--text)", flex: 1 }}>{seg.name}</span>
              <span style={{ color: "var(--text-muted)" }}>{((seg.value / total) * 100).toFixed(0)}%</span>
              <span style={{ color: "var(--text-muted)", minWidth: 70, textAlign: "right" }}>{formatMoney(seg.value)}</span>
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
  onSelectMonth,
}: {
  monthly: { income: number; expense: number }[];
  selectedMonth: number;
  onSelectMonth: (monthIndex: number) => void;
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
            <g key={i} style={{ cursor: "pointer" }} onClick={() => onSelectMonth(i)}>
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
                opacity={hover && hover.month === i && hover.type !== "income" ? 0.4 : 1}
                onMouseEnter={() => setHover({ month: i, type: "income" })}
                onMouseLeave={() => setHover(null)}
              />
              <rect
                x={gx + groupW / 2 + 2}
                y={padding.top + chartH - expenseH}
                width={barW}
                height={expenseH}
                rx={3}
                fill="var(--danger)"
                opacity={hover && hover.month === i && hover.type !== "expense" ? 0.4 : 1}
                onMouseEnter={() => setHover({ month: i, type: "expense" })}
                onMouseLeave={() => setHover(null)}
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
function CashFlowLine({ monthly }: { monthly: { income: number; expense: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 180;
  const padding = { top: 16, right: 10, bottom: 24, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let running = 0;
  const cumulative = monthly.map((m) => (running += m.income - m.expense));
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
            r={hover === i ? 5 : 4}
            fill="var(--accent)"
            stroke="var(--bg-card)"
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
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
  subcategories,
  onAddCategory,
  onRemoveCategory,
  onAddSubcategory,
  onRemoveSubcategory,
  onClose,
}: {
  categories: string[];
  subcategories: string[];
  onAddCategory: (v: string) => void;
  onRemoveCategory: (v: string) => void;
  onAddSubcategory: (v: string) => void;
  onRemoveSubcategory: (v: string) => void;
  onClose: () => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");

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
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={newSubcategory}
            onChange={(e) => setNewSubcategory(e.target.value)}
            placeholder="Nova subcategoria"
            style={{ fontSize: 12, padding: "6px 8px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSubcategory.trim()) {
                onAddSubcategory(newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          />
          <button
            className="btn-primary"
            style={{ fontSize: 11, padding: "6px 10px" }}
            onClick={() => {
              if (newSubcategory.trim()) {
                onAddSubcategory(newSubcategory.trim());
                setNewSubcategory("");
              }
            }}
          >
            +
          </button>
        </div>
        {subcategories.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Nenhuma subcategoria extra ainda.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {subcategories.map((s) => (
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
                  onClick={() => onRemoveSubcategory(s)}
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ type: "expense", amount: "", category: "", subcategory: "", description: "", date: "" });
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customSubcategories, setCustomSubcategories] = useState<string[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  useEffect(() => {
    setCustomCategories(loadFromStorage(CATEGORIES_STORAGE_KEY));
    setCustomSubcategories(loadFromStorage(SUBCATEGORIES_STORAGE_KEY));
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
  function addCustomSubcategory(value: string) {
    setCustomSubcategories((prev) => {
      if (prev.includes(value)) return prev;
      const next = [...prev, value];
      window.localStorage.setItem(SUBCATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }
  function removeCustomSubcategory(value: string) {
    setCustomSubcategories((prev) => {
      const next = prev.filter((s) => s !== value);
      window.localStorage.setItem(SUBCATEGORIES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const categoryOptions = [...new Set([...categoriesForType(form.type), ...customCategories])];
  const subcategoryOptions = [...new Set([...subcategoriesFor(form.type, form.category), ...customSubcategories])];
  const editCategoryOptions = [...new Set([...categoriesForType(editForm.type), ...customCategories])];
  const editSubcategoryOptions = [...new Set([...subcategoriesFor(editForm.type, editForm.category), ...customSubcategories])];

  const year = month.split("-")[0];

  const load = useCallback(async () => {
    setLoading(true);
    const [monthRes, yearRes] = await Promise.all([
      fetch(`/api/finance?month=${month}`),
      fetch(`/api/finance?year=${year}`),
    ]);
    setEntries(await monthRes.json());
    setYearEntries(await yearRes.json());
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedCategory(null); }, [month]);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;

  const visibleEntries = selectedCategory
    ? entries.filter((e) => (e.category || "Outros") === selectedCategory)
    : entries;

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
    await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.type,
        amount: Number(form.amount),
        category: form.category,
        subcategory: form.subcategory,
        description: form.description,
        date: form.date ? new Date(form.date).toISOString() : undefined,
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
      }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>💰 Financeiro</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteMonth}>
              Apagar mês
            </button>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteAll}>
              Apagar tudo
            </button>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: 190 }}
            />
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Receitas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--success)" }}>{formatMoney(income)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Despesas</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--danger)" }}>{formatMoney(expense)}</p>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Saldo</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: balance >= 0 ? "var(--accent)" : "var(--danger)" }}>
              {formatMoney(balance)}
            </p>
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Gastos por categoria — {MONTH_LABELS[Number(month.split("-")[1]) - 1]}</h2>
            <CategoryDonut entries={entries} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Receitas x despesas — {year}</h2>
            <MonthlyBarChart
              monthly={monthly}
              selectedMonth={Number(month.split("-")[1]) - 1}
              onSelectMonth={(i) => setMonth(`${year}-${String(i + 1).padStart(2, "0")}`)}
            />
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Fluxo de caixa acumulado — {year}</h2>
          <CashFlowLine monthly={monthly} />
        </div>

        {/* Add form */}
        <form
          onSubmit={addEntry}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "100px 110px 1fr 1fr 1fr 130px auto",
            gap: 8,
            alignItems: "end",
          }}
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
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Categoria</label>
              <button
                type="button"
                onClick={() => setShowCategoryManager((v) => !v)}
                title="Gerenciar categorias"
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}
              >
                ⚙️
              </button>
            </div>
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
            {showCategoryManager && (
              <CategoryManager
                categories={customCategories}
                subcategories={customSubcategories}
                onAddCategory={addCustomCategory}
                onRemoveCategory={removeCustomCategory}
                onAddSubcategory={addCustomSubcategory}
                onRemoveSubcategory={removeCustomSubcategory}
                onClose={() => setShowCategoryManager(false)}
              />
            )}
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
            <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? "..." : "Adicionar"}
          </button>
        </form>

        {selectedCategory && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "var(--text-muted)" }}>
            Filtrando por: <strong style={{ color: "var(--text)" }}>{selectedCategory}</strong>
            <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setSelectedCategory(null)}>
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
                          <td style={{ padding: "6px 16px" }}>
                            <input type="date" value={editForm.date} onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))} style={{ width: 155 }} />
                          </td>
                          <td style={{ padding: "6px 16px" }}>
                            <input
                              list="finance-categories-edit"
                              value={editForm.category}
                              onChange={(ev) => setEditForm((f) => ({ ...f, category: ev.target.value }))}
                              style={{ width: 110 }}
                            />
                          </td>
                          <td style={{ padding: "6px 16px" }}>
                            <input
                              list="finance-subcategories-edit"
                              value={editForm.subcategory}
                              onChange={(ev) => setEditForm((f) => ({ ...f, subcategory: ev.target.value }))}
                              style={{ width: 110 }}
                            />
                          </td>
                          <td style={{ padding: "6px 16px" }}>
                            <input
                              value={editForm.description}
                              onChange={(ev) => setEditForm((f) => ({ ...f, description: ev.target.value }))}
                            />
                          </td>
                          <td style={{ padding: "6px 16px" }}>
                            <select value={editForm.type} onChange={(ev) => setEditForm((f) => ({ ...f, type: ev.target.value }))}>
                              <option value="expense">Despesa</option>
                              <option value="income">Receita</option>
                            </select>
                          </td>
                          <td style={{ padding: "6px 16px", textAlign: "right" }}>
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.amount}
                              onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                              style={{ width: 90, textAlign: "right" }}
                            />
                          </td>
                          <td style={{ padding: "6px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="btn-primary" style={{ fontSize: 11, padding: "4px 8px" }} disabled={saving} onClick={() => saveEdit(e.id)}>
                              Salvar
                            </button>{" "}
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{new Date(e.date).toLocaleDateString("pt-BR")}</td>
                        <td style={{ padding: "10px 16px" }}>{e.category || "—"}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{e.subcategory || "—"}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-muted)" }}>{e.description || "—"}</td>
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
