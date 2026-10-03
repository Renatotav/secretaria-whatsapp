import { prisma } from "@/lib/prisma";

/**
 * Dá baixa automática só na FATURA DO CARTÃO: compra no cartão com data
 * (= vencimento da fatura) até hoje vira "paga". Pix, boleto e entradas
 * previstas (aluguel, salário...) continuam pendentes até o dono confirmar
 * ("paguei o aluguel", "recebi o salário") ou marcar no painel — antes tudo
 * virava pago sozinho, inclusive salário que veio diferente do previsto, e o
 * lembrete das 09h nunca tinha o que avisar.
 */
export async function autoMarkPaid() {
  try {
    const now = new Date();
    // Usa o fuso BRT (UTC-3) para garantir que a virada de dia bata com a do usuário
    const brtTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    // Até o final do dia de hoje no BRT (23:59:59).
    // Como as datas são salvas às 12h00 local, elas cairão nessa condição assim que o dia começar.
    const endOfToday = new Date(
      brtTime.getUTCFullYear(),
      brtTime.getUTCMonth(),
      brtTime.getUTCDate(),
      23, 59, 59
    );

    const result = await prisma.financeEntry.updateMany({
      where: {
        type: "expense",
        paymentMethod: "cartão",
        status: "pending",
        date: {
          lte: endOfToday
        }
      },
      data: {
        status: "paid"
      }
    });

    if (result.count > 0) {
      console.log(`[Auto-Pay] ${result.count} compras no cartão marcadas como pagas (fatura vencida até ${endOfToday.toISOString()})`);
    }
  } catch (error) {
    console.error("[Auto-Pay] Erro ao atualizar lançamentos pendentes", error);
  }
}
