"use client";
import { useState, useEffect, useCallback } from "react";

interface Briefing {
  id: string;
  phone: string;
  contactName: string;
  rawMessage: string;
  summary: string;
  subject: string;
  urgency: string;
  suggestion: string;
  repCode: string;
  replied: boolean;
  read: boolean;
  receivedAt: string;
  createdAt: string;
}

const URGENCY_LABELS: Record<string, string> = {
  critical: "URGENTE",
  high: "IMPORTANTE",
  normal: "Normal",
  low: "Baixa",
};

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selected, setSelected] = useState<Briefing | null>(null);
  const [filterUrgency, setFilterUrgency] = useState("");
  const [filterRead, setFilterRead] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterUrgency) params.set("urgency", filterUrgency);
    if (filterRead !== "") params.set("read", filterRead);
    const res = await fetch(`/api/briefings?${params}`);
    const data = await res.json();
    setBriefings(data);
    setLoading(false);
  }, [filterUrgency, filterRead]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/briefings?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
    setBriefings((prev) => prev.map((b) => (b.id === id ? { ...b, read: true } : b)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, read: true } : null);
  }

  async function deleteBriefing(id: string) {
    if (!confirm("Excluir este briefing?")) return;
    await fetch(`/api/briefings?id=${id}`, { method: "DELETE" });
    setBriefings((prev) => prev.filter((b) => b.id !== id));
    if (selected?.id === id) setSelected(null);
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
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>👤 Contatos</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todas urgências</option>
              <option value="critical">Urgente</option>
              <option value="high">Importante</option>
              <option value="normal">Normal</option>
              <option value="low">Baixa</option>
            </select>
            <select value={filterRead} onChange={(e) => setFilterRead(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos</option>
              <option value="false">Não lidos</option>
              <option value="true">Lidos</option>
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              Carregando...
            </div>
          )}
          {!loading && briefings.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              Nenhum contato encontrado
            </div>
          )}
          {briefings.map((b) => (
            <button
              key={b.id}
              onClick={() => { setSelected(b); if (!b.read) markRead(b.id); }}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: selected?.id === b.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-light)",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {!b.read && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {b.contactName || b.phone}
                  </span>
                </div>
                <span
                  className={`badge-${b.urgency}`}
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {URGENCY_LABELS[b.urgency] ?? b.urgency}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                {b.subject}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {new Date(b.receivedAt).toLocaleString("pt-BR")}
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
            <span style={{ fontSize: 40 }}>👤</span>
            <p>Selecione um contato para ver os detalhes</p>
          </div>
        ) : (
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>{selected.contactName || selected.phone}</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{selected.phone}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span
                  className={`badge-${selected.urgency}`}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {URGENCY_LABELS[selected.urgency] ?? selected.urgency}
                </span>
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Assunto</p>
              <p style={{ fontWeight: 600 }}>{selected.subject}</p>
            </div>

            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Resumo da IA</p>
              <p style={{ lineHeight: 1.6 }}>{selected.summary}</p>
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
                  💬 Sugestão de resposta {selected.repCode && `(${selected.repCode})`}
                </p>
                <p style={{ lineHeight: 1.6, color: "var(--text)" }}>{selected.suggestion}</p>
                {selected.replied && (
                  <p style={{ marginTop: 8, fontSize: 12, color: "var(--success)" }}>✅ Resposta enviada</p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!selected.read && (
                <button className="btn-primary" onClick={() => markRead(selected.id)}>
                  Marcar como lido
                </button>
              )}
              <button className="btn-danger" onClick={() => deleteBriefing(selected.id)}>
                Excluir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
