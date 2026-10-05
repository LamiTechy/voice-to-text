import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { readJson, requireDb } from "@/lib/api/http";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie, toSessionUser } from "@/lib/auth/session";
import { users } from "@/lib/db/schema";
import { errorResponse, jsonError, jsonOk } from "@/lib/utils/errors";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { collectIssues, firstIssueMessage, registerSchema } from "@/lib/utils/validators";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`register:${clientIp(request)}`, 10, 60_000);
    if (!limit.ok) {
      return jsonError(
        "RATE_LIMITED",
        "Too many sign-up attempts. Please wait a moment and try again.",
        429,
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }

    const body = await readJson(request);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const db = requireDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (existing) {
      return jsonError("CONFLICT", "An account with this email already exists.", 409);
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: "user",
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      });

    if (!user) {
      return jsonError("INTERNAL_ERROR", "Account creation failed. Please try again.", 500);
    }

    await setSessionCookie({ sub: user.id, name: user.name, email: user.email, role: user.role });
    return jsonOk({ user: toSessionUser(user) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
