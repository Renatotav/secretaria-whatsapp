"use client";
import { useState, useEffect, useCallback } from "react";

interface DiaryEntry {
  id: string;
  date: string;
  content: string;
  mood: string;
  source: string;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/diary?${params}`);
    const data = await res.json();
    setEntries(data);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    await fetch("/api/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mood, date: new Date(date).toISOString() }),
    });
    setContent("");
    setMood("");
    setDate(todayInputValue());
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Excluir esta entrada do diário?")) return;
    await fetch(`/api/diary?id=${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>📓 Diário</h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            style={{ width: 200 }}
          />
        </div>

        <form
          onSubmit={addEntry}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Como foi o seu dia?"
            rows={4}
            style={{ marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: 160 }}
            />
            <input
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="Humor (opcional)"
              style={{ flex: 1 }}
            />
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>

        {loading && <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Carregando...</p>}
        {!loading && entries.length === 0 && (
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Nenhuma entrada ainda</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {new Date(entry.date).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                  {entry.mood && ` — ${entry.mood}`}
                  {entry.source === "whatsapp" && " · 📱"}
                </span>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => deleteEntry(entry.id)}>
                  Excluir
                </button>
              </div>
              <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
