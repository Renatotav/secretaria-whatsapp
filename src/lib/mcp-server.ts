import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { FERRAMENTAS } from "./mcp-tools";

// Servidor MCP da secretária (Streamable HTTP, só leitura), usado por duas
// rotas: /api/mcp com "Authorization: Bearer <chave>" (a chave não aparece no
// registro de acessos) e /api/mcp/<chave> (o conector do claude.ai só aceita
// endereço). Chave gerada pelo WhatsApp com "mcp chave".

export async function chaveOk(token: string): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { mcpToken: true } });
  const esperado = cfg?.mcpToken || "";
  return esperado.length >= 32 && token.length === esperado.length && timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
}

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const erro = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function tratar(m: Rpc) {
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "secretaria-renato", version: "1.0.0" },
        instructions: "Dados do Renato: chamados do trabalho (suporte do PJe/TJCE, já sem CPF/telefone), financeiro pessoal, agenda e scooter. Só leitura. Responda em português.",
      });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: FERRAMENTAS.map(({ name, description, inputSchema, escreve }) => ({ name, description, inputSchema, annotations: { readOnlyHint: !escreve } })) });
    case "tools/call": {
      const f = FERRAMENTAS.find((x) => x.name === m.params?.name);
      if (!f) return erro(m.id, -32602, "Ferramenta desconhecida");
      try {
        const texto = await f.run((m.params?.arguments as Record<string, unknown>) || {});
        console.log(`[mcp] ${f.name}`);
        return ok(m.id, { content: [{ type: "text", text: texto }] });
      } catch (e) {
        return ok(m.id, { content: [{ type: "text", text: `Erro: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default:
      return m.id === undefined || m.id === null ? null : erro(m.id, -32601, "Método não suportado");
  }
}

export async function responderMcp(request: Request, chave: string): Promise<Response> {
  if (!(await chaveOk(chave))) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json(erro(null, -32700, "JSON inválido"), { status: 400 });
  if (Array.isArray(body)) {
    const res = (await Promise.all(body.map(tratar))).filter(Boolean);
    return res.length ? NextResponse.json(res) : new NextResponse(null, { status: 202 });
  }
  const r = await tratar(body);
  return r ? NextResponse.json(r) : new NextResponse(null, { status: 202 });
}
