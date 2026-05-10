"use client";
import { useState, useEffect, useCallback } from "react";

interface AgendaItem {
  id: string;
  source: string;
  groupJid: string | null;
  groupName: string;
  category: string;
  title: string;
  description: string;
  dueDate: string | null;
  senderName: string;
  rawMessage: string;
  suggestion: string;
  repCode: string;
  replied: boolean;
  done: boolean;
  followUpNote: string;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  mention: "🔔",
  task: "📋",
  event: "📅",
  urgent_call: "🚨",
  personal: "🗒️",
  reminder: "⏰",
};

export default function AgendaPage() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [filterDone, setFilterDone] = useState("false");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDone !== "") params.set("done", filterDone);
    if (filterCategory) params.set("category", filterCategory);
    if (filterSource) params.set("source", filterSource);
    const res = await fetch(`/api/agenda?${params}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }, [filterDone, filterCategory, filterSource]);

  useEffect(() => { load(); }, [load]);

  async function markDone(id: string, done: boolean) {
    await fetch(`/api/agenda?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, done } : null);
  }

  async function saveNote(id: string) {
    await fetch(`/api/agenda?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpNote: note }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, followUpNote: note } : i)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, followUpNote: note } : null);
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📅 Agenda</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={filterDone} onChange={(e) => setFilterDone(e.target.value)}>
              <option value="false">Pendentes</option>
              <option value="true">Concluídos</option>
              <option value="">Todos</option>
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ flex: 1 }}>
                <option value="">Categoria</option>
                <option value="mention">Menção</option>
                <option value="task">Tarefa</option>
                <option value="event">Evento</option>
                <option value="urgent_call">Chamado</option>
                <option value="personal">Pessoal</option>
                <option value="reminder">Lembrete</option>
              </select>
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={{ flex: 1 }}>
                <option value="">Origem</option>
                <option value="group">Grupo</option>
                <option value="self">Pessoal</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              Nenhum item encontrado
            </div>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelected(item); setNote(item.followUpNote); }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: selected?.id === item.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-light)",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                opacity: item.done ? 0.5 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{CATEGORY_ICONS[item.category] ?? "📌"}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {item.title}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {item.source === "group" ? `👥 ${item.groupName}` : "🗒️ Pessoal"}
                {item.senderName ? ` — ${item.senderName}` : ""}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {new Date(item.createdAt).toLocaleString("pt-BR")}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {!selected ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 40 }}>📅</span>
            <p>Selecione um item para ver os detalhes</p>
          </div>
        ) : (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 28 }}>{CATEGORY_ICONS[selected.category] ?? "📌"}</span>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selected.title}</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {selected.source === "group" ? `Grupo: ${selected.groupName}` : "Mensagem pessoal"}
                  {selected.senderName ? ` — ${selected.senderName}` : ""}
                </p>
              </div>
              {selected.done && (
                <span style={{ marginLeft: "auto", color: "var(--success)", fontSize: 12 }}>✅ Concluído</span>
              )}
            </div>

            {selected.dueDate && (
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>📅</span>
                <span style={{ fontWeight: 600 }}>
                  {new Date(selected.dueDate).toLocaleDateString("pt-BR", { dateStyle: "full" })}
                </span>
              </div>
            )}

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Descrição</p>
              <p style={{ lineHeight: 1.6 }}>{selected.description}</p>
            </div>

            <div
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border-light)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Mensagem original</p>
              <p style={{ color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.6 }}>
                {selected.rawMessage}
              </p>
            </div>

            {selected.suggestion && (
              <div
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 12, color: "var(--accent)", marginBottom: 6 }}>
                  💬 Sugestão {selected.repCode && `(${selected.repCode})`}
                </p>
                <p style={{ lineHeight: 1.6 }}>{selected.suggestion}</p>
              </div>
            )}

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Nota de acompanhamento</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Adicione uma nota..."
                rows={3}
                style={{ marginBottom: 8 }}
              />
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => saveNote(selected.id)}>
                Salvar nota
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {!selected.done ? (
                <button className="btn-primary" onClick={() => markDone(selected.id, true)}>
                  ✅ Marcar como concluído
                </button>
              ) : (
                <button className="btn-ghost" onClick={() => markDone(selected.id, false)}>
                  Reabrir
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
