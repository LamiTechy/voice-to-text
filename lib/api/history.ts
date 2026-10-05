import { getDb } from "@/lib/db";
import { conversions, type Conversion, type NewConversion } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export type { Conversion };

/**
 * Persists a conversion for the signed-in user.
 * Returns `null` for guests or when the database is unavailable — never throws,
 * so callers can treat history as a best-effort side effect.
 */
export async function saveConversion(input: NewConversion): Promise<Conversion | null> {
  try {
    const session = await getSession();
    if (!session) return null;
    const db = getDb();
    const [row] = await db
      .insert(conversions)
      .values({ ...input, userId: session.sub })
      .returning();
    return row ?? null;
  } catch (error) {
    console.error("[history] failed to save conversion:", error);
    return null;
  }
}
