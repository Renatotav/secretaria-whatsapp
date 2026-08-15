const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.financeEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40
  });
  console.log(JSON.stringify(entries.map(e => ({
    id: e.id,
    description: e.description,
    date: e.date,
    amount: e.amount
  })), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
