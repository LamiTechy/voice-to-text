import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  DashboardClient,
  type ConversionRow,
  type DashboardStats,
} from "@/components/dashboard/dashboard-client";
import { getSessionUser } from "@/lib/auth/session";
import { DatabaseNotConfiguredError, getDb } from "@/lib/db";
import { conversions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ denied?: string }>;
}

function buildStats(rows: ConversionRow[]): DashboardStats {
  const total = rows.length;
  const tts = rows.filter((row) => row.type === "tts").length;
  const stt = total - tts;
  const seconds = rows.reduce((sum, row) => sum + (row.durationSeconds ?? 0), 0);

  const byLanguage = new Map<string, number>();
  for (const row of rows) {
    if (!row.language) continue;
    byLanguage.set(row.language, (byLanguage.get(row.language) ?? 0) + 1);
  }
  let topLanguage: string | null = null;
  let topCount = 0;
  for (const [language, count] of byLanguage) {
    if (count > topCount) {
      topLanguage = language;
      topCount = count;
    }
  }

  return { total, tts, stt, minutes: seconds / 60, topLanguage };
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  const params = await searchParams;

  let rows: ConversionRow[] = [];
  let dbError: string | null = null;

  try {
    const db = getDb();
    const records = await db
      .select()
      .from(conversions)
      .where(eq(conversions.userId, user.id))
      .orderBy(desc(conversions.createdAt))
      .limit(200);

    rows = records.map((record) => ({
      id: record.id,
      type: record.type,
      inputText: record.inputText,
      outputText: record.outputText,
      language: record.language,
      voice: record.voice,
      durationSeconds: record.durationSeconds,
      settings: record.settings ?? {},
      createdAt: record.createdAt.toISOString(),
    }));
  } catch (error) {
    dbError =
      error instanceof DatabaseNotConfiguredError
        ? error.message
        : "Your history could not be loaded right now. Please try again shortly.";
    console.error("[dashboard] failed to load history:", error);
  }

  return (
    <DashboardClient
      user={user}
      initialRows={rows}
      stats={buildStats(rows)}
      dbError={dbError}
      denied={params.denied === "admin"}
    />
  );
}
