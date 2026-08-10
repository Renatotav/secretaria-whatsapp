"use client";
import { useState, useEffect } from "react";

interface Instance {
  name: string;
  connected: boolean;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/instances");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Erro ao carregar instâncias");
      setInstances([]);
    } else {
      setInstances(data.instances ?? []);
      setActiveInstanceId(data.activeInstanceId ?? "");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function useInstance(name: string) {
    setBusy(name);
    setMessage("");
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: name }),
    });
    setActiveInstanceId(name);
    setBusy(null);
    setMessage(`✅ "${name}" agora é a instância ativa`);
  }

  async function configureWebhook(name: string) {
    setBusy(name);
    setMessage("");
    const res = await fetch(`/api/instances/${encodeURIComponent(name)}/webhook`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    setMessage(res.ok ? `✅ Webhook configurado: ${data.webhookUrl}` : `❌ ${data.error}`);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>📡 Instâncias Evolution</h1>
          <button className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              color: "var(--danger)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-border)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {message}
          </div>
        )}

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {!loading && instances.length === 0 && !error && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
              Nenhuma instância encontrada
            </div>
          )}
          {instances.map((inst) => (
            <div
              key={inst.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: inst.connected ? "var(--success)" : "var(--text-dim)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600 }}>
                  {inst.name}
                  {inst.name === activeInstanceId && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)" }}>● em uso</span>
                  )}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {inst.connected ? "Conectada" : "Desconectada"}
                </p>
              </div>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => useInstance(inst.name)}
                disabled={busy === inst.name || inst.name === activeInstanceId}
              >
                Usar esta instância
              </button>
              <button
                className="btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => configureWebhook(inst.name)}
                disabled={busy === inst.name}
              >
                Configurar webhook
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
