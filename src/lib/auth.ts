import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  readCookie,
} from "./session-token";

export { SESSION_COOKIE };

export async function isAuthenticated(request: Request): Promise<boolean> {
  return verifySessionToken(readCookie(request.headers.get("cookie") ?? "", SESSION_COOKIE));
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
