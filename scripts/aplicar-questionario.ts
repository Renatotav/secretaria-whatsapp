// Grava as respostas do questionário numa instalação NOVA da secretária.
// Uso: DATABASE_URL=... npx tsx scripts/aplicar-questionario.ts respostas.json [--gravar]
// Sem --gravar só mostra o que faria. Recusa banco que já tem lançamentos.
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { withReason } from "../src/lib/finance-reason";
import { planoDoQuestionario, type Respostas } from "../src/lib/questionario";
import { projectAndInsertFinanceEntries } from "../src/lib/statement-import";

async function main() {
  const [arquivo, flag] = process.argv.slice(2);
  if (!arquivo) throw new Error("uso: aplicar-questionario.ts respostas.json [--gravar]");
  const plano = planoDoQuestionario(JSON.parse(readFileSync(arquivo, "utf8")) as Respostas, new Date());
  if (plano.erros.length) throw new Error(`respostas incompletas:\n- ${plano.erros.join("\n- ")}`);
  console.log(JSON.stringify({ ...plano, config: { ...plano.config, ownerPhone: "(oculto)" } }, null, 2));
  if (flag !== "--gravar") return console.log("\nSó simulei. Para gravar, rode de novo com --gravar.");

  if (await prisma.financeEntry.count()) throw new Error("este banco já tem lançamentos: o questionário é só para instalação nova");
  const atual = await prisma.agentConfig.findFirst({ select: { id: true } });
  if (atual) await prisma.agentConfig.update({ where: { id: atual.id }, data: plano.config });
  else await prisma.agentConfig.create({ data: plano.config });
  for (const t of plano.tetos) await prisma.budget.create({ data: { month: "default", category: t.category, amount: t.amount } });
  for (const m of plano.metas) {
    await prisma.savingsGoal.create({ data: { name: m.nome, targetAmount: m.valor, currentAmount: m.atual ?? 0, deadline: m.prazo ? new Date(`${m.prazo}T12:00:00`) : null } });
  }
  await withReason("questionário de instalação", () => projectAndInsertFinanceEntries(plano.lancamentos, "dashboard"));
  console.log("\nGravado. Abra o painel e confira Dinheiro, Orçamentos e Metas.");
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
