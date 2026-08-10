import { NextResponse } from "next/server";

/**
 * Garante que toda rota sempre devolve JSON, mesmo se algo (ex: Prisma)
 * lançar uma exceção não tratada — sem isso, o Next.js devolve uma página
 * de erro HTML, e o frontend quebra com "Unexpected token '<'... is not
 * valid JSON" em vez de mostrar o erro real.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api]", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro interno" },
        { status: 500 }
      );
    }
  };
}
