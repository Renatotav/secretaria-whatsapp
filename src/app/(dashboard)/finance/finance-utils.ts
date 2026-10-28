// Tipos, cores, formatos e categorias da tela do Financeiro (usados pela tela e
// pelos gráficos). Saiu de finance/page.tsx (28/10/2026).

import { FINANCE_TAXONOMY_DATA } from "@/lib/finance-taxonomy";

export interface FinanceEntry {
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
  mood?: string;
  source: string;
  _count?: { invoiceItems: number };
}

export type FormState = {
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
  mood: string;
  recurring: boolean;
  installments: string; // número de parcelas ("1" = sem parcelas)
};

export const EMPTY_FORM: FormState = {
  type: "expense",
  amount: "",
  category: "",
  subcategory: "",
  description: "",
  date: "",
  purchaseDate: "",
  // Quase tudo dele é no cartão (igual ao WhatsApp): o formulário já começa nele.
  paymentMethod: "cartão",
  account: "Principal",
  status: "pending",
  mood: "neutro",
  recurring: false,
  installments: "1",
};

export type EditForm = Omit<FormState, "recurring" | "installments">;

// Paleta categórica validada (modo escuro) — ordem fixa, nunca reciclada.
// Ver skill de dataviz: node scripts/validate_palette.js ... --mode dark --surface #13131f
export const CATEGORY_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];

export const OTHER_COLOR = "#5a5a7a"; // var(--text-dim), pro grupo "Outros"

export const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const MOODS = [
  { key: "pessimo", emoji: "😞", label: "Péssimo" },
  { key: "ruim", emoji: "🙁", label: "Ruim" },
  { key: "neutro", emoji: "😐", label: "Neutro" },
  { key: "bom", emoji: "🙂", label: "Bom" },
  { key: "otimo", emoji: "🤩", label: "Ótimo" },
];

export const MOOD_MAP = new Map(MOODS.map(m => [m.key, m]));

// Categoria/subcategoria padrão: a mesma lista usada pela IA (WhatsApp/fatura).
export const DEFAULT_TAXONOMY = FINANCE_TAXONOMY_DATA;

/** Título do lançamento: previsto sem nome mostra a subcategoria ("Aluguel (previsto)"), não só "(previsto)". */
export function entryTitle(e: { description: string; subcategory: string; category: string }): string {
  const isPrevisto = /\(previsto\)/i.test(e.description);
  const name = e.description.replace(/\s*\(previsto\)/gi, "").trim() || e.subcategory || e.category || "—";
  return isPrevisto ? `${name} (previsto)` : name;
}

/** Conta de vale (VR, ticket, vale-alimentação): gasto nela é forma "ticket", nunca cartão de crédito. */
export function isVoucherAccount(account: string): boolean {
  return /ticket|\bvr\b|vale/i.test(account);
}

export function categoriesForType(type: string): string[] {
  return Object.keys(DEFAULT_TAXONOMY[type === "income" ? "income" : "expense"]);
}

export function subcategoriesFor(type: string, category: string): string[] {
  const map = DEFAULT_TAXONOMY[type === "income" ? "income" : "expense"];
  return map[category] ?? [];
}

export const CATEGORIES_STORAGE_KEY = "finance_custom_categories";

export const SUBCATEGORIES_STORAGE_KEY = "finance_custom_subcategories_v2";

export function loadFromStorage(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function loadSubcategoriesFromStorage(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SUBCATEGORIES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Tick "redondo" pra eixo Y: arredonda o máximo pra um valor limpo. */
export function niceMax(max: number): number {
  if (max <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

// Dia de hoje no relógio de quem usa o painel (toISOString seria UTC: depois
// das 21h em Brasília já viraria amanhã).
export function currentDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
