import path from "path";
import os from "os";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { maskPersonalData, normalizeTicketId } from "./work-privacy";

// Leitura LOCAL dos prints do celular do trabalho (OCR com Tesseract, aqui no
// servidor): nenhuma imagem sai para IA. Serve para achar o nº do chamado e
// montar um resumo curto (serviço, categoria e começo da descrição).

const LANG_PATH = path.join(process.cwd(), "node_modules/@tesseract.js-data/por/4.0.0");

/** Texto da imagem (ampliada, em tons de cinza). */
export async function readImageText(images: Buffer[]): Promise<string[]> {
  if (!images.length) return [];
  const worker = await createWorker("por", 1, { langPath: LANG_PATH, cachePath: os.tmpdir(), gzip: true });
  try {
    const out: string[] = [];
    for (const img of images) {
      const meta = await sharp(img).metadata();
      const width = Math.min((meta.width || 1000) * 2, 2400);
      const prepared = await sharp(img).resize({ width }).grayscale().normalize().png().toBuffer();
      out.push((await worker.recognize(prepared)).data.text || "");
    }
    return out;
  } finally {
    await worker.terminate();
  }
}

const CNJ = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g;

/** Números que parecem chamado no texto lido (o OCR erra: quem chama confere no banco). */
export function ticketCandidates(text: string): string[] {
  const t = text.replace(CNJ, " ");
  const found = new Set<string>();
  for (const m of t.matchAll(/(?:chamado|progresso\s*>)\s*(?:n[\s.]*[ºo°]?\.?\s*|#\s*)?[*_]*([A-Za-z]?\d{6,9})/gi)) found.add(normalizeTicketId(m[1]));
  for (const m of t.matchAll(/\b([RS]?\d{7})\b/g)) found.add(normalizeTicketId(m[1]));
  return [...found];
}

/** Resumo do print do Assyst: serviço, categoria e começo da descrição (mascarado). */
export function summarizeAssystPrint(text: string): string {
  const line = (label: RegExp) => {
    const m = text.match(label);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  };
  const servico = line(/Servi[cç]o\*?\s*[:"”]?\s*(.+)/i);
  const categoria = line(/Categoria\*?\s*[:"”]?\s*(.+)/i);
  const desc = text.match(/Descri[cç][aã]o\*?\s*[:"”]?\s*([\s\S]{20,600})/i)?.[1] || "";
  const firstSentence = desc.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0].slice(0, 280);
  const parts = [servico && `Serviço: ${servico}`, categoria && `Categoria: ${categoria}`, firstSentence && `Descrição: ${firstSentence}`].filter(Boolean);
  return maskPersonalData(parts.join("\n"));
}
