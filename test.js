const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const f = await prisma.financeEntry.findMany({ select: { date: true, purchaseDate: true }});
  const d = await prisma.diaryEntry.findMany({ select: { date: true }});
  console.log("Finance dates:", f.map(x => x.date.toISOString()).slice(-5));
  console.log("Finance purchase dates:", f.map(x => x.purchaseDate?.toISOString()).slice(-5));
  console.log("Diary dates:", d.map(x => x.date.toISOString()).slice(-5));
}
main().finally(() => prisma.$disconnect());
