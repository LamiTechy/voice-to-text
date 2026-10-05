import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import {
  SESSION_DURATION,
  signSession,
  verifySession,
  type SessionPayload,
} from "./jwt";
import type { SessionRole, SessionUser } from "./types";

export type { SessionRole, SessionUser };

export const SESSION_COOKIE = "voicebridge_session";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION,
} as const;

export function toSessionUser(user: Pick<User, "id" | "name" | "email" | "role">): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Resolves the signed-in user. Falls back to JWT claims when the database is
 * unreachable so that `/api/auth/me` still reports a session to the client.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, session.sub))
      .limit(1);
    if (user) return toSessionUser(user);
  } catch {
    // database unavailable — trust the signed token
  }

  return { id: session.sub, name: session.name, email: session.email, role: session.role };
}
