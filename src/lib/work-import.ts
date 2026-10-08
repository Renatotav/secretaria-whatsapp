import * as XLSX from "xlsx";
import { upsertWorkTicket } from "./work";

// Importa a "Planilha Chamados Erro e Falha" (Excel Online → .xlsx) para a aba
// Trabalho. Acha sozinha a aba e a linha de cabeçalho (a planilha tem título
// em cima, ex: "NOME DO COLABORADOR: ...") e completa os chamados que vieram
// do escala pelo número. CPF é mascarado e telefone/e-mail saem no upsert.

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Coluna da planilha → campo. Procura pelo começo do nome, sem acento.
const COLUMNS: { field: string; test: (h: string) => boolean }[] = [
  { field: "ticketId", test: (h) => /^N[Oº°]? ?CHAMADO|^NUMERO DO CHAMADO|^CHAMADO$/.test(h) },
  { field: "openedAt", test: (h) => h.startsWith("DATA DA ABERTURA") || h.startsWith("DATA ABERTURA") },
  { field: "description", test: (h) => h.startsWith("DESCRICAO DO CHAMADO") },
  { field: "origin", test: (h) => h.startsWith("ORIGEM") },
  { field: "errorType", test: (h) => h.startsWith("TIPO DO ERRO") || h.startsWith("TIPO DE ERRO") },
  { field: "resolution", test: (h) => h.startsWith("DESCRICAO DA RESOLUCAO") || h === "RESOLUCAO" },
];

/** Data da planilha (número do Excel, Date ou "dd/mm/aaaa") → ISO. */
function toISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "number" && v > 20000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d, 15)).toISOString() : null;
  }
  const m = String(v ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), 15)).toISOString();
}

export interface ImportResult {
  aba: string;
  lidas: number;
  salvas: number;
  ignoradas: number;
  erros: string[];
}

export async function importWorkSpreadsheet(buffer: Buffer): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  // A aba certa é a que tem uma coluna de chamado no cabeçalho (ignora "Manual").
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    const headerIdx = rows.slice(0, 30).findIndex((r) => r.some((c) => COLUMNS[0].test(norm(c))));
    if (headerIdx < 0) continue;
    const header = rows[headerIdx].map(norm);
    const col: Record<string, number> = {};
    for (const { field, test } of COLUMNS) {
      const i = header.findIndex(test);
      if (i >= 0) col[field] = i;
    }
    const result: ImportResult = { aba: name, lidas: 0, salvas: 0, ignoradas: 0, erros: [] };
    for (const r of rows.slice(headerIdx + 1)) {
      const ticketId = String(r[col.ticketId] ?? "").trim();
      if (!ticketId) continue;
      result.lidas++;
      const origin = norm(r[col.origin]);
      const resolution = col.resolution !== undefined ? String(r[col.resolution] ?? "").trim() : "";
      try {
        await upsertWorkTicket(
          {
            ticketId,
            openedAt: col.openedAt !== undefined ? toISO(r[col.openedAt]) : null,
            description: col.description !== undefined ? String(r[col.description] ?? "") : undefined,
            errorType: col.errorType !== undefined ? String(r[col.errorType] ?? "") : undefined,
            origin: origin.includes("EXTERNO") ? "externo" : origin.includes("INTERNO") ? "interno" : undefined,
            resolution: resolution || undefined,
            // Com resolução preenchida, o chamado está resolvido (o upsert nunca rebaixa um Redmine).
            status: resolution ? "resolvido" : undefined,
          },
          "planilha"
        );
        result.salvas++;
      } catch (err) {
        result.ignoradas++;
        if (result.erros.length < 10) result.erros.push(`${ticketId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return result;
  }
  throw new Error("Não achei nenhuma aba com a coluna do número do chamado (ex: \"Nº CHAMADO\").");
}
