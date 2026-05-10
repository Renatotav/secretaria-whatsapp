"use client";
import { useState, useEffect } from "react";

interface Group {
  id: string;
  groupJid: string;
  groupName: string;
}

interface DailySummary {
  id: string;
  groupJid: string;
  groupName: string;
  date: string;
  summary: string;
  sentAt: string | null;
}

export default function DailySummaryPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then(setGroups);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedGroup) params.set("groupJid", selectedGroup);
      if (selectedDate) params.set("date", selectedDate);
      const res = await fetch(`/api/daily-summary?${params}`);
      const data = await res.json();
      setSummaries(data);
      setLoading(false);
    }
    load();
  }, [selectedGroup, selectedDate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📋 Resumos Diários</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g.id} value={g.groupJid}>{g.groupName || g.groupJid}</option>
            ))}
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="btn-ghost" onClick={() => setSelectedDate("")}>
            Ver todos
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>Carregando...</div>
        )}
        {!loading && summaries.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "60%",
              color: "var(--text-muted)",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 40 }}>📋</span>
            <p>Nenhum resumo encontrado para os filtros selecionados</p>
            <p style={{ fontSize: 12 }}>Os resumos são gerados automaticamente às 18h</p>
          </div>
        )}
        {summaries.map((s) => (
          <div
            key={s.id}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
              maxWidth: 720,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h3 style={{ fontWeight: 600 }}>{s.groupName || s.groupJid}</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {new Date(s.date).toLocaleDateString("pt-BR", { dateStyle: "full" })}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                {s.sentAt ? (
                  <span style={{ fontSize: 12, color: "var(--success)" }}>✅ Enviado via WhatsApp</span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Não enviado</span>
                )}
              </div>
            </div>
            <pre
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.7,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {s.summary}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
