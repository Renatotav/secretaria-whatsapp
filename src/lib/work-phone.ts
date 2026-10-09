import { unzipSync, strFromU8 } from "fflate";
import type { AgentConfig } from "@prisma/client";
import { prisma } from "./prisma";
import { downloadIncomingMedia, notifyOwner } from "./message-handlers";
import { upsertWorkTicket } from "./work";
import { maskPersonalData, normalizeTicketId } from "./work-privacy";

// Celular institucional → secretária. O dono encaminha (ou exporta) do
// WhatsApp do trabalho para o próprio número a conversa com o usuário, com
// "chamado 2154585" no meio. Nada disso passa por IA nem vira conversa do
// CRM: o texto é guardado no chamado com CPF mascarado e sem telefone/e-mail,
// e as imagens viram anexo. Áudio é ignorado (transcrever usaria IA).

type Evo = { evolutionUrl: string; evolutionApiKey: string; instanceId: string };

interface Session {
  lines: string[];
  images: { mimetype: string; data: Buffer; caption: string }[];
  skipped: number;
  /** Resumo dos prints do Assyst (lidos aqui, sem IA). */
  prints?: string[];
  timer?: ReturnType<typeof setTimeout>;
  /** Esperando o dono dizer o chamado (até quando). */
  waitingUntil?: number;
}

// Uma sessão só (há um celular institucional). Fica na memória: se o app
// reiniciar no meio, ele encaminha de novo.
let session: Session | null = null;
const IDLE_MS = 45_000;
const WAIT_MS = 30 * 60_000;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_LOG = 60_000;
const PAIR_RE = /^\s*vincular\s+(\d{4,6})\s*$/i;

const CNJ = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g;

/** Nº do chamado no texto: "chamado 2154585" (ou uma linha só com o número). */
export function findTicketInText(text: string): string | null {
  const t = text.replace(CNJ, " ");
  const m = t.match(/chamado\s*(?:n[\s.]*[ºo°]?\.?\s*|#\s*)?[*_]*([A-Za-z]?\d{6,9})\b/i);
  if (m) return normalizeTicketId(m[1]);
  const line = t.split("\n").map((l) => l.trim()).find((l) => /^[A-Za-z]?\d{6,9}$/.test(l));
  return line ? normalizeTicketId(line) : null;
}

/** Vínculo: no painel ele gera um código e manda "vincular 1234" do celular institucional. */
export async function tryPairWorkPhone(config: AgentConfig, phone: string, text: string): Promise<boolean> {
  const m = text.match(PAIR_RE);
  if (!m || !config.workPairCode) return false;
  const [code, until] = config.workPairCode.split("|");
  if (code !== m[1] || Date.now() > Number(until)) return false;
  await prisma.agentConfig.update({ where: { id: config.id }, data: { workPhone: phone, workPairCode: "" } });
  await notifyOwner(config, "📱 Celular institucional vinculado! Agora é só encaminhar a conversa do usuário para cá com \"chamado 2154585\" no meio.");
  return true;
}

function textOf(message: Record<string, unknown>): string {
  const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
  const img = message.imageMessage as Record<string, unknown> | undefined;
  const doc = message.documentMessage as Record<string, unknown> | undefined;
  const docCaption = (message.documentWithCaptionMessage as { message?: { documentMessage?: { caption?: string } } } | undefined)?.message?.documentMessage?.caption;
  return String(message.conversation || ext?.text || img?.caption || doc?.caption || docCaption || "").trim();
}

/** Conversa exportada (.txt, ou .zip do iPhone com o .txt dentro). */
async function exportedChat(evo: Evo, messageId: string, message: Record<string, unknown>): Promise<string> {
  const doc = (message.documentMessage ??
    (message.documentWithCaptionMessage as { message?: { documentMessage?: Record<string, unknown> } } | undefined)?.message?.documentMessage) as
    | Record<string, unknown>
    | undefined;
  if (!doc) return "";
  const name = String(doc.fileName || "").toLowerCase();
  const mime = String(doc.mimetype || "");
  const isTxt = mime.startsWith("text/") || name.endsWith(".txt");
  const isZip = mime.includes("zip") || name.endsWith(".zip");
  if (!isTxt && !isZip) return "";
  const msg = message.documentMessage ? message : { ...message, documentMessage: doc };
  const { base64 } = await downloadIncomingMedia(evo, messageId, msg, "documentMessage", mime || "text/plain");
  if (!base64) return "";
  const buf = Buffer.from(base64, "base64");
  if (isTxt) return buf.toString("utf8");
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name.toLowerCase().endsWith(".txt") });
  return Object.values(files).map((f) => strFromU8(f)).join("\n");
}

/** Toda mensagem que chega do celular institucional passa por aqui (nunca pela IA). */
export async function handleWorkPhoneMessage(config: AgentConfig, evo: Evo, messageId: string, message: Record<string, unknown>): Promise<void> {
  if (!session) session = { lines: [], images: [], skipped: 0 };
  const s = session;
  try {
    const chat = await exportedChat(evo, messageId, message);
    if (chat) s.lines.push(chat.trim());
    else if (message.imageMessage) {
      const { base64, mimetype } = await downloadIncomingMedia(evo, messageId, message, "imageMessage", "image/jpeg");
      const data = Buffer.from(base64 || "", "base64");
      if (data.length > 0 && data.length <= MAX_IMAGE) s.images.push({ mimetype, data, caption: maskPersonalData(textOf(message)).slice(0, 500) });
      else s.skipped++;
      const caption = textOf(message);
      if (caption) s.lines.push(caption);
    } else {
      const text = textOf(message);
      if (text) s.lines.push(text);
      else s.skipped++; // áudio, vídeo, figurinha…
    }
  } catch (err) {
    console.error("[trabalho] celular institucional:", err instanceof Error ? err.message : err);
    s.skipped++;
  }
  // Só tipos e contagens no log, nunca o conteúdo.
  console.log("[trabalho] celular do trabalho:", Object.keys(message).filter((k) => k !== "messageContextInfo").join(","), `· ${s.lines.length} texto(s), ${s.images.length} imagem(ns), ${s.skipped} ignorado(s)`);
  // Espera parar de chegar mensagem (encaminhar várias leva alguns segundos).
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    flush(config).catch((err) => console.error("[trabalho] falha ao juntar a conversa:", err instanceof Error ? err.stack : err));
  }, IDLE_MS);
}

async function flush(config: AgentConfig) {
  const s = session;
  if (!s || (!s.lines.length && !s.images.length)) return;
  let ticket = findTicketInText(s.lines.join("\n"));
  // Prints: leitura local (sem IA) para o resumo e, se faltar, o nº do chamado.
  if (s.images.length && !s.prints) {
    try {
      const { readImageText, summarizeAssystPrint, ticketCandidates, conversationFromPrint } = await import("./work-ocr");
      const texts = await readImageText(s.images.slice(0, 6).map((i) => i.data));
      // Print do Assyst → resumo; print de conversa → o texto lido (mascarado).
      s.prints = texts
        .map((t) => {
          const assyst = summarizeAssystPrint(t);
          return assyst ? `🖼️ Print do chamado:\n${assyst}` : conversationFromPrint(t) ? `🖼️ Texto do print:\n${conversationFromPrint(t)}` : "";
        })
        .filter(Boolean);
      for (const t of texts) {
        if (ticket) break;
        // "chamado n.º 2120102" no print da mensagem padrão: confiável.
        ticket = findTicketInText(t);
        // Número solto (ex: trilha do Assyst): só vale se o chamado já existe aqui.
        if (!ticket) {
          for (const c of ticketCandidates(t)) {
            if (await prisma.workTicket.findUnique({ where: { ticketId: c }, select: { id: true } })) {
              ticket = c;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("[trabalho] leitura do print:", err instanceof Error ? err.message : err);
      s.prints = [];
    }
  }
  console.log(`[trabalho] juntando: ${s.lines.length} texto(s), ${s.images.length} imagem(ns) → ${ticket ? "chamado encontrado" : "sem número, perguntando"}`);
  if (ticket) return save(config, ticket);
  s.waitingUntil = Date.now() + WAIT_MS;
  await notifyOwner(
    config,
    `📱 Recebi do celular do trabalho ${s.lines.length} mensagem(ns)${s.images.length ? ` e ${s.images.length} imagem(ns)` : ""}, mas não achei o número do chamado.\nDe qual chamado é? Responda: *chamado 2154585*`
  );
}

/** "chamado 2154585" no chat pessoal enquanto há conversa esperando: guarda nesse chamado. */
export async function attachPendingWorkChat(text: string): Promise<string | null> {
  const s = session;
  if (!s?.waitingUntil) return null;
  if (Date.now() > s.waitingUntil) {
    session = null;
    return null;
  }
  const m = text.trim().match(/^(?:o\s+)?(?:chamado\s*)?(?:n[ºo°]?\.?\s*)?([A-Za-z]?\d{6,9})\s*$/i);
  if (!m) return null;
  const config = await prisma.agentConfig.findFirst();
  if (!config) return null;
  return save(config, normalizeTicketId(m[1]), false);
}

async function save(config: AgentConfig, ticketId: string, notify = true): Promise<string> {
  const s = session!;
  session = null;
  if (s.timer) clearTimeout(s.timer);
  const existing = await prisma.workTicket.findUnique({ where: { ticketId }, select: { chatLog: true } });
  if (!existing) await upsertWorkTicket({ ticketId }, "whatsapp");
  const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const body = [s.lines.length ? maskPersonalData(s.lines.join("\n")).trim() : "", ...(s.prints || [])].filter(Boolean);
  const block = body.length ? `── ${stamp} · celular do trabalho ──\n${body.join("\n\n")}` : "";
  if (block) {
    const log = [existing?.chatLog, block].filter(Boolean).join("\n\n");
    await prisma.workTicket.update({ where: { ticketId }, data: { chatLog: log.length > MAX_LOG ? log.slice(-MAX_LOG) : log } });
  }
  for (const img of s.images) {
    await prisma.workAttachment.create({ data: { ticketId, mimetype: img.mimetype, caption: img.caption, data: new Uint8Array(img.data) } });
  }
  const t = await prisma.workTicket.findUnique({ where: { ticketId }, select: { status: true, resolution: true, redmine: true, redmineStatus: true } });
  const statusLine =
    t?.status === "resolvido"
      ? `✅ Resolvido${t.resolution ? `: ${t.resolution.slice(0, 160)}` : ""}`
      : t?.status === "escalado"
      ? `🔁 Virou Redmine${t.redmine ? ` #${t.redmine}` : ""}`
      : `🟡 Em aberto${t?.redmineStatus ? ` · Redmine ${t.redmineStatus}` : ""}`;
  // A conversa parece pedir urgência? (Jev, decisão rápida; sem certeza = sem aviso)
  let urgent = false;
  if (s.lines.length) {
    try {
      const { decide } = await import("./jev");
      const a = (await decide(maskPersonalData(s.lines.join("\n")).slice(-6000), { u: { type: "noul", instructions: "O usuário pede urgência, fala em prazo vencendo, audiência próxima ou sessão de julgamento?" } })).u;
      urgent = !!a && a.type === "noul" && a.noul >= 0.7;
    } catch {
      // sem aviso de urgência
    }
  }
  const reply = [
    `📱 Chamado *${ticketId}*${existing ? "" : " (novo)"} — ${statusLine}`,
    urgent ? "🚨 A conversa parece pedir urgência." : "",
    ...(s.prints || []).slice(0, 1).map((p) => `📝 ${p.replace(/^🖼️ [^\n]*\n/, "").replace(/\n/g, " · ").slice(0, 300)}`),
    "Salvo:",
    s.lines.length ? `• ${s.lines.join("\n").split("\n").filter((l) => l.trim()).length} linha(s) de texto (CPF mascarado, sem telefone/e-mail)` : "",
    s.images.length ? `• ${s.images.length} imagem(ns) anexada(s)` : "",
    s.skipped ? `• ${s.skipped} item(ns) ignorado(s) (áudio/vídeo/figurinha)` : "",
    "Veja no painel › 💼 Trabalho.",
  ]
    .filter(Boolean)
    .join("\n");
  if (notify) await notifyOwner(config, reply);
  return reply;
}
