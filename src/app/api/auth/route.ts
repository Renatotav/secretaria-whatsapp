import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSession, clearSession } from "@/lib/auth";

// Login do painel. O endereço é público e a senha é curta, então há limite de
// tentativas: 5 erros por IP em 15 min bloqueiam aquele IP por 15 min, e 30
// erros no total em 1 hora travam o login por 1 hora. Na 10ª falha da hora a
// secretária avisa o dono no WhatsApp. (Fica na memória: reinício zera.)

const PER_IP = 5;
const IP_WINDOW = 15 * 60_000;
const GLOBAL = 30;
const GLOBAL_WINDOW = 60 * 60_000;

const byIp = new Map<string, number[]>();
let allFails: number[] = [];
let warned = 0;

const recent = (list: number[], win: number) => list.filter((t) => Date.now() - t < win);

function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "?";
}

function samePassword(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const ipFails = recent(byIp.get(ip) ?? [], IP_WINDOW);
  allFails = recent(allFails, GLOBAL_WINDOW);
  if (ipFails.length >= PER_IP || allFails.length >= GLOBAL) {
    return NextResponse.json({ error: "Muitas tentativas. Espere alguns minutos e tente de novo." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "").trim();
  const adminPassword = (process.env.ADMIN_PASSWORD ?? "admin").trim();

  if (!password || !samePassword(password, adminPassword)) {
    ipFails.push(Date.now());
    byIp.set(ip, ipFails);
    allFails.push(Date.now());
    if (byIp.size > 500) byIp.delete(byIp.keys().next().value as string);
    await new Promise((r) => setTimeout(r, 800)); // atrasa quem tenta em série
    if (allFails.length >= 10 && Date.now() - warned > GLOBAL_WINDOW) {
      warned = Date.now();
      try {
        const { prisma } = await import("@/lib/prisma");
        const { notifyOwner } = await import("@/lib/message-handlers");
        const config = await prisma.agentConfig.findFirst();
        if (config) await notifyOwner(config, `🔐 Atenção: ${allFails.length} tentativas de senha erradas no painel na última hora. Se não foi você, troque a senha (ADMIN_PASSWORD no EasyPanel).`);
      } catch {
        // o bloqueio vale mesmo sem o aviso
      }
    }
    return NextResponse.json({ error: "Senha inválida" }, { status: 401 });
  }

  byIp.delete(ip);
  await createSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
