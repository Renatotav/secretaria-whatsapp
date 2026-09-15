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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

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

  async function syncGroups() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao sincronizar grupos");
      } else {
        setSyncMsg(`${data.totalEvolution} grupos no WhatsApp (${data.added} novos, ${data.updated} atualizados)`);
        await load();
      }
    } catch {
      alert("Erro ao conectar com a API");
    } finally {
      setSyncing(false);
    }
  }

  async function deleteGroup(id: string, name: string) {
    if (!confirm(`Deseja remover o grupo "${name}" do painel?\n\nEle sairá desta lista. (Se você ainda estiver no grupo e receber novas mensagens nele, ele poderá reaparecer automaticamente).`)) return;
    await fetch(`/api/groups?id=${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
    if (selected?.id === id) setSelected(null);
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

  const filteredGroups = groups.filter((g) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (g.groupName && g.groupName.toLowerCase().includes(term)) ||
      (g.groupJid && g.groupJid.toLowerCase().includes(term)) ||
      (g.focus && g.focus.toLowerCase().includes(term))
    );
  });

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>👥 Grupos</h1>
            <button
              onClick={syncGroups}
              disabled={syncing}
              style={{
                background: "rgba(57, 135, 229, 0.15)",
                color: "var(--accent, #3987e5)",
                border: "1px solid rgba(57, 135, 229, 0.3)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: syncing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.2s",
              }}
              title="Buscar grupos atuais diretamente da Evolution API (WhatsApp)"
            >
              {syncing ? "⏳ Sincronizando..." : "🔄 Sincronizar"}
            </button>
          </div>

          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            {groups.length} grupos cadastrados
          </p>

          {syncMsg && (
            <div
              style={{
                background: "rgba(25, 158, 112, 0.15)",
                border: "1px solid rgba(25, 158, 112, 0.3)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 11,
                color: "var(--success, #199e70)",
                marginBottom: 10,
              }}
            >
              {syncMsg}
            </div>
          )}

          <input
            type="text"
            placeholder="🔍 Buscar grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 10px",
              fontSize: 12,
              borderRadius: 6,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>Carregando...</div>
          )}
          {!loading && groups.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center" }}>
              <p>Nenhum grupo detectado ainda</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>
                Clique em <strong>Sincronizar</strong> acima para puxar os grupos do seu WhatsApp.
              </p>
            </div>
          )}
          {!loading && groups.length > 0 && filteredGroups.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-muted)", textAlign: "center", fontSize: 12 }}>
              Nenhum grupo corresponde à busca.
            </div>
          )}
          {filteredGroups.map((g) => (
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

              <button
                onClick={() => deleteGroup(selected.id, selected.groupName || selected.groupJid)}
                style={{
                  marginTop: 8,
                  background: "rgba(230, 103, 103, 0.12)",
                  color: "var(--danger, #e66767)",
                  border: "1px solid rgba(230, 103, 103, 0.25)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  transition: "all 0.2s",
                }}
                title="Remover este grupo do painel"
              >
                🗑️ Remover este grupo do painel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
