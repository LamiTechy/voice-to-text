import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { readJson, requireDb } from "@/lib/api/http";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, toSessionUser } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";
import { errorResponse, jsonError, jsonOk } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { collectIssues, firstIssueMessage, loginSchema } from "@/lib/utils/validators";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`login:${clientIp(request)}`, 15, 60_000);
    if (!limit.ok) {
      return jsonError(
        "RATE_LIMITED",
        "Too many sign-in attempts. Please wait a moment and try again.",
        429,
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }

    const body = await readJson(request);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const db = requireDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!user) {
      return jsonError("UNAUTHORIZED", "Invalid email or password.", 401);
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return jsonError("UNAUTHORIZED", "Invalid email or password.", 401);
    }

    await setSessionCookie({ sub: user.id, name: user.name, email: user.email, role: user.role });
    return jsonOk({ user: toSessionUser(user) });
  } catch (error) {
    return errorResponse(error);
  }
}
