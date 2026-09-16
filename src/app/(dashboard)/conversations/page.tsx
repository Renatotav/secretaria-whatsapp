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
  displayName?: string;
  contactName: string;
  nameSource: string;
  status: string;
  messages: Message[];
  updatedAt: string;
  createdAt: string;
}

const STATUS_COLUMNS = [
  { id: "pje", label: "PJe" },
  { id: "em_atendimento", label: "Em atendimento" },
  { id: "resolvido", label: "Resolvido" },
];

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [filterSource, setFilterSource] = useState("whatsapp");
  const [activeStatus, setActiveStatus] = useState("em_atendimento");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Right sidebar state
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ source: filterSource });
    if (search) params.set("phone", search);
    const res = await fetch(`/api/conversations?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setConversations(data);
    } else {
      setConversations([]);
      console.error("Failed to load conversations:", data);
    }
    setLoading(false);
  }, [filterSource, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected) {
      setEditName(selected.contactName || selected.displayName || selected.phone || "");
      setEditStatus(selected.status === "lead" || selected.status === "atendimento" || !selected.status ? "em_atendimento" : selected.status);
    }
  }, [selected]);

  async function deleteConversation(id: string) {
    if (!confirm("Excluir esta conversa e todas as suas mensagens?")) return;
    await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function deleteAllConversations() {
    const label = filterSource === "group" ? "todas as conversas de GRUPOS" : "todas as conversas PRIVADAS";
    if (!confirm(`Tem certeza que deseja apagar ${label}? Essa ação não pode ser desfeita.`)) return;
    await fetch(`/api/conversations?all=true&source=${filterSource}`, { method: "DELETE" });
    setConversations([]);
    setSelected(null);
  }

  async function saveContactProfile() {
    if (!selected) return;
    const res = await fetch(`/api/conversations?id=${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactName: editName, status: editStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setConversations(prev => prev.map(c => c.id === updated.id ? { ...c, contactName: updated.contactName, nameSource: updated.nameSource, status: updated.status } : c));
      setSelected(prev => prev ? { ...prev, contactName: updated.contactName, nameSource: updated.nameSource, status: updated.status } : null);
      if (editStatus !== activeStatus) {
        setActiveStatus(editStatus);
      }
      alert("Contato atualizado!");
    }
  }

  const filteredConversations = conversations.filter(c => (c.status === "lead" || c.status === "atendimento" ? "em_atendimento" : (c.status || "em_atendimento")) === activeStatus);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Col 1: Kanban / List */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>💬 CRM</h1>
            {conversations.length > 0 && (
              <button
                onClick={deleteAllConversations}
                style={{
                  background: "rgba(230, 103, 103, 0.15)",
                  color: "var(--danger, #e66767)",
                  border: "1px solid rgba(230, 103, 103, 0.3)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                title="Apagar todas as conversas"
              >
                🗑️ Limpar tudo
              </button>
            )}
          </div>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            style={{ marginBottom: 8, width: "100%" }}
          >
            <option value="whatsapp">Privadas (Leads)</option>
            <option value="group">Grupos</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar contato..."
            style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
          />
        </div>

        {/* Status Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
          {STATUS_COLUMNS.map(col => {
            const count = conversations.filter(c => (c.status === "lead" || c.status === "atendimento" ? "em_atendimento" : (c.status || "em_atendimento")) === col.id).length;
            return (
              <button
                key={col.id}
                onClick={() => setActiveStatus(col.id)}
                style={{
                  flex: 1,
                  padding: "10px 4px",
                  background: activeStatus === col.id ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  borderBottom: activeStatus === col.id ? "2px solid var(--accent)" : "2px solid transparent",
                  fontSize: 12,
                  fontWeight: activeStatus === col.id ? 600 : 400,
                  color: activeStatus === col.id ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label} ({count})
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-body)" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
          )}
          {!loading && filteredConversations.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>
              Nenhum contato na etapa "{STATUS_COLUMNS.find(c => c.id === activeStatus)?.label}"
            </div>
          )}
          {filteredConversations.map((c) => {
            const lastMsg = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: selected?.id === c.id ? "var(--bg-card)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-light)",
                  borderLeft: selected?.id === c.id ? "3px solid var(--accent)" : "3px solid transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {c.contactName || c.displayName || c.phone || "—"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    {new Date(c.updatedAt).toLocaleDateString("pt-BR")}
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
                    {lastMsg.content.slice(0, 50)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Col 2: Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid var(--border)" }}>
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
            <p>Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--bg-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                  {(selected.contactName || selected.phone || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15, margin: 0 }}>{selected.contactName || selected.displayName || selected.phone}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                    {selected.messages.length} mensagens
                  </p>
                </div>
              </div>

              <button
                onClick={() => deleteConversation(selected.id)}
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                }}
                title="Excluir esta conversa"
              >
                🗑️
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "var(--bg-body)" }}>
              {selected.messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-start" : "flex-end", // WhatsApp style: user is on left, assistant on right
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: isUser ? "var(--bg-card)" : "var(--accent)",
                        color: isUser ? "var(--text)" : "#fff",
                        border: isUser ? "1px solid var(--border)" : "none",
                        fontSize: 14,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      <p style={{ margin: 0 }}>{msg.content}</p>
                      <p style={{ fontSize: 10, color: isUser ? "var(--text-dim)" : "rgba(255,255,255,0.7)", marginTop: 6, textAlign: "right", margin: "6px 0 0 0" }}>
                        {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Col 3: Contact Profile */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          background: "var(--bg-card)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {!selected ? (
          <div style={{ padding: 20, color: "var(--text-muted)", textAlign: "center", fontSize: 13, marginTop: 40 }}>
            Selecione uma conversa para ver o perfil do contato.
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: "bold", margin: "0 auto 16px auto" }}>
                {(selected.contactName || selected.phone || "?").charAt(0).toUpperCase()}
              </div>
              <h2 style={{ fontSize: 16, margin: "0 0 4px 0" }}>{selected.contactName || selected.phone}</h2>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.phone}</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Nome do Contato</label>
              <input 
                type="text" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text)" }}
              />
              <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                {selected.nameSource === "manual" ? "Nome protegido (edição manual)." : "Nome atualizado via WhatsApp."}
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Etapa do Funil (Status)</label>
              <select 
                value={editStatus} 
                onChange={(e) => setEditStatus(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-body)", color: "var(--text)" }}
              >
                {STATUS_COLUMNS.map(col => (
                  <option key={col.id} value={col.id}>{col.label}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={saveContactProfile}
              style={{
                width: "100%",
                padding: "10px",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Salvar Alterações
            </button>
            
            <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>Informações</h3>
              <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Origem</span>
                  <span>{selected.source === "group" ? "Grupo" : "WhatsApp Privado"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Criado em</span>
                  <span>{new Date(selected.createdAt || Date.now()).toLocaleDateString("pt-BR")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Última msg</span>
                  <span>{new Date(selected.updatedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
