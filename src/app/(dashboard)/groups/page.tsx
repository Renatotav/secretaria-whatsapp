"use client";
import { useState, useEffect } from "react";

interface GroupConfig {
  id: string;
  groupJid: string;
  groupName: string;
  focus: string;
  active: boolean;
  messagesCount: number;
  urgentCount: number;
  ticketsCount: number;
  createdAt: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupConfig[]>([]);
  const [selected, setSelected] = useState<GroupConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editFocus, setEditFocus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/groups");
    const data = await res.json();
    setGroups(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function selectGroup(g: GroupConfig) {
    setSelected(g);
    setEditName(g.groupName);
    setEditFocus(g.focus);
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/groups?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, active } : g)));
    if (selected?.id === id) setSelected((s) => s ? { ...s, active } : null);
  }

  async function saveGroup() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/groups?id=${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: editName, focus: editFocus }),
    });
    setGroups((prev) =>
      prev.map((g) => g.id === selected.id ? { ...g, groupName: editName, focus: editFocus } : g)
    );
    setSelected((s) => s ? { ...s, groupName: editName, focus: editFocus } : null);
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List */}
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
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>👥 Grupos</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Grupos detectados automaticamente via webhook
          </p>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
          )}
          {!loading && groups.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              <p>Nenhum grupo detectado ainda</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>Os grupos aparecerão aqui quando chegarem mensagens via webhook</p>
            </div>
          )}
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGroup(g)}
              style={{
                width: "100%",
                padding: "12px 16px",
                background: selected?.id === g.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-light)",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {g.groupName || g.groupJid.split("@")[0]}
                </span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: g.active ? "var(--success)" : "var(--text-dim)",
                    flexShrink: 0,
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                <span>💬 {g.messagesCount} hoje</span>
                <span>⚡ {g.urgentCount} urgentes</span>
                <span>🎫 {g.ticketsCount} chamados</span>
              </div>
              {g.focus && (
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Foco: {g.focus.slice(0, 40)}
                </span>
              )}
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
            <span style={{ fontSize: 40 }}>👥</span>
            <p>Selecione um grupo para configurar</p>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>
                {selected.groupName || selected.groupJid.split("@")[0]}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {selected.active ? "Ativo" : "Inativo"}
                </span>
                <button
                  onClick={() => toggleActive(selected.id, !selected.active)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: selected.active ? "var(--accent)" : "var(--border)",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: selected.active ? 22 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "white",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 20, fontWeight: 700 }}>{selected.messagesCount}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>msgs hoje</p>
              </div>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 20, fontWeight: 700, color: "var(--warning)" }}>{selected.urgentCount}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>urgentes</p>
              </div>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{selected.ticketsCount}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>chamados abertos</p>
              </div>
            </div>

            {/* Edit form */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>
                  Nome do grupo
                </label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>
                  Foco do grupo
                </label>
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
                  Contexto para calibrar a IA (ex: "chamados, reuniões, equipe PJe")
                </p>
                <textarea
                  value={editFocus}
                  onChange={(e) => setEditFocus(e.target.value)}
                  rows={3}
                  placeholder="Descreva o propósito deste grupo..."
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>
                  JID do grupo
                </label>
                <input value={selected.groupJid} disabled style={{ opacity: 0.5 }} />
              </div>
              <button className="btn-primary" onClick={saveGroup} disabled={saving}>
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
