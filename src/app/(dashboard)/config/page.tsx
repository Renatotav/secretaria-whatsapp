"use client";
import { useState, useEffect } from "react";

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
  mutedContacts: "",
  debounceSeconds: 8,
  typingMsPerChar: 35,
  typingMaxSeconds: 8,
  creditCardDueDay: 10,
  creditCardBestDay: 5,
};

/** Chave liga/desliga com o texto ao lado (mesmo visual da chave de áudio). */
function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
      <button
        type="button"
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
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>{hint}</p>
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

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig({ ...DEFAULT, ...data, ownerPhone: data.ownerPhone || "55" });
        setLoading(false);
      });
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
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

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>⚙️ Configurações</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {saved && (
              <span style={{ fontSize: 13, color: "var(--success)" }}>✅ Salvo!</span>
            )}
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar todas"}
            </button>
          </div>
        </div>

        {/* Meu Perfil */}
        <Section title="👤 Meu Perfil">
          <Field
            label="Meu número do WhatsApp"
            hint="Formato: 5585999999999 (com DDI e DDD, sem + ou espaços)"
          >
            <input
              value={config.ownerPhone}
              onChange={(e) => set("ownerPhone", e.target.value)}
              placeholder="5585999999999"
            />
          </Field>
          <Field label="Meu nome" hint="Usado pela IA e para achar o SEU cartão na fatura (ex: separar do cartão do titular)">
            <input
              value={config.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              placeholder="Renato"
            />
          </Field>
          <Field label="Meu cargo" hint="Ex: Operador de Atendimento PJe">
            <input
              value={config.ownerRole}
              onChange={(e) => set("ownerRole", e.target.value)}
              placeholder="Supervisor de Atendimento"
            />
          </Field>
        </Section>

        {/* Financeiro */}
        <Section title="💳 Financeiro">
          <Field label="Dia do vencimento do cartão" hint="O vencimento das parcelas de cartão será alocado automaticamente para este dia">
            <input
              type="number"
              min={1}
              max={31}
              value={config.creditCardDueDay}
              onChange={(e) => set("creditCardDueDay", Number(e.target.value))}
            />
          </Field>
          <Field label="Melhor dia de compra no cartão" hint="Compras a partir deste dia caem na fatura do mês seguinte (ex: 5 → compra em 05/10 vence em 10/11)">
            <input
              type="number"
              min={1}
              max={31}
              value={config.creditCardBestDay}
              onChange={(e) => set("creditCardBestDay", Number(e.target.value))}
            />
          </Field>
        </Section>

        {/* Agendamento */}
        <Section title="⏰ Agendamento Automático">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Horário do resumo do dia" hint="Gastos, tetos, previsão e o que vence amanhã, com gráfico">
              <input
                type="time"
                value={config.summaryTime}
                onChange={(e) => set("summaryTime", e.target.value)}
              />
            </Field>
            <Field label="Horário do relatório semanal" hint="Todo domingo, com gráficos">
              <input
                type="time"
                value={config.weeklyTime}
                onChange={(e) => set("weeklyTime", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* Conversas e privacidade */}
        <Section title="💬 Conversas e privacidade">
          <Toggle
            on={config.detectCommitments}
            onChange={(v) => set("detectCommitments", v)}
            label="Compromissos das conversas → agenda"
            hint="A IA lê as conversas privadas só para achar compromissos combinados e pergunta se coloca na agenda."
          />
          <Toggle
            on={config.privateBriefings}
            onChange={(v) => set("privateBriefings", v)}
            label="Resumo de cada mensagem recebida"
            hint="Avisa no WhatsApp um resumo de toda mensagem privada (desligado: era muito aviso sem utilidade)."
          />
          <Field label="Contatos silenciados" hint='Nunca passam pela IA. No WhatsApp: "silencia fulano" / "volta a ouvir fulano".'>
            {config.mutedContacts.split(",").filter((p) => p.trim()).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {config.mutedContacts.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
                  <span key={p} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 12, background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                    {contactNames[p] || p}
                    <button
                      type="button"
                      onClick={() => set("mutedContacts", config.mutedContacts.split(",").map((x) => x.trim()).filter((x) => x && x !== p).join(","))}
                      style={{ marginLeft: 6, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                      title="Voltar a ouvir"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
        </Section>

        {/* Evolution API */}
        {/* Telas que saíram do menu, mas continuam disponíveis */}
        <Section title="🔗 Outras telas">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a className="btn-ghost" href="/instances" style={{ fontSize: 13, padding: "6px 12px" }}>📡 Conexão do WhatsApp (instâncias)</a>
            <a className="btn-ghost" href="/groups" style={{ fontSize: 13, padding: "6px 12px" }}>👥 Gerenciar grupos</a>
            <a className="btn-ghost" href="/briefings" style={{ fontSize: 13, padding: "6px 12px" }}>👤 Resumos de contatos (antigos)</a>
          </div>
        </Section>

        <Section title="📱 Evolution API (WhatsApp)">
          <Field label="URL da Evolution API" hint="Ex: https://evolution.seudominio.com">
            <input
              value={config.evolutionUrl}
              onChange={(e) => set("evolutionUrl", e.target.value)}
              placeholder="https://evolution.seudominio.com"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={config.evolutionApiKey}
              onChange={(e) => set("evolutionApiKey", e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Field label="Instance ID">
            <input
              value={config.instanceId}
              onChange={(e) => set("instanceId", e.target.value)}
              placeholder="minha-instancia"
            />
          </Field>
          <Field label="URL do Webhook" hint="Configure este endereço na Evolution API com evento messages.upsert">
            <input
              value={typeof window !== "undefined" ? `${window.location.origin}/api/webhook` : "/api/webhook"}
              readOnly
              style={{ opacity: 0.7, cursor: "text" }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
          </Field>
        </Section>

        {/* IA Provider */}
        <Section title="🤖 Provedor de IA">
          <Field label="Provedor">
            <select
              value={config.aiProvider}
              onChange={(e) => set("aiProvider", e.target.value)}
            >
              <option value="openai">OpenAI</option>
              <option value="groq">Groq</option>
              <option value="google">Google Gemini</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </Field>

          {config.aiProvider === "openai" && (
            <>
              <Field label="OpenAI API Key">
                <input
                  type="password"
                  value={config.openaiApiKey}
                  onChange={(e) => set("openaiApiKey", e.target.value)}
                  placeholder="sk-..."
                />
              </Field>
              <Field label="Modelo OpenAI">
                <select
                  value={config.openaiModel}
                  onChange={(e) => set("openaiModel", e.target.value)}
                >
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
              <Field label="Groq API Key">
                <input
                  type="password"
                  value={config.groqApiKey}
                  onChange={(e) => set("groqApiKey", e.target.value)}
                  placeholder="gsk_..."
                />
              </Field>
              <Field label="Modelo Groq">
                <select
                  value={config.groqModel}
                  onChange={(e) => set("groqModel", e.target.value)}
                >
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                </select>
              </Field>
            </>
          )}

          {config.aiProvider === "google" && (
            <>
              <Field label="Google AI API Key" hint="Obtenha em aistudio.google.com">
                <input
                  type="password"
                  value={config.googleApiKey}
                  onChange={(e) => set("googleApiKey", e.target.value)}
                  placeholder="AIza..."
                />
              </Field>
              <Field label="Modelo Gemini">
                <select
                  value={config.googleModel}
                  onChange={(e) => set("googleModel", e.target.value)}
                >
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
              <Field label="OpenRouter API Key" hint="Obtenha em openrouter.ai/keys">
                <input
                  type="password"
                  value={config.openrouterApiKey}
                  onChange={(e) => set("openrouterApiKey", e.target.value)}
                  placeholder="sk-or-v1-..."
                />
              </Field>
              <Field label="Modelo" hint="Slug do modelo no OpenRouter, ex: openai/gpt-4o-mini">
                <input
                  list="openrouter-models"
                  value={config.openrouterModel}
                  onChange={(e) => set("openrouterModel", e.target.value)}
                  placeholder="openai/gpt-4o-mini"
                />
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
        </Section>

        {/* Assistente */}
        <Section title="🧠 Personalidade e instruções">
          <Field
            label="Instruções personalizadas"
            hint="Some às regras da secretária (agenda, financeiro, diário, análise de grupos e contatos). Ex: tom de voz, categorias de gasto que você usa, o que considerar urgente. Deixe em branco para usar só o comportamento padrão."
          >
            <textarea
              value={config.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              rows={4}
              placeholder="Ex: Seja bem direta e objetiva. Trate qualquer gasto acima de R$500 como prioridade alta no resumo mensal."
            />
          </Field>
          <Field label="Histórico (mensagens)" hint="Quantas mensagens recentes do canal pessoal entram no contexto da IA">
            <input
              type="number"
              min={1}
              max={50}
              value={config.historyLimit}
              onChange={(e) => set("historyLimit", Number(e.target.value))}
              style={{ maxWidth: 160 }}
            />
          </Field>
        </Section>

        {/* Áudio e Digitação */}
        <Section title="🎙️ Áudio e Digitação">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => set("audioEnabled", !config.audioEnabled)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: config.audioEnabled ? "var(--accent)" : "var(--border)",
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
                  left: config.audioEnabled ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {config.audioEnabled ? "Escutar áudios (transcrever automaticamente)" : "Áudios ignorados"}
            </span>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 16 }}>
            A transcrição usa, nessa ordem, a primeira chave configurada na seção de Provedor de IA acima: Groq (whisper-large-v3), OpenRouter (openai/whisper-1) ou OpenAI (whisper-1).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Debounce (segundos)" hint="Espera antes de processar mensagens quebradas">
              <input
                type="number"
                min={1}
                max={60}
                value={config.debounceSeconds}
                onChange={(e) => set("debounceSeconds", Number(e.target.value))}
              />
            </Field>
            <Field label="Digitação (ms/caractere)" hint="Tempo de 'digitando' por caractere da resposta">
              <input
                type="number"
                min={0}
                max={200}
                value={config.typingMsPerChar}
                onChange={(e) => set("typingMsPerChar", Number(e.target.value))}
              />
            </Field>
            <Field label="Teto de digitação (segundos)" hint="Tempo máximo de 'digitando'">
              <input
                type="number"
                min={1}
                max={60}
                value={config.typingMaxSeconds}
                onChange={(e) => set("typingMaxSeconds", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>

        {/* Segurança */}
        <Section title="🔒 Segurança">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button
              onClick={() => set("enabled", !config.enabled)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: config.enabled ? "var(--accent)" : "var(--border)",
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
                  left: config.enabled ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {config.enabled ? "Agente ativo" : "Agente inativo"}
            </span>
          </div>
          <Field
            label="Números autorizados"
            hint="Deixe vazio para aceitar qualquer número. Separe com vírgulas: 5585999999999,5585888888888"
          >
            <input
              value={config.allowedPhones}
              onChange={(e) => set("allowedPhones", e.target.value)}
              placeholder="5585999999999,5585888888888"
            />
          </Field>
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: "10px 24px" }}>
            {saving ? "Salvando..." : "Salvar todas as configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
