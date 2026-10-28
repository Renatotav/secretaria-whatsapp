"use client";

// Painéis da tela do Trabalho: ajustar prazo, contatos, atalhos de texto,
// situações e cartões-filtro. Saiu de work/page.tsx (28/10/2026).

import { useCallback, useEffect, useRef, useState } from "react";
import { type Situation } from "@/lib/work-sla";
import { TicketLink } from "./work-ui";
import type { Links, Ticket } from "./work-ui";

/** "⚙️ prazo": recebido em (de quando conta) e prazo em dias só deste chamado. */
export function AdjustPrazo({ t, onSave }: { t: Ticket; onSave: (d: { receivedAt: string; slaOverride: string }) => void }) {
  const toDay = (v?: string | null) => (v ? new Date(new Date(v).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : "");
  const [received, setReceived] = useState(toDay(t.receivedAt));
  const [sla, setSla] = useState(t.slaOverride ? String(t.slaOverride) : "");
  return (
    <details style={{ fontSize: 12 }}>
      <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>⚙️ prazo</summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
        <label>
          Recebido em <input type="date" value={received} onChange={(e) => setReceived(e.target.value)} style={{ fontSize: 12 }} />
        </label>
        <label>
          Prazo <input type="number" min={1} max={365} placeholder="fila" value={sla} onChange={(e) => setSla(e.target.value)} style={{ width: 60, fontSize: 12 }} /> dias
        </label>
        <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => onSave({ receivedAt: received, slaOverride: sla })}>
          Salvar
        </button>
      </div>
    </details>
  );
}

export type Contact = { id: string; name: string; labels: string[]; notes: string; tickets: string[]; reminderAt: string | null; reminderText: string; updatedAt: string };

/** 👥 Contatos do CRM do WhatsApp Web (a edição é feita no próprio WhatsApp Web). */
export function ContactsList({ links }: { links: Links }) {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    fetch("/api/work/contacts").then(async (r) => r.ok && setRows((await r.json()).contacts));
  }, []);
  useEffect(load, [load]);
  async function remove(id: string) {
    if (!confirm("Apagar este contato do CRM (notas, etiquetas e lembrete)?")) return;
    await fetch("/api/work/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }
  const filtered = (rows ?? []).filter((c) => !q || `${c.name} ${c.labels.join(" ")} ${c.notes} ${c.tickets.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>👥 Contatos (CRM do WhatsApp Web)</div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        Notas, etiquetas, chamados e lembretes de cada contato. Edite no WhatsApp Web, pelo painel 👥 da extensão.
      </p>
      <input placeholder="🔎 Buscar nome, etiqueta, nota ou chamado" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      {rows === null && <div style={{ fontSize: 12 }}>Carregando…</div>}
      {rows && !filtered.length && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum contato ainda.</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, fontSize: 12, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>{c.name}</strong>
              <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 7px" }} onClick={() => remove(c.id)}>
                Apagar
              </button>
            </div>
            {!!c.labels.length && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {c.labels.map((l) => (
                  <span key={l} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, border: "1px solid var(--border)" }}>
                    🏷️ {l}
                  </span>
                ))}
              </div>
            )}
            {!!c.tickets.length && (
              <div>
                Chamados:{" "}
                {c.tickets.map((t, i) => (
                  <span key={t}>
                    {i > 0 && ", "}
                    <TicketLink id={t} links={links} size={12} />
                  </span>
                ))}
              </div>
            )}
            {c.reminderAt && <div>⏰ {new Date(c.reminderAt).toLocaleString("pt-BR")} {c.reminderText}</div>}
            {c.notes && <div style={{ whiteSpace: "pre-wrap", color: "var(--text-muted)" }}>{c.notes.length > 300 ? c.notes.slice(0, 300) + "…" : c.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export type Snippet = { shortcut: string; title: string; body: string };

/** Texto do atalho com botões: **negrito**, __itálico__, [link](…) e {clipboard} (o que está copiado). */
export function SnippetBody({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function envolver(antes: string, depois: string, vazio: string) {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const meio = value.slice(a, b) || vazio;
    onChange(value.slice(0, a) + antes + meio + depois + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = a + antes.length;
      el.selectionEnd = a + antes.length + meio.length;
    });
  }
  function link() {
    const url = window.prompt("Endereço do link (https://…)");
    if (!url) return;
    const certo = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    envolver("[", `](${certo})`, "texto do link");
  }
  const btn = { fontSize: 12, padding: "2px 9px", minWidth: 30 } as const;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button type="button" className="btn-ghost" style={{ ...btn, fontWeight: 700 }} title="Negrito: **texto**" onClick={() => envolver("**", "**", "texto")}>B</button>
        <button type="button" className="btn-ghost" style={{ ...btn, fontStyle: "italic" }} title="Itálico: __texto__" onClick={() => envolver("__", "__", "texto")}>I</button>
        <button type="button" className="btn-ghost" style={btn} title="Link: [texto](https://…)" onClick={link}>🔗 Link</button>
        <button type="button" className="btn-ghost" style={btn} title="Entra o que você copiou (Ctrl+C)" onClick={() => envolver("{clipboard}", "", "")}>📋 Copiado</button>
      </div>
      <textarea ref={ref} aria-label="Texto" value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(10, Math.max(3, value.split("\n").length + 1))} style={{ width: "100%", fontSize: 12 }} />
    </div>
  );
}

/** ⌨️ Atalhos de texto: "/padrao" vira o texto em qualquer campo (extensão). */
export function SnippetsEditor() {
  const [rows, setRows] = useState<Snippet[] | null>(null);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch("/api/work/snippets")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setRows((await r.json()).snippets);
      })
      .catch(() => setErro("Não consegui carregar os atalhos. Atualize a página."));
  }, []);
  const set = (i: number, patch: Partial<Snippet>) => setRows((r) => (r ?? []).map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function save() {
    const res = await fetch("/api/work/snippets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snippets: rows }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(`⚠️ ${data.error || "Não consegui salvar. Tente de novo."}`);
    // Atalho com problema continua na tela (antes sumia e a tela dizia "Salvo").
    const rejeitados: (Snippet & { motivo: string })[] = data.rejected ?? [];
    setRows([...data.snippets, ...rejeitados.map(({ shortcut, title, body }) => ({ shortcut, title, body }))]);
    setMsg(
      rejeitados.length
        ? `⚠️ Salvei ${data.snippets.length}, mas ${rejeitados.length === 1 ? "1 não foi salvo" : `${rejeitados.length} não foram salvos`} (ficaram no fim da lista): ${rejeitados.map((r) => r.motivo).join("; ")}.`
        : `✅ Salvo (${data.snippets.length} atalho(s)). Volte para a aba do Assyst e a extensão pega na hora — ou clique em ⚡ › ⌨️ Atualizar atalhos.`
    );
  }
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⌨️ Atalhos de texto</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
        Digite o atalho (começando com / ou {"\\"}) em qualquer campo — Assyst, WhatsApp Web, e-mail, Redmine — e ele vira o texto.
      </p>
      <details style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        <summary style={{ cursor: "pointer", minHeight: 32, display: "flex", alignItems: "center" }}>Ver campos automáticos e formatação</summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
          <li><code>{"{chamado}"}</code> nº do chamado aberto · <code>{"{saudacao}"}</code> Bom dia/Boa tarde/Boa noite · <code>{"{data}"}</code> · <code>{"{hora}"}</code></li>
          <li><code>{"{campo:Nome do usuário}"}</code> pergunta na hora · <code>{"{cursor}"}</code> onde o cursor fica · <code>{"{clipboard}"}</code> o que você copiou</li>
          <li>Do chamado aberto (sem IA): <code>{"{situacao}"}</code> <code>{"{status}"}</code> <code>{"{redmine}"}</code> <code>{"{usuario}"}</code> <code>{"{tipo}"}</code> <code>{"{fila}"}</code> <code>{"{dias}"}</code></li>
          <li><b>**negrito**</b>, <i>__itálico__</i> e <code>[texto](https://link)</code> — no WhatsApp viram *negrito*/_itálico_</li>
          <li>Atalhos do Text Blaze ({"{time}"}, {"{formtext}"}, {"{if}"}) funcionam colados como estão. Campo &quot;Pronome&quot; vira botões Sr./Sra./Dr./Dra.</li>
        </ul>
      </details>
      {erro && <div style={{ fontSize: 13, color: "var(--danger)" }}>⚠️ {erro}</div>}
      {rows === null && !erro && <div style={{ fontSize: 12 }}>Carregando…</div>}
      {rows?.map((r, i) => (
        <div key={i} style={{ display: "grid", gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input aria-label="Atalho" value={r.shortcut} onChange={(e) => set(i, { shortcut: e.target.value })} placeholder="/atalho" style={{ width: 130, fontFamily: "monospace" }} />
            <input aria-label="Nome" value={r.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="Nome (ex: Mensagem padrão)" style={{ flex: "1 1 200px" }} />
            <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setRows((x) => (x ?? []).filter((_, k) => k !== i))}>
              Remover
            </button>
          </div>
          <SnippetBody value={r.body} onChange={(v) => set(i, { body: v })} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setRows((x) => [...(x ?? []), { shortcut: "/novo", title: "", body: "" }])}>
          + Atalho
        </button>
        <button className="btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={save}>
          Salvar
        </button>
        <span style={{ fontSize: 12 }}>{msg}</span>
      </div>
    </div>
  );
}

/** Editor da lista de situações (nome, emoji, cor, pausa o prazo, quando pulsa). */
export function SituationsEditor({ list, onSaved }: { list: Situation[]; onSaved: (l: Situation[]) => void }) {
  const [rows, setRows] = useState<Situation[]>(list);
  const [msg, setMsg] = useState("");
  const set = (i: number, patch: Partial<Situation>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function save() {
    const res = await fetch("/api/work/situations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ situations: rows }) });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "Não consegui salvar.");
    setRows(data.situations);
    onSaved(data.situations);
    setMsg("✅ Salvo.");
  }
  const pulseKind = (p: string) => (p.startsWith("apos:") ? "apos" : p);
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🏷️ Situações dos chamados</div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        O segundo badge do chamado: com quem está a bola. &quot;Aguardando retorno&quot; faz o badge de dias parar de pulsar (vermelho fixo 🕒). &quot;Pulsa&quot; chama atenção no próprio badge da situação.
      </p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)", fontSize: 12 }}>
          <input aria-label="Emoji" value={r.emoji} onChange={(e) => set(i, { emoji: e.target.value })} style={{ width: 44, textAlign: "center" }} />
          <input aria-label="Nome" value={r.name} onChange={(e) => set(i, { name: e.target.value })} style={{ flex: "1 1 180px" }} />
          <input aria-label="Cor" type="color" value={r.color} onChange={(e) => set(i, { color: e.target.value })} style={{ width: 40, padding: 0 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={r.pauses} onChange={(e) => set(i, { pauses: e.target.checked })} /> aguardando retorno 🕒
          </label>
          <select
            aria-label="Quando pulsa"
            value={pulseKind(r.pulse)}
            onChange={(e) => set(i, { pulse: e.target.value === "apos" ? "apos:2" : e.target.value })}
          >
            <option value="nunca">não pulsa</option>
            <option value="sempre">pulsa sempre</option>
            <option value="apos">pulsa depois de N dias</option>

          </select>
          {pulseKind(r.pulse) === "apos" && (
            <input
              aria-label="Dias"
              type="number"
              min={1}
              max={60}
              value={Number(r.pulse.split(":")[1] || 2)}
              onChange={(e) => set(i, { pulse: `apos:${Math.max(1, Number(e.target.value) || 1)}` })}
              style={{ width: 56 }}
            />
          )}
          <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>
            Remover
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => setRows((x) => [...x, { key: "", emoji: "•", name: "Nova situação", color: "#64748b", pauses: false, pulse: "nunca" }])}>
          + Situação
        </button>
        <button className="btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={save}>
          Salvar
        </button>
        <span style={{ fontSize: 12 }}>{msg}</span>
      </div>
    </div>
  );
}

/** Cartão-filtro (clique liga/desliga), igual aos do escala. */
export function FilterCard({ title, n, color, active, onClick }: { title: string; n: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "pulsar" : undefined}
      style={{
        flex: "1 1 160px",
        textAlign: "left",
        cursor: "pointer",
        background: active ? `color-mix(in srgb, ${color} 13%, transparent)` : "var(--bg-card)",
        border: `1px solid ${active ? color : n > 0 ? `color-mix(in srgb, ${color} 53%, transparent)` : "var(--border)"}`,
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
