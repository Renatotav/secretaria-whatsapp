import { prisma } from "./src/lib/prisma";
async function main() {
  const previousEntries = await prisma.financeEntry.findMany({
    where: { date: { lt: new Date(2026, 7, 1) } },
    select: { description: true, amount: true, date: true, status: true, account: true }
  });
  console.log("July or earlier entries:");
  console.table(previousEntries);
}
main().finally(() => prisma.$disconnect());
