"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { alertsFor, DEFAULT_SITUATIONS, type Situation } from "@/lib/work-sla";
import { useWidth } from "@/lib/use-width";
import { InsightPanel, AskBox, type Selecao } from "./insight-panel";
import { ClosePill, EMPTY, RedmineLinks, STATUS, TicketBadges, TicketLink, priority } from "./work-ui";
import type { Count, Links, Stats, Ticket } from "./work-ui";
import { ProductivityChart } from "./ProductivityChart";
import type { Prod } from "./ProductivityChart";
import { AdjustPrazo, ContactsList, FilterCard, SituationsEditor, SnippetsEditor } from "./work-panels";

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
  const [sel, setSel] = useState<Selecao>(null); // barra clicada na Produtividade
  const [situations, setSituations] = useState<Situation[]>(DEFAULT_SITUATIONS);
  const [showSituations, setShowSituations] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [sync, setSync] = useState<{ pending: boolean; syncedAt: string | null } | null>(null);
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
      if (data.situations) setSituations(data.situations);
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

  // "🔄 Atualizar do escala": grava o pedido; o vigia do servidor copia em até 1 min.
  const loadSync = useCallback(async () => {
    const res = await fetch("/api/work/sync");
    if (res.ok) setSync(await res.json());
  }, []);
  async function requestSync() {
    const res = await fetch("/api/work/sync", { method: "POST" });
    if (res.ok) setSync(await res.json());
  }
  useEffect(() => {
    loadSync();
  }, [loadSync]);
  useEffect(() => {
    if (!sync?.pending) return;
    // Enquanto espera, confere a cada 10 s; quando terminar, recarrega os chamados.
    const t = setInterval(async () => {
      const res = await fetch("/api/work/sync");
      if (!res.ok) return;
      const st = await res.json();
      setSync(st);
      if (!st.pending) load();
    }, 10_000);
    return () => clearInterval(t);
  }, [sync?.pending, load]);

  async function postAction(body: Record<string, unknown>) {
    setError("");
    const res = await fetch("/api/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error || "Não consegui salvar.");
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
      {/* Topo: título + as 2 ações do dia a dia; o resto fica em "⚙️ Ferramentas". */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, textWrap: "balance" }}>💼 Trabalho</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn-ghost"
            disabled={!!sync?.pending}
            title={sync?.syncedAt ? `Última cópia do escala: ${new Date(sync.syncedAt).toLocaleString("pt-BR")}` : "Copiar agora os seus chamados do escala"}
            style={{ fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap" }}
            onClick={requestSync}
          >
            {sync?.pending ? "⏳ Atualizando…" : "🔄 Atualizar do escala"}
            {!sync?.pending && sync?.syncedAt ? (
              <span style={{ color: "var(--text-muted)" }}> · {new Date(sync.syncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            ) : null}
          </button>
          <a href="/work/portfolio" className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px", whiteSpace: "nowrap" }}>
            📊 Produtividade
          </a>
          <details className="tools-menu" style={{ position: "relative" }}>
            <summary className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px", listStyle: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
              ⚙️ Ferramentas ▾
            </summary>
            <div
              className="menu-ferramentas"
              style={{ position: "absolute", top: "calc(100% + 6px)", zIndex: 20, minWidth: 220, display: "grid", gap: 2, padding: 6, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
              onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute("open")}
            >
              {[
                { label: "⌨️ Atalhos de texto", on: () => setShowSnippets((v) => !v) },
                { label: "👥 Contatos (CRM)", on: () => setShowContacts((v) => !v) },
                { label: "🏷️ Situações", on: () => setShowSituations((v) => !v) },
                { label: `📱 Celular do trabalho${phoneLinked ? " ✅" : ""}`, on: () => setShowPhone((v) => !v) },
                { label: "🔑 Chave da extensão", on: () => setShowKey((v) => !v) },
              ].map((x) => (
                <button key={x.label} className="btn-ghost" style={{ fontSize: 12, padding: "7px 10px", textAlign: "left", border: 0 }} onClick={x.on}>
                  {x.label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, maxWidth: "70ch" }}>
        Central do Atendente PJe. A descrição dos chamados é guardada com CPF mascarado e sem telefone/e-mail.
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
        {token ? (
          <code style={{ display: "block", wordBreak: "break-all", fontSize: 12, padding: 8, background: "var(--bg-hover)", borderRadius: 6 }}>{token}</code>
        ) : (
          <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={newToken}>Gerar chave</button>
        )}
      </div>
      )}

      {showSnippets && <SnippetsEditor />}
      {showContacts && <ContactsList links={links} />}
      {showSituations && <SituationsEditor list={situations} onSaved={(l) => { setSituations(l); load(); }} />}

      {showPhone && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📱 Celular do trabalho → chamados</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            Do WhatsApp do celular institucional, encaminhe (ou exporte, sem mídia) a conversa com o usuário para o seu número, com <b>chamado 1234567</b> numa das mensagens.
            A secretária guarda o texto no chamado com CPF mascarado e sem telefone/e-mail, e as imagens como anexo (lidas aqui mesmo). Só o texto já mascarado vai ao Jev, para avisar urgência; áudio é ignorado.
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
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Na sua fila agora</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{stats.emAberto}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              e {stats.no3n ?? 0} com o 3º nível{stats.encerrarAqui ? ` · ${stats.encerrarAqui} já encerrado(s) na planilha` : ""}
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <FilterCard title="🚨 Solicitação de Urgência" n={stats.urgentes} color="var(--danger)" active={f === "urgentes"} onClick={() => setF(f === "urgentes" ? "" : "urgentes")} />
          <FilterCard title="⚠ Passou do prazo" n={stats.atrasados} color="var(--danger)" active={f === "atrasados"} onClick={() => setF(f === "atrasados" ? "" : "atrasados")} />
          <FilterCard title="⚡ Redmine resolvido" n={stats.paraEncerrar.length} color="var(--warning)" active={f === "encerrar"} onClick={() => setF(f === "encerrar" ? "" : "encerrar")} />
        </div>
      )}

      <AskBox links={links} />

      {prod && <ProductivityChart p={prod} />}

      {stats && !!stats.gruposDoMes?.length && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🗂️ O que mais se repete no mês (grupos de erro)</div>
          {stats.gruposDoMes.map((g) => {
            const max = stats.gruposDoMes![0].n || 1;
            return (
              <div key={g.name} role="button" title="Clique para ver os chamados e como você resolveu" onClick={() => setSel({ recorte: "grupo", valor: g.name })} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4, cursor: "pointer" }}>
                <span style={{ flex: "0 0 45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                <span style={{ flex: 1, height: 8, background: "var(--bg-hover)", borderRadius: 4 }}>
                  <span style={{ display: "block", height: "100%", width: `${(g.n / max) * 100}%`, background: "var(--success)", borderRadius: 4 }} />
                </span>
                <strong>{g.n}</strong>
              </div>
            );
          })}
        </div>
      )}

      {stats && stats.tiposDoMes.length > 0 && (
        <div style={{ ...box, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🏷️ Tipos de erro do mês</div>
          {stats.tiposDoMes.map((t) => {
            const max = stats.tiposDoMes[0].n || 1;
            return (
              <div key={t.name} role="button" title="Clique para ver os chamados e como você resolveu" onClick={() => setSel({ recorte: "tipo", valor: t.name })} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4, cursor: "pointer" }}>
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

      <InsightPanel sel={sel} onClose={() => setSel(null)} links={links} />

      <form onSubmit={add} style={{ ...box, display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input placeholder="Nº do chamado (ex: R1234567)" value={form.ticketId} onChange={(e) => setForm((f) => ({ ...f, ticketId: e.target.value }))} style={{ flex: "1 1 160px" }} />
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 10 }}>
        {[...tickets].sort((a, b) => priority(a, situations) - priority(b, situations)).map((t) => {
          const al = alertsFor(t, situations);
          return (
          <div
            key={t.id}
            style={{
              ...box,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              ...(al.urgent
                ? { borderLeft: "3px solid var(--danger)", background: "rgba(127,29,29,.25)" }
                : al.overdue
                ? { borderLeft: "3px solid var(--warning)", background: "rgba(124,45,18,.18)" }
                : {}),
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <TicketLink id={t.ticketId} links={links} />
                  <TicketBadges t={t} situations={situations} />
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
            {t.errorGroup && t.errorGroup !== "Sem grupo" && (
              <span title="Grupo do erro (sugerido pela IA)" style={{ fontSize: 11, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 8px", width: "fit-content" }}>
                🗂️ {t.errorGroup}
              </span>
            )}
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t.origin ? `Usuário ${t.origin} · ` : ""}
              {t.openedAt ? `aberto em ${new Date(t.openedAt).toLocaleDateString("pt-BR")} · ` : ""}
              {t.receivedAt ? `recebido em ${new Date(t.receivedAt).toLocaleDateString("pt-BR")} · ` : ""}
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
            {(t.status === "aberto" || t.status === "pendente") && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
                <select
                  aria-label="Situação"
                  value={t.situation || ""}
                  onChange={(e) => postAction({ action: "situation", ticketId: t.ticketId, situation: e.target.value })}
                  style={{ fontSize: 12, padding: "3px 6px" }}
                >
                  <option value="">— situação —</option>
                  {situations.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.emoji} {x.name}
                    </option>
                  ))}
                </select>
                <AdjustPrazo t={t} onSave={(d) => postAction({ action: "adjust", ticketId: t.ticketId, ...d })} />
              </div>
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
