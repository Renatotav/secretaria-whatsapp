"use client";
import { useState, useEffect } from "react";

interface WeeklyReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  content: string;
  sentAt: string | null;
}

function getWeekStart(offset = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  return monday.toISOString().split("T")[0];
}

export default function WeeklyReportPage() {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const weekStart = getWeekStart(weekOffset);
      const res = await fetch(`/api/weekly-report?weekStart=${weekStart}`);
      const data = await res.json();
      if (data) {
        setSelectedReport(data);
      } else {
        setSelectedReport(null);
      }
      setLoading(false);
    }
    load();
  }, [weekOffset]);

  useEffect(() => {
    fetch("/api/weekly-report")
      .then((r) => r.json())
      .then(setReports);
  }, []);

  const weekStart = getWeekStart(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar — report list */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h1 style={{ fontSize: 15, fontWeight: 600 }}>📊 Relatórios</h1>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedReport(r)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: selectedReport?.id === r.id ? "var(--bg-hover)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border-light)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600 }}>
                {new Date(r.weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                {" — "}
                {new Date(r.weekEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </p>
              {r.sentAt && (
                <p style={{ fontSize: 10, color: "var(--success)" }}>✅ Enviado</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Week nav */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <button className="btn-ghost" onClick={() => setWeekOffset((w) => w - 1)}>← Anterior</button>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Semana de {new Date(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            {" a "}
            {weekEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
          </span>
          <button
            className="btn-ghost"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 0}
          >
            Próxima →
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loading && (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 40 }}>Carregando...</div>
          )}
          {!loading && !selectedReport && (
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
              <span style={{ fontSize: 40 }}>📊</span>
              <p>Nenhum relatório para esta semana</p>
              <p style={{ fontSize: 12 }}>O relatório é gerado automaticamente todo domingo às 20h</p>
            </div>
          )}
          {!loading && selectedReport && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 600 }}>Relatório Semanal</h2>
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    {new Date(selectedReport.weekStart).toLocaleDateString("pt-BR", { dateStyle: "long" })}
                  </p>
                </div>
                {selectedReport.sentAt && (
                  <span style={{ fontSize: 12, color: "var(--success)" }}>✅ Enviado via WhatsApp</span>
                )}
              </div>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <pre
                  style={{
                    fontFamily: "inherit",
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: "var(--text)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {selectedReport.content}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
