const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const entries = await prisma.financeEntry.findMany({ where: { amount: 604.8 } });
  console.log(entries);
}

run();
