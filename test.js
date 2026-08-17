require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['query'] });
async function main() {
  const entries = await prisma.financeEntry.findMany({
    select: { date: true, amount: true, type: true, description: true, account: true, status: true, purchaseDate: true }
  });
  console.log(entries);
}
main().finally(() => prisma.$disconnect());
