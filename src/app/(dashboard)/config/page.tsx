"use client";
import { useState, useEffect, useRef } from "react";

interface Config {
  id?: string;
  name: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  historyLimit: number;
  enabled: boolean;
  allowedPhones: string;
  evolutionUrl: string;
  evolutionApiKey: string;
  instanceId: string;
  aiProvider: string;
  openaiApiKey: string;
  openaiModel: string;
  groqApiKey: string;
  groqModel: string;
  googleApiKey: string;
  googleModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  ownerPhone: string;
  ownerName: string;
  ownerRole: string;
  summaryTime: string;
  weeklyTime: string;
  reminderHours: number;
  audioEnabled: boolean;
  privateBriefings: boolean;
  detectCommitments: boolean;
  mutedContacts: string;
  debounceSeconds: number;
  typingMsPerChar: number;
  typingMaxSeconds: number;
  creditCardDueDay: number;
  creditCardBestDay: number;
  cardBillDays: { card: string; due: number; best: number }[];
  invoiceBuddyName: string;
  invoiceBuddyPhone: string;
}

const DEFAULT: Config = {
  name: "Secretária Eletrônica",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 1024,
  historyLimit: 10,
  enabled: true,
  allowedPhones: "",
  evolutionUrl: "",
  evolutionApiKey: "",
  instanceId: "",
  aiProvider: "openai",
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  groqApiKey: "",
  groqModel: "llama-3.3-70b-versatile",
  googleApiKey: "",
  googleModel: "gemini-2.0-flash",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-4o-mini",
  ownerPhone: "",
  ownerName: "",
  ownerRole: "",
  summaryTime: "18:00",
  weeklyTime: "20:00",
  reminderHours: 3,
  audioEnabled: false,
  privateBriefings: false,
  detectCommitments: true,
  invoiceBuddyName: "",
  invoiceBuddyPhone: "",
  mutedContacts: "",
  debounceSeconds: 8,
  typingMsPerChar: 35,
  typingMaxSeconds: 8,
  creditCardDueDay: 10,
  creditCardBestDay: 5,
  cardBillDays: [],
};

/** Chave liga/desliga com o texto ao lado (mesmo visual da chave de áudio). */
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        style={{ flex: "0 0 44px", width: 44, height: 24, borderRadius: 12, background: on ? "var(--accent)" : "var(--border)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s" }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{hint}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 16px 4px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: "var(--text)" }}>{title}</h2>
      {children}
    </section>
  );
}

/** Título de um grupo dentro do "Avançado" (sem cartão dentro de cartão). */
function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "24px 0 12px", paddingTop: 16, borderTop: "1px solid var(--border-light)" }}>{children}</h3>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{hint}</p>
      )}
      {children}
    </div>
  );
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>(DEFAULT);
  // Nome dos contatos (para mostrar os silenciados pelo nome, não pelo número).
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/conversations?light=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { phone: string | null; contactName?: string }[]) => {
        const map: Record<string, string> = {};
        for (const c of list) if (c.phone && c.contactName) map[c.phone] = c.contactName;
        setContactNames(map);
      })
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Não carregou (sessão expirada, servidor fora): NÃO mostra o formulário —
  // salvar os valores padrão apagaria as configurações e as chaves reais.
  const [loadError, setLoadError] = useState("");
  const original = useRef<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok || !data || data.error) throw new Error(r.status === 401 ? "Sua sessão expirou. Entre de novo." : "Não consegui carregar as configurações.");
        original.current = data;
        setConfig({ ...DEFAULT, ...data, ownerPhone: data.ownerPhone || "55" });
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Não consegui carregar as configurações."))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  // Chave salva vem como "••••abcd": o campo fica vazio, dizendo o final da
  // chave guardada; digitar troca. (Antes o texto novo começava com "••••" e
  // era ignorado sem aviso.)
  const MASK = "••••";
  function secretField(key: "evolutionApiKey" | "openaiApiKey" | "groqApiKey" | "googleApiKey" | "openrouterApiKey") {
    const v = config[key] || "";
    const guardada = original.current[key] || ""; // como veio do servidor
    const salva = guardada.startsWith(MASK);
    return {
      value: v.startsWith(MASK) ? "" : v,
      placeholder: salva ? `Chave salva (final ${guardada.slice(-4)}) — digite outra para trocar` : "Cole a chave aqui",
      // Sem isso o navegador cola uma senha guardada aqui ao salvar (28/10 trocou a chave da Evolution e o WhatsApp parou de responder).
      autoComplete: "new-password",
      "data-lpignore": "true",
      "data-1p-ignore": "true",
      // Apagar o que digitou volta para a chave guardada (não apaga a chave).
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value || (salva ? guardada : "")),
    };
  }

  const [avisoMsg, setAvisoMsg] = useState("");
  async function testarAviso() {
    setAvisoMsg("Mandando…");
    // Salva antes, para o teste usar o nome e o número que estão na tela.
    await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    const r = await fetch("/api/config/invoice-buddy-test", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setAvisoMsg(r.ok ? "✅ Teste enviado. Confira com a pessoa se chegou." : `⚠️ ${d.error || "Não consegui mandar."}`);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    const r = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).catch(() => null);
    setSaving(false);
    const erro = r && !r.ok ? ((await r.json().catch(() => ({}))) as { error?: string }).error : "";
    if (!r || !r.ok) return setSaveError(r?.status === 401 ? "Não salvou: sua sessão expirou. Entre de novo." : erro || "Não salvou. Tente de novo.");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <p style={{ color: "var(--text-muted)" }}>Carregando configurações...</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24, textAlign: "center", gap: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ color: "var(--danger)" }}>⚠️ {loadError}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Por segurança o formulário não aparece: salvar agora apagaria suas configurações.</p>
          <div><button className="btn-primary" onClick={() => location.reload()}>Tentar de novo</button></div>
        </div>
      </div>
    );
  }


  const silenciados = config.mutedContacts.split(",").map((p) => p.trim()).filter(Boolean);
  const numero = (key: "creditCardDueDay" | "creditCardBestDay" | "debounceSeconds" | "typingMsPerChar" | "typingMaxSeconds" | "historyLimit", min: number, max: number) => (
    <input type="number" inputMode="numeric" min={min} max={max} value={config[key]} onChange={(e) => set(key, Number(e.target.value))} />
  );

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 0" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>⚙️ Configurações</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            O que você muda no dia a dia fica em cima. A parte técnica fica no fim, fechada.
          </p>
        </header>

        <Section title="👤 Você">
          <Field label="Seu WhatsApp" hint="Com DDI e DDD, só números (ex: 5585999999999)">
            <input inputMode="numeric" value={config.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="5585999999999" />
          </Field>
          <div className="cfg-grid">
            <Field label="Seu nome" hint="A IA usa para achar o SEU cartão na fatura">
              <input value={config.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Renato" />
            </Field>
            <Field label="Seu cargo">
              <input value={config.ownerRole} onChange={(e) => set("ownerRole", e.target.value)} placeholder="Operador de Atendimento PJe" />
            </Field>
          </div>
        </Section>

        <Section title="💳 Cartões e faturas">
          <div className="cfg-grid">
            <Field label="Vencimento do cartão" hint="Dia em que a fatura vence">
              {numero("creditCardDueDay", 1, 31)}
            </Field>
            <Field label="Melhor dia de compra" hint="A partir dele, a compra cai na fatura seguinte">
              {numero("creditCardBestDay", 1, 31)}
            </Field>
          </div>
          <Field
            label="Outros cartões"
            hint='Cada um com o seu vencimento. Ao citar o cartão na mensagem ("80 no santander do bruno"), o gasto e as parcelas vão para ele. O nome tem que ser igual ao dos lançamentos.'
          >
            <div style={{ display: "grid", gap: 8 }}>
              {(config.cardBillDays || []).map((c, i) => (
                <div key={i} className="cfg-row">
                  <input
                    aria-label="Nome do cartão"
                    placeholder="Santander do Bruno"
                    value={c.card}
                    onChange={(e) => set("cardBillDays", config.cardBillDays.map((x, j) => (j === i ? { ...x, card: e.target.value } : x)))}
                    style={{ flex: "1 1 180px", minWidth: 0 }}
                  />
                  <label className="cfg-inline">
                    vence dia
                    <input type="number" inputMode="numeric" min={1} max={31} value={c.due} style={{ width: 64 }}
                      onChange={(e) => set("cardBillDays", config.cardBillDays.map((x, j) => (j === i ? { ...x, due: Number(e.target.value) } : x)))} />
                  </label>
                  <label className="cfg-inline">
                    melhor dia
                    <input type="number" inputMode="numeric" min={1} max={31} value={c.best} style={{ width: 64 }}
                      onChange={(e) => set("cardBillDays", config.cardBillDays.map((x, j) => (j === i ? { ...x, best: Number(e.target.value) } : x)))} />
                  </label>
                  <button type="button" className="btn-ghost" onClick={() => set("cardBillDays", config.cardBillDays.filter((_x, j) => j !== i))}>Tirar</button>
                </div>
              ))}
              <div>
                <button type="button" className="btn-ghost" onClick={() => set("cardBillDays", [...(config.cardBillDays || []), { card: "", due: 15, best: 5 }])}>+ Adicionar cartão</button>
              </div>
            </div>
          </Field>
          <Field
            label="Avisar outra pessoa das faturas"
            hint="Ela recebe no WhatsApp, às 9h do vencimento de cada cartão, só a SUA parte da fatura. Sem número, fica desligado."
          >
            <div className="cfg-row">
              <input aria-label="Nome de quem recebe" placeholder="Nome (ex: Bruno)" value={config.invoiceBuddyName} onChange={(e) => set("invoiceBuddyName", e.target.value)} style={{ flex: "1 1 140px" }} />
              <input aria-label="WhatsApp de quem recebe" inputMode="numeric" placeholder="WhatsApp com DDI e DDD" value={config.invoiceBuddyPhone} onChange={(e) => set("invoiceBuddyPhone", e.target.value.replace(/\D/g, ""))} style={{ flex: "1 1 180px" }} />
              <button type="button" className="btn-ghost" disabled={!config.invoiceBuddyPhone} onClick={testarAviso} style={{ flex: "0 0 auto" }}>Mandar teste</button>
            </div>
            {avisoMsg && <div role="status" style={{ fontSize: 12, marginTop: 6, color: "var(--text-muted)" }}>{avisoMsg}</div>}
          </Field>
        </Section>

        <Section title="⏰ Horários">
          <div className="cfg-grid">
            <Field label="Resumo do dia" hint="Gastos, tetos e o que vence amanhã">
              <input type="time" value={config.summaryTime} onChange={(e) => set("summaryTime", e.target.value)} />
            </Field>
            <Field label="Relatório da semana" hint="Todo domingo">
              <input type="time" value={config.weeklyTime} onChange={(e) => set("weeklyTime", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="🧠 Jeito da secretária">
          <Field label="Instruções para a IA" hint="Ajudam a IA a entender suas mensagens: como classificar gastos, o que é diário, o tom. Em branco, ela usa só o padrão.">
            <textarea
              value={config.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              rows={9}
              style={{ resize: "vertical", lineHeight: 1.5 }}
              placeholder="Ex: Me chame de Renato. Bar e espetinho = Saídas."
            />
          </Field>
        </Section>

        <Section title="💬 Conversas e áudios">
          <Toggle
            on={config.audioEnabled}
            onChange={(v) => set("audioEnabled", v)}
            label="Escutar áudios"
            hint="Transcreve os áudios que você manda e trata como texto."
          />
          <Toggle
            on={config.detectCommitments}
            onChange={(v) => set("detectCommitments", v)}
            label="Achar compromissos nas conversas"
            hint="A IA lê as conversas com contatos e pergunta se coloca o combinado na agenda."
          />
          <Toggle
            on={config.privateBriefings}
            onChange={(v) => set("privateBriefings", v)}
            label="Resumo de cada mensagem recebida"
            hint="Avisa no WhatsApp um resumo de toda mensagem de contato."
          />
          <Field label="Contatos silenciados" hint='A IA nunca lê. No WhatsApp: "silencia fulano" / "volta a ouvir fulano".'>
            {silenciados.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Nenhum.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {silenciados.map((p) => (
                  <span key={p} style={{ fontSize: 12, padding: "4px 4px 4px 10px", borderRadius: 12, background: "var(--bg-hover)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center" }}>
                    {contactNames[p] || p}
                    <button
                      type="button"
                      onClick={() => set("mutedContacts", silenciados.filter((x) => x !== p).join(","))}
                      style={{ marginLeft: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 6px" }}
                      aria-label={`Voltar a ouvir ${contactNames[p] || p}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
        </Section>

        <details className="cfg-advanced">
          <summary>
            <span>
              <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>⚙️ Avançado</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>WhatsApp, IA e tempos. Só mexa se algo parar de funcionar.</span>
            </span>
            <span className="cfg-chevron" aria-hidden>›</span>
          </summary>

          <div className="cfg-advanced-body">
            <SubHead>📱 WhatsApp (Evolution)</SubHead>
            <Field label="Endereço da Evolution">
              <input value={config.evolutionUrl} onChange={(e) => set("evolutionUrl", e.target.value)} placeholder="https://evolution.seudominio.com" />
            </Field>
            <Field label="Chave da Evolution" hint="A tela testa a chave nova antes de salvar.">
              <input type="password" {...secretField("evolutionApiKey")} />
            </Field>
            <Field label="Nome da instância">
              <input value={config.instanceId} onChange={(e) => set("instanceId", e.target.value)} placeholder="minha-instancia" />
            </Field>
            <Field label="Endereço que a Evolution chama" hint="Cadastrado na Evolution com o evento messages.upsert. Toque para selecionar.">
              <input
                value={typeof window !== "undefined" ? `${window.location.origin}/api/webhook` : "/api/webhook"}
                readOnly
                style={{ color: "var(--text-muted)", cursor: "text" }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </Field>
            <a className="btn-ghost" href="/instances" style={{ fontSize: 13, display: "inline-block", padding: "8px 12px" }}>📡 Ver conexão do WhatsApp</a>

            <SubHead>🤖 Inteligência artificial</SubHead>
            <Field label="Provedor">
              <select value={config.aiProvider} onChange={(e) => set("aiProvider", e.target.value)}>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="google">Google Gemini</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </Field>

            {config.aiProvider === "openai" && (
              <>
                <Field label="Chave da OpenAI">
                  <input type="password" {...secretField("openaiApiKey")} />
                </Field>
                <Field label="Modelo">
                  <select value={config.openaiModel} onChange={(e) => set("openaiModel", e.target.value)}>
                    <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                    <option value="gpt-4.1">gpt-4.1</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                  </select>
                </Field>
              </>
            )}

            {config.aiProvider === "groq" && (
              <>
                <Field label="Chave da Groq">
                  <input type="password" {...secretField("groqApiKey")} />
                </Field>
                <Field label="Modelo">
                  <select value={config.groqModel} onChange={(e) => set("groqModel", e.target.value)}>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                    <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  </select>
                </Field>
              </>
            )}

            {config.aiProvider === "google" && (
              <>
                <Field label="Chave do Google AI" hint="Pegue em aistudio.google.com">
                  <input type="password" {...secretField("googleApiKey")} />
                </Field>
                <Field label="Modelo">
                  <select value={config.googleModel} onChange={(e) => set("googleModel", e.target.value)}>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (recomendado)</option>
                    <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (mais rápido)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  </select>
                </Field>
              </>
            )}

            {config.aiProvider === "openrouter" && (
              <>
                <Field label="Chave da OpenRouter" hint="Pegue em openrouter.ai/keys">
                  <input type="password" {...secretField("openrouterApiKey")} />
                </Field>
                <Field label="Modelo" hint="Nome do modelo na OpenRouter (ex: openai/gpt-4o-mini)">
                  <input list="openrouter-models" value={config.openrouterModel} onChange={(e) => set("openrouterModel", e.target.value)} placeholder="openai/gpt-4o-mini" />
                  <datalist id="openrouter-models">
                    <option value="openai/gpt-4o-mini" />
                    <option value="openai/gpt-4o" />
                    <option value="anthropic/claude-sonnet-4.5" />
                    <option value="google/gemini-2.0-flash-001" />
                    <option value="meta-llama/llama-3.3-70b-instruct" />
                  </datalist>
                </Field>
              </>
            )}
            <Field label="Mensagens lembradas" hint="Quantas mensagens recentes suas a IA lê junto para entender o contexto">
              <div style={{ maxWidth: 160 }}>{numero("historyLimit", 1, 50)}</div>
            </Field>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Os áudios são transcritos pela primeira chave que existir: Groq, OpenRouter ou OpenAI.
            </p>

            <SubHead>⏱️ Tempos de resposta</SubHead>
            <div className="cfg-grid">
              <Field label="Esperar antes de responder" hint="Segundos. Junta mensagens mandadas em sequência">
                {numero("debounceSeconds", 1, 60)}
              </Field>
              <Field label="“Digitando” por letra" hint="Milissegundos por letra da resposta">
                {numero("typingMsPerChar", 0, 200)}
              </Field>
              <Field label="“Digitando” no máximo" hint="Segundos">
                {numero("typingMaxSeconds", 1, 60)}
              </Field>
            </div>

            <SubHead>👥 Contatos e grupos</SubHead>
            <Toggle
              on={config.enabled}
              onChange={(v) => set("enabled", v)}
              label="Ler conversas de contatos e grupos"
              hint="Desligado, ela ignora contatos e grupos. A sua conversa com ela continua funcionando."
            />
            <a className="btn-ghost" href="/groups" style={{ fontSize: 13, display: "inline-block", padding: "8px 12px" }}>👥 Escolher grupos</a>
          </div>
        </details>
      </div>

      <div className="cfg-savebar">
        <div className="cfg-savebar-inner">
          <span role="status" style={{ fontSize: 13, flex: 1, minWidth: 0, color: saveError ? "var(--danger)" : "var(--success)" }}>
            {saveError ? `⚠️ ${saveError}` : saved ? "✅ Salvo!" : ""}
          </span>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: "10px 24px" }}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
