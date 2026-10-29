"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import { GoalsSection } from "./GoalsSection";
import { BudgetsManager } from "./BudgetsManager";
import { CreditCardsSection } from "./CreditCardsSection";
import { InsightsModal } from "./InsightsModal";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { FINANCE_TAXONOMY_DATA } from "@/lib/finance-taxonomy";
import { autoEntryDates } from "@/lib/dates";
import { useWidth } from "@/lib/use-width";
import { CATEGORIES_STORAGE_KEY, CATEGORY_COLORS, EMPTY_FORM, MONTH_LABELS, MOODS, MOOD_MAP, OTHER_COLOR, SUBCATEGORIES_STORAGE_KEY, categoriesForType, currentDay, currentMonth, entryTitle, formatCompact, formatMoney, isVoucherAccount, loadFromStorage, loadSubcategoriesFromStorage, niceMax, subcategoriesFor } from "./finance-utils";
import type { EditForm, FinanceEntry } from "./finance-utils";
import { CashFlowLine, CategoryDonut, MonthlyBarChart } from "./FinanceCharts";
import { CategoryManager } from "./CategoryManager";

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<"income" | "expense" | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategoryMatch, setSelectedCategoryMatch] = useState<string[]>([]);
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [yearEntries, setYearEntries] = useState<FinanceEntry[]>([]);
  const [allAccounts, setAllAccounts] = useState<string[]>([]);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [ordem, setOrdem] = useState<"compra" | "fatura">("compra");
  const [busca, setBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<FinanceEntry[] | null>(null);
  // "Dia da compra": a lista mostra as compras FEITAS no mês escolhido (de qualquer fatura).
  const [comprasDoMes, setComprasDoMes] = useState<FinanceEntry[] | null>(null);
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) return setResultadosBusca(null);
    const t = setTimeout(() => {
      fetch(`/api/finance?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setResultadosBusca(Array.isArray(d) ? d : []))
        .catch(() => setResultadosBusca([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);
  // A data de hoje sai do relógio do navegador (o servidor roda em UTC).
  useEffect(() => setForm((f) => (f.date ? f : { ...f, date: currentDay() })), []);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM);
  // Fatura e pago/pendente são calculados sozinhos (mesma regra da API); o
  // status só fica "na mão" se o dono mexer nele.
  const [cardDays, setCardDays] = useState({ due: 10, best: 5 });
  const [statusTouched, setStatusTouched] = useState(false);
  const [editStatusTouched, setEditStatusTouched] = useState(false);
  const [editOriginal, setEditOriginal] = useState<{ paymentMethod: string; purchaseDate: string } | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCardDays({ due: c.creditCardDueDay || 10, best: c.creditCardBestDay || 5 }))
      .catch(() => {});
  }, []);
  const isCardForm = form.type === "expense" && form.paymentMethod === "cartão";
  const formAuto = autoEntryDates(
    { type: form.type, paymentMethod: form.paymentMethod, date: form.date, purchaseDate: isCardForm ? form.purchaseDate || form.date : form.purchaseDate },
    cardDays.due,
    cardDays.best
  );
  useEffect(() => {
    if (!statusTouched && form.status !== formAuto.status) setForm((f) => ({ ...f, status: formAuto.status }));
  }, [formAuto.status, statusTouched, form.status]);
  useEffect(() => {
    // Edição: só recalcula fatura/status quando a forma de pagamento ou a data
    // da compra mudam (uma fatura ajustada à mão continua como está).
    if (!editingId || !editOriginal) return;
    const changed = editForm.paymentMethod !== editOriginal.paymentMethod || editForm.purchaseDate !== editOriginal.purchaseDate;
    if (!changed) return;
    const auto = autoEntryDates(
      { type: editForm.type, paymentMethod: editForm.paymentMethod, date: editForm.date, purchaseDate: editForm.purchaseDate || editForm.date, description: editForm.description },
      cardDays.due,
      cardDays.best
    );
    const iso = auto.date.toISOString().slice(0, 10);
    const isCard = editForm.type === "expense" && editForm.paymentMethod === "cartão";
    setEditForm((f) => ({
      ...f,
      ...(isCard && f.date !== iso ? { date: iso } : {}),
      ...(!editStatusTouched && f.status !== auto.status ? { status: auto.status } : {}),
    }));
    setEditOriginal({ paymentMethod: editForm.paymentMethod, purchaseDate: editForm.purchaseDate });
  }, [editForm.paymentMethod, editForm.purchaseDate, editingId, editOriginal, editStatusTouched, cardDays, editForm.type, editForm.date, editForm.description]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customSubcategories, setCustomSubcategories] = useState<Record<string, string[]>>({});
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [budgets, setBudgets] = useState<{id: string, category: string, amount: number, month: string}[]>([]);
  const [showBudgetsManager, setShowBudgetsManager] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

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
      // Lista "dia da compra" (não trava a tela: chega quando chegar).
      fetch(`/api/finance?month=${month}&compra=1&account=${encodeURIComponent(selectedAccount)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setComprasDoMes(Array.isArray(d) ? d : null))
        .catch(() => setComprasDoMes(null));
      const [monthRes, yearRes, budgetsRes, balanceRes, accountsRes] = await Promise.all([
        fetch(`/api/finance?month=${month}&account=${encodeURIComponent(selectedAccount)}`),
        fetch(`/api/finance?year=${year}&account=${encodeURIComponent(selectedAccount)}`),
        fetch(`/api/finance/budgets?month=${month}`),
        fetch(`/api/finance/balance?month=${month}&account=${encodeURIComponent(selectedAccount)}`),
        fetch(`/api/finance/accounts`),
      ]);
      const mData = await monthRes.json();
      const yData = await yearRes.json();
      const bData = await budgetsRes.json();
      const balData = await balanceRes.json();
      const accData = await accountsRes.json();
      setEntries(Array.isArray(mData) ? mData : []);
      setYearEntries(Array.isArray(yData) ? yData : []);
      setBudgets(Array.isArray(bData) ? bData : []);
      setPreviousBalance(balData.previousBalance || 0);
      setAllAccounts(Array.isArray(accData) ? accData : []);
    } catch (err) {
      console.error(err);
      setEntries([]);
      setYearEntries([]);
      setBudgets([]);
      setAllAccounts([]);
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

  // Lista segue o DIA DA COMPRA (mais recente primeiro) — pela fatura quase tudo
  // caía no mesmo dia (10/11) e a compra se perdia. Busca: qualquer mês.
  const diaDe = (e: FinanceEntry) => (e.purchaseDate || e.date).slice(0, 10);
  // "23/10" (com o ano só se for de outro ano): cabe no cartão do celular.
  const curta = (iso: string) => {
    const d = new Date(iso);
    const dm = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return d.getFullYear() === new Date().getFullYear() ? dm : `${dm}/${String(d.getFullYear()).slice(2)}`;
  };
  const rotuloDia = (d: string) => {
    const hoje = currentDay();
    const ontem = (() => { const x = new Date(); x.setDate(x.getDate() - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; })();
    const [y, m, dd] = d.split("-");
    const sem = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(Number(y), Number(m) - 1, Number(dd)).getDay()];
    return d === hoje ? `Hoje · ${dd}/${m}` : d === ontem ? `Ontem · ${dd}/${m}` : `${sem} · ${dd}/${m}${y !== hoje.slice(0, 4) ? `/${y}` : ""}`;
  };
  let visibleEntries = busca.trim().length >= 2 && resultadosBusca ? resultadosBusca : ordem === "compra" && comprasDoMes ? comprasDoMes : entries;
  visibleEntries = ordem === "compra"
    ? [...visibleEntries].sort((a, b) => diaDe(b).localeCompare(diaDe(a)) || b.amount - a.amount)
    : visibleEntries;
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

    const totalParcelas = Math.max(1, parseInt(form.installments || "1", 10) || 1);
    const baseDesc = form.recurring ? `${form.description} (recorrente)`.trim() : form.description.trim();

    // Monta a descrição no formato que a API já sabe projetar automaticamente
    const [purchaseYear, purchaseMonth] = (form.purchaseDate || form.date).split("-");
    const compraTag = `(compra em ${purchaseMonth}/${purchaseYear})`;
    const description = totalParcelas > 1
      ? `${baseDesc} - Parcela 1/${totalParcelas} ${compraTag}`.trim()
      : baseDesc;

    const send = (force: boolean) => fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        force,
        type: form.type,
        amount: Number(form.amount),
        category: form.category,
        subcategory: form.subcategory,
        description,
        date: form.date ? new Date(form.date).toISOString() : undefined,
        purchaseDate: isCardForm
          ? new Date(form.purchaseDate || form.date).toISOString()
          : form.purchaseDate ? new Date(form.purchaseDate).toISOString() : undefined,
        paymentMethod: form.paymentMethod,
        account: form.account,
        status: form.status,
        statusManual: statusTouched,
        mood: form.mood,
      }),
    });
    let res = await send(false);
    if (res.status === 409) {
      const dup = await res.json().catch(() => ({}));
      const onde = dup.source === "whatsapp" ? " (veio pelo WhatsApp)" : "";
      if (!confirm(`Já existe um lançamento igual neste dia${onde}: mesmo valor e descrição.\n\nLançar mesmo assim?`)) {
        setSaving(false);
        return;
      }
      res = await send(true);
    }
    setForm({ ...EMPTY_FORM, date: currentDay() });
    setStatusTouched(false);
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
    // Apagar em massa pede para DIGITAR a palavra — um clique sem querer não apaga nada.
    const typed = prompt(`Isso apaga TODOS os lançamentos de ${label} e não tem volta.\nPara confirmar, digite APAGAR:`);
    if ((typed || "").trim().toUpperCase() !== "APAGAR") return;
    await fetch(`/api/finance?month=${month}`, { method: "DELETE" });
    load();
  }

  async function deleteAll() {
    const typed = prompt("Isso apaga TODOS os lançamentos financeiros, de todos os meses, e não tem volta.\nPara confirmar, digite APAGAR TUDO:");
    if ((typed || "").trim().toUpperCase() !== "APAGAR TUDO") return;
    await fetch(`/api/finance?all=true`, { method: "DELETE" });
    load();
  }

  function startEdit(entry: FinanceEntry) {
    setEditingId(entry.id);
    setEditStatusTouched(false);
    setEditOriginal({ paymentMethod: entry.paymentMethod || "pix", purchaseDate: entry.purchaseDate ? entry.purchaseDate.slice(0, 10) : "" });
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
      mood: entry.mood || "neutro",
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
        statusManual: editStatusTouched,
        mood: editForm.mood,
      }),
    });
    setEditingId(null);
    setSaving(false);
    load();
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 160 }} className="page-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>💰 Financeiro</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
            <Link href={`/finance/xray?month=${month}`} className="btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }}>
              🔍 Raio-X
            </Link>
            <button className="btn-primary" style={{ fontSize: 12, padding: "6px 12px", background: "var(--accent)" }} onClick={() => setShowInsights(true)}>
              ✨ Insights IA
            </button>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ width: "auto", minWidth: 160, maxWidth: 220, padding: "6px 12px" }}
            >
              <option value="all">📊 Todas as contas</option>
              <option value="Principal">🏦 Conta Principal</option>
              {allAccounts.filter(a => a !== "Principal" && a !== "all").map(acc => (
                <option key={acc} value={acc}>
                  {isVoucherAccount(acc) ? "🍔 " : "🏦 "}{acc}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer" }}>
              <span
                style={{ fontSize: 14, color: "var(--text)", whiteSpace: "nowrap", cursor: "pointer" }}
                onClick={() => { const inp = document.getElementById("month-picker-hidden") as HTMLInputElement; inp?.showPicker?.(); }}
              >
                {new Date(month + "-02").toLocaleDateString("pt-BR", { month: "long" })} de
              </span>
              <select
                value={month.split("-")[0]}
                onChange={(e) => setMonth(`${e.target.value}-${month.split("-")[1]}`)}
                style={{ border: "none", background: "transparent", color: "var(--text)", fontSize: 14, cursor: "pointer", padding: 0, outline: "none", fontWeight: 500 }}
              >
                {[2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
              <span
                style={{ fontSize: 16, cursor: "pointer" }}
                onClick={() => { const inp = document.getElementById("month-picker-hidden") as HTMLInputElement; inp?.showPicker?.(); }}
              >📅</span>
              <input
                id="month-picker-hidden"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
              />
            </div>
          </div>
        </div>

        {showInsights && <InsightsModal month={month} onClose={() => setShowInsights(false)} />}
        {selectedInvoiceId && <InvoiceDrawer entryId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />}

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
        <CreditCardsSection onPaid={load} />

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
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 14 }}
          >
            {/* 1. Despesa ou receita */}
            <div role="radiogroup" aria-label="Tipo" style={{ display: "flex", gap: 6 }}>
              {([["expense", "↓ Despesa", "var(--danger)"], ["income", "↑ Receita", "var(--success)"]] as const).map(([v, t, cor]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={form.type === v}
                  onClick={() => setForm((f) => ({ ...f, type: v }))}
                  style={{ flex: "1 1 0", padding: "8px 10px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${form.type === v ? cor : "var(--border)"}`, background: form.type === v ? `color-mix(in srgb, ${cor} 14%, transparent)` : "transparent", color: form.type === v ? cor : "var(--text-muted)" }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* 2. Quanto e o que foi */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Quanto</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 10, padding: "0 12px", background: "var(--bg)" }}>
                  <span style={{ fontSize: 18, color: "var(--text-muted)", fontWeight: 600 }}>R$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0,00"
                    required
                    aria-label="Valor"
                    style={{ border: 0, background: "transparent", fontSize: 24, fontWeight: 700, padding: "8px 0", width: "100%", minWidth: 0, fontVariantNumeric: "tabular-nums" }}
                  />
                </div>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>O que foi</span>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={form.type === "income" ? "ex.: salário, freela" : "ex.: almoço, mercado Guará"}
                  style={{ fontSize: 15, padding: "12px" }}
                />
              </label>
            </div>

            {/* 3. Como pagou (toque) */}
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{form.type === "income" ? "Como recebeu" : "Como pagou"}</span>
              <div role="radiogroup" aria-label="Forma de pagamento" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(form.type === "income"
                  ? [["pix", "Pix"], ["dinheiro", "Dinheiro"], ["ticket", "VR"], ["cartão", "Estorno no cartão"]]
                  : [["cartão", "💳 Cartão"], ["pix", "Pix"], ["débito", "Débito"], ["ticket", "🍽️ VR"], ["dinheiro", "Dinheiro"], ["boleto", "Boleto"]]
                ).map(([v, t]) => {
                  const on = form.paymentMethod === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          paymentMethod: v,
                          installments: v === "cartão" ? f.installments : "1",
                          // VR vai para a conta do vale; sair do VR volta para a Principal.
                          account: v === "ticket" ? allAccounts.find((a) => isVoucherAccount(a)) || "VR" : isVoucherAccount(f.account) ? "Principal" : f.account,
                        }))
                      }
                      style={{ padding: "7px 12px", borderRadius: 999, fontSize: 13, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-dim)" : "transparent", color: on ? "var(--text)" : "var(--text-muted)", fontWeight: on ? 600 : 400 }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Quando (+ parcelas no cartão) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isCardForm ? "Dia da compra" : form.type === "income" ? "Dia que recebeu" : "Quando"}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {[["Hoje", 0], ["Ontem", 1]].map(([t, n]) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (n as number));
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const atual = isCardForm ? form.purchaseDate || form.date : form.date;
                    const on = atual === iso;
                    return (
                      <button
                        key={t as string}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setForm((f) => (isCardForm ? { ...f, purchaseDate: iso, date: iso } : { ...f, date: iso }))}
                        style={{ padding: "7px 12px", borderRadius: 999, fontSize: 13, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-dim)" : "transparent", color: on ? "var(--text)" : "var(--text-muted)" }}
                      >
                        {t}
                      </button>
                    );
                  })}
                  <input
                    type="date"
                    aria-label="Outro dia"
                    value={isCardForm ? form.purchaseDate || form.date : form.date}
                    onChange={(e) => setForm((f) => (isCardForm ? { ...f, purchaseDate: e.target.value, date: e.target.value } : { ...f, date: e.target.value }))}
                    style={{ width: "auto" }}
                  />
                </div>
              </div>
              {isCardForm && (
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Parcelas</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min="1"
                      max="96"
                      step="1"
                      inputMode="numeric"
                      value={form.installments}
                      onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
                      aria-label="Número de parcelas"
                      style={{ width: 64, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>x</span>
                  </div>
                </div>
              )}
              {isCardForm && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", paddingBottom: 9 }}>
                  💳 Fatura de <b style={{ color: "var(--text)" }}>{formAuto.date.toLocaleDateString("pt-BR")}</b>
                  {parseInt(form.installments || "1", 10) > 1 && <> · {form.installments}x de {formatMoney(Number(form.amount) || 0)}</>}
                </div>
              )}
            </div>

            {/* 5. Categoria */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))" }}>
<div style={{ gridColumn: "span 1" }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Categoria</label>
              {categoryOptions.includes(form.category) || form.category === "" ? (
                <select
                  value={form.category || ""}
                  onChange={(e) => {
                    if (e.target.value === "NEW") {
                      setForm((f) => ({ ...f, category: "Nova Categoria" }));
                    } else {
                      setForm((f) => ({ ...f, category: e.target.value }));
                    }
                  }}
                  style={{ width: "100%" }}
                >
                  <option value="" disabled>Selecione...</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="NEW">➕ Digitar Nova...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="Alimentação"
                    style={{ flex: 1, minWidth: 0, padding: "8px 6px" }}
                    autoFocus
                  />
                  <button type="button" className="btn-ghost" onClick={() => setForm(f => ({ ...f, category: categoryOptions[0] || "" }))} style={{ padding: "0 8px" }} title="Voltar">
                    x
                  </button>
                </div>
              )}
            </div>
<div style={{ gridColumn: "span 1" }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Subcategoria</label>
              {subcategoryOptions.includes(form.subcategory) || form.subcategory === "" ? (
                <select
                  value={form.subcategory || ""}
                  onChange={(e) => {
                    if (e.target.value === "NEW") {
                      setForm((f) => ({ ...f, subcategory: "Nova Subcategoria" }));
                    } else {
                      setForm((f) => ({ ...f, subcategory: e.target.value }));
                    }
                  }}
                  style={{ width: "100%" }}
                >
                  <option value="" disabled>Selecione...</option>
                  {subcategoryOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="NEW">➕ Digitar Nova...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={form.subcategory}
                    onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                    placeholder="Mercado"
                    style={{ flex: 1, minWidth: 0, padding: "8px 6px" }}
                    autoFocus
                  />
                  <button type="button" className="btn-ghost" onClick={() => setForm(f => ({ ...f, subcategory: subcategoryOptions[0] || "" }))} style={{ padding: "0 8px" }} title="Voltar">
                    x
                  </button>
                </div>
              )}
            </div>
            </div>

            {/* Raro: conta, status, humor, recorrente */}
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)", minHeight: 32, display: "flex", alignItems: "center" }}>
                Mais opções <span style={{ marginLeft: 6, fontSize: 12 }}>· {form.account || "Principal"} · {form.status === "paid" ? (form.type === "income" ? "recebido" : "pago") : form.type === "income" ? "a receber" : "a pagar"}{form.recurring ? " · recorrente" : ""}</span>
              </summary>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", marginTop: 10 }}>
<div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Conta (Carteira)</label>
              {allAccounts.includes(form.account) || form.account === "" ? (
                <select
                  value={form.account || "Principal"}
                  onChange={(e) => {
                    if (e.target.value === "NEW") {
                      setForm((f) => ({ ...f, account: "Nova Conta" }));
                    } else {
                      const account = e.target.value;
                      setForm((f) => ({
                        ...f,
                        account,
                        paymentMethod: isVoucherAccount(account) ? "ticket" : f.paymentMethod
                      }));
                    }
                  }}
                  style={{ width: "100%" }}
                >
                  {allAccounts.map((acc) => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                  <option value="NEW">➕ Digitar Nova Conta...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    value={form.account}
                    onChange={(e) => {
                      const account = e.target.value;
                      setForm((f) => ({
                        ...f,
                        account,
                        paymentMethod: isVoucherAccount(account) ? "ticket" : f.paymentMethod
                      }));
                    }}
                    placeholder="Nome da conta..."
                    style={{ flex: 1, minWidth: 0, padding: "8px 6px" }}
                    autoFocus
                  />
                  <button type="button" className="btn-ghost" onClick={() => setForm(f => ({ ...f, account: "Principal" }))} style={{ padding: "0 8px" }} title="Voltar">
                    x
                  </button>
                </div>
              )}
            </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Situação {statusTouched ? "" : "(automática)"}</label>
                  <select value={form.status} onChange={(e) => { setStatusTouched(true); setForm((f) => ({ ...f, status: e.target.value as "paid" | "pending" })); }}>
                    <option value="paid">{form.type === "income" ? "Recebido" : "Pago"}</option>
                    <option value="pending">{form.type === "income" ? "A receber" : "A pagar"}</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Como você estava</label>
                  <select value={form.mood} onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}>
                    {MOODS.map((m) => (
                      <option key={m.key} value={m.key}>{m.emoji} {m.label}</option>
                    ))}
                  </select>
                </div>
                <label title="Repete todo mês (ex.: salário, aluguel)" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)", minHeight: 40, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.recurring} onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))} style={{ width: "auto" }} />
                  🔁 Repete todo mês
                </label>
              </div>
            </details>

            <button className="btn-primary" type="submit" disabled={saving} style={{ fontSize: 15, padding: "12px 16px", fontWeight: 700 }}>
              {saving
                ? "Salvando…"
                : `Adicionar${Number(form.amount) > 0 ? ` ${formatMoney(Number(form.amount))}` : ""}${parseInt(form.installments || "1", 10) > 1 && isCardForm ? ` em ${form.installments}x` : ""}`}
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

        {/* Busca e ordem da lista */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            type="search"
            value={busca}
            onChange={(ev) => setBusca(ev.target.value)}
            placeholder="🔎 Procurar compra (qualquer mês)…"
            aria-label="Procurar compra"
            style={{ flex: "1 1 220px", minWidth: 0 }}
          />
          <div role="radiogroup" aria-label="Ordem da lista" style={{ display: "flex", gap: 4 }}>
            {([["compra", "Dia da compra"], ["fatura", "Vencimento"]] as const).map(([v, t]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ordem === v}
                onClick={() => setOrdem(v)}
                style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, border: `1px solid ${ordem === v ? "var(--accent)" : "var(--border)"}`, background: ordem === v ? "var(--accent-dim)" : "transparent", color: ordem === v ? "var(--text)" : "var(--text-muted)" }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {busca.trim().length < 2 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            {ordem === "compra"
              ? `Compras feitas em ${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long" })} (de qualquer fatura; parcelado aparece uma vez)`
              : `O que vence em ${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long" })} (faturas e contas)`}
          </div>
        )}
        {busca.trim().length >= 2 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            {resultadosBusca === null ? "Procurando…" : `${resultadosBusca.length} resultado(s) para "${busca.trim()}" em todos os meses`} ·{" "}
            <button type="button" onClick={() => setBusca("")} style={{ background: "none", border: 0, color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 12 }}>voltar ao mês</button>
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
              <table className="entries-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Data</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Categoria</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Subcategoria</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Descrição</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Conta</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Forma</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Status</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Origem</th>
                    <th style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500, textAlign: "right" }}>Valor</th>
                    <th style={{ padding: "8px 8px" }} />
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((e, idx) => {
                    // Cabeçalho do dia da compra ("Hoje", "Ontem", "20/10") quando a lista segue a compra.
                    const cab = ordem === "compra" && (idx === 0 || diaDe(visibleEntries[idx - 1]) !== diaDe(e)) ? (
                      <tr className="day-row">
                        <td colSpan={10}>{rotuloDia(diaDe(e))}</td>
                      </tr>
                    ) : null;
                    const linha = (() => {
                    if (editingId === e.id) {
                      return (
                        <tr key={e.id} className="edit-row" style={{ borderBottom: "1px solid var(--border-light)", background: "var(--bg-hover)" }}>
                          <td style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                            <input type="date" value={editForm.date} onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))} style={{ width: 130, padding: "8px 6px" }} title={editForm.paymentMethod === "cartão" ? "Fatura (calculada pela data da compra; mude só se a fatura fechou diferente)" : "Data"} />
                            <input type="date" value={editForm.purchaseDate} onChange={(ev) => setEditForm((f) => ({ ...f, purchaseDate: ev.target.value }))} style={{ width: 130, padding: "8px 6px" }} title="Data da Compra" />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            {editCategoryOptions.includes(editForm.category) || editForm.category === "" ? (
                              <select
                                value={editForm.category || ""}
                                onChange={(ev) => {
                                  if (ev.target.value === "NEW") {
                                    setEditForm((f) => ({ ...f, category: "Nova Categoria" }));
                                  } else {
                                    setEditForm((f) => ({ ...f, category: ev.target.value }));
                                  }
                                }}
                                style={{ width: 100, padding: "8px 6px" }}
                              >
                                <option value="" disabled>Selecione...</option>
                                {editCategoryOptions.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                                <option value="NEW">➕ Digitar...</option>
                              </select>
                            ) : (
                              <div style={{ display: "flex", gap: 2 }}>
                                <input
                                  value={editForm.category}
                                  onChange={(ev) => setEditForm((f) => ({ ...f, category: ev.target.value }))}
                                  style={{ width: 80, padding: "8px 6px" }}
                                  autoFocus
                                />
                                <button type="button" className="btn-ghost" onClick={() => setEditForm(f => ({ ...f, category: editCategoryOptions[0] || "" }))} style={{ padding: "0 4px" }} title="Voltar">
                                  x
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            {editSubcategoryOptions.includes(editForm.subcategory) || editForm.subcategory === "" ? (
                              <select
                                value={editForm.subcategory || ""}
                                onChange={(ev) => {
                                  if (ev.target.value === "NEW") {
                                    setEditForm((f) => ({ ...f, subcategory: "Nova Subcategoria" }));
                                  } else {
                                    setEditForm((f) => ({ ...f, subcategory: ev.target.value }));
                                  }
                                }}
                                style={{ width: 100, padding: "8px 6px" }}
                              >
                                <option value="" disabled>Selecione...</option>
                                {editSubcategoryOptions.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                                <option value="NEW">➕ Digitar...</option>
                              </select>
                            ) : (
                              <div style={{ display: "flex", gap: 2 }}>
                                <input
                                  value={editForm.subcategory}
                                  onChange={(ev) => setEditForm((f) => ({ ...f, subcategory: ev.target.value }))}
                                  style={{ width: 80, padding: "8px 6px" }}
                                  autoFocus
                                />
                                <button type="button" className="btn-ghost" onClick={() => setEditForm(f => ({ ...f, subcategory: editSubcategoryOptions[0] || "" }))} style={{ padding: "0 4px" }} title="Voltar">
                                  x
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              value={editForm.description}
                              onChange={(ev) => setEditForm((f) => ({ ...f, description: ev.target.value }))}
                              style={{ width: 160, padding: "8px 6px" }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            {allAccounts.includes(editForm.account) || editForm.account === "" ? (
                              <select
                                value={editForm.account || "Principal"}
                                onChange={(ev) => {
                                  if (ev.target.value === "NEW") {
                                    setEditForm((f) => ({ ...f, account: "Nova Conta" }));
                                  } else {
                                    const account = ev.target.value;
                                    setEditForm((f) => ({
                                      ...f,
                                      account,
                                      paymentMethod: isVoucherAccount(account) ? "ticket" : f.paymentMethod
                                    }));
                                  }
                                }}
                                style={{ width: 110, padding: "8px 6px" }}
                              >
                                {allAccounts.map((acc) => (
                                  <option key={acc} value={acc}>{acc}</option>
                                ))}
                                <option value="NEW">➕ Digitar...</option>
                              </select>
                            ) : (
                              <div style={{ display: "flex", gap: 2 }}>
                                <input
                                  value={editForm.account}
                                  onChange={(ev) => {
                                    const account = ev.target.value;
                                    setEditForm((f) => ({
                                      ...f,
                                      account,
                                      paymentMethod: isVoucherAccount(account) ? "ticket" : f.paymentMethod
                                    }));
                                  }}
                                  style={{ width: 80, padding: "8px 6px" }}
                                  placeholder="Ticket..."
                                  autoFocus
                                />
                                <button type="button" className="btn-ghost" onClick={() => setEditForm(f => ({ ...f, account: "Principal" }))} style={{ padding: "0 4px" }} title="Voltar">
                                  x
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select 
                              value={editForm.paymentMethod} 
                              onChange={(ev) => setEditForm((f) => ({ ...f, paymentMethod: ev.target.value }))} 
                              style={{ width: 90, padding: "8px 6px" }}
                              disabled={isVoucherAccount(editForm.account)}
                              title={isVoucherAccount(editForm.account) ? "Conta de vale (VR) só aceita a forma VR / Ticket" : undefined}
                            >
                              <option value="pix">Pix</option>
                              <option value="cartão">Cartão</option>
                              <option value="débito">Débito</option>
                              <option value="boleto">Boleto</option>
                              <option value="dinheiro">Dinheiro</option>
                              <option value="ticket">VR / Ticket</option>
                            </select>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <select value={editForm.status} onChange={(ev) => { setEditStatusTouched(true); setEditForm((f) => ({ ...f, status: ev.target.value as "paid" | "pending" })); }} style={{ width: 90, padding: "8px 6px" }}>
                              <option value="paid">{editForm.type === "income" ? "Recebido" : "Pago"}</option>
                              <option value="pending">{editForm.type === "income" ? "A receber" : "Pendente"}</option>
                            </select>
                            <select value={editForm.mood} onChange={(ev) => setEditForm((f) => ({ ...f, mood: ev.target.value }))} style={{ width: 90, padding: "8px 6px", marginTop: 4 }}>
                              {MOODS.map(m => (
                                <option key={m.key} value={m.key}>{m.emoji} {m.label}</option>
                              ))}
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
                      <tr key={e.id} className="entry-row" style={{ borderBottom: "1px solid var(--border-light)" }}>
                        <td className="c-date" style={{ padding: "8px 8px" }}>
                          {e.purchaseDate && e.paymentMethod === "cartão" ? (
                            <>
                              <div>Compra {curta(e.purchaseDate)}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>💳 fatura {curta(e.date)}</div>
                            </>
                          ) : (
                            <div>{curta(e.date)}</div>
                          )}
                        </td>
                        <td className="c-cat" style={{ padding: "8px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {e.category || "—"}
                            {e.subcategory && <span className="entry-extra" style={{ color: "var(--text-muted)" }}>› {e.subcategory}</span>}
                            {e.mood && e.mood !== "neutro" && MOOD_MAP.get(e.mood) && (
                              <span title={MOOD_MAP.get(e.mood)?.label} style={{ fontSize: 14 }}>
                                {MOOD_MAP.get(e.mood)?.emoji}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="c-sub" style={{ padding: "8px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{e.subcategory || "—"}</td>
                        <td className="c-desc" style={{ padding: "8px 8px", color: "var(--text-muted)", maxWidth: 220, overflowWrap: "anywhere", whiteSpace: "normal" }}>{entryTitle(e)}</td>
                        <td className="c-acc" style={{ padding: "8px 8px", color: "var(--text-muted)", fontWeight: 500 }}>{e.account || "—"}</td>
                        <td className="c-pay" style={{ padding: "8px 8px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                          {e.paymentMethod || "Pix"}
                        </td>
                        <td className="c-status" style={{ padding: "8px 8px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: e.status === "paid" ? "var(--success-dim)" : "var(--warning-dim)", color: e.status === "paid" ? "var(--success)" : "var(--warning)", border: `1px solid ${e.status === "paid" ? "var(--success)" : "var(--warning)"}` }}>
                            {e.type === "income" 
                              ? (e.status === "paid" ? "Recebido" : "A receber") 
                              : (e.status === "paid" ? "Pago" : "Pendente")}
                          </span>
                        </td>
                        <td className="c-src" style={{ padding: "8px 8px", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                          {e.source === "whatsapp" ? "📱 WhatsApp" : "🖥️ Painel"}
                        </td>
                        <td
                          className="c-val"
                          style={{
                            padding: "8px 8px",
                            textAlign: "right",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            color: e.type === "income" ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {e.type === "income" ? "+" : "-"} {formatMoney(e.amount)}
                        </td>
                        <td className="c-act" style={{ padding: "8px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {e._count && e._count.invoiceItems > 0 && (
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} onClick={() => setSelectedInvoiceId(e.id)} title="Ver itens da nota fiscal">
                              🛒 Itens
                            </button>
                          )}
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => startEdit(e)}>
                            Editar
                          </button>{" "}
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => deleteEntry(e.id)}>
                            Excluir
                          </button>
                        </td>
                      </tr>
                    );
                  })();
                    return (
                      <Fragment key={e.id}>
                        {cab}
                        {linha}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Apagar em massa fica no fim (antes era o 1º botão vermelho do topo); continua pedindo para digitar APAGAR. */}
        <details style={{ marginTop: 32, border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>🗑️ Apagar lançamentos em massa</summary>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteMonth}>Apagar este mês</button>
            <button className="btn-danger" style={{ fontSize: 12, padding: "6px 12px" }} onClick={deleteAll}>Apagar tudo</button>
          </div>
        </details>
      </div>
    </div>
  );
}
