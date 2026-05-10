"use client";
import { useState, useEffect, useCallback } from "react";

interface Ticket {
  id: string;
  ticketId: string;
  prefix: string;
  groupJid: string;
  groupName: string;
  status: string;
  title: string;
  mentions: string;
  lastSeen: string;
  createdAt: string;
}

const STATUS_OPTIONS = ["open", "resolved", "pending", "escalated"];

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    const res = await fetch(`/api/tickets?${params}`);
    const data = await res.json();
    setTickets(data);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const counts = {
    open: tickets.filter((t) => t.status === "open").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
    escalated: tickets.filter((t) => t.status === "escalated").length,
    pending: tickets.filter((t) => t.status === "pending").length,
  };

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/tickets?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, status } : null);
  }

  async function deleteTicket(id: string) {
    if (!confirm("Excluir este chamado?")) return;
    await fetch(`/api/tickets?id=${id}`, { method: "DELETE" });
    setTickets((prev) => prev.filter((t) => t.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const statusColor: Record<string, string> = {
    open: "var(--ticket-open)",
    resolved: "var(--ticket-resolved)",
    escalated: "var(--ticket-escalated)",
    pending: "var(--ticket-pending)",
  };

  const statusLabel: Record<string, string> = {
    open: "Aberto",
    resolved: "Resolvido",
    escalated: "Escalado",
    pending: "Pendente",
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: "column" }}>
      {/* Counters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {Object.entries(counts).map(([status, count]) => (
          <div
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? "" : status)}
            style={{
              flex: 1,
              padding: "10px 16px",
              background: filterStatus === status ? "var(--bg-hover)" : "var(--bg-card)",
              border: `1px solid ${filterStatus === status ? statusColor[status] : "var(--border)"}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: statusColor[status] }}>{count}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{statusLabel[status]}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>🎫 Chamados</h1>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{statusLabel[s]}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
            )}
            {!loading && tickets.length === 0 && (
              <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
                Nenhum chamado encontrado
              </div>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: selected?.id === t.id ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border-light)",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: statusColor[t.status] }}>
                    {t.ticketId}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: `${statusColor[t.status]}20`,
                      color: statusColor[t.status],
                      fontWeight: 600,
                    }}
                  >
                    {statusLabel[t.status]}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t.groupName || "—"}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Visto: {new Date(t.lastSeen).toLocaleString("pt-BR")}
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
              <span style={{ fontSize: 40 }}>🎫</span>
              <p>Selecione um chamado para ver detalhes</p>
            </div>
          ) : (
            <div style={{ maxWidth: 640 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: statusColor[selected.status] }}>
                  {selected.ticketId}
                </h2>
                <select
                  value={selected.status}
                  onChange={(e) => updateStatus(selected.id, e.target.value)}
                  style={{ width: "auto" }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{statusLabel[s]}</option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Grupo</p>
                  <p style={{ fontWeight: 500 }}>{selected.groupName || "—"}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Último visto</p>
                  <p style={{ fontWeight: 500 }}>{new Date(selected.lastSeen).toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Criado em</p>
                  <p style={{ fontWeight: 500 }}>{new Date(selected.createdAt).toLocaleString("pt-BR")}</p>
                </div>
              </div>

              {/* Mentions timeline */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                  Histórico de menções
                </p>
                {(() => {
                  try {
                    const mentions = JSON.parse(selected.mentions ?? "[]") as Array<{
                      senderName: string;
                      groupName: string;
                      context: string;
                      at: string;
                    }>;
                    if (mentions.length === 0) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Nenhuma menção registrada</p>;
                    return mentions.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "10px 0",
                          borderBottom: i < mentions.length - 1 ? "1px solid var(--border-light)" : "none",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{m.senderName || "—"}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {new Date(m.at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.context}</p>
                      </div>
                    ));
                  } catch {
                    return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Erro ao carregar menções</p>;
                  }
                })()}
              </div>

              <button className="btn-danger" onClick={() => deleteTicket(selected.id)}>
                Excluir chamado
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
