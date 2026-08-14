const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.financeEntry.findMany({
    where: { date: { lt: new Date(2026, 7, 1) } }
  });
  console.log(entries);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
