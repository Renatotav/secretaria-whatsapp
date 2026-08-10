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
 * Extrai o texto de um PDF (base64) usando o pdfjs-dist (motor do Firefox)
 * diretamente. PDFs sem camada de texto real (imagem escaneada) retornam
 * string vazia.
 */
export async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
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
