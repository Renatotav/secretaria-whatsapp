// Importa direto da implementação interna, não do index.js — o index.js do
// pdf-parse@1.1.1 tenta ler um PDF de teste em disco quando `module.parent`
// não existe (o caso de bundlers como o Turbopack), quebrando o build/boot.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<{ text: string }>;

/**
 * Extrai o texto de um PDF (base64). Funciona bem para PDFs gerados
 * digitalmente (extratos, notas fiscais); PDFs que são só uma imagem
 * escaneada sem camada de texto retornam string vazia.
 */
export async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const result = await pdfParse(buffer);
  return result.text.trim();
}
