import { X509Certificate, createVerify } from "crypto";
import { rootCertificates } from "tls";
import { prisma } from "./prisma";

// Skill particular "minha secretária" na Alexa (modo desenvolvedor, só na
// conta dele). Toda chamada é conferida como a Amazon manda: certificado de
// s3.amazonaws.com/echo.api/, assinatura do corpo, horário (150 s) e o ID da
// skill cadastrado pelo WhatsApp ("alexa skill amzn1.ask.skill...").

const certCache = new Map<string, { leaf: X509Certificate; at: number }>();

function certUrlOk(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.toLowerCase() === "s3.amazonaws.com" && u.pathname.startsWith("/echo.api/") && (u.port === "" || u.port === "443");
  } catch {
    return false;
  }
}

const ROOTS = rootCertificates.map((pem) => {
  try {
    return new X509Certificate(pem);
  } catch {
    return null;
  }
}).filter((c): c is X509Certificate => !!c);

export async function leafCert(url: string): Promise<X509Certificate | null> {
  const hit = certCache.get(url);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.leaf;
  const pem = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  const certs = blocks.map((b) => new X509Certificate(b));
  if (!certs.length) return null;
  const now = Date.now();
  const valido = (c: X509Certificate) => now >= Date.parse(c.validFrom) && now <= Date.parse(c.validTo);
  const leaf = certs[0];
  if (!valido(leaf) || !(leaf.subjectAltName || "").split(/,\s*/).includes("DNS:echo-api.amazon.com")) return null;
  // Sobe a cadeia até uma raiz confiável do sistema (ex.: Amazon Root CA 1).
  // A Amazon ainda manda no fim uma ponte para uma raiz antiga (Starfield) que
  // saiu das listas: o que vem depois da raiz confiável não importa.
  for (let i = 0; i < certs.length; i++) {
    const c = certs[i];
    if (ROOTS.some((r) => r.fingerprint256 === c.fingerprint256)) break; // é uma raiz confiável
    if (ROOTS.some((r) => c.checkIssued(r) && c.verify(r.publicKey))) break; // assinado por uma
    const pai = certs[i + 1];
    if (!pai || !valido(pai) || !c.checkIssued(pai) || !c.verify(pai.publicKey)) return null;
  }
  certCache.set(url, { leaf, at: now });
  return leaf;
}

/** Confere se o pedido veio mesmo da Amazon e é da skill dele. */
export async function alexaRequestOk(request: Request, raw: string, body: AlexaBody): Promise<boolean> {
  // Diz no log POR QUE recusou (sem mostrar chave nem assinatura) — o 1º pedido
  // de verdade (15/10) voltou 401 e não dava para saber qual conferência falhou.
  const no = (motivo: string) => (console.warn(`[alexa-skill] recusado: ${motivo}`), false);
  const url = request.headers.get("signaturecertchainurl") || "";
  const sig = request.headers.get("signature-256") || "";
  if (!certUrlOk(url)) return no(url ? "endereço do certificado não é da Amazon" : "sem certificado (não veio da Alexa)");
  if (!sig) return no("sem assinatura Signature-256");
  const ts = Date.parse(body?.request?.timestamp || "");
  if (!ts || Math.abs(Date.now() - ts) > 150_000) return no("horário do pedido fora do prazo de 150 s");
  const cfg = await prisma.agentConfig.findFirst({ select: { alexaSkillId: true } });
  const appId = body?.session?.application?.applicationId || body?.context?.System?.application?.applicationId || "";
  if (!cfg?.alexaSkillId) return no("ID da skill não cadastrado (mande 'alexa skill amzn1.ask.skill...')");
  if (appId !== cfg.alexaSkillId) return no(`ID da skill diferente do cadastrado (veio …${appId.slice(-6)}, cadastrado …${cfg.alexaSkillId.slice(-6)})`);
  const leaf = await leafCert(url).catch((e) => (console.warn("[alexa-skill] certificado:", e instanceof Error ? e.message : e), null));
  if (!leaf) return no("certificado da Amazon não conferiu");
  const ok = createVerify("RSA-SHA256").update(raw).verify(leaf.publicKey, sig, "base64");
  return ok || no("assinatura não confere");
}

export interface AlexaBody {
  session?: { application?: { applicationId?: string } };
  context?: { System?: { application?: { applicationId?: string } } };
  request?: { type?: string; timestamp?: string; intent?: { name?: string; slots?: Record<string, { value?: string }> } };
}

// Intenção → começo da frase (a Alexa tira a palavra que disparou a intenção).
const PREFIXO: Record<string, string> = {
  AnotarIntent: "",
  PerguntarIntent: "",
  LembrarIntent: "me lembra ",
  QuantoIntent: "quanto ",
  ComoIntent: "como ",
  QualIntent: "qual ",
};

/** Texto da resposta do WhatsApp → fala (sem emoji, markdown e listas). */
export function paraFala(t: string): string {
  return t
    // "R$ -2.551,76" / "−R$ 10,00" → "menos 2551 reais e 76 centavos".
    .replace(/(?:[-−]\s*R\$\s?|R\$\s?([-−])?)(\d{1,3}(?:\.\d{3})*),(\d{2})/g, (m: string, neg: string | undefined, r: string, c: string) =>
      {
        // Na fala, sem centavos (arredonda): "244 reais", não "244 reais e 25 centavos".
        const v = Math.round(Number(r.replace(/\./g, "")) + Number(c) / 100);
        return `${neg || /^[-−]/.test(m) ? "menos " : ""}${v.toLocaleString("pt-BR")} ${v === 1 ? "real" : "reais"}`;
      })
    .replace(/[*_~`]/g, "")
    .replace(/\s*\([^)]{0,80}\)/g, "")
    .replace(/\s*·\s*/g, ", ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/^\s*[•\-–]\s*/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/([:;,])\s*\./g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 700);
}

export function falar(texto: string, fim = true) {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text: texto },
      ...(fim ? {} : { reprompt: { outputSpeech: { type: "PlainText", text: "Pode falar." } } }),
      shouldEndSession: fim,
    },
  };
}

/** O que ele disse, como mensagem para a secretária (null = não é pedido). */
export function frase(body: AlexaBody): string | null {
  const it = body.request?.intent;
  if (!it?.name || !(it.name in PREFIXO)) return null;
  const v = it.slots?.texto?.value?.trim();
  return v ? `${PREFIXO[it.name]}${v}` : null;
}
