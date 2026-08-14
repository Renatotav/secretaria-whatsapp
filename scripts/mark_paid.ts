import { prisma } from "../src/lib/prisma";

async function main() {
  const startOfAugust = new Date(2026, 7, 1);
  const endOfAugust = new Date(2026, 7, 31, 23, 59, 59);

  const entries = await prisma.financeEntry.updateMany({
    where: {
      type: "expense",
      date: { gte: startOfAugust, lte: endOfAugust },
      OR: [
        { category: { contains: "Cartão", mode: "insensitive" } },
        { subcategory: { contains: "Cartão", mode: "insensitive" } },
        { description: { contains: "Cartão", mode: "insensitive" } },
      ],
      status: "pending",
    },
    data: {
      status: "paid",
    },
  });

  console.log(`Faturas de agosto marcadas como pagas. Total de itens atualizados: ${entries.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
