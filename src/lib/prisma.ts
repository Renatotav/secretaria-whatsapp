import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function resolveDbUrl(raw: string): string {
  if (raw.startsWith("file:./") || raw.startsWith("file:dev")) {
    return `file:${path.resolve(raw.slice(5))}`;
  }
  return raw;
}

const url = resolveDbUrl(process.env.DATABASE_URL ?? "file:./dev.db");
const adapter = new PrismaLibSql({ url });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
