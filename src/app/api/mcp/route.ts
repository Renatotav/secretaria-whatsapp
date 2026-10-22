import { responderMcp } from "@/lib/mcp-server";

// Conector MCP com a chave no cabeçalho: Authorization: Bearer <chave>.
export async function POST(request: Request) {
  const chave = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return responderMcp(request, chave);
}
