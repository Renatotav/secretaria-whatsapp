import { NextResponse } from "next/server";
import { createSession, clearSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = body.password ?? "";

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Senha inválida" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
