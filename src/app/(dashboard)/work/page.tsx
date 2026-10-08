"use client";

import { useCallback, useEffect, useState } from "react";

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
  const [token, setToken] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/work${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.ok) {
      const data = await res.json();
      setTickets(data.tickets);
      setStats(data.stats);
    }
  }, [q]);

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
        {token ? (
          <code style={{ display: "block", wordBreak: "break-all", fontSize: 12, padding: 8, background: "var(--bg-hover)", borderRadius: 6 }}>{token}</code>
        ) : (
          <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={newToken}>Gerar chave</button>
        )}
      </div>
      )}

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

      {stats && stats.paraEncerrar?.length > 0 && (
        <div style={{ ...box, marginBottom: 16, borderColor: "var(--success)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>✅ Pode encerrar no Assyst — Redmine já resolvido</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Chamados seus ainda abertos cujo Redmine aparece como resolvido no escala. Depois de encerrar no Assyst, toque em &quot;Encerrei&quot;.
          </div>
          {stats.paraEncerrar.map((t) => (
            <div key={t.ticketId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              <span>
                <strong>{t.ticketId}</strong> · Redmine #{t.redmine}
                {t.openedAt ? <span style={{ color: "var(--text-muted)" }}> · aberto em {new Date(t.openedAt).toLocaleDateString("pt-BR")}</span> : null}
              </span>
              <button className="btn-ghost" style={{ fontSize: 12, padding: "4px 8px" }} onClick={() => save({ ticketId: t.ticketId, status: "resolvido" })}>✅ Encerrei</button>
            </div>
          ))}
        </div>
      )}

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

      <div style={{ ...box, marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>📥 Importar planilha de chamados (.xlsx)</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Baixe a &quot;Planilha Chamados Erro e Falha&quot; do Excel Online e envie aqui. Completa os chamados do escala com tipo do erro, origem e resolução. CPF é mascarado.
          </div>
        </div>
        <label className="btn-ghost" style={{ fontSize: 13, padding: "6px 12px", cursor: "pointer" }}>
          Escolher arquivo
          <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { importSheet(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {importMsg && <div style={{ flex: "1 1 100%", fontSize: 13 }}>{importMsg}</div>}
      </div>

      <input placeholder="🔎 Buscar por número ou tipo de erro" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
        {tickets.map((t) => (
          <div key={t.id} style={{ ...box, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 15 }}>{t.ticketId}</strong>
              <span style={{ fontSize: 12, color: STATUS[t.status]?.color }}>{STATUS[t.status]?.label ?? t.status}{t.redmine ? ` #${t.redmine}${t.redmineStatus ? ` · ${t.redmineStatus}` : ""}` : ""}</span>
            </div>
            {t.errorType && <div style={{ fontSize: 13 }}>{t.errorType}</div>}
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t.origin ? `Usuário ${t.origin} · ` : ""}
              {t.openedAt ? `aberto em ${new Date(t.openedAt).toLocaleDateString("pt-BR")} · ` : ""}
              atualizado {new Date(t.updatedAt).toLocaleDateString("pt-BR")} · via {t.source}
            </div>
            {t.resolution && <div style={{ fontSize: 12 }}>✅ {t.resolution}</div>}
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
        ))}
      </div>
      {tickets.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Nenhum chamado ainda.</div>}
    </div>
    </div>
  );
}
