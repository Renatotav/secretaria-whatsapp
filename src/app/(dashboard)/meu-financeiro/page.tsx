"use client";

import { useEffect, useState } from "react";

type Perfil = { versao?: number; categorias?: string[]; categoriasExtras?: Record<string, string[]>; dicas?: string[]; gastoAlto?: number; cartaoPrincipal?: string };
type Dados = { perfil: Perfil; efetivas: Record<string, string[]>; lista: Record<string, string[]>; pessoais: string[] };

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "grid", gap: 10 };
const muted: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)" };

// "Pets: Ração, Veterinário" por linha ↔ { Pets: ["Ração", "Veterinário"] }
const extrasParaTexto = (e: Record<string, string[]> = {}) => Object.entries(e).map(([c, s]) => `${c}: ${s.join(", ")}`).join("\n");
function textoParaExtras(t: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const linha of t.split("\n")) {
    const [cat, subs] = linha.split(":");
    const nome = cat?.trim();
    if (!nome) continue;
    const lista = (subs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    out[nome] = lista.length ? lista : ["Geral"];
  }
  return out;
}

/**
 * "Meu financeiro": o questionário da instalação em forma de tela. O que for
 * marcado aqui é o que a secretária usa para classificar os gastos dessa pessoa.
 */
export default function MeuFinanceiroPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [usa, setUsa] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState("");
  const [dicas, setDicas] = useState("");
  const [gastoAlto, setGastoAlto] = useState("");
  const [cartao, setCartao] = useState("");
  const [salvo, setSalvo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/perfil")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((x: Dados) => {
        setD(x);
        setUsa(new Set(Object.keys(x.efetivas).filter((c) => c in x.lista)));
        setExtras(extrasParaTexto(x.perfil.categoriasExtras));
        setDicas((x.perfil.dicas ?? []).join("\n"));
        setGastoAlto(String(x.perfil.gastoAlto ?? 500));
        setCartao(x.perfil.cartaoPrincipal ?? "");
      })
      .catch(() => setErro("Não consegui abrir. Atualize a página."));
  }, []);

  async function salvar() {
    setSalvando(true);
    setSalvo("");
    try {
      const r = await fetch("/api/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorias: [...usa],
          categoriasExtras: textoParaExtras(extras),
          dicas: dicas.split("\n").map((s) => s.trim()).filter(Boolean),
          gastoAlto: Number(gastoAlto.replace(",", ".")) || undefined,
          cartaoPrincipal: cartao.trim() || undefined,
        }),
      });
      if (!r.ok) throw new Error();
      setSalvo("Salvo. Vale a partir da próxima mensagem no WhatsApp.");
    } catch {
      setSalvo("Não salvou. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const alterna = (c: string) => setUsa((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 16px 32px", display: "grid", gap: 14 }}>
        <div>
          <h1>🧭 Meu financeiro</h1>
          <p style={muted}>Do seu jeito: o que você marcar aqui é o que a secretária usa para classificar seus gastos.</p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>{erro}</div>}
        {!d && !erro && <div style={muted}>Carregando...</div>}
        {d && (
          <>
            <section style={card}>
              <h2 style={{ fontSize: 16 }}>Categorias que você usa</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(d.lista).filter(([c]) => c !== "Outros").map(([c, subs]) => (
                  <label key={c} htmlFor={`cat-${c}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input id={`cat-${c}`} type="checkbox" checked={usa.has(c)} onChange={() => alterna(c)} style={{ marginTop: 4, width: "auto" }} />
                    <span>
                      <strong>{c}</strong>
                      <span style={{ ...muted, display: "block" }}>{subs.join(", ")}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p style={muted}>"Outros" fica sempre ligada, para o que não couber em nenhuma.</p>
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 16 }}>Categorias suas</h2>
              <label htmlFor="extras" style={muted}>Uma por linha: nome, dois-pontos e os tipos separados por vírgula.</label>
              <textarea id="extras" rows={4} value={extras} onChange={(e) => setExtras(e.target.value)} placeholder={"Pets: Ração, Veterinário\nFilhos: Escola, Roupas"} />
            </section>

            <section style={card}>
              <h2 style={{ fontSize: 16 }}>Palavras do seu jeito</h2>
              <label htmlFor="dicas" style={muted}>Uma por linha. Ajuda a secretária a entender como você chama as coisas.</label>
              <textarea id="dicas" rows={4} value={dicas} onChange={(e) => setDicas(e.target.value)} placeholder={"mercantil = Alimentação › Supermercado\npetshop = Pets › Ração"} />
            </section>

            <section style={{ ...card, gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))" }}>
              <label htmlFor="gasto-alto" style={{ display: "grid", gap: 6 }}>
                <strong>Confirmar gasto a partir de (R$)</strong>
                <input id="gasto-alto" inputMode="decimal" value={gastoAlto} onChange={(e) => setGastoAlto(e.target.value)} />
              </label>
              <label htmlFor="cartao" style={{ display: "grid", gap: 6 }}>
                <strong>Nome do seu cartão principal</strong>
                <input id="cartao" value={cartao} onChange={(e) => setCartao(e.target.value)} placeholder="ex.: Nubank" />
              </label>
            </section>

            <p style={muted}>Dia da fatura, melhor dia de compra, outros cartões e horários dos resumos ficam em Mais → Configurações.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
              {salvo && <span style={muted} role="status">{salvo}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
