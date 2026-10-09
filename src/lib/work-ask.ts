import OpenAI from "openai";
import { prisma } from "./prisma";
import { ERROR_GROUPS } from "./work-groups";
import { alertsFor } from "./work-sla";

// Perguntas livres sobre o trabalho no WhatsApp ("quantos de MNI eu fechei em
// setembro?"). A IA só TRADUZ a pergunta em filtros (JSON); a conta é feita
// aqui no banco. Nenhum texto de chamado vai para a IA — só a pergunta.

interface Plan {
  metric: "contar" | "tempo_medio" | "listar";
  status: "fechados" | "resolvido" | "escalado" | "abertos" | "todos";
  data: "fechamento" | "recebimento";
  de: string | null; // YYYY-MM-DD
  ate: string | null; // YYYY-MM-DD (inclusive)
  grupo: string | null;
  texto: string | null; // palavra no tipo do erro/fila
  origem: "externo" | "interno" | null;
  agrupar: "grupo" | "tipo" | "mes" | "semana" | "dia_semana" | "origem" | null;
  entendi: boolean;
}

const DAY = 86400_000;
const brtDay = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

async function planFor(question: string): Promise<Plan | null> {
  const config = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true, workAiModel: true } });
  if (!config?.openrouterApiKey) return null;
  const today = brtDay(new Date());
  const client = new OpenAI({ apiKey: config.openrouterApiKey, baseURL: "https://openrouter.ai/api/v1" });
  const res = await client.chat.completions.create({
    model: config.workAiModel || "anthropic/claude-sonnet-5.5",
    temperature: 0,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          `Você converte perguntas de um atendente do suporte do PJe sobre os PRÓPRIOS chamados em filtros JSON. Hoje é ${today} (America/Sao_Paulo; semana começa na segunda). ` +
          `Responda SÓ o JSON: {"metric":"contar|tempo_medio|listar","status":"fechados|resolvido|escalado|abertos|todos","data":"fechamento|recebimento","de":"YYYY-MM-DD|null","ate":"YYYY-MM-DD|null","grupo":"<um dos grupos>|null","texto":"palavra|null","origem":"externo|interno|null","agrupar":"grupo|tipo|mes|semana|dia_semana|origem|null","entendi":true|false}. ` +
          `Grupos válidos: ${Object.keys(ERROR_GROUPS).join(" | ")}. "fechei/resolvi" = fechados (resolvido + virou Redmine); "virou Redmine/escalei" = escalado; "em aberto/pendentes" = abertos. ` +
          `Período pelo fechamento, salvo se ele falar em recebidos/chegaram. "tempo médio" = tempo_medio. "texto" só para um termo que não seja grupo (ex: "assinatura", "SAJMP"). ` +
          `Se não for uma pergunta sobre os chamados dele, entendi=false.`,
      },
      { role: "user", content: question.slice(0, 500) },
    ],
  });
  const raw = res.choices[0]?.message?.content || "";
  try {
    const p = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Plan;
    if (p.grupo && !ERROR_GROUPS[p.grupo]) p.grupo = null;
    return p;
  } catch {
    return null;
  }
}

function describe(p: Plan): string {
  const st = { fechados: "fechados", resolvido: "resolvidos", escalado: "que viraram Redmine", abertos: "em aberto", todos: "" }[p.status];
  const per = p.de && p.ate ? ` de ${p.de.split("-").reverse().join("/")} a ${p.ate.split("-").reverse().join("/")}` : p.de ? ` desde ${p.de.split("-").reverse().join("/")}` : "";
  return [st && `chamados ${st}`, p.grupo && `grupo "${p.grupo}"`, p.texto && `com "${p.texto}"`, p.origem && `usuário ${p.origem}`].filter(Boolean).join(", ") + per;
}

export async function answerWorkQuestion(question: string): Promise<string | null> {
  const p = await planFor(question);
  if (!p || !p.entendi) return null;
  // "Virou Redmine" = marcado como Redmine OU com nº de Redmine (vem do escala).
  const statusIn =
    p.status === "fechados" || p.status === "escalado" ? ["resolvido", "escalado"] : p.status === "resolvido" ? ["resolvido"] : p.status === "abertos" ? ["aberto", "pendente"] : undefined;
  const dateField = p.status === "abertos" || p.data === "recebimento" ? "receivedAt" : "resolvedAt";
  const from = p.de ? new Date(`${p.de}T00:00:00-03:00`) : null;
  const to = p.ate ? new Date(new Date(`${p.ate}T00:00:00-03:00`).getTime() + DAY) : null;
  let rows = await prisma.workTicket.findMany({
    where: {
      ...(statusIn ? { status: { in: statusIn } } : {}),
      ...(p.grupo ? { errorGroup: p.grupo } : {}),
      ...(p.origem ? { origin: p.origem } : {}),
      ...(p.status === "escalado" ? { AND: [{ OR: [{ status: "escalado" }, { redmine: { not: "" } }] }] } : {}),
      ...(p.texto ? { OR: [{ errorType: { contains: p.texto, mode: "insensitive" } }, { queue: { contains: p.texto, mode: "insensitive" } }] } : {}),
    },
  });
  // Período: pelo fechamento (ou recebimento; sem "recebido em", vale a abertura).
  if (from || to) {
    rows = rows.filter((t) => {
      const d = dateField === "resolvedAt" ? t.resolvedAt : t.receivedAt ?? t.openedAt;
      return d && (!from || d >= from) && (!to || d < to);
    });
  }
  const label = describe(p);
  if (!rows.length) return `💼 Nenhum chamado encontrado (${label}).`;

  if (p.metric === "tempo_medio") {
    const spans = rows
      .map((t) => {
        const start = t.receivedAt ?? t.openedAt;
        const end = t.resolvedAt ?? (t.status === "aberto" || t.status === "pendente" ? new Date() : null);
        return start && end && end > start ? (end.getTime() - start.getTime()) / DAY : null;
      })
      .filter((x): x is number => x !== null);
    if (!spans.length) return `💼 Sem datas suficientes para o tempo médio (${label}).`;
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    return `💼 Tempo médio: *${avg < 2 ? `${Math.round(avg * 24)} h` : `${avg.toFixed(1).replace(".", ",")} dias`}* em ${spans.length} chamado(s) (${label}).`;
  }

  if (p.agrupar) {
    const keyOf = (t: (typeof rows)[number]) => {
      const d = (dateField === "resolvedAt" ? t.resolvedAt : t.receivedAt ?? t.openedAt) ?? t.createdAt;
      const day = new Date(d.getTime() - 3 * 3600_000);
      switch (p.agrupar) {
        case "grupo":
          return t.errorGroup && t.errorGroup !== "Sem grupo" ? t.errorGroup : "(sem grupo)";
        case "tipo":
          return t.errorType || "(sem tipo)";
        case "origem":
          return t.origin || "(sem origem)";
        case "mes":
          return `${MONTHS[day.getUTCMonth()]}/${day.getUTCFullYear()}`;
        case "semana": {
          const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
          return `semana de ${monday.toISOString().slice(8, 10)}/${monday.toISOString().slice(5, 7)}`;
        }
        case "dia_semana":
          return WEEKDAYS[day.getUTCDay()];
        default:
          return "";
      }
    };
    const tally = Object.entries(rows.reduce<Record<string, number>>((acc, t) => ((acc[keyOf(t)] = (acc[keyOf(t)] || 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
    return [`💼 *${rows.length}* chamado(s) (${label}):`, ...tally.slice(0, 10).map(([k, n]) => `• ${k}: ${n}`)].join("\n");
  }

  if (p.metric === "listar") {
    const lines = rows.slice(0, 15).map((t) => {
      const a = alertsFor(t);
      return `• *${t.ticketId}*${t.errorGroup && t.errorGroup !== "Sem grupo" ? ` — ${t.errorGroup}` : t.errorType ? ` — ${t.errorType.slice(0, 50)}` : ""}${a.days !== null ? ` · ${a.days}d` : ""}`;
    });
    return [`💼 *${rows.length}* chamado(s) (${label})${rows.length > 15 ? " — os 15 primeiros" : ""}:`, ...lines].join("\n");
  }

  return `💼 *${rows.length}* chamado(s) (${label}).`;
}
