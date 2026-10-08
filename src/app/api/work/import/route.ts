import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { importWorkSpreadsheet } from "@/lib/work-import";

// Upload da planilha de chamados (.xlsx) pelo painel (protegido pelo login).
export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Envie o arquivo .xlsx" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Arquivo grande demais (máx. 15 MB)" }, { status: 400 });
    return NextResponse.json(await importWorkSpreadsheet(Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
