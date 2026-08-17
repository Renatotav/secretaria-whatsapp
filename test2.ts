import { prisma } from "./src/lib/prisma";
async function main() {
  const f = await prisma.financeEntry.findMany({ select: { date: true, purchaseDate: true }});
  console.log("Finance dates:", f.map(x => x.date).slice(-5));
  console.log("Purchase dates:", f.map(x => x.purchaseDate).slice(-5));
}
main().finally(() => prisma.$disconnect());
