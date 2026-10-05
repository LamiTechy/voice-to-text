import Link from "next/link";
import { redirect } from "next/navigation";
import { computeAdminStats, type AdminStats } from "@/lib/api/admin";
import { AlertIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { formatDateTime, formatDuration } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/dashboard?denied=admin");

  let stats: AdminStats | null = null;
  let error: string | null = null;

  try {
    stats = await computeAdminStats();
  } catch (failure) {
    error = failure instanceof Error ? failure.message : "Statistics are unavailable right now.";
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip">Admin console</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">System overview</h1>
          <p className="mt-1 text-muted">
            Signed in as {user.name} · {user.email}
          </p>
        </div>
        <Link href="/api/admin/stats" className="btn btn-secondary" target="_blank" rel="noreferrer">
          View raw stats API
        </Link>
      </header>

      {error ? (
        <div className="mt-6">
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
          >
            <span className="mt-0.5 shrink-0 text-warning">
              <AlertIcon width={16} height={16} />
            </span>
            <span>{error}</span>
          </div>
          <EmptyState
            title="Database not available"
            description="Set DATABASE_URL and run `npm run db:migrate && npm run db:seed` to populate the admin console."
            action={
              <a href="https://neon.tech" target="_blank" rel="noreferrer" className="btn btn-primary">
                Neon setup guide
              </a>
            }
          />
        </div>
      ) : (
        stats && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total users" value={String(stats.totalUsers)} />
              <StatCard
                label="Total conversions"
                value={String(stats.totalConversions)}
                hint={`${stats.ttsCount} TTS · ${stats.sttCount} STT`}
              />
              <StatCard
                label="Audio processed"
                value={formatDuration(stats.totalAudioSeconds)}
                hint="sum of stored durations"
              />
              <StatCard
                label="Most-used language"
                value={stats.mostUsedLanguage?.toUpperCase() ?? "—"}
              />
            </div>

            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>

              {stats.recentActivity.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  description="Conversions recorded by signed-in users will appear here in real time."
                />
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[46rem] text-left text-sm">
                      <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            When
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            Type
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            User
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            Language
                          </th>
                          <th scope="col" className="px-4 py-3 font-semibold">
                            Preview
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {stats.recentActivity.map((row) => (
                          <tr key={row.id} className="hover:bg-subtle">
                            <td className="whitespace-nowrap px-4 py-3 text-muted">
                              {formatDateTime(row.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "chip",
                                  row.type === "tts" ? "text-primary" : "text-accent",
                                )}
                              >
                                {row.type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="block font-medium">
                                {row.userName ?? "Guest"}
                              </span>
                              <span className="block text-xs text-muted">
                                {row.userEmail ?? "not signed in"}
                              </span>
                            </td>
                            <td className="px-4 py-3 uppercase">{row.language}</td>
                            <td className="max-w-md truncate px-4 py-3 text-muted">
                              {row.preview || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
