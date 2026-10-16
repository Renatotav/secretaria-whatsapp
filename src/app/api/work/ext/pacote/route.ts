import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";

// Arquivos da última versão da extensão, para ela se regravar na própria pasta.
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const r = await prisma.extRelease.findFirst({ orderBy: { createdAt: "desc" } });
  if (!r) return NextResponse.json({ error: "Nenhuma versão publicada" }, { status: 404 });
  return NextResponse.json({ version: r.version, notes: r.notes, files: JSON.parse(r.files) });
}
