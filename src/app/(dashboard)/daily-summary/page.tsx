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
  const [selectedDate, setSelectedDate] = useState("");
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>📋 Resumos Diários</h1>
          <button 
            className="btn-primary" 
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 12px" }}
            onClick={async () => {
              if (!selectedGroup) return alert("Selecione um resumo específico (Pessoal ou de Grupo) para gerar agora.");
              setLoading(true);
              try {
                const resPost = await fetch("/api/daily-summary", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ groupJid: selectedGroup })
                });
                if (!resPost.ok) {
                  const errorData = await resPost.json().catch(() => ({}));
                  alert(`Erro ao gerar resumo: ${errorData.error || "Erro interno"}`);
                  return;
                }
                const params = new URLSearchParams();
                params.set("groupJid", selectedGroup);
                if (selectedDate) params.set("date", selectedDate);
                const res = await fetch(`/api/daily-summary?${params}`);
                setSummaries(await res.json());
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            ⚡ Gerar Resumo Agora
          </button>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Selecione um Resumo...</option>
            <optgroup label="📌 Meus Resumos">
              <option value="personal">Fechamento Pessoal</option>
            </optgroup>
            <optgroup label="💬 Grupos do WhatsApp">
              {groups.map((g) => (
                <option key={g.id} value={g.groupJid}>{g.groupName || g.groupJid}</option>
              ))}
            </optgroup>
          </select>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: 160 }}
          />
          <button className="btn-ghost" onClick={() => { setSelectedGroup(""); setSelectedDate(""); }}>
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
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                {s.sentAt ? (
                  <span style={{ fontSize: 12, color: "var(--success)" }}>✅ Enviado via WhatsApp</span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Não enviado</span>
                )}
                <button
                  className="btn-danger"
                  style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={async () => {
                    if (!confirm("Excluir este resumo?")) return;
                    await fetch(`/api/daily-summary?id=${s.id}`, { method: "DELETE" });
                    setSummaries((prev) => prev.filter((x) => x.id !== s.id));
                  }}
                >
                  🗑 Excluir
                </button>
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
