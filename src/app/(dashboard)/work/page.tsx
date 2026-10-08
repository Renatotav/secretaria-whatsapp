"use client";

import { useCallback, useEffect, useState } from "react";
import { alertsFor } from "@/lib/work-sla";

type Ticket = {
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
  attachments?: { id: string; caption: string }[];
  description: string;
  source: string;
  updatedAt: string;
};
type Count = { registrados: number; resolvidos: number; escalados: number };
type Stats = {
  hoje: Count;
  semana: Count;
  mes: Count;
  emAberto: number;
  urgentes: number;
  atrasados: number;
  tiposDoMes: { name: string; n: number }[];
  origemDoMes: { name: string; n: number }[];
  paraEncerrar: { ticketId: string; redmine: string; openedAt: string | null }[];
};

const STATUS: Record<string, { label: string; color: string }> = {
  aberto: { label: "Aberto", color: "var(--warning)" },
  pendente: { label: "Pendente", color: "var(--text-muted)" },
  resolvido: { label: "Resolvido", color: "var(--success)" },
  escalado: { label: "Redmine", color: "var(--accent)" },
};
const EMPTY = { ticketId: "", status: "aberto", errorType: "", origin: "", redmine: "", resolution: "", description: "" };

type Links = { ticket: string; redmine: string };

const linkStyle = { color: "#60a5fa", textDecoration: "underline" } as const;
const urlFor = (template: string, n: string) => template.replace("{n}", encodeURIComponent(n));

/** Número do chamado como link azul para o Assyst (igual ao escala). */
function TicketLink({ id, links, size = 15 }: { id: string; links: Links; size?: number }) {
  if (!links.ticket) return <strong style={{ fontSize: size }}>{id}</strong>;
  return (
    <a href={urlFor(links.ticket, id)} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: size, fontWeight: 700 }}>
      {id}
    </a>
  );
}

/** "273231, 281479" ou "273231 e 281479" → um link por linha (mesma regra do escala). */
function RedmineLinks({ value, links }: { value: string; links: Links }) {
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

type Prod = { dias: { dia: string; resolvidos: number; redmine: number }[]; total: number; tmrHoras: number | null };

/** Barras dos últimos 30 dias (resolvidos + Redmine), com o tempo médio. */
function ProductivityChart({ p }: { p: Prod }) {
  const max = Math.max(1, ...p.dias.map((d) => d.resolvidos + d.redmine));
  const W = 600, H = 120, bw = W / p.dias.length;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>📈 Sua produtividade — últimos 30 dias</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {p.total} fechado(s){p.tmrHoras !== null ? ` · tempo médio ${p.tmrHoras < 48 ? `${p.tmrHoras}h` : `${Math.round(p.tmrHoras / 24)} dias`}` : ""}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Chamados fechados por dia">
        {p.dias.map((d, i) => {
          const hr = (d.resolvidos / max) * H, hm = (d.redmine / max) * H;
          return (
            <g key={d.dia}>
              <title>{`${d.dia.split("-").reverse().slice(0, 2).join("/")}: ${d.resolvidos} resolvido(s), ${d.redmine} Redmine`}</title>
              <rect x={i * bw + 2} y={H - hr} width={bw - 4} height={hr} rx={2} fill="var(--success)" />
              <rect x={i * bw + 2} y={H - hr - hm} width={bw - 4} height={hm} rx={2} fill="var(--accent)" />
              {i % 5 === 0 && (
                <text x={i * bw + bw / 2} y={H + 14} fontSize={10} textAnchor="middle" fill="var(--text-muted)">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        <span style={{ color: "var(--success)" }}>■</span> resolvidos · <span style={{ color: "var(--accent)" }}>■</span> viraram Redmine
      </div>
    </div>
  );
}

// Alertas do chamado com a mesma ideia da tela "Meus chamados" do escala.
const tag = { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, lineHeight: 1.2, whiteSpace: "nowrap" } as const;

/** URGENTE e prazo estourado: vermelho pulsando. */
function TicketBadges({ t }: { t: Ticket }) {
  const a = alertsFor(t);
  return (
    <>
      {a.urgent && (
        <span className="badge-alerta" style={{ ...tag, color: "#fff", background: "#dc2626" }}>
          URGENTE
        </span>
      )}
      {a.overdue && a.days !== null && (
        <span className="badge-alerta" title={`Passou do prazo de ${a.sla} dias da fila`} style={{ ...tag, color: "#fff", background: "#dc2626" }}>
          ⚠ {a.days}d
        </span>
      )}
    </>
  );
}

/** "⚡ Redmine resolvido — encerre" (laranja pulsando, como no escala). */
function ClosePill() {
  return (
    <span className="pulsar" style={{ ...tag, fontSize: 11, borderRadius: 999, padding: "3px 9px", color: "#fdba74", background: "rgba(249,115,22,.18)", border: "1px solid rgba(249,115,22,.45)", width: "fit-content" }}>
      ⚡ Redmine resolvido — encerre
    </span>
  );
}

/** Ordem: urgente, Redmine resolvido, atrasado, aberto, o resto. */
function priority(t: Ticket) {
  const a = alertsFor(t);
  return a.urgent ? 0 : a.canClose ? 1 : a.overdue ? 2 : t.status === "aberto" || t.status === "pendente" ? 3 : 4;
}

/** Cartão-filtro (clique liga/desliga), igual aos do escala. */
function FilterCard({ title, n, color, active, onClick }: { title: string; n: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "pulsar" : undefined}
      style={{
        flex: "1 1 160px",
        textAlign: "left",
        cursor: "pointer",
        background: active ? `${color}22` : "var(--bg-card)",
        border: `1px solid ${active ? color : n > 0 ? `${color}88` : "var(--border)"}`,
        borderRadius: 12,
        padding: 14,
        color: "var(--text)",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: n > 0 ? color : "var(--text-muted)" }}>{n}</div>
      <div style={{ fontSize: 11, color: active ? color : "var(--text-muted)", marginTop: 2 }}>{active ? "✓ Filtro ativo" : "Clique para filtrar"}</div>
    </button>
  );
}

/**
 * Central do Atendente PJe — chamados do trabalho. A descrição é gravada com
 * CPF mascarado e sem telefone/e-mail (feito no servidor), e nada daqui vai
 * para a IA. A extensão do Assyst manda chamados pela chave abaixo.
 */
export default function WorkPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState("");
  const [f, setF] = useState("");
  const [token, setToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [phoneLinked, setPhoneLinked] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [guideUrl, setGuideUrl] = useState("");
  const [links, setLinks] = useState<Links>({ ticket: "", redmine: "" });
  const [prod, setProd] = useState<Prod | null>(null);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (f) params.set("f", f);
    const res = await fetch(`/api/work${params.size ? `?${params}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
      setStats(data.stats);
      setGuideUrl(data.guideUrl || "");
      if (data.links) setLinks(data.links);
      setPhoneLinked(!!data.phoneLinked);
      if (data.produtividade) setProd(data.produtividade);
    }
  }, [q, f]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(data: Partial<typeof EMPTY> & { ticketId: string }) {
    setError("");
    const res = await fetch("/api/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) setError((await res.json()).error || "Não consegui salvar.");
    load();
    return res.ok;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await save(form)) setForm(EMPTY);
  }

  async function remove(id: string) {
    if (!confirm("Apagar este chamado da Central?")) return;
    await fetch("/api/work", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  async function importSheet(file: File | undefined) {
    if (!file) return;
    setImportMsg("Importando…");
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/work/import", { method: "POST", body });
    const r = await res.json();
    setImportMsg(
      res.ok
        ? `✅ Aba "${r.aba}": ${r.salvas} de ${r.lidas} chamados importados${r.ignoradas ? ` · ${r.ignoradas} ignorados (${r.erros.join("; ")})` : ""}.`
        : `⚠️ ${r.error || "Não consegui importar."}`
    );
    load();
  }

  async function pairPhone(action: "pair" | "unlink") {
    if (action === "unlink" && !confirm("Desvincular o celular do trabalho? As conversas já salvas continuam nos chamados.")) return;
    const res = await fetch("/api/work/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!res.ok) return;
    const data = await res.json();
    setPairCode(data.code || "");
    load();
  }

  async function removeAttachment(id: string) {
    if (!confirm("Apagar esta imagem do chamado?")) return;
    await fetch("/api/work/attachment", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  async function newToken() {
    if (!confirm("Gerar uma chave nova? A extensão com a chave antiga para de funcionar até você colar a nova.")) return;
    const res = await fetch("/api/work/token", { method: "POST" });
    if (res.ok) setToken((await res.json()).token);
  }

  const box = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 } as const;
  const Card = ({ title, c }: { title: string; c: Count }) => (
    <div style={{ ...box, flex: "1 1 160px" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{c.registrados}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        ✅ {c.resolvidos} resolvidos · 🔧 {c.escalados} Redmine
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>💼 Trabalho — Central do Atendente</h1>
        <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setShowKey((v) => !v)}>🔑 Chave da extensão</button>
        <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setShowPhone((v) => !v)}>
          📱 Celular do trabalho{phoneLinked ? " ✅" : ""}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Chamados do PJe. A descrição é guardada com CPF mascarado (xxx.xxx.xxx-xx) e sem telefone/e-mail, e não passa pela IA.
      </p>

      {showKey && (
      <div style={{ ...box, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🔑 Chave da extensão (Central do Atendente)</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
          A extensão do Assyst manda os chamados para cá usando esta chave. Ela só aparece uma vez: copie e guarde na extensão. Gerar outra invalida a anterior.
        </p>
        {guideUrl && (
          <p style={{ fontSize: 12, marginBottom: 8 }}>
            📥{" "}
            <a href={guideUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline" }}>
              Baixar a extensão e ver o guia de instalação
            </a>
          </p>
        )}
      {showPhone && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📱 Celular do trabalho → chamados</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Do WhatsApp do celular institucional, encaminhe (ou exporte, sem mídia) a conversa com o usuário para o seu número, com <b>chamado 2154585</b> numa das mensagens.
            A secretária guarda o texto no chamado com CPF mascarado e sem telefone/e-mail, e as imagens como anexo. Nada passa por IA; áudio é ignorado.
          </p>
          {phoneLinked ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
              ✅ Vinculado.
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => pairPhone("unlink")}>Desvincular</button>
            </div>
          ) : pairCode ? (
            <div style={{ fontSize: 13 }}>
              Do celular institucional, mande para o seu número: <code style={{ fontSize: 15, padding: "2px 8px", background: "var(--bg-hover)", borderRadius: 6 }}>vincular {pairCode}</code>
              <span style={{ color: "var(--text-muted)" }}> (vale 15 min). Depois atualize esta página.</span>
            </div>
          ) : (
            <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => pairPhone("pair")}>Vincular celular</button>
          )}
        </div>
      )}
        {token ? (
          <code style={{ display: "block", wordBreak: "break-all", fontSize: 12, padding: 8, background: "var(--bg-hover)", borderRadius: 6 }}>{token}</code>
        ) : (
          <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={newToken}>Gerar chave</button>
        )}
      </div>
      )}

      <div style={{ ...box, marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>📥 Importar planilha de chamados (.xlsx)</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Baixe a &quot;Planilha Chamados Erro e Falha&quot; do Excel Online e envie aqui. Completa os chamados do escala com tipo do erro, origem e resolução. CPF é mascarado.
          </div>
        </div>
        <label style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px", cursor: "pointer", background: "#16a34a", color: "#fff", borderRadius: 8 }}>
          📥 Importar planilha
          <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { importSheet(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {importMsg && <div style={{ flex: "1 1 100%", fontSize: 13 }}>{importMsg}</div>}
      </div>

      {stats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <Card title="Hoje" c={stats.hoje} />
          <Card title="Semana" c={stats.semana} />
          <Card title="Mês" c={stats.mes} />
          <div style={{ ...box, flex: "1 1 160px" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Em aberto agora</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--warning)" }}>{stats.emAberto}</div>
          </div>
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <FilterCard title="🚨 Solicitação de Urgência" n={stats.urgentes} color="#ef4444" active={f === "urgentes"} onClick={() => setF(f === "urgentes" ? "" : "urgentes")} />
          <FilterCard title="⚠ Passou do prazo" n={stats.atrasados} color="#ef4444" active={f === "atrasados"} onClick={() => setF(f === "atrasados" ? "" : "atrasados")} />
          <FilterCard title="⚡ Redmine resolvido" n={stats.paraEncerrar.length} color="#f97316" active={f === "encerrar"} onClick={() => setF(f === "encerrar" ? "" : "encerrar")} />
        </div>
      )}

      {prod && <ProductivityChart p={prod} />}

      {stats && stats.tiposDoMes.length > 0 && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🏷️ Tipos de erro do mês</div>
          {stats.tiposDoMes.map((t) => {
            const max = stats.tiposDoMes[0].n || 1;
            return (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                <span style={{ flex: "0 0 45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <span style={{ flex: 1, height: 8, background: "var(--bg-hover)", borderRadius: 4 }}>
                  <span style={{ display: "block", height: "100%", width: `${(t.n / max) * 100}%`, background: "var(--accent)", borderRadius: 4 }} />
                </span>
                <strong>{t.n}</strong>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={add} style={{ ...box, display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input placeholder="Nº do chamado (ex: R2428333)" value={form.ticketId} onChange={(e) => setForm((f) => ({ ...f, ticketId: e.target.value }))} style={{ flex: "1 1 160px" }} />
        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} style={{ flex: "1 1 120px" }}>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={form.origin} onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))} style={{ flex: "1 1 120px" }}>
          <option value="">Origem…</option>
          <option value="externo">Usuário externo</option>
          <option value="interno">Usuário interno</option>
        </select>
        <input placeholder="Tipo do erro (frase curta)" value={form.errorType} onChange={(e) => setForm((f) => ({ ...f, errorType: e.target.value }))} style={{ flex: "2 1 240px" }} />
        <input placeholder="Nº do Redmine (se escalou)" value={form.redmine} onChange={(e) => setForm((f) => ({ ...f, redmine: e.target.value }))} style={{ flex: "1 1 160px" }} />
        <textarea placeholder="Resolução" value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))} style={{ flex: "1 1 100%", minHeight: 50 }} />
        <textarea placeholder="Descrição do chamado (CPF é mascarado ao salvar)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ flex: "1 1 100%", minHeight: 60 }} />
        <button className="btn-primary" style={{ flex: "1 1 140px" }}>Salvar chamado</button>
        {error && <div style={{ flex: "1 1 100%", color: "var(--danger)", fontSize: 13 }}>{error}</div>}
      </form>


      <input placeholder="🔎 Buscar por número ou tipo de erro" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
        {[...tickets].sort((a, b) => priority(a) - priority(b)).map((t) => {
          const al = alertsFor(t);
          return (
          <div
            key={t.id}
            style={{
              ...box,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              ...(al.urgent
                ? { borderLeft: "3px solid #ef4444", background: "rgba(127,29,29,.25)" }
                : al.overdue
                ? { borderLeft: "3px solid #f97316", background: "rgba(124,45,18,.18)" }
                : {}),
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <TicketLink id={t.ticketId} links={links} />
                  <TicketBadges t={t} />
                </span>
                {al.canClose && <ClosePill />}
              </span>
              <span style={{ fontSize: 12, color: STATUS[t.status]?.color, textAlign: "right" }}>
                {STATUS[t.status]?.label ?? t.status}
                {t.redmine ? (
                  <span style={{ display: "block", marginTop: 2, color: "var(--text-muted)" }}>
                    Redmine{t.redmineStatus ? ` · ${t.redmineStatus}` : ""}
                    <RedmineLinks value={t.redmine} links={links} />
                  </span>
                ) : null}
              </span>
            </div>
            {t.errorType && <div style={{ fontSize: 13 }}>{t.errorType}</div>}
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t.origin ? `Usuário ${t.origin} · ` : ""}
              {t.openedAt ? `aberto em ${new Date(t.openedAt).toLocaleDateString("pt-BR")} · ` : ""}
              atualizado {new Date(t.updatedAt).toLocaleDateString("pt-BR")} · via {t.source}
            </div>
            {t.resolution && <div style={{ fontSize: 12 }}>✅ {t.resolution}</div>}
            {t.chatLog && (
              <details style={{ fontSize: 12 }}>
                <summary>💬 Conversa do WhatsApp</summary>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4, maxHeight: 260, overflowY: "auto", padding: 8, background: "var(--bg-hover)", borderRadius: 6 }}>{t.chatLog}</div>
              </details>
            )}
            {!!t.attachments?.length && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.attachments.map((a) => (
                  <span key={a.id} style={{ position: "relative" }}>
                    <a href={`/api/work/attachment?id=${a.id}`} target="_blank" rel="noopener noreferrer" title={a.caption || "Imagem do celular do trabalho"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/work/attachment?id=${a.id}`} alt={a.caption || "Imagem anexada"} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                    </a>
                    <button
                      title="Apagar imagem"
                      onClick={() => removeAttachment(a.id)}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 0, fontSize: 10, cursor: "pointer", background: "var(--bg-card)", color: "var(--text-muted)" }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {t.description && (
              <details style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <summary>Descrição</summary>
                <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{t.description}</div>
              </details>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {t.status !== "resolvido" && (
                <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => save({ ticketId: t.ticketId, status: "resolvido" })}>✅ Resolvido</button>
              )}
              {t.status !== "escalado" && (
                <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => save({ ticketId: t.ticketId, status: "escalado" })}>🔧 Virou Redmine</button>
              )}
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px", marginLeft: "auto" }} onClick={() => remove(t.id)}>Apagar</button>
            </div>
          </div>
          );
        })}
      </div>
      {tickets.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{f ? "Nenhum chamado neste filtro." : "Nenhum chamado ainda."}</div>}
    </div>
    </div>
  );
}
