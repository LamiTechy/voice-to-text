import { desc, eq, sql } from "drizzle-orm";
import { conversions, users } from "@/lib/db/schema";
import { requireDb } from "./http";

export interface AdminStats {
  totalUsers: number;
  totalConversions: number;
  ttsCount: number;
  sttCount: number;
  totalAudioSeconds: number;
  mostUsedLanguage: string | null;
  recentActivity: Array<{
    id: string;
    type: "tts" | "stt";
    language: string;
    createdAt: string;
    userEmail: string | null;
    userName: string | null;
    preview: string;
  }>;
}

/** Aggregated statistics shown on the admin dashboard (requires a database). */
export async function computeAdminStats(): Promise<AdminStats> {
  const db = requireDb();

  const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  const typeRows = await db
    .select({
      type: conversions.type,
      count: sql<number>`count(*)::int`,
      seconds: sql<number>`coalesce(sum(${conversions.durationSeconds}), 0)::int`,
    })
    .from(conversions)
    .groupBy(conversions.type);

  const languageRows = await db
    .select({
      language: conversions.language,
      count: sql<number>`count(*)::int`,
    })
    .from(conversions)
    .groupBy(conversions.language)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  const recent = await db
    .select({
      id: conversions.id,
      type: conversions.type,
      language: conversions.language,
      createdAt: conversions.createdAt,
      inputText: conversions.inputText,
      outputText: conversions.outputText,
      userEmail: users.email,
      userName: users.name,
    })
    .from(conversions)
    .leftJoin(users, eq(conversions.userId, users.id))
    .orderBy(desc(conversions.createdAt))
    .limit(15);

  const ttsCount = typeRows.find((row) => row.type === "tts")?.count ?? 0;
  const sttCount = typeRows.find((row) => row.type === "stt")?.count ?? 0;
  const totalAudioSeconds = typeRows.reduce((sum, row) => sum + (row.seconds ?? 0), 0);

  return {
    totalUsers: userCount?.count ?? 0,
    totalConversions: ttsCount + sttCount,
    ttsCount,
    sttCount,
    totalAudioSeconds,
    mostUsedLanguage: languageRows[0]?.language ?? null,
    recentActivity: recent.map((row) => ({
      id: row.id,
      type: row.type,
      language: row.language,
      createdAt: row.createdAt.toISOString(),
      userEmail: row.userEmail,
      userName: row.userName,
      preview: (row.outputText || row.inputText || "").slice(0, 90),
    })),
  };
}
