/**
 * Token de sessão assinado: "<expira em ms>.<HMAC-SHA256 hex>". O segredo só
 * existe no servidor (SESSION_SECRET, ou ADMIN_PASSWORD + DATABASE_URL), então não
 * dá pra forjar o cookie lendo o código — antes o valor era fixo
 * ("authenticated") e o repositório é público.
 *
 * Usa Web Crypto pra rodar igual no proxy (src/proxy.ts) e nas rotas.
 */
export const SESSION_COOKIE = "agent_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function sessionSecret(): string {
  // Sem SESSION_SECRET, a senha sozinha é fraca demais como chave: junta a
  // DATABASE_URL (que tem a senha do banco e nunca vai para o repositório).
  return process.env.SESSION_SECRET || `${process.env.ADMIN_PASSWORD || "admin"}|${process.env.DATABASE_URL || ""}`;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`agent_session:${payload}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(): Promise<string> {
  const expires = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expires}.${await sign(expires)}`;
}

async function sameSig(payload: string, sig: string): Promise<boolean> {
  const expected = await sign(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return sameSig(expires, sig);
}

// Login do personal (o irmão, 27/11): "p<expira>-<geração>.<HMAC>". Só abre Treino e Corpo; nunca passa
// no verifySessionToken (o começo não é só número). A geração vale enquanto o acesso não for tirado.
export const PERSONAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function createPersonalToken(gen: string): Promise<string> {
  const payload = `p${Date.now() + PERSONAL_MAX_AGE_SECONDS * 1000}-${gen}`;
  return `${payload}.${await sign(payload)}`;
}

/** Geração do acesso do personal, se o cookie for dele e válido (a rota confere se ainda é a geração atual). */
export async function personalGen(token: string | undefined | null): Promise<string | null> {
  const m = token?.match(/^(p(\d+)-([0-9a-f]{16}))\.([0-9a-f]+)$/);
  if (!m || Number(m[2]) < Date.now()) return null;
  return (await sameSig(m[1], m[4])) ? m[3] : null;
}

/** Lê o valor de um cookie no cabeçalho "cookie" (sem confundir nomes parecidos). */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
