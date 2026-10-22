import { responderMcp } from "@/lib/mcp-server";

// Conector MCP com a chave no endereço (/api/mcp/<chave>) — o do claude.ai só
// aceita assim. Quem aceita cabeçalho deve usar /api/mcp (a chave não fica no
// registro de acessos do servidor).
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return responderMcp(request, token);
}
