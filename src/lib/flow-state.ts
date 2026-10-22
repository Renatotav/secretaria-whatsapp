import { prisma } from "./prisma";

// Guarda no banco os estados de conversa que antes viviam só na memória, para
// um deploy no meio de uma pergunta ("sim?", "soma?") não perder a resposta.
// Datas viram {$d: "ISO"} no JSON e voltam como Date.

function encode(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, function (key, v) {
      const raw = (this as Record<string, unknown>)[key];
      return raw instanceof Date ? { $d: raw.toISOString() } : v;
    })
  );
}

function decode(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$d === "string" ? new Date(v.$d) : v
  );
}

export async function loadFlowStates(): Promise<Record<string, unknown>> {
  const rows = await prisma.flowState.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, decode(r.value)]));
}

/** Grava só o que mudou desde a última gravação (null apaga). */
const lastJson = new Map<string, string>();
export async function saveFlowStates(states: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(states)) {
    const json = value == null ? "" : JSON.stringify(encode(value));
    if (lastJson.get(key) === json) continue;
    if (!json) await prisma.flowState.deleteMany({ where: { key } });
    else await prisma.flowState.upsert({ where: { key }, create: { key, value: JSON.parse(json) }, update: { value: JSON.parse(json) } });
    lastJson.set(key, json);
  }
}

/** Marca o que veio do banco como já gravado (não regrava à toa). */
export function markFlowStatesLoaded(states: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(states)) lastJson.set(key, value == null ? "" : JSON.stringify(encode(value)));
}

/** true se o id é novo (e já fica gravado); false se a mensagem já foi processada. */
export async function claimMessageId(id: string): Promise<boolean> {
  try {
    const { count } = await prisma.processedMessage.createMany({ data: [{ id }], skipDuplicates: true });
    return count === 1;
  } catch (e) {
    console.error("[webhook] não gravou o id da mensagem:", e);
    return true; // banco com problema: segue (a memória ainda segura repetições)
  }
}

export async function pruneProcessedMessages(): Promise<void> {
  await prisma.processedMessage.deleteMany({ where: { at: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
}
