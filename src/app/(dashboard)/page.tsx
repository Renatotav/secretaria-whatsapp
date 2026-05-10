"use client";
import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: input }),
      });
      const data = await res.json();
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { ...data.message, id: data.message.id }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: "Erro ao conectar.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>💬</span>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>Chat de Teste</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Teste o comportamento da IA antes de conectar ao WhatsApp
          </p>
        </div>
        {conversationId && (
          <button
            className="btn-ghost"
            style={{ marginLeft: "auto", fontSize: 12 }}
            onClick={() => { setMessages([]); setConversationId(null); }}
          >
            Nova conversa
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 40 }}>🤖</span>
            <p style={{ fontSize: 14 }}>Envie uma mensagem para testar o assistente</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: "70%",
                padding: "10px 14px",
                borderRadius: 12,
                background:
                  msg.role === "user"
                    ? "var(--accent-dim)"
                    : "var(--bg-card)",
                border: "1px solid",
                borderColor:
                  msg.role === "user"
                    ? "var(--accent-border)"
                    : "var(--border)",
                color: "var(--text)",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              Digitando...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 10,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua mensagem..."
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !input.trim()}
          style={{ flexShrink: 0 }}
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
