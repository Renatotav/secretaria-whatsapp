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
  ownerPhone: string;
  ownerName: string;
  ownerRole: string;
  summaryTime: string;
  weeklyTime: string;
  reminderHours: number;
}

const DEFAULT: Config = {
  name: "Secretária Eletrônica",
  systemPrompt: "Você é um assistente prestativo e amigável.",
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
  ownerPhone: "",
  ownerName: "",
  ownerRole: "",
  summaryTime: "18:00",
  weeklyTime: "20:00",
  reminderHours: 3,
};

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig({ ...DEFAULT, ...data });
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
          <Field label="Meu nome nos grupos" hint="Como você aparece nos grupos (para a IA reconhecer menções)">
            <input
              value={config.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              placeholder="Renato"
            />
          </Field>
          <Field label="Meu cargo" hint="Ex: Supervisor de Atendimento PJe">
            <input
              value={config.ownerRole}
              onChange={(e) => set("ownerRole", e.target.value)}
              placeholder="Supervisor de Atendimento"
            />
          </Field>
        </Section>

        {/* Agendamento */}
        <Section title="⏰ Agendamento Automático">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Horário do resumo diário" hint="Resumo enviado uma vez por dia">
              <input
                type="time"
                value={config.summaryTime}
                onChange={(e) => set("summaryTime", e.target.value)}
              />
            </Field>
            <Field label="Horário do relatório semanal" hint="Todo domingo">
              <input
                type="time"
                value={config.weeklyTime}
                onChange={(e) => set("weeklyTime", e.target.value)}
              />
            </Field>
            <Field label="Lembrar após (horas)" hint="Horas sem resposta para lembrar tarefa">
              <input
                type="number"
                min={1}
                max={24}
                value={config.reminderHours}
                onChange={(e) => set("reminderHours", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>

        {/* Evolution API */}
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
        </Section>

        {/* Assistente */}
        <Section title="💬 Assistente (Chat de Teste)">
          <Field label="Nome do assistente">
            <input
              value={config.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="System prompt">
            <textarea
              value={config.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              rows={4}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Temperature">
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={config.temperature}
                onChange={(e) => set("temperature", Number(e.target.value))}
              />
            </Field>
            <Field label="Max tokens">
              <input
                type="number"
                min={64}
                max={8192}
                value={config.maxTokens}
                onChange={(e) => set("maxTokens", Number(e.target.value))}
              />
            </Field>
            <Field label="Histórico (mensagens)">
              <input
                type="number"
                min={1}
                max={50}
                value={config.historyLimit}
                onChange={(e) => set("historyLimit", Number(e.target.value))}
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
