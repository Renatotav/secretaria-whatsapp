import { prisma } from "./prisma";

// Ferramentas da secretária para o app do Claude (conector MCP, só leitura).
// Chamados: só o que já está mascarado (CPF/telefone/e-mail saem ao gravar).

type Args = Record<string, unknown>;
export interface Ferramenta {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (a: Args) => Promise<string>;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (d: Date | null | undefined) => (d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/") : "—");
const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
function mesRange(mes?: string) {
  const brt = new Date(Date.now() - 3 * 3600_000);
  const m = /^(\d{4})-(\d{2})$/.exec(mes || "");
  const ano = m ? Number(m[1]) : brt.getUTCFullYear();
  const mm = m ? Number(m[2]) - 1 : brt.getUTCMonth();
  return { de: new Date(Date.UTC(ano, mm, 1, 3)), ate: new Date(Date.UTC(ano, mm + 1, 1, 3)), rotulo: `${String(mm + 1).padStart(2, "0")}/${ano}` };
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "perguntar_chamados",
    description: "Pergunta livre sobre os chamados de trabalho do Renato (suporte do PJe): contagens, tempo médio, listas, agrupamentos por grupo de erro, mês, semana. Ex.: 'quantos de MNI eu fechei em setembro?'. A conta é feita no banco.",
    inputSchema: { type: "object", properties: { pergunta: { type: "string", description: "A pergunta em português" } }, required: ["pergunta"] },
    run: async (a) => {
      const { planFor, rowsFor, describe, answerWorkQuestion } = await import("./work-ask");
      const q = str(a.pergunta, 500);
      const p = await planFor(q);
      if (!p || !p.entendi) return "Não entendi como pergunta sobre os chamados.";
      const [resp, rows] = await Promise.all([answerWorkQuestion(q, p), rowsFor(p)]);
      return `${(resp || "").replace(/\*/g, "")}\nCritério: ${describe(p)}\nChamados: ${rows.slice(0, 40).map((t) => `${t.ticketId} (${t.status}${t.errorGroup ? ", " + t.errorGroup : ""})`).join("; ")}`;
    },
  },
  {
    name: "resumo_trabalho",
    description: "Resumo atual do trabalho: hoje, semana e mês (registrados, resolvidos, viraram Redmine), em aberto, urgentes, atrasados, grupos de erro do mês e o relatório da semana passada.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const { workStats } = await import("./work");
      const { buildWeeklyWorkReport } = await import("./work-weekly");
      const s = await workStats();
      const linha = (n: string, c: { registrados: number; resolvidos: number; escalados: number }) => `${n}: ${c.registrados} registrados, ${c.resolvidos} resolvidos, ${c.escalados} viraram Redmine`;
      return [
        linha("Hoje", s.hoje),
        linha("Semana", s.semana),
        linha("Mês", s.mes),
        `Em aberto: ${s.emAberto} · urgentes: ${s.urgentes} · atrasados: ${s.atrasados} · Redmine resolvido para encerrar: ${s.paraEncerrar.length}`,
        `Grupos do mês: ${(s.gruposDoMes || []).map((g) => `${g.name} ${g.n}`).join(", ")}`,
        `Tipos do mês: ${s.tiposDoMes.map((g) => `${g.name} ${g.n}`).join(", ")}`,
        "",
        (await buildWeeklyWorkReport()).replace(/\*/g, "") || "Semana passada sem movimento.",
      ].join("\n");
    },
  },
  {
    name: "chamado",
    description: "Detalhes de um chamado pelo número (ex.: 2163697 ou R2484992): status, tipo, grupo de erro, Redmine, STATUS da planilha, dias, resolução.",
    inputSchema: { type: "object", properties: { numero: { type: "string" } }, required: ["numero"] },
    run: async (a) => {
      const id = str(a.numero, 20).toUpperCase().replace(/\s+/g, "");
      const t = await prisma.workTicket.findUnique({ where: { ticketId: id } });
      if (!t) return `Chamado ${id} não está na Central.`;
      const { alertsFor } = await import("./work-sla");
      const al = alertsFor(t);
      return [
        `Chamado ${t.ticketId} — ${t.status}${t.sheetStatus ? ` (planilha: ${t.sheetStatus})` : ""}`,
        `Aberto: ${dia(t.openedAt)} · chegou: ${dia(t.receivedAt)} · fechado: ${dia(t.resolvedAt)}${al.days !== null ? ` · ${al.days} dia(s) com ele` : ""}`,
        t.errorType && `Tipo: ${t.errorType}`,
        t.errorGroup && `Grupo: ${t.errorGroup}`,
        t.queue && `Fila: ${t.queue}`,
        t.redmine && `Redmine: ${t.redmine}${t.redmineStatus ? ` (${t.redmineStatus})` : ""}`,
        t.description && `Descrição: ${t.description.slice(0, 800)}`,
        t.resolution && `Resolução: ${t.resolution.slice(0, 800)}`,
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "como_resolvi",
    description: "Como o Renato resolveu chamados de um grupo de erro (ex.: 'MNI / integração', 'Peticionamento / protocolo', 'Migração SAJ → PJe'): números do mês e as últimas resoluções escritas por ele.",
    inputSchema: { type: "object", properties: { grupo: { type: "string" } }, required: ["grupo"] },
    run: async (a) => {
      const { ERROR_GROUPS } = await import("./work-groups");
      const g0 = str(a.grupo, 80).toLowerCase();
      const g = Object.keys(ERROR_GROUPS).find((x) => x.toLowerCase() === g0) ?? Object.keys(ERROR_GROUPS).find((x) => x.toLowerCase().includes(g0));
      if (!g) return `Grupo não encontrado. Grupos: ${Object.keys(ERROR_GROUPS).join(", ")}`;
      const { insight } = await import("./work-insight");
      const d = await insight("grupo", g);
      return [
        `${g} no mês: ${d.total} chamado(s), ${d.fechados} fechados, ${d.abertos} em aberto, ${d.redmine} viraram Redmine.`,
        ...d.resolucoes.map((r) => `• ${r.ticketId} (${dia(r.quando ? new Date(r.quando) : null)}): ${r.texto}`),
      ].join("\n");
    },
  },
  {
    name: "financeiro_mes",
    description: "Financeiro pessoal do Renato num mês (padrão: o atual): entradas, saídas, pago e a pagar, e gastos por categoria. mes no formato AAAA-MM.",
    inputSchema: { type: "object", properties: { mes: { type: "string", description: "AAAA-MM (opcional)" } } },
    run: async (a) => {
      const { de, ate, rotulo } = mesRange(str(a.mes, 7));
      const e = await prisma.financeEntry.findMany({ where: { date: { gte: de, lt: ate } }, select: { type: true, amount: true, status: true, category: true } });
      const soma = (f: (x: (typeof e)[number]) => boolean) => e.filter(f).reduce((s, x) => s + x.amount, 0);
      const cats: Record<string, number> = {};
      for (const x of e) if (x.type === "expense") cats[x.category || "Outros"] = (cats[x.category || "Outros"] || 0) + x.amount;
      return [
        `Financeiro ${rotulo}:`,
        `Entradas: ${brl(soma((x) => x.type === "income"))} · Saídas: ${brl(soma((x) => x.type === "expense"))}`,
        `Saídas pagas: ${brl(soma((x) => x.type === "expense" && x.status === "paid"))} · a pagar: ${brl(soma((x) => x.type === "expense" && x.status === "pending"))}`,
        "Por categoria: " + Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([c, v]) => `${c} ${brl(v)}`).join(" · "),
      ].join("\n");
    },
  },
  {
    name: "gastos",
    description: "Lista lançamentos do financeiro pessoal com filtros: período (de/ate AAAA-MM-DD, pela data em que o dinheiro sai), categoria, texto na descrição, forma de pagamento.",
    inputSchema: {
      type: "object",
      properties: { de: { type: "string" }, ate: { type: "string" }, categoria: { type: "string" }, texto: { type: "string" }, pagamento: { type: "string" } },
    },
    run: async (a) => {
      const de = /^\d{4}-\d{2}-\d{2}$/.test(str(a.de)) ? new Date(`${str(a.de)}T00:00:00-03:00`) : mesRange().de;
      const ate = /^\d{4}-\d{2}-\d{2}$/.test(str(a.ate)) ? new Date(new Date(`${str(a.ate)}T00:00:00-03:00`).getTime() + 86400_000) : mesRange().ate;
      const rows = await prisma.financeEntry.findMany({
        where: {
          date: { gte: de, lt: ate },
          ...(str(a.categoria) ? { category: { contains: str(a.categoria), mode: "insensitive" as const } } : {}),
          ...(str(a.texto) ? { description: { contains: str(a.texto), mode: "insensitive" as const } } : {}),
          ...(str(a.pagamento) ? { paymentMethod: { contains: str(a.pagamento), mode: "insensitive" as const } } : {}),
        },
        orderBy: { date: "asc" },
        take: 80,
        select: { date: true, purchaseDate: true, description: true, amount: true, type: true, category: true, paymentMethod: true, status: true },
      });
      if (!rows.length) return "Nenhum lançamento com esses filtros.";
      const total = rows.reduce((s, x) => s + (x.type === "expense" ? x.amount : -x.amount), 0);
      return [
        `${rows.length} lançamento(s) — saldo de saídas: ${brl(total)}`,
        ...rows.map((x) => `${dia(x.date)}${x.purchaseDate ? ` (compra ${dia(x.purchaseDate)})` : ""} · ${x.type === "income" ? "+" : "-"}${brl(x.amount)} · ${x.description} · ${x.category} · ${x.paymentMethod} · ${x.status === "paid" ? "pago" : "a pagar"}`),
      ].join("\n");
    },
  },
  {
    name: "agenda",
    description: "Compromissos e lembretes da agenda pessoal nos próximos dias (padrão 7).",
    inputSchema: { type: "object", properties: { dias: { type: "number" } } },
    run: async (a) => {
      const n = Math.min(60, Math.max(1, Number(a.dias) || 7));
      const itens = await prisma.agendaItem.findMany({ where: { done: false, dueDate: { gte: new Date(Date.now() - 86400_000), lt: new Date(Date.now() + n * 86400_000) } }, orderBy: { dueDate: "asc" }, take: 50 });
      if (!itens.length) return `Nada na agenda nos próximos ${n} dias.`;
      return itens.map((i) => `${i.dueDate ? new Date(i.dueDate.getTime() - 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "sem data"} · ${i.title}`).join("\n");
    },
  },
  {
    name: "scooter",
    description: "Situação da scooter elétrica: km desde a carga, folga até recarregar, consumo, pneus.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const { scooterStatus } = await import("./scooter");
      return (await scooterStatus()).replace(/\*/g, "");
    },
  },
];

/** "mcp chave" (gera/troca a chave do conector) · "mcp desliga". null = não é isso. */
export async function applyMcpCommand(text: string): Promise<string | null> {
  const m = text.trim().match(/^\s*mcp\s+(chave|nova\s+chave|desliga|desligar)\s*$/i);
  if (!m) return null;
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true } });
  if (!cfg) return null;
  if (/^desl/i.test(m[1])) {
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { mcpToken: "" } });
    return "🔌 Conector do Claude desligado. Para religar: *mcp chave*.";
  }
  const { randomBytes } = await import("crypto");
  const chave = randomBytes(24).toString("base64url");
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { mcpToken: chave } });
  return `🔌 Nova chave do conector do Claude criada (a anterior parou de valer).\nNo claude.ai (só aceita endereço): Configurações › Conectores › Adicionar conector personalizado › o endereço do seu painel + /api/mcp/${chave}\nNo Claude Code/Desktop (mais seguro, a chave não fica no registro do servidor): endereço do painel + /api/mcp, com o cabeçalho Authorization: Bearer ${chave}`;
}
