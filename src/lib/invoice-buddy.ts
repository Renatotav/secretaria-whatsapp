import { prisma } from "./prisma";
import { sendTextWithTyping } from "./evolution";

// Aviso das faturas para o irmão (pedido dele, 21/10/2026): ele é o titular do
// C6 (o Renato é o adicional) e o dono do cartão Santander. A secretária só
// conhece a PARTE DO RENATO em cada fatura — o texto deixa isso claro.
// Manda 3 dias antes e no dia do vencimento, às 9h.

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const AVISAR_DIAS = [3, 0];

export async function invoiceBuddyMessage(hoje = new Date()): Promise<string> {
  const { listOpenInvoices } = await import("./invoices");
  const brt = new Date(hoje.getTime() - 3 * 3600_000);
  const base = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate());
  const faturas = (await listOpenInvoices()).filter((f) => {
    const [y, m, d] = f.dueDate.split("-").map(Number);
    const dias = Math.round((Date.UTC(y, m - 1, d) - base) / 86_400_000);
    return f.total >= 1 && AVISAR_DIAS.includes(dias);
  });
  if (!faturas.length) return "";
  const cfg = await prisma.agentConfig.findFirst({ select: { invoiceBuddyName: true } });
  const linhas = faturas.map((f) => {
    const [, m, d] = f.dueDate.split("-").map(Number);
    const quando = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
    const nome = f.card ? (/santander/i.test(f.card) ? "Santander" : f.card) : "C6";
    return `💳 *${nome}* vence *${quando}* — parte do Renato: *${brl(f.total)}*`;
  });
  return `Oi${cfg?.invoiceBuddyName ? `, ${cfg.invoiceBuddyName}` : ""}! 👋 Lembrete das faturas:\n${linhas.join("\n")}\n\n_(Aviso automático da secretária do Renato.)_`;
}

/** Agendador (9h): manda o aviso para o irmão, se houver fatura vencendo em 3 dias ou hoje. */
export async function sendInvoiceBuddyReminder(): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { invoiceBuddyPhone: true, evolutionUrl: true, evolutionApiKey: true, instanceId: true } });
  if (!cfg?.invoiceBuddyPhone || !cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.instanceId) return false;
  const texto = await invoiceBuddyMessage();
  if (!texto) return false;
  await sendTextWithTyping(cfg.evolutionUrl, cfg.evolutionApiKey, cfg.instanceId, cfg.invoiceBuddyPhone, texto, 20, 3);
  return true;
}
