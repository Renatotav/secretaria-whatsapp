import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  readCookie,
  PERSONAL_MAX_AGE_SECONDS,
  createPersonalToken,
  personalGen,
} from "./session-token";
import { acessoPersonal } from "./acesso-personal";

export { SESSION_COOKIE };

export async function isAuthenticated(request: Request): Promise<boolean> {
  return verifySessionToken(readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE));
}

/** Dono, ou o personal (irmão) com o acesso ainda ativo: só para as rotas de Treino e Corpo. */
export async function isAuthenticatedOuPersonal(request: Request): Promise<boolean> {
  if (await isAuthenticated(request)) return true;
  const gen = await personalGen(readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE));
  return !!gen && gen === (await acessoPersonal())?.gen;
}

export async function createPersonalSession(gen: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createPersonalToken(gen), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PERSONAL_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
