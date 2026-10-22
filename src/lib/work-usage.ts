import { prisma } from "./prisma";

// Quanto cada função da extensão é usada (contagens por dia, sem conteúdo).
// "uso da extensão" no WhatsApp mostra o que ele usa e o que nunca usou.

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export async function addUsage(contagens: Record<string, number>, day = hoje()): Promise<void> {
  for (const [f, n] of Object.entries(contagens)) {
    const feature = String(f).slice(0, 60);
    const count = Math.max(0, Math.min(10_000, Math.round(Number(n) || 0)));
    if (!feature || !count) continue;
    await prisma.workUsage.upsert({ where: { day_feature: { day, feature } }, create: { day, feature, count }, update: { count: { increment: count } } });
  }
}

// Funções que existem (para listar as que nunca apareceram). Atalhos de texto
// ficam de fora de propósito: ele usa e não quer mexer.
const CONHECIDAS = [
  "⚡ painel aberto", "⚡ registrar", "⚡ copiar-resposta", "⚡ copiar-titulo", "⚡ copiar-corpo", "⚡ usar-conversa", "⚡ abrir-claude", "⚡ limpar",
  "🔎 balão do chamado", "✍️ corretor (botão)", "✍️ corretor (Alt+C)", "👥 CRM aberto", "🔄 recarga automática da página",
  "🧩 janelinha da extensão aberta", "🧩 consulta rápida", "🧩 importar planilha", "🧩 atualizar do escala",
];

export async function applyUsageCommand(text: string): Promise<string | null> {
  if (!/^\s*(?:uso\s+da\s+extens[aã]o|o\s+que\s+(?:eu\s+)?uso\s+na\s+extens[aã]o|extens[aã]o\s+uso)\s*\??\s*$/i.test(text)) return null;
  const rows = await prisma.workUsage.findMany();
  if (!rows.length) return "📊 Ainda não tenho contagem: a extensão 3.11 manda os números 1 vez por dia. Pergunte de novo daqui a uns dias.";
  const dias = new Set(rows.map((r) => r.day));
  const total = new Map<string, number>();
  for (const r of rows) total.set(r.feature, (total.get(r.feature) ?? 0) + r.count);
  const lista = [...total].sort((a, b) => b[1] - a[1]);
  const nunca = CONHECIDAS.filter((f) => !total.has(f));
  const desde = [...dias].sort()[0];
  return [
    `📊 *Uso da extensão* (${dias.size} dia(s), desde ${desde.slice(8, 10)}/${desde.slice(5, 7)})`,
    ...lista.slice(0, 25).map(([f, n]) => `• ${f.replace(/^ia:/, "🤖 IA ")}: ${n}×`),
    nunca.length ? `\n💤 *Nunca usado até agora:*\n${nunca.map((f) => `• ${f}`).join("\n")}` : "",
    "\n(Atalhos de texto não entram na conta.)",
  ].filter(Boolean).join("\n");
}
