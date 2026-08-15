"use client";
import { useState, useEffect, useCallback, useMemo } from "react";

interface DiaryEntry {
  id: string;
  date: string;
  content: string;
  mood: string;
  source: string;
}

interface AgendaItem {
  id: string;
  title: string;
  category: string;
  dueDate: string | null;
  done: boolean;
}

interface FinanceEntry {
  id: string;
  type: string;
  amount: number;
  date: string;
  purchaseDate?: string | null;
}

const MOODS = [
  { key: "pessimo", emoji: "😞", label: "Péssimo", color: "#f87171" },
  { key: "ruim", emoji: "🙁", label: "Ruim", color: "#fb923c" },
  { key: "neutro", emoji: "😐", label: "Neutro", color: "#6b6b8a" },
  { key: "bom", emoji: "🙂", label: "Bom", color: "#86efac" },
  { key: "otimo", emoji: "😄", label: "Ótimo", color: "#4ade80" },
] as const;

const MOOD_MAP = new Map<string, (typeof MOODS)[number]>(MOODS.map((m) => [m.key, m]));
const EMPTY_CELL_COLOR = "#1e1e30";

const QUOTES = [
  "Um passo de cada vez já é progresso.",
  "O que não é registrado é esquecido — o que é registrado vira padrão.",
  "Organização não é sobre perfeição, é sobre clareza.",
  "Hoje só precisa ser um pouco melhor que ontem.",
  "Pequenas anotações diárias valem mais que grandes planos esquecidos.",
  "Cuidar do dinheiro é cuidar do futuro.",
  "Descanso também é produtividade.",
  "O controle começa quando você escreve o que está sentindo.",
  "Feito é melhor que perfeito.",
  "Cada dia registrado é um dado a menos perdido.",
];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addDays(key: string, delta: number): string {
  const d = new Date(key + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

/* ── Mapa de calor de humor do ano ("year in pixels") ────────────────── */
function MoodHeatmap({
  moodByDate,
  year,
  selected,
  onSelect,
}: {
  moodByDate: Map<string, string>;
  year: number;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const cell = 11;
  const gap = 3;

  const jan1 = new Date(year, 0, 1);
  const startOffset = jan1.getDay(); // domingo=0
  const dec31 = new Date(year, 11, 31);
  const totalDays = dayOfYear(dec31) + 1;
  const weeks = Math.ceil((totalDays + startOffset) / 7);

  const cells: { key: string; col: number; row: number; label: string }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i);
    const idx = i + startOffset;
    cells.push({
      key: dateKey(d),
      col: Math.floor(idx / 7),
      row: idx % 7,
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    });
  }

  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (const c of cells) {
    const month = Number(c.key.slice(5, 7)) - 1;
    if (month !== lastMonth) {
      monthLabels.push({ col: c.col, label: new Date(year, month, 1).toLocaleDateString("pt-BR", { month: "short" }) });
      lastMonth = month;
    }
  }

  const width = weeks * (cell + gap);
  const height = 7 * (cell + gap);
  const hoveredEntry = hover ? moodByDate.get(hover) : null;
  const hoveredMood = hoveredEntry ? MOOD_MAP.get(hoveredEntry) : null;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <svg width={width} height={height + 16} style={{ minWidth: width }}>
          {monthLabels.map((m, i) => (
            <text key={i} x={m.col * (cell + gap)} y={10} fontSize={10} fill="var(--text-dim)">
              {m.label}
            </text>
          ))}
          <g transform="translate(0, 16)">
            {cells.map((c) => {
              const mood = moodByDate.get(c.key);
              const color = mood ? MOOD_MAP.get(mood)?.color ?? EMPTY_CELL_COLOR : EMPTY_CELL_COLOR;
              const isSelected = c.key === selected;
              const isToday = c.key === todayKey();
              return (
                <rect
                  key={c.key}
                  x={c.col * (cell + gap)}
                  y={c.row * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={color}
                  stroke={isSelected ? "var(--text)" : isToday ? "var(--accent)" : "none"}
                  strokeWidth={isSelected || isToday ? 1.5 : 0}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(c.key)}
                  onMouseLeave={() => setHover((h) => (h === c.key ? null : h))}
                  onClick={() => onSelect(c.key)}
                />
              );
            })}
          </g>
        </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap" }}>
          {MOODS.map((m) => (
            <span key={m.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color, display: "inline-block" }} />
              {m.emoji} {m.label}
            </span>
          ))}
        </div>
        {hover && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {new Date(hover + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            {hoveredMood ? ` — ${hoveredMood.emoji} ${hoveredMood.label}` : " — sem entrada"}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(todayKey());
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("neutro");
  const [saving, setSaving] = useState(false);

  const year = Number(selected.slice(0, 4));
  const month = selected.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    const [diaryRes, agendaRes] = await Promise.all([
      fetch("/api/diary"),
      fetch("/api/agenda?done=false"),
    ]);
    setEntries(await diaryRes.json());
    setAgendaItems(await agendaRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`/api/finance?month=${month}&dateOrPurchase=true`)
      .then((r) => r.json())
      .then(setFinanceEntries);
  }, [month]);

  const moodByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
      map.set(dateKey(new Date(e.date)), e.mood || "neutro");
    }
    return map;
  }, [entries]);

  const entriesForSelected = entries.filter((e) => dateKey(new Date(e.date)) === selected);
  const agendaForSelected = agendaItems.filter((a) => a.dueDate && dateKey(new Date(a.dueDate)) === selected);
  const spentToday = financeEntries
    .filter((f) => {
      if (f.type !== "expense") return false;
      const expenseDate = f.purchaseDate ? dateKey(new Date(f.purchaseDate)) : dateKey(new Date(f.date));
      return expenseDate === selected;
    })
    .reduce((s, f) => s + f.amount, 0);

  const filteredEntries = search
    ? entries.filter((e) => e.content.toLowerCase().includes(search.toLowerCase()))
    : entries;

  const quote = QUOTES[dayOfYear(new Date()) % QUOTES.length];

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mood, date: new Date(selected + "T12:00:00").toISOString() }),
    });
    setContent("");
    setMood("neutro");
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Excluir esta entrada do diário?")) return;
    await fetch(`/api/diary?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const selectedLabel = new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>📓 Diário</h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{ width: 200 }}
          />
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic", marginBottom: 20 }}>
          &ldquo;{quote}&rdquo;
        </p>

        {/* Navegador de dia */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button className="btn-ghost" onClick={() => setSelected((s) => addDays(s, -1))} style={{ padding: "6px 12px" }}>
              ◀
            </button>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontWeight: 600, textTransform: "capitalize" }}>{selectedLabel}</p>
              {selected === todayKey() && <p style={{ fontSize: 11, color: "var(--accent)" }}>Hoje</p>}
            </div>
            <button
              className="btn-ghost"
              onClick={() => setSelected((s) => addDays(s, 1))}
              disabled={selected >= todayKey()}
              style={{ padding: "6px 12px" }}
            >
              ▶
            </button>
          </div>

          {/* Recap do dia: financeiro + agenda */}
          <div style={{ display: "flex", gap: 16, marginBottom: 14, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span>💰 Gasto no dia: <strong style={{ color: "var(--text)" }}>{formatMoney(spentToday)}</strong></span>
            <span>📋 Pendências do dia: <strong style={{ color: "var(--text)" }}>{agendaForSelected.length}</strong></span>
          </div>
          {agendaForSelected.length > 0 && (
            <ul style={{ marginBottom: 14, paddingLeft: 18, fontSize: 12, color: "var(--text-muted)" }}>
              {agendaForSelected.map((a) => (
                <li key={a.id}>{a.title}</li>
              ))}
            </ul>
          )}

          {/* Entradas existentes do dia */}
          {entriesForSelected.map((e) => {
            const m = MOOD_MAP.get(e.mood);
            return (
              <div key={e.id} style={{ background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {m ? `${m.emoji} ${m.label}` : ""} {e.source === "whatsapp" && "· 📱"}
                  </span>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => deleteEntry(e.id)}>
                    Excluir
                  </button>
                </div>
                <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", fontSize: 13 }}>{e.content}</p>
              </div>
            );
          })}

          {/* Form de nova entrada pro dia selecionado */}
          <form onSubmit={addEntry}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Como foi o dia?"
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {MOODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMood(m.key)}
                    title={m.label}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: mood === m.key ? "2px solid var(--accent)" : "1px solid var(--border)",
                      background: mood === m.key ? "var(--accent-dim)" : "var(--bg)",
                      fontSize: 16,
                      padding: 0,
                    }}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
              <button className="btn-primary" type="submit" disabled={saving} style={{ marginLeft: "auto" }}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>

        {/* Mapa de calor de humor */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Humor do ano — {year}</h2>
          <MoodHeatmap moodByDate={moodByDate} year={year} selected={selected} onSelect={setSelected} />
        </div>

        {/* Lista completa / busca */}
        {loading && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Carregando...</p>}
        {!loading && filteredEntries.length === 0 && (
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Nenhuma entrada encontrada</p>
        )}
        {!loading && filteredEntries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredEntries.map((entry) => {
              const m = MOOD_MAP.get(entry.mood);
              const key = dateKey(new Date(entry.date));
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelected(key)}
                  style={{
                    textAlign: "left",
                    background: key === selected ? "var(--bg-hover)" : "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 12,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span>
                      {new Date(entry.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      {m ? ` · ${m.emoji}` : ""}
                    </span>
                    {entry.source === "whatsapp" && <span>📱</span>}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.content}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
