"use client";
import { useState, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  source: string;
  phone: string | null;
  messages: Message[];
  updatedAt: string;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [filterSource, setFilterSource] = useState("whatsapp");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ source: filterSource });
    if (search) params.set("phone", search);
    const res = await fetch(`/api/conversations?${params}`);
    const data = await res.json();
    setConversations(data);
    setLoading(false);
  }, [filterSource, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>💬 Conversas</h1>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            style={{ marginBottom: 8 }}
          >
            <option value="whatsapp">Privadas</option>
            <option value="group">Grupos</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número ou grupo..."
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
          )}
          {!loading && conversations.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              Nenhuma conversa encontrada
            </div>
          )}
          {conversations.map((c) => {
            const lastMsg = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: selected?.id === c.id ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-light)",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{filterSource === "group" ? "👥" : "👤"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {c.phone || "—"}
                  </span>
                </div>
                {lastMsg && (
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {lastMsg.content.slice(0, 60)}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {new Date(c.updatedAt).toLocaleString("pt-BR")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
            <span style={{ fontSize: 40 }}>💬</span>
            <p>Selecione uma conversa para ver as mensagens</p>
          </div>
        ) : (
          <>
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{selected.source === "group" ? "👥" : "👤"}</span>
              <div>
                <p style={{ fontWeight: 600 }}>{selected.phone}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {selected.messages.length} mensagens
                </p>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {selected.messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: isUser ? "var(--accent-dim)" : "var(--bg-card)",
                        border: `1px solid ${isUser ? "var(--accent-border)" : "var(--border)"}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <p>{msg.content}</p>
                      <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, textAlign: "right" }}>
                        {new Date(msg.createdAt).toLocaleTimeString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
