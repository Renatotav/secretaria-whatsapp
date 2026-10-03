import path from "path";
import { pathToFileURL } from "url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// Sem worker thread/DOM disponível no servidor — a build "legacy" roda tudo
// na mesma thread, mas ainda precisa do caminho do worker script resolvido
// como file:// URL. Usa process.cwd() em vez de require.resolve/import.meta —
// o Turbopack empacota o módulo e quebra as duas (mesma classe de bug que o
// pdf-parse deu: introspecção de módulo não sobrevive ao empacotamento). O
// node_modules completo (não só o que o Next rastreia) é copiado no Dockerfile,
// então o arquivo sempre existe em process.cwd()/node_modules.
GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
).href;

interface TextItem {
  str?: string;
}

/**
 * PDF protegido (fatura de banco costuma vir com senha): "need" = pede senha,
 * "wrong" = a senha informada não abriu. Qualquer outro erro = null.
 */
export function pdfPasswordError(err: unknown): "need" | "wrong" | null {
  const e = err as { name?: string; code?: number } | null;
  if (e?.name !== "PasswordException") return null;
  return e.code === 2 ? "wrong" : "need";
}

/**
 * Extrai o texto de um PDF (base64) usando o pdfjs-dist (motor do Firefox)
 * diretamente. PDFs sem camada de texto real (imagem escaneada) retornam
 * string vazia. PDF com senha lança PasswordException (ver pdfPasswordError).
 */
export async function extractPdfText(base64: string, password?: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    ...(password ? { password } : {}),
  });

  try {
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items as TextItem[]).map((item) => item.str ?? "").join(" ");
      pages.push(pageText);
    }
    return pages.join("\n").trim();
  } finally {
    await loadingTask.destroy();
  }
}

export interface CardSection {
  last4: string;
  holder: string;
  text: string;
  /** "Subtotal deste cartão" impresso logo depois do cabeçalho, se houver. */
  subtotal: number | null;
}

const normalizeName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z]+/).filter(Boolean);

/**
 * Fatura com mais de um cartão (titular + adicionais): separa o texto pelos
 * cabeçalhos "Final 1234 - NOME" de cada cartão. O mesmo cartão pode aparecer
 * em mais de uma página — os pedaços são juntados pelo final do cartão.
 * Texto antes do primeiro cabeçalho não entra em nenhum bloco.
 */
export function splitCardSections(text: string): CardSection[] {
  const marks = [...text.matchAll(/Final\s+(\d{4})\s*[-–]\s*((?:[A-ZÀ-Ü]+\b\.?\s*)+)/g)];
  const byCard = new Map<string, CardSection>();
  marks.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < marks.length ? marks[i + 1].index ?? text.length : text.length;
    const chunk = text.slice(start, end);
    const sub = chunk.slice(0, 300).match(/Subtotal deste cart[ãa]o\s*R\$\s*([\d.]+,\d{2})/i);
    const subtotal = sub ? Number(sub[1].replace(/\./g, "").replace(",", ".")) : null;
    const prev = byCard.get(m[1]);
    if (prev) {
      prev.text += `\n${chunk}`;
      prev.subtotal ??= subtotal;
    } else {
      byCard.set(m[1], { last4: m[1], holder: m[2].trim(), text: chunk, subtotal });
    }
  });
  return [...byCard.values()];
}

/** O cabeçalho do cartão é do dono? (todas as palavras do nome dele aparecem). */
export function holderMatches(holder: string, ownerName: string): boolean {
  const owner = normalizeName(ownerName).filter((w) => w.length >= 3);
  const words = new Set(normalizeName(holder));
  return owner.length > 0 && owner.every((w) => words.has(w));
}
