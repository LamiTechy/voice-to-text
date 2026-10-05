import type { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { readJson, requireDb } from "@/lib/api/http";
import { getSessionUser } from "@/lib/auth/session";
import { conversions } from "@/lib/db/schema";
import { errorResponse, jsonError, jsonOk } from "@/lib/utils/errors";
import {
  collectIssues,
  firstIssueMessage,
  historyDeleteSchema,
  historyListSchema,
  historySchema,
} from "@/lib/utils/validators";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonError("UNAUTHORIZED", "Sign in to view your conversion history.", 401);
    }

    const url = new URL(request.url);
    const parsed = historyListSchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const db = requireDb();
    const filters = [eq(conversions.userId, user.id)];
    if (parsed.data.type) filters.push(eq(conversions.type, parsed.data.type));

    const rows = await db
      .select()
      .from(conversions)
      .where(and(...filters))
      .orderBy(desc(conversions.createdAt))
      .limit(parsed.data.limit)
      .offset(parsed.data.offset);

    return jsonOk({ conversions: rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonError("UNAUTHORIZED", "Sign in to save conversions to your history.", 401);
    }

    const body = await readJson(request);
    const parsed = historySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const db = requireDb();
    const [row] = await db
      .insert(conversions)
      .values({
        userId: user.id,
        type: parsed.data.type,
        inputText: parsed.data.input_text,
        outputText: parsed.data.output_text,
        language: parsed.data.language,
        voice: parsed.data.voice ?? null,
        durationSeconds: parsed.data.duration_seconds ?? null,
        settings: parsed.data.settings,
      })
      .returning();

    return jsonOk({ conversion: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return jsonError("UNAUTHORIZED", "Sign in to manage your conversion history.", 401);
    }

    const body = await readJson(request);
    const parsed = historyDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const db = requireDb();
    const deleted = await db
      .delete(conversions)
      .where(and(eq(conversions.id, parsed.data.id), eq(conversions.userId, user.id)))
      .returning({ id: conversions.id });

    if (deleted.length === 0) {
      return jsonError("NOT_FOUND", "That conversion was not found in your history.", 404);
    }

    return jsonOk({ ok: true, id: parsed.data.id });
  } catch (error) {
    return errorResponse(error);
  }
}
