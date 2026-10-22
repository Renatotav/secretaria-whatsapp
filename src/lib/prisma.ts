import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentReason } from "./finance-reason";

const connectionString = process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString });

function createClient() {
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Histórico do financeiro: toda criação, alteração e exclusão de lançamento
  // vira uma linha em FinanceLog (antes, depois e motivo). Se gravar o
  // histórico falhar, a operação dele segue normal.
  type Row = { id: string; description: string } & Record<string, unknown>;
  const json = (r: unknown) => JSON.parse(JSON.stringify(r)) as Prisma.InputJsonValue;
  const log = (rows: { entryId: string; action: string; description: string; before?: unknown; after?: unknown }[]) => {
    if (!rows.length) return;
    const reason = currentReason().slice(0, 300);
    return base.financeLog
      .createMany({
        data: rows.map((r) => ({
          entryId: r.entryId,
          action: r.action,
          description: r.description.slice(0, 200),
          before: r.before == null ? Prisma.DbNull : json(r.before),
          after: r.after == null ? Prisma.DbNull : json(r.after),
          reason,
        })),
      })
      .catch((e) => console.error("[histórico] não gravou:", e));
  };

  return base.$extends({
    query: {
      financeEntry: {
        async create({ args, query }) {
          const r = (await query(args)) as Row;
          await log([{ entryId: r.id, action: "create", description: r.description, after: r }]);
          return r;
        },
        async createMany({ args, query }) {
          const res = await query(args);
          const data = (Array.isArray(args.data) ? args.data : [args.data]) as Record<string, unknown>[];
          await log(data.map((d) => ({ entryId: String(d.id ?? ""), action: "create", description: String(d.description ?? ""), after: d })));
          return res;
        },
        async update({ args, query }) {
          const before = await base.financeEntry.findUnique({ where: args.where });
          const r = (await query(args)) as Row;
          await log([{ entryId: r.id, action: "update", description: r.description, before, after: r }]);
          return r;
        },
        async updateMany({ args, query }) {
          const before = await base.financeEntry.findMany({ where: args.where });
          const res = await query(args);
          const after = before.length ? await base.financeEntry.findMany({ where: { id: { in: before.map((b) => b.id) } } }) : [];
          const byId = new Map(after.map((a) => [a.id, a]));
          await log(before.map((b) => ({ entryId: b.id, action: "update", description: b.description, before: b, after: byId.get(b.id) })));
          return res;
        },
        async upsert({ args, query }) {
          const before = await base.financeEntry.findUnique({ where: args.where });
          const r = (await query(args)) as Row;
          await log([{ entryId: r.id, action: before ? "update" : "create", description: r.description, before, after: r }]);
          return r;
        },
        async delete({ args, query }) {
          const r = (await query(args)) as Row;
          await log([{ entryId: r.id, action: "delete", description: r.description, before: r }]);
          return r;
        },
        async deleteMany({ args, query }) {
          const before = await base.financeEntry.findMany({ where: args.where });
          const res = await query(args);
          await log(before.map((b) => ({ entryId: b.id, action: "delete", description: b.description, before: b })));
          return res;
        },
      },
    },
  });
}

type Client = ReturnType<typeof createClient>;
const globalForPrisma = globalThis as unknown as { prisma: Client };
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
