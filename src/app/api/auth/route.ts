import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSession, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyOwner } from "@/lib/message-handlers";

// Login do painel. O endereço é público e a senha é curta, então há limite de
// tentativas: 5 erros por IP em 15 min bloqueiam aquele IP por 15 min; 30
// erros no total em 1 hora deixam cada tentativa 4 s mais lenta e 100 travam
// o login até a hora esfriar. Na 10ª falha da hora a
// secretária avisa o dono no WhatsApp. (Fica na memória: reinício zera.)

const PER_IP = 5;
const IP_WINDOW = 15 * 60_000;
const GLOBAL = 30;
const GLOBAL_WINDOW = 60 * 60_000;
const HARD_CAP = 100;

const byIp = new Map<string, number[]>();
let allFails: number[] = [];
let warned = 0;

const recent = (list: number[], win: number) => list.filter((t) => Date.now() - t < win);

// O proxy do EasyPanel (Traefik) ACRESCENTA o IP real no fim do
// X-Forwarded-For; o começo da lista quem escreve é o próprio cliente.
function clientIp(request: Request) {
  const hops = (request.headers.get("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
  return hops[hops.length - 1] || request.headers.get("x-real-ip") || "?";
}

function samePassword(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const ipFails = recent(byIp.get(ip) ?? [], IP_WINDOW);
  allFails = recent(allFails, GLOBAL_WINDOW);
  if (ipFails.length >= PER_IP) {
    return NextResponse.json({ error: "Muitas tentativas. Espere alguns minutos e tente de novo." }, { status: 429 });
  }
  // Muitas falhas no geral (vários IPs): primeiro deixa cada tentativa bem
  // mais lenta; passando de HARD_CAP na hora, recusa até a janela esfriar.
  if (allFails.length >= HARD_CAP) {
    return NextResponse.json({ error: "Login temporariamente bloqueado por excesso de tentativas. Tente mais tarde." }, { status: 429 });
  }
  if (allFails.length >= GLOBAL) await new Promise((r) => setTimeout(r, 4000));

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
