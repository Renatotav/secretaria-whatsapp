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

/** Print de conversa (WhatsApp): o texto lido, limpo e mascarado (sem a faixa de criptografia). */
export function conversationFromPrint(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1)
    .filter((l) => !/criptografia de ponta|Somente as pessoas que fazem parte|podem ler, ouvir|Clique para saber mais/i.test(l));
  return maskPersonalData(lines.join("\n")).slice(0, 4000);
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

/**
 * Print de tela do PJe (o usuário manda junto da dúvida): só o que serve para entender o caso —
 * tarefa(s) do fluxo, mensagem de erro e perfil. Nome, login, partes e nº de processo ficam de fora
 * (nunca entram no resultado, nem mascarados). Vazio = o print não parece tela do PJe.
 */
export function resumoPrintPJe(text: string): string {
  const t = text.replace(/[|]/g, "\n").replace(CNJ, " ").replace(/\b\d{11}\b/g, " ");
  // Nome de tarefa "[Sec] - Certidão - ASSINAR …": o OCR às vezes come o "[" e cola ")] on Token(/)" no fim.
  const tarefas = new Map<string, string>();
  for (const m of t.matchAll(/\[?\b(Sec|SEC|Gab|GAB|Dir|DIR|Plant[aã]o|Ger|GER)\]\s*-\s*([^\n)\]]{4,120})/g)) {
    const nome = `[${m[1]}] - ${m[2].replace(/\s+/g, " ").replace(/\s*(on Token.*)?$/, "").trim()}`;
    tarefas.set(nome.toLowerCase(), nome);
  }
  const erros = [...new Set(t.split("\n").map((l) => l.trim()).filter((l) => /falha|erro (ao|na|no|de|inesperado)|n[aã]o foi poss[ií]vel|n[aã]o [eé] poss[ií]vel|exception|existem tarefas/i.test(l) && !/^\+?\s*\[\d+\]/.test(l)))]
    .map((l) => l.replace(/^.*?(Falha|Erro|N[aã]o foi|N[aã]o [eé]|Existem|Exception)/i, "$1").slice(0, 200));
  const perfil = t.match(/Perfil:?\s*([^\n]{4,160})/i)?.[1].trim();
  const partes = [
    tarefas.size ? `Tarefa(s) na tela: ${[...tarefas.values()].slice(0, 4).join("; ")}` : "",
    erros.length ? `Mensagem na tela: ${erros.slice(0, 2).join(" / ")}` : "",
    perfil ? `Perfil: ${perfil}` : "",
  ].filter(Boolean);
  return maskPersonalData(partes.join("\n"));
}
