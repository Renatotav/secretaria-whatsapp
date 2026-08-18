import { prisma } from "@/lib/prisma";

export async function autoMarkPaid() {
  try {
    const now = new Date();
    // Usa o fuso BRT (UTC-3) para garantir que a virada de dia bata com a do usuário
    const brtTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    
    // Até o final do dia de hoje no BRT (23:59:59). 
    // Como as datas são salvas às 12h00 local, elas cairão nessa condição assim que o dia começar.
    const endOfToday = new Date(
      brtTime.getFullYear(),
      brtTime.getMonth(),
      brtTime.getDate(),
      23, 59, 59
    );

    const result = await prisma.financeEntry.updateMany({
      where: {
        status: "pending",
        date: {
          lte: endOfToday
        }
      },
      data: {
        status: "paid"
      }
    });
    
    // Lançamentos pendentes não podem ser Pix (Pix é imediato, a pagar/vencimento é Cartão)
    await prisma.financeEntry.updateMany({
      where: {
        status: "pending",
        paymentMethod: "pix"
      },
      data: {
        paymentMethod: "cartão"
      }
    });

    if (result.count > 0) {
      console.log(`[Auto-Pay] ${result.count} lançamentos pendentes marcados como pagos (Data <= ${endOfToday.toISOString()})`);
    }
  } catch (error) {
    console.error("[Auto-Pay] Erro ao atualizar lançamentos pendentes", error);
  }
}
