import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { invoiceBuddyMessage } from "@/lib/invoice-buddy";
import { sendTextWithTyping } from "@/lib/evolution";
import { listOpenInvoices } from "@/lib/invoices";

/** "Mandar teste" em Configurações: manda para a pessoa como ficam os avisos das próximas faturas. */
export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const cfg = await prisma.agentConfig.findFirst({ select: { invoiceBuddyPhone: true, evolutionUrl: true, evolutionApiKey: true, instanceId: true } });
  if (!cfg?.invoiceBuddyPhone) return NextResponse.json({ error: "Coloque o WhatsApp da pessoa primeiro." }, { status: 400 });
  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.instanceId) return NextResponse.json({ error: "WhatsApp da secretária não está configurado." }, { status: 400 });
  // Um aviso por vencimento das próximas faturas (como sairia em cada dia).
  const datas = [...new Set((await listOpenInvoices()).filter((f) => f.total >= 1).map((f) => f.dueDate))].slice(0, 2);
  const partes: string[] = [];
  for (const d of datas) {
    const m = await invoiceBuddyMessage(new Date(`${d}T15:00:00Z`));
    if (m) partes.push(m);
  }
  if (!partes.length) return NextResponse.json({ error: "Não há fatura em aberto para mostrar." }, { status: 400 });
  const texto = `🧪 *(Teste do lembrete — pode ignorar.)* Nos dias do vencimento você vai receber assim:\n\n${partes.join("\n\n—\n\n")}`;
  await sendTextWithTyping(cfg.evolutionUrl, cfg.evolutionApiKey, cfg.instanceId, cfg.invoiceBuddyPhone, texto, 10, 2);
  return NextResponse.json({ ok: true });
});
