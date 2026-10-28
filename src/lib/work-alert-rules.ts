import { prisma } from "./prisma";
import { ERROR_GROUPS } from "./work-groups";
import { alertsFor } from "./work-sla";
import { getSituations } from "./work-situations";
import { buildWeeklyWorkReport } from "./work-weekly";

// Alertas que ele mesmo define pelo WhatsApp (sem IA, frase fixa):
//   "alerta MNI passar de 5 na semana"  → grupo de erro na semana (desde segunda)
//   "alerta chamado parado 5 dias"      → chamado aberto há N dias (fora o relógio parado)
//   "alerta abertos passar de 15"       → total em aberto
//   "alertas" · "apaga alerta 2" · "relatório da semana"
// Conferidos a cada cópia do escala (11h/16h); cada aviso sai uma vez só.

type Regra =
  | { id: number; tipo: "grupo_semana"; grupo: string; limite: number }
  | { id: number; tipo: "parado"; dias: number }
  | { id: number; tipo: "abertos"; limite: number };

const DAY = 86400_000;
const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function lerRegras(raw: string): Regra[] {
  try {
    const r = JSON.parse(raw || "[]");
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}
const descrever = (r: Regra) =>
  r.tipo === "grupo_semana" ? `${r.grupo} passar de ${r.limite} na semana` : r.tipo === "parado" ? `chamado parado há ${r.dias}+ dias` : `mais de ${r.limite} em aberto`;

/** "mni" → "MNI / integração" (pelo começo ou por palavra do nome do grupo). */
function acharGrupo(txt: string): string | null {
  const t = sem(txt).trim();
  if (!t) return null;
  const nomes = Object.keys(ERROR_GROUPS);
  return nomes.find((g) => sem(g) === t) ?? nomes.find((g) => sem(g).startsWith(t)) ?? nomes.find((g) => sem(g).split(/[^a-z0-9]+/).includes(t)) ?? nomes.find((g) => sem(g).includes(t)) ?? null;
}

export async function applyAlertRuleCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, workAlertRules: true } });
  if (!cfg) return null;
  const regras = lerRegras(cfg.workAlertRules);
  const salvar = (r: Regra[]) => prisma.agentConfig.update({ where: { id: cfg.id }, data: { workAlertRules: JSON.stringify(r) } });

  if (/^\s*(relat[oó]rio\s+da\s+semana|semana\s+do\s+trabalho|minha\s+semana\s+no\s+trabalho)\s*\??\s*$/i.test(t)) {
    return (await buildWeeklyWorkReport()) || "📊 A semana passada não teve movimento nos seus chamados.";
  }
  if (/^\s*(meus\s+)?alertas\s*\??\s*$/i.test(t)) {
    if (!regras.length) return "🔔 Você ainda não tem alertas. Exemplos:\n• *alerta MNI passar de 5 na semana*\n• *alerta chamado parado 5 dias*\n• *alerta abertos passar de 15*";
    return ["🔔 *Seus alertas* (confiro a cada atualização do escala):", ...regras.map((r) => `${r.id}. ${descrever(r)}`), "Para tirar: *apaga alerta 1*"].join("\n");
  }
  const apaga = t.match(/^\s*(?:apaga|apagar|remove|remover|tira|tirar)\s+(?:o\s+)?alerta\s+(\d+)\s*$/i);
  if (apaga) {
    const id = Number(apaga[1]);
    if (!regras.some((r) => r.id === id)) return `🔔 Não achei o alerta ${id}. Mande *alertas* para ver a lista.`;
    await salvar(regras.filter((r) => r.id !== id));
    return `🔔 Alerta ${id} apagado.`;
  }
  if (!/^\s*alerta\b/i.test(t)) return null;

  const novoId = (regras.reduce((m, r) => Math.max(m, r.id), 0) || 0) + 1;
  let nova: Regra | null = null;
  const parado = t.match(/parad[oa]s?\s+(?:h[aá]\s+|por\s+|mais\s+de\s+)?(\d{1,3})\s*dias?/i);
  const abertos = t.match(/abertos?\s+(?:passar\s+de|acima\s+de|mais\s+de|>)\s*(\d{1,3})/i);
  const grupo = t.match(/^\s*alerta\s+(?:quando\s+|se\s+)?(?:o\s+grupo\s+|os\s+de\s+|de\s+)?(.+?)\s+(?:passar\s+de|acima\s+de|mais\s+de|>)\s*(\d{1,3})\s*(?:chamados?\s*)?(?:na|por)\s+semana/i);
  if (parado) nova = { id: novoId, tipo: "parado", dias: Math.max(1, Number(parado[1])) };
  else if (abertos) nova = { id: novoId, tipo: "abertos", limite: Number(abertos[1]) };
  else if (grupo) {
    const g = acharGrupo(grupo[1]);
    if (!g) return `🔔 Não reconheci o grupo "${grupo[1]}". Grupos: ${Object.keys(ERROR_GROUPS).join(", ")}.`;
    nova = { id: novoId, tipo: "grupo_semana", grupo: g, limite: Number(grupo[2]) };
  }
  if (!nova) return "🔔 Não entendi o alerta. Mande assim:\n• *alerta MNI passar de 5 na semana*\n• *alerta chamado parado 5 dias*\n• *alerta abertos passar de 15*";
  await salvar([...regras, nova]);
  return `🔔 Combinado! Alerta ${nova.id}: ${descrever(nova)}. Confiro a cada atualização do escala (11h e 16h) e aviso uma vez só.`;
}

/** Confere os alertas dele; devolve a mensagem com o que disparou agora (ou ""). */
export async function checkAlertRules(): Promise<string> {
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, workAlertRules: true, workAlertFired: true } });
  if (!cfg) return "";
  const regras = lerRegras(cfg.workAlertRules);
  if (!regras.length) return "";
  let disparados: string[] = [];
  try {
    disparados = JSON.parse(cfg.workAlertFired || "[]");
  } catch {}
  const brt = new Date(Date.now() - 3 * 3600_000);
  const hoje = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3));
  const segunda = new Date(hoje.getTime() - ((brt.getUTCDay() + 6) % 7) * DAY);
  const semanaKey = segunda.toISOString().slice(0, 10);
  const situacoes = await getSituations();
  const abertos = await prisma.workTicket.findMany({ where: { status: { in: ["aberto", "pendente"] } } });
  const linhas: string[] = [];
  const novos: string[] = [];
  for (const r of regras) {
    if (r.tipo === "grupo_semana") {
      const n = await prisma.workTicket.count({ where: { errorGroup: r.grupo, OR: [{ receivedAt: { gte: segunda } }, { receivedAt: null, openedAt: { gte: segunda } }] } });
      const k = `g${r.id}:${semanaKey}`;
      if (n > r.limite && !disparados.includes(k)) {
        linhas.push(`🔔 *${r.grupo}* já tem ${n} chamado(s) nesta semana (seu limite: ${r.limite}).`);
        novos.push(k);
      }
    } else if (r.tipo === "parado") {
      const presos = abertos.map((t) => ({ id: t.ticketId, al: alertsFor(t, situacoes) })).filter((x) => !x.al.paused && (x.al.days ?? 0) >= r.dias);
      const inedito = presos.filter((x) => !disparados.includes(`p${r.id}:${x.id}`));
      if (inedito.length) {
        linhas.push(`🔔 Parado(s) há ${r.dias}+ dias: ${inedito.slice(0, 8).map((x) => `${x.id} (${x.al.days}d)`).join(", ")}`);
        novos.push(...inedito.map((x) => `p${r.id}:${x.id}`));
      }
    } else if (r.tipo === "abertos") {
      const k = `a${r.id}:${hoje.toISOString().slice(0, 10)}`;
      if (abertos.length > r.limite && !disparados.includes(k)) {
        linhas.push(`🔔 ${abertos.length} chamados em aberto (seu limite: ${r.limite}).`);
        novos.push(k);
      }
    }
  }
  if (novos.length) {
    // Guarda só os últimos 300 para não crescer para sempre.
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { workAlertFired: JSON.stringify([...disparados, ...novos].slice(-300)) } });
  }
  return linhas.join("\n");
}
