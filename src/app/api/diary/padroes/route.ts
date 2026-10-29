import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { seusPadroes } from "@/lib/padroes";

export const dynamic = "force-dynamic";

/** Cartão "🔍 Seus padrões" do Diário. */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await seusPadroes());
});
