"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "@/lib/use-width";

type Item = { exercicio: string; series: number; repMin: number; repMax: number; descanso: number; segundos?: number | null };
type Feita = { id: string; kg: number | null; reps: number | null; segundos: number | null; rir: number | null };
type ItemSessao = Item & {
  grupo: string;
  sugestao: { kg: number | null; reps: number; motivo: string };
  ultima: { dia: string; sets: { kg: number | null; reps: number | null; segundos: number | null }[] } | null;
  recorde: number | null;
  feitas: Feita[];
};
type Rotina = { id: string; nome: string; dia: number | null; itens: Item[] };
type Lib = { nome: string; grupo: string; equip: string; tempo: boolean };
type Evol = { nome: string; grupo: string; vezes: number; recorde: number | null; ultimo: string | null; pontos: { dia: string; rm: number; volume: number }[] };
type Dados = {
  hoje: string;
  biblioteca: Lib[];
  rotinas: Rotina[];
  rotinaHoje: { id: string; nome: string } | null;
  sessaoId: string | null;
  sessao: ItemSessao[];
  stats: { dias: string[]; seriesGrupo: Record<string, number>; faixa: [number, number]; evolucao: Evol[] };
};

// Cor de cada grupo muscular (só no selo do exercício).
const COR_GRUPO: Record<string, string> = { Peito: "#f87171", Costas: "#60a5fa", Pernas: "#4ade80", "Glúteos": "#f472b6", Ombros: "#fbbf24", "Bíceps": "#a78bfa", "Tríceps": "#c084fc", "Abdômen": "#2dd4bf", Panturrilha: "#86efac", "Antebraço": "#fdba74", Cardio: "#38bdf8" };
const Selo = ({ g }: { g: string }) => (
  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", padding: "2px 8px", borderRadius: 999, color: COR_GRUPO[g] ?? "var(--text-muted)", background: "color-mix(in srgb, currentColor 14%, transparent)", border: "1px solid color-mix(in srgb, currentColor 35%, transparent)" }}>{g}</span>
);
const COLS = "26px minmax(0, 96px) minmax(0, 96px) 48px";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const dia = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
// gridTemplateColumns minmax(0,1fr): o gráfico mede a largura do cartão em vez de esticá-lo (estourava a tela no celular).
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const input: React.CSSProperties = { width: "100%", minWidth: 0, padding: "10px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", font: "inherit", fontSize: 16, textAlign: "center", fontVariantNumeric: "tabular-nums" };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", font: "inherit" };
const btn2: React.CSSProperties = { ...btn, background: "var(--bg-hover)", color: "var(--text)", border: "1px solid var(--border)" };

async function post(body: object) {
  const r = await fetch("/api/treino", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Não deu certo.");
  return j;
}

/**
 * Aba Treino (24/11/2026): treino guiado do dia (cargas sugeridas, ✓ por série, descanso que vibra,
 * recorde na hora), rotinas da semana e evolução. Feita para o celular, dentro da academia.
 */
export default function TreinoPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState<"hoje" | "rotinas" | "evolucao">("hoje");
  const [rotinaSel, setRotinaSel] = useState<string | null>(null);

  const carregar = useCallback((rot?: string | null) => {
    fetch(`/api/treino${rot ? `?rotina=${encodeURIComponent(rot)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Dados) => setD(j))
      .catch(() => setErro(true));
  }, []);
  useEffect(() => carregar(rotinaSel), [carregar, rotinaSel]);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, paddingBottom: 140, maxWidth: 1180, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🏋️ Treino</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Marque cada série com ✓. Também vale pelo WhatsApp: <em>supino 3x10 40kg</em>.</p>
        </div>
        <div role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4 }}>
          {([["hoje", "Hoje"], ["rotinas", "Rotinas"], ["evolucao", "Evolução"]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={aba === k} type="button" onClick={() => setAba(k)}
              style={{ padding: "9px 6px", borderRadius: 9, border: "none", cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: 14, background: aba === k ? "var(--accent)" : "transparent", color: aba === k ? "#fff" : "var(--text-muted)" }}>
              {t}
            </button>
          ))}
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d && aba === "hoje" && <Hoje d={d} rotinaSel={rotinaSel} setRotinaSel={setRotinaSel} recarregar={() => carregar(rotinaSel)} irRotinas={() => setAba("rotinas")} />}
        {d && aba === "rotinas" && <Rotinas d={d} recarregar={() => carregar(rotinaSel)} />}
        {d && aba === "evolucao" && <Evolucao d={d} />}
      </div>
    </div>
  );
}

/* ───────────────────────────── Hoje: treino guiado ───────────────────────────── */

function Hoje({ d, rotinaSel, setRotinaSel, recarregar, irRotinas }: { d: Dados; rotinaSel: string | null; setRotinaSel: (v: string | null) => void; recarregar: () => void; irRotinas: () => void }) {
  const [sessaoId, setSessaoId] = useState<string | null>(d.sessaoId);
  const [extras, setExtras] = useState<ItemSessao[]>([]);
  const [descanso, setDescanso] = useState<{ fim: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ series: number; volume: number; minutos: number; exercicios: number; recordes: string[] } | null>(null);
  useEffect(() => setSessaoId(d.sessaoId), [d.sessaoId]);

  // Tela acesa durante o treino (quando o celular deixa).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch { /* sem permissão: segue normal */ }
    };
    if (sessaoId) pedir();
    const vis = () => sessaoId && pedir();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, [sessaoId]);

  const itens = [...d.sessao, ...extras.filter((e) => !d.sessao.some((s) => s.exercicio === e.exercicio))];
  const feitasTotal = itens.reduce((t, i) => t + i.feitas.length, 0);
  const planejadas = itens.reduce((t, i) => t + Math.max(i.series, i.feitas.length), 0);

  const marcar = async (item: ItemSessao, ordem: number, kg: string, reps: string) => {
    try {
      const r = await post({ acao: "serie", sessaoId, exercicio: item.exercicio, ordem, kg: kg === "" ? null : Number(kg.replace(",", ".")), reps: item.segundos != null ? null : reps === "" ? null : Number(reps), segundos: item.segundos != null ? Number(reps) || item.segundos : null });
      setSessaoId(r.sessaoId);
      if (r.recorde) { setAviso(`🏆 Recorde no ${item.exercicio}! Força ~${n(r.rm, 1)} kg`); navigator.vibrate?.([80, 60, 80, 60, 200]); }
      setDescanso({ fim: Date.now() + item.descanso * 1000, total: item.descanso });
      recarregar();
    } catch (e) { setAviso(`❌ ${(e as Error).message}`); }
  };

  return (
    <>
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{d.rotinaHoje ? d.rotinaHoje.nome : "Treino livre"}</strong>
          <span style={muted}>{DIAS[new Date(d.hoje + "T12:00:00").getDay()]}, {dia(d.hoje)}</span>
        </div>
        {planejadas > 0 && (
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              <span><strong style={{ fontSize: 16 }}>{feitasTotal}</strong> de {planejadas} séries</span>
              <span style={muted}>{itens.filter((i) => i.feitas.length >= i.series).length} de {itens.length} exercícios</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--bg-hover)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(1, feitasTotal / planejadas) * 100}%`, height: "100%", borderRadius: 4, background: feitasTotal >= planejadas ? "var(--success)" : "var(--accent)", transition: "width .6s cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </div>
          </div>
        )}
        {d.rotinas.length > 0 ? (
          <select value={rotinaSel ?? d.rotinaHoje?.id ?? ""} onChange={(e) => setRotinaSel(e.target.value || null)} style={{ ...input, textAlign: "left" }} aria-label="Rotina de hoje">
            <option value="">Treino livre (sem rotina)</option>
            {d.rotinas.map((r) => <option key={r.id} value={r.id}>{r.dia != null ? `${DIAS[r.dia]} · ` : ""}{r.nome}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 14 }}>Ainda sem rotina. <button type="button" style={{ ...btn2, padding: "6px 10px" }} onClick={irRotinas}>Montar minhas rotinas</button> ou adicione exercícios abaixo.</div>
        )}
      </div>

      {aviso && <div role="status" style={{ ...card, borderColor: "var(--accent-border)", fontWeight: 600 }} onClick={() => setAviso(null)}>{aviso}</div>}
      {resumo && (
        <div style={{ ...card, borderColor: "var(--success)", display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 17 }}>✅ Treino finalizado</strong>
          <span>{resumo.exercicios} exercício(s) · {resumo.series} séries · {n(resumo.volume)} kg levantados · ~{resumo.minutos} min</span>
          {resumo.recordes.length > 0 && <span>🏆 Recorde em: {resumo.recordes.join(", ")}</span>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))", gap: 12 }}>
        {itens.map((item, i) => <CartaoExercicio key={item.exercicio} item={item} marcar={marcar} recarregar={recarregar} atraso={i * 60} />)}
      </div>

      <AdicionarExercicio biblioteca={d.biblioteca} onAdd={(lib) => setExtras((x) => [...x, { exercicio: lib.nome, grupo: lib.grupo, series: 3, repMin: 8, repMax: 12, descanso: 90, segundos: lib.tempo ? 30 : null, sugestao: { kg: null, reps: 10, motivo: "novo hoje" }, ultima: null, recorde: null, feitas: [] }])} />

      {sessaoId && feitasTotal > 0 && !resumo && (
        <button type="button" style={{ ...btn, padding: "14px", fontSize: 16 }} onClick={async () => { const r = await post({ acao: "finalizar", sessaoId }); setResumo(r.resumo); setDescanso(null); }}>
          Finalizar treino
        </button>
      )}

      {descanso && <Descanso fim={descanso.fim} total={descanso.total} onFim={() => setDescanso(null)} onMais={() => setDescanso((x) => (x ? { ...x, fim: x.fim + 15_000, total: x.total + 15 } : x))} />}
    </>
  );
}

function CartaoExercicio({ item, marcar, recarregar, atraso = 0 }: { item: ItemSessao; marcar: (i: ItemSessao, ordem: number, kg: string, reps: string) => Promise<void>; recarregar: () => void; atraso?: number }) {
  const tempo = item.segundos != null;
  const [extra, setExtra] = useState(0);
  const linhas = Math.max(item.series + extra, item.feitas.length + (item.feitas.length >= item.series + extra ? 0 : 0));
  const ultimaFeita = item.feitas.at(-1);
  const kgPadrao = ultimaFeita?.kg ?? item.sugestao.kg ?? null;
  const repsPadrao = tempo ? (ultimaFeita?.segundos ?? item.segundos ?? 30) : (ultimaFeita?.reps ?? item.sugestao.reps);
  const completo = item.feitas.length >= item.series;
  return (
    <div className="surge" style={{ ...card, display: "grid", gap: 10, alignContent: "start", borderColor: completo ? "var(--success)" : "var(--border)", animationDelay: `${atraso}ms` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 17, lineHeight: 1.25 }}>{completo ? "✅ " : ""}{item.exercicio}</strong>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Selo g={item.grupo} />
            <span style={muted}>{item.series}×{tempo ? `${item.segundos}s` : `${item.repMin}–${item.repMax}`} · descanso {item.descanso}s</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <strong style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{item.feitas.length}/{item.series}</strong>
          {item.recorde != null && <div style={{ ...muted, whiteSpace: "nowrap" }} title="Força: carga máxima estimada para 1 repetição">🏆 {n(item.recorde)} kg</div>}
        </div>
      </div>
      {!tempo && (
        <div style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, background: "var(--accent-dim)" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Hoje </span><strong style={{ fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{item.sugestao.kg != null ? `${n(item.sugestao.kg, 1)} kg × ${item.sugestao.reps}` : `${item.sugestao.reps} repetições`}</strong>
          <span style={{ color: "var(--text-muted)" }}> · {item.sugestao.motivo}</span>
          {item.ultima && <div style={muted}>Última ({dia(item.ultima.dia)}): {item.ultima.sets.map((s) => `${s.kg != null ? n(s.kg, 1) : "—"}×${s.reps ?? "—"}`).join(" · ")}</div>}
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, ...muted }}>
          <span>Série</span><span style={{ textAlign: "center" }}>kg</span><span style={{ textAlign: "center" }}>{tempo ? "segundos" : "repetições"}</span><span />
        </div>
        {Array.from({ length: Math.max(linhas, item.feitas.length) }, (_, i) => {
          const f = item.feitas[i];
          return f ? (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center" }}>
              <span style={{ fontWeight: 700 }}>{i + 1}</span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{f.kg != null ? n(f.kg, 1) : "—"}</span>
              <span style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{tempo ? `${f.segundos}s` : f.reps}</span>
              <button type="button" aria-label="Desfazer série" title="Desfazer" className="acende" style={{ ...btn, background: "var(--success)", padding: "10px 0" }}
                onClick={async () => { await post({ acao: "apagarSerie", id: f.id }); recarregar(); }}>✓</button>
            </div>
          ) : null;
        }).flatMap((el, i) => {
          const f = item.feitas[i];
          // Logo depois da última série feita: "Como foi?" (vira o RIR e ajuda a decidir quando subir a carga).
          const pergunta = f && i === item.feitas.length - 1 && f.rir == null && !tempo ? (
            <div key={`rir${f.id}`} className="surge" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 13, paddingLeft: 32 }}>
              <span style={muted}>Como foi?</span>
              {([["fácil", 3], ["ok", 1], ["no limite", 0]] as const).map(([t, v]) => (
                <button key={t} type="button" onClick={async () => { await post({ acao: "rir", id: f.id, rir: v }); recarregar(); }}
                  style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: "pointer", font: "inherit", fontSize: 13 }}>{t}</button>
              ))}
            </div>
          ) : f && f.rir != null && !tempo ? <span key={`rv${f.id}`} style={{ ...muted, paddingLeft: 32 }}>{f.rir >= 3 ? "😌 fácil" : f.rir >= 1 ? "👍 ok" : "🔥 no limite"}</span> : null;
          return [el, pergunta];
        })}
        {Array.from({ length: Math.max(linhas, item.feitas.length) }, (_, i) => {
          if (i < item.feitas.length) return null;
          return i === item.feitas.length ? (
            <LinhaNova key={`n${i}`} n={i + 1} kg={kgPadrao} reps={repsPadrao} tempo={tempo} onOk={(kg, reps) => marcar(item, i + 1, kg, reps)} />
          ) : (
            <div key={`p${i}`} style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center", ...muted }}>
              <span>{i + 1}</span>
              <span style={{ height: 40, borderRadius: 8, border: "1px dashed var(--border)" }} />
              <span style={{ height: 40, borderRadius: 8, border: "1px dashed var(--border)" }} />
              <span />
            </div>
          );
        })}
      </div>
      <button type="button" style={{ ...btn2, padding: "6px 10px", justifySelf: "start", fontSize: 13 }} onClick={() => setExtra((x) => x + 1)}>+ série</button>
    </div>
  );
}

function LinhaNova({ n: num, kg, reps, tempo, onOk }: { n: number; kg: number | null; reps: number; tempo: boolean; onOk: (kg: string, reps: string) => void }) {
  const [k, setK] = useState(kg != null ? String(kg).replace(".", ",") : "");
  const [r, setR] = useState(String(reps));
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setK(kg != null ? String(kg).replace(".", ",") : ""); setR(String(reps)); }, [kg, reps]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center" }}>
      <span style={{ fontWeight: 700 }}>{num}</span>
      <input style={input} inputMode="decimal" value={k} onChange={(e) => setK(e.target.value)} placeholder="kg" aria-label={`Carga da série ${num}`} />
      <input style={input} inputMode="numeric" value={r} onChange={(e) => setR(e.target.value)} aria-label={tempo ? `Segundos da série ${num}` : `Repetições da série ${num}`} />
      <button type="button" disabled={ocupado} aria-label={`Marcar série ${num}`} style={{ ...btn2, padding: "10px 0", fontSize: 18 }}
        onClick={async () => { setOcupado(true); await onOk(k, r); setOcupado(false); }}>✓</button>
    </div>
  );
}

/** Descanso: barra presa embaixo, vibra e apita no fim. */
function Descanso({ fim, total, onFim, onMais }: { fim: number; total: number; onFim: () => void; onMais: () => void }) {
  const [agora, setAgora] = useState(Date.now());
  const avisou = useRef(false);
  useEffect(() => {
    avisou.current = false;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [fim]);
  const resta = Math.max(0, Math.ceil((fim - agora) / 1000));
  useEffect(() => {
    if (resta > 0 || avisou.current) return;
    avisou.current = true;
    navigator.vibrate?.([300, 120, 300, 120, 300]);
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + 0.4);
    } catch { /* sem som */ }
  }, [resta]);
  const pct = Math.max(0, Math.min(1, (fim - agora) / (total * 1000)));
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", padding: "0 12px", zIndex: 20 }}>
      <div style={{ maxWidth: 620, margin: "0 auto", ...card, borderColor: resta === 0 ? "var(--success)" : "var(--accent-border)", display: "grid", gap: 8, boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong className={resta === 0 ? "acende" : undefined} style={{ fontSize: resta === 0 ? 20 : 30, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", color: resta === 0 ? "var(--success)" : "var(--text)" }}>{resta === 0 ? "Bora, próxima série! 💪" : <>{Math.floor(resta / 60)}:{String(resta % 60).padStart(2, "0")}<span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-muted)", marginLeft: 6 }}>descanso</span></>}</strong>
          <div style={{ display: "flex", gap: 6 }}>
            {resta > 0 && <button type="button" style={{ ...btn2, padding: "6px 10px" }} onClick={onMais}>+15s</button>}
            <button type="button" style={{ ...btn2, padding: "6px 10px" }} onClick={onFim}>{resta > 0 ? "Pular" : "Fechar"}</button>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "var(--bg-hover)", overflow: "hidden" }}>
          <div style={{ width: `${pct * 100}%`, height: "100%", background: "var(--accent)", transition: "width .25s linear" }} />
        </div>
      </div>
    </div>
  );
}

function AdicionarExercicio({ biblioteca, onAdd, rotulo = "+ Adicionar exercício" }: { biblioteca: Lib[]; onAdd: (l: Lib) => void; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("");
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const achados = useMemo(() => biblioteca.filter((e) => (!grupo || e.grupo === grupo) && (!q || fold(e.nome).includes(fold(q)))).slice(0, 40), [biblioteca, q, grupo]);
  const grupos = [...new Set(biblioteca.map((e) => e.grupo))];
  if (!aberto) return <button type="button" style={{ ...btn2, padding: "12px" }} onClick={() => setAberto(true)}>{rotulo}</button>;
  return (
    <div style={{ ...card, display: "grid", gap: 8 }}>
      <input style={{ ...input, textAlign: "left" }} placeholder="Buscar: supino, leg, rosca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {grupos.map((g) => (
          <button key={g} type="button" onClick={() => setGrupo(grupo === g ? "" : g)} style={{ fontSize: 12, padding: "4px 9px", borderRadius: 999, cursor: "pointer", font: "inherit", border: "1px solid var(--border)", background: grupo === g ? "var(--accent)" : "transparent", color: grupo === g ? "#fff" : "var(--text-muted)" }}>{g}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 4, maxHeight: 300, overflowY: "auto" }}>
        {achados.map((e) => (
          <button key={e.nome} type="button" onClick={() => { onAdd(e); setAberto(false); setQ(""); }}
            style={{ textAlign: "left", padding: "9px 10px", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg)", color: "var(--text)", cursor: "pointer", font: "inherit" }}>
            {e.nome} <span style={muted}>· {e.grupo} · {e.equip}</span>
          </button>
        ))}
        {!achados.length && <span style={muted}>Não achei. Crie em Rotinas › Criar exercício.</span>}
      </div>
      <button type="button" style={{ ...btn2, padding: "6px 10px", justifySelf: "start" }} onClick={() => setAberto(false)}>Fechar</button>
    </div>
  );
}

/* ───────────────────────────── Rotinas ───────────────────────────── */

const grupoLib = (nome: string, lib: Lib[]) => lib.find((e) => e.nome === nome)?.grupo ?? "Outros";

function Rotinas({ d, recarregar }: { d: Dados; recarregar: () => void }) {
  const [edit, setEdit] = useState<Rotina | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (edit) return <EditorRotina r={edit} biblioteca={d.biblioteca} fechar={(m) => { setEdit(null); if (m) setMsg(m); recarregar(); }} />;
  return (
    <>
      {msg && <div role="status" style={{ ...card, borderColor: "var(--success)" }}>{msg}</div>}
      {d.rotinas.map((r) => (
        <button key={r.id} type="button" onClick={() => setEdit(r)} className="surge" style={{ ...card, textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{r.nome}</strong>
            <span style={{ fontSize: 13, fontWeight: 600, color: r.dia === new Date(d.hoje + "T12:00:00").getDay() ? "var(--accent)" : "var(--text-muted)" }}>{r.dia != null ? DIAS[r.dia] : "livre"}{r.dia === new Date(d.hoje + "T12:00:00").getDay() ? " · hoje" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[...new Set(r.itens.map((i) => grupoLib(i.exercicio, d.biblioteca)))].map((g) => <Selo key={g} g={g} />)}<span style={muted}>{r.itens.length} exercício(s)</span></div>
          <span style={muted}>{r.itens.map((i) => i.exercicio).join(" · ")}</span>
        </button>
      ))}
      {!d.rotinas.length && <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Monte uma rotina para cada dia de treino (ex.: Segunda · Peito e tríceps). No dia, ela abre sozinha na aba Hoje com as cargas sugeridas.</p>}
      <button type="button" style={{ ...btn, padding: 12 }} onClick={() => setEdit({ id: "", nome: "", dia: null, itens: [] })}>+ Nova rotina</button>
      <CriarExercicio onOk={(m) => { setMsg(m); recarregar(); }} />
    </>
  );
}

function EditorRotina({ r, biblioteca, fechar }: { r: Rotina; biblioteca: Lib[]; fechar: (msg?: string) => void }) {
  const [nome, setNome] = useState(r.nome);
  const [diaSem, setDiaSem] = useState<string>(r.dia != null ? String(r.dia) : "");
  const [itens, setItens] = useState<Item[]>(r.itens);
  const [erro, setErro] = useState<string | null>(null);
  const muda = (i: number, campo: keyof Item, v: string) => setItens((xs) => xs.map((x, k) => (k === i ? { ...x, [campo]: Number(v) || 0 } : x)));
  const num = (v: number | null | undefined, campo: keyof Item, i: number, rot: string) => (
    <label style={{ display: "grid", gap: 2, ...muted }}>{rot}<input style={{ ...input, padding: "8px 4px" }} inputMode="numeric" value={v ?? ""} onChange={(e) => muda(i, campo, e.target.value)} /></label>
  );
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...card, display: "grid", gap: 8 }}>
        <input style={{ ...input, textAlign: "left" }} placeholder="Nome (ex.: Peito e tríceps)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <select style={{ ...input, textAlign: "left" }} value={diaSem} onChange={(e) => setDiaSem(e.target.value)} aria-label="Dia da semana">
          <option value="">Sem dia fixo</option>
          {DIAS.map((dd, i) => <option key={dd} value={i}>{dd}</option>)}
        </select>
      </div>
      {itens.map((it, i) => (
        <div key={`${it.exercicio}${i}`} style={{ ...card, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong>{it.exercicio}</strong>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" aria-label="Subir" style={{ ...btn2, padding: "4px 8px" }} disabled={i === 0} onClick={() => setItens((xs) => { const c = [...xs]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>↑</button>
              <button type="button" aria-label="Tirar" style={{ ...btn2, padding: "4px 8px" }} onClick={() => setItens((xs) => xs.filter((_, k) => k !== i))}>✕</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {num(it.series, "series", i, "séries")}
            {it.segundos != null ? num(it.segundos, "segundos", i, "segundos") : num(it.repMin, "repMin", i, "rep. mín.")}
            {it.segundos != null ? <span /> : num(it.repMax, "repMax", i, "rep. máx.")}
            {num(it.descanso, "descanso", i, "descanso (s)")}
          </div>
        </div>
      ))}
      <AdicionarExercicio biblioteca={biblioteca} onAdd={(l) => setItens((xs) => [...xs, { exercicio: l.nome, series: 3, repMin: 8, repMax: 12, descanso: l.grupo === "Pernas" || l.grupo === "Costas" ? 120 : 90, segundos: l.tempo ? 30 : null }])} />
      {erro && <span style={{ color: "var(--danger)", fontSize: 14 }}>{erro}</span>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn} onClick={async () => {
          try { await post({ acao: "salvarRotina", id: r.id || undefined, nome, dia: diaSem === "" ? null : Number(diaSem), itens }); fechar("✅ Rotina salva."); }
          catch (e) { setErro((e as Error).message); }
        }}>Salvar rotina</button>
        <button type="button" style={btn2} onClick={() => fechar()}>Cancelar</button>
        {r.id && <button type="button" style={{ ...btn2, color: "var(--danger)" }} onClick={async () => { await post({ acao: "apagarRotina", id: r.id }); fechar("Rotina apagada."); }}>Apagar</button>}
      </div>
    </div>
  );
}

function CriarExercicio({ onOk }: { onOk: (m: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const grupos = ["Peito", "Costas", "Pernas", "Glúteos", "Ombros", "Bíceps", "Tríceps", "Abdômen", "Panturrilha", "Antebraço", "Cardio"];
  if (!aberto) return <button type="button" style={{ ...btn2, padding: 10 }} onClick={() => setAberto(true)}>Criar exercício que não está na lista</button>;
  return (
    <div style={{ ...card, display: "grid", gap: 8 }}>
      <input style={{ ...input, textAlign: "left" }} placeholder="Nome (ex.: Remada cavalinho)" value={nome} onChange={(e) => setNome(e.target.value)} />
      <select style={{ ...input, textAlign: "left" }} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Grupo muscular">
        <option value="">Grupo muscular…</option>
        {grupos.map((g) => <option key={g}>{g}</option>)}
      </select>
      {erro && <span style={{ color: "var(--danger)", fontSize: 14 }}>{erro}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={btn} onClick={async () => { try { await post({ acao: "criarExercicio", nome, grupo }); setAberto(false); onOk(`✅ ${nome} criado.`); setNome(""); } catch (e) { setErro((e as Error).message); } }}>Criar</button>
        <button type="button" style={btn2} onClick={() => setAberto(false)}>Cancelar</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Evolução e estatísticas ───────────────────────────── */

function Evolucao({ d }: { d: Dados }) {
  const [sel, setSel] = useState<string | null>(d.stats.evolucao[0]?.nome ?? null);
  const ex = d.stats.evolucao.find((e) => e.nome === sel) ?? null;
  const [fmin, fmax] = d.stats.faixa;
  const maxSeries = Math.max(fmax, ...Object.values(d.stats.seriesGrupo));
  return (
    <>
      <Calendario dias={d.stats.dias} hoje={d.hoje} />
      <div style={{ ...card, display: "grid", gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>💪 Séries por grupo (últimos 7 dias)</h2>
        <span style={muted}>A faixa clara é o que costuma render: {fmin} a {fmax} séries por semana.</span>
        {Object.entries(d.stats.seriesGrupo).map(([g, v]) => (
          <div key={g} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) 28px", gap: 8, alignItems: "center", fontSize: 13 }}>
            <span>{g}</span>
            <div style={{ position: "relative", height: 12, borderRadius: 6, background: "var(--bg-hover)" }}>
              <div style={{ position: "absolute", left: `${(fmin / maxSeries) * 100}%`, width: `${((fmax - fmin) / maxSeries) * 100}%`, top: 0, bottom: 0, background: "var(--accent-dim)", borderRadius: 6 }} />
              <div className="enche" style={{ position: "absolute", left: 0, top: 2, bottom: 2, width: `${(v / maxSeries) * 100}%`, background: v >= fmin ? "var(--success)" : v > 0 ? "var(--accent)" : "transparent", borderRadius: 5 }} />
            </div>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: v ? "var(--text)" : "var(--text-muted)" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Evolução por exercício</h2>
        {!d.stats.evolucao.length && <span style={muted}>Aparece depois do primeiro treino.</span>}
        {d.stats.evolucao.length > 0 && (
          <select style={{ ...input, textAlign: "left" }} value={sel ?? ""} onChange={(e) => setSel(e.target.value)} aria-label="Exercício">
            {d.stats.evolucao.map((e) => <option key={e.nome} value={e.nome}>{e.nome}{e.recorde ? ` · 🏆 ${n(e.recorde)} kg` : ""}</option>)}
          </select>
        )}
        {ex && <GraficoForca ex={ex} />}
      </div>
      {d.stats.evolucao.some((e) => e.recorde) && (
        <div style={{ ...card, display: "grid", gap: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>🏆 Recordes</h2>
          {d.stats.evolucao.filter((e) => e.recorde).sort((a, b) => (b.recorde ?? 0) - (a.recorde ?? 0)).map((e) => (
            <div key={e.nome} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, borderTop: "1px solid var(--border-light)", paddingTop: 6 }}>
              <span>{e.nome}</span><strong style={{ fontVariantNumeric: "tabular-nums" }}>{n(e.recorde!)} kg</strong>
            </div>
          ))}
          <span style={muted}>Força = carga máxima estimada para 1 repetição (pela melhor série até 12 repetições).</span>
        </div>
      )}
    </>
  );
}

function Calendario({ dias, hoje }: { dias: string[]; hoje: string }) {
  const set = new Set(dias);
  const fim = new Date(hoje + "T12:00:00");
  const inicio = new Date(fim.getTime() - (12 * 7 + fim.getDay()) * 86_400_000);
  const semanas: string[][] = [];
  for (let s = new Date(inicio); s <= fim; s = new Date(s.getTime() + 7 * 86_400_000)) semanas.push(Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * 86_400_000).toISOString().slice(0, 10)));
  const ultimos30 = dias.filter((x) => new Date(x + "T12:00:00").getTime() > fim.getTime() - 30 * 86_400_000).length;
  return (
    <div style={{ ...card, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📅 Dias treinados</h2>
        <span style={muted}>{ultimos30} nos últimos 30 dias</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${semanas.length}, minmax(0,1fr))`, gap: 3 }}>
        {semanas.map((sem) => (
          <div key={sem[0]} style={{ display: "grid", gap: 3 }}>
            {sem.map((x) => (
              <span key={x} title={dia(x)} className={set.has(x) ? "acende" : undefined} style={{ animationDelay: `${(semanas.findIndex((w) => w.includes(x)) * 35)}ms`, aspectRatio: "1", maxWidth: 22, borderRadius: 4, background: x > hoje ? "transparent" : set.has(x) ? "var(--accent)" : "var(--bg-hover)", outline: x === hoje ? "1px solid var(--text-muted)" : "none" }} />
            ))}
          </div>
        ))}
      </div>
      <span style={muted}>Cada coluna é uma semana (domingo em cima). Conta academia, treino guiado e o relógio.</span>
    </div>
  );
}

function GraficoForca({ ex }: { ex: Evol }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const p = ex.pontos.filter((x) => x.rm > 0);
  if (p.length < 2) return <span style={muted}>{ex.vezes} treino(s). O gráfico aparece a partir do 2º.</span>;
  const h = 180, left = 34, right = 10, top = 12, base = h - 22;
  const min = Math.floor(Math.min(...p.map((x) => x.rm)) - 2), max = Math.ceil(Math.max(...p.map((x) => x.rm)) + 2);
  const x = (i: number) => left + (i / (p.length - 1)) * (w - left - right);
  const y = (v: number) => top + ((max - v) / Math.max(1, max - min)) * (base - top);
  return (
    <div ref={ref}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Força estimada no ${ex.nome}`}>
        {[min, max].map((v) => <text key={v} x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v}</text>)}
        <polyline points={p.map((q, i) => `${x(i)},${y(q.rm)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {p.map((q, i) => <circle key={q.dia} cx={x(i)} cy={y(q.rm)} r={3.5} fill="var(--accent)"><title>{`${dia(q.dia)}: força ~${n(q.rm, 1)} kg · volume ${n(q.volume)} kg`}</title></circle>)}
        <text x={left} y={h - 4} fontSize={10} fill="var(--text-muted)">{dia(p[0].dia)}</text>
        <text x={w - right} y={h - 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{dia(p.at(-1)!.dia)}</text>
      </svg>
      <span style={muted}>Força estimada (kg) por treino · {ex.vezes} treino(s)</span>
    </div>
  );
}
