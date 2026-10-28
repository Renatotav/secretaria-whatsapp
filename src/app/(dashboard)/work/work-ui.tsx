"use client";

// Peças da tela do Trabalho: tipos do chamado, links do Assyst/Redmine, selos
// (prazo, situação, planilha) e prioridade. Saiu de work/page.tsx (28/10/2026).

import { alertsFor, type Situation } from "@/lib/work-sla";

export type Ticket = {
  id: string;
  ticketId: string;
  openedAt: string | null;
  status: string;
  errorType: string;
  origin: string;
  resolution: string;
  redmine: string;
  redmineStatus?: string;
  queue?: string;
  lastAction?: string;
  chatLog?: string;
  errorGroup?: string;
  receivedAt?: string | null;
  slaOverride?: number | null;
  situation?: string;
  situationSince?: string | null;
  pausedMs?: number;
  attachments?: { id: string; caption: string }[];
  description: string;
  source: string;
  updatedAt: string;
};

export type Count = { registrados: number; resolvidos: number; escalados: number };

export type Stats = {
  hoje: Count;
  semana: Count;
  mes: Count;
  emAberto: number;
  no3n?: number;
  encerrarAqui?: number;
  urgentes: number;
  atrasados: number;
  tiposDoMes: { name: string; n: number }[];
  origemDoMes: { name: string; n: number }[];
  gruposDoMes?: { name: string; n: number }[];
  paraEncerrar: { ticketId: string; redmine: string; openedAt: string | null }[];
};

export const STATUS: Record<string, { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "var(--warning)" },
  pendente: { label: "Pendente", color: "var(--text-muted)" },
  resolvido: { label: "Resolvido", color: "var(--success)" },
  escalado: { label: "Redmine", color: "var(--accent)" },
};

export const EMPTY = { ticketId: "", status: "aberto", errorType: "", origin: "", redmine: "", resolution: "", description: "" };

export type Links = { ticket: string; redmine: string };

export const linkStyle = { color: "var(--accent)", textDecoration: "underline" } as const;

export const urlFor = (template: string, n: string) => template.replace("{n}", encodeURIComponent(n));

/** Número do chamado como link azul para o Assyst (igual ao escala). */
export function TicketLink({ id, links, size = 15 }: { id: string; links: Links; size?: number }) {
  if (!links.ticket) return <strong style={{ fontSize: size }}>{id}</strong>;
  return (
    <a href={urlFor(links.ticket, id)} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: size, fontWeight: 700 }}>
      {id}
    </a>
  );
}

/** "100001, 100002" ou "100001 e 100002" → um link por linha (mesma regra do escala). */
export function RedmineLinks({ value, links }: { value: string; links: Links }) {
  const nums = value.split(/[;/,|\\]|\s+e\s+|\s+/i).map((n) => n.trim()).filter(Boolean);
  return (
    <>
      {nums.map((n) => (
        <span key={n} style={{ display: "block" }}>
          {links.redmine ? (
            <a href={urlFor(links.redmine, n)} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              #{n}
            </a>
          ) : (
            `#${n}`
          )}
        </span>
      ))}
    </>
  );
}

// Alertas do chamado com a mesma ideia da tela "Meus chamados" do escala.
export const tag = { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, lineHeight: 1.2, whiteSpace: "nowrap" } as const;

/** URGENTE (vermelho pulsando) e dias em aberto: 🟢 no prazo · 🟡 perto · 🔴 passou (pulsando). */
export function TicketBadges({ t, situations }: { t: Ticket; situations: Situation[] }) {
  const a = alertsFor(t, situations);
  const sit = a.situation;
  return (
    <>
      {a.urgent && (
        <span className="badge-alerta" style={{ ...tag, color: "#fff", background: "var(--danger)" }}>
          URGENTE
        </span>
      )}
      {/* Badge 1: dias (🟢🟡🔴; vermelho pulsa — aguardando retorno = vermelho fixo 🕒) */}
      {a.days !== null && a.color && (
        <span
          className={a.pulsing ? "badge-alerta" : undefined}
          title={
            a.paused
              ? `${a.days} dia(s) com você · aguardando retorno (${sit?.name}), não pulsa`
              : a.color === "vermelho"
              ? `Passou do prazo de ${a.sla ?? 5} dias`
              : `${a.days} dia(s) com você · prazo ${a.sla ?? 5} dias`
          }
          style={{
            ...tag,
            color: a.color === "amarelo" ? "#111827" : "#fff",
            background: a.color === "vermelho" ? "var(--danger)" : a.color === "amarelo" ? "var(--warning)" : "var(--success)",
          }}
        >
          {a.paused ? "🕒 " : a.color === "vermelho" ? "⚠ " : ""}
          {a.days}d
        </span>
      )}
      {/* Badge 2: situação (com quem está a bola) */}
      {sit && (
        <span
          className={sit.pulsing ? "pulsar" : undefined}
          title={`${sit.name} há ${sit.days} dia(s)${sit.pulsing ? " — hora de agir" : ""}`}
          style={{ ...tag, color: "#fff", background: sit.color, outline: sit.pulsing ? `2px solid ${sit.color}` : undefined, outlineOffset: 1 }}
        >
          {sit.emoji} {sit.name}
          {sit.days ? ` · ${sit.days}d` : ""}
        </span>
      )}
    </>
  );
}

/** "⚡ Redmine resolvido — encerre" (laranja pulsando, como no escala). */
export function ClosePill() {
  return (
    <span className="pulsar" style={{ ...tag, fontSize: 11, borderRadius: 999, padding: "3px 9px", color: "#fdba74", background: "rgba(249,115,22,.18)", border: "1px solid rgba(249,115,22,.45)", width: "fit-content" }}>
      ⚡ Redmine resolvido — encerre
    </span>
  );
}

/** Ordem: urgente, Redmine resolvido, atrasado, aberto, o resto. */
export function priority(t: Ticket, situations: Situation[]) {
  const a = alertsFor(t, situations);
  return a.urgent ? 0 : a.canClose ? 1 : a.situation?.pulsing ? 2 : a.overdue ? 3 : t.status === "aberto" || t.status === "pendente" ? 4 : 5;
}
