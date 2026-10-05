"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertIcon,
  ClockIcon,
  DownloadIcon,
  RefreshIcon,
  TrashIcon,
  WaveIcon,
} from "@/components/ui/icons";
import type { SessionUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils/cn";
import { downloadText } from "@/lib/utils/download";
import { formatDateTime, formatDuration, truncate } from "@/lib/utils/formatters";

export interface ConversionRow {
  id: string;
  type: "tts" | "stt";
  inputText: string;
  outputText: string;
  language: string;
  voice: string | null;
  durationSeconds: number | null;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  minutes: number;
  topLanguage: string | null;
  tts: number;
  stt: number;
}

interface DashboardClientProps {
  user: SessionUser;
  initialRows: ConversionRow[];
  stats: DashboardStats;
  dbError: string | null;
  denied: boolean;
}

type Filter = "all" | "tts" | "stt";

export function DashboardClient({
  user,
  initialRows,
  stats,
  dbError,
  denied,
}: DashboardClientProps) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<ConversionRow[]>(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => row.type === filter)),
    [filter, rows],
  );

  const remove = async (id: string) => {
    const confirmed = window.confirm("Delete this conversion from your history?");
    if (!confirmed) return;
    setBusyId(id);
    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(payload?.error?.message ?? "Could not delete that conversion.");
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
      toast.success("Conversion deleted.");
      router.refresh();
    } catch {
      toast.error("Network error while deleting.");
    } finally {
      setBusyId(null);
    }
  };

  const redownloadAudio = async (row: ConversionRow) => {
    if (!row.inputText) {
      toast.error("This record has no source text to regenerate.");
      return;
    }
    setBusyId(row.id);
    try {
      const rate = typeof row.settings.rate === "number" ? row.settings.rate : 1;
      const pitch = typeof row.settings.pitch === "number" ? row.settings.pitch : 1;
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: row.inputText,
          voice: row.language,
          rate,
          pitch,
          format: "mp3",
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(payload?.error?.message ?? "Could not regenerate the audio.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `voicebridge-${row.id.slice(0, 8)}.mp3`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("Audio downloaded.");
    } catch {
      toast.error("Network error while generating audio.");
    } finally {
      setBusyId(null);
    }
  };

  const downloadTranscript = (row: ConversionRow) => {
    downloadText(row.outputText || row.inputText, `voicebridge-${row.id.slice(0, 8)}.txt`);
    toast.success("Transcript downloaded.");
  };

  const openHref = (row: ConversionRow) =>
    row.type === "tts"
      ? `/tts?text=${encodeURIComponent(row.inputText.slice(0, 4000))}`
      : `/stt?text=${encodeURIComponent(row.outputText.slice(0, 4000))}`;

  const statCards = [
    { label: "Total conversions", value: String(stats.total) },
    { label: "Minutes of audio", value: stats.minutes.toFixed(1) },
    { label: "Most-used language", value: stats.topLanguage ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      {denied && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <span className="mt-0.5 shrink-0 text-warning">
            <AlertIcon width={16} height={16} />
          </span>
          <span>
            <strong>Administrator access required.</strong> Your account does not have the admin
            role, so the admin console stayed locked.
          </span>
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted">
            Signed in as <strong className="text-fg">{user.name}</strong> · {user.email}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.refresh()}
            aria-label="Refresh history"
          >
            <RefreshIcon />
            Refresh
          </button>
          <Link href="/tts" className="btn btn-primary">
            New conversion
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{stat.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {dbError && (
        <div className="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="font-semibold text-fg">History is unavailable</p>
          <p className="mt-1 text-muted">{dbError}</p>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Conversion history</h2>
          <div
            role="group"
            aria-label="Filter history by type"
            className="inline-flex rounded-lg border border-line bg-subtle p-1 text-xs font-semibold"
          >
            {(["all", "tts", "stt"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "rounded-md px-3 py-1.5 uppercase tracking-wide",
                  filter === value ? "bg-card text-fg shadow-sm" : "text-muted",
                )}
              >
                {value === "all" ? "All" : value === "tts" ? "TTS" : "STT"}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<WaveIcon width={32} height={32} />}
            title={dbError ? "History unavailable" : "No conversions yet"}
            description={
              dbError
                ? "Configure the database to start recording conversions automatically."
                : filter === "all"
                  ? "Create your first text-to-speech or speech-to-text conversion and it will appear here."
                  : `No ${filter.toUpperCase()} conversions recorded yet.`
            }
            action={
              <div className="flex gap-2">
                <Link href="/tts" className="btn btn-primary">
                  Text to Speech
                </Link>
                <Link href="/stt" className="btn btn-secondary">
                  Speech to Text
                </Link>
              </div>
            }
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((row) => (
              <li key={row.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      "chip shrink-0",
                      row.type === "tts" ? "text-primary" : "text-accent",
                    )}
                  >
                    {row.type === "tts" ? "TTS" : "STT"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {row.type === "tts"
                        ? truncate(row.inputText || "(empty input)", 140)
                        : truncate(row.outputText || "(empty transcript)", 140)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="capitalize">{row.language}</span>
                      {row.voice && <span className="truncate max-w-[12rem]">{row.voice}</span>}
                      {row.durationSeconds !== null && (
                        <span className="flex items-center gap-1">
                          <ClockIcon width={12} height={12} />
                          {formatDuration(row.durationSeconds)}
                        </span>
                      )}
                      <span>{formatDateTime(row.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Link href={openHref(row)} className="btn btn-secondary !min-h-9 !px-3 text-xs">
                      Re-open
                    </Link>
                    <button
                      type="button"
                      className="btn btn-secondary !min-h-9 !px-3 text-xs"
                      disabled={busyId === row.id}
                      onClick={() =>
                        row.type === "tts" ? void redownloadAudio(row) : downloadTranscript(row)
                      }
                      aria-label={
                        row.type === "tts"
                          ? "Re-download generated audio"
                          : "Download transcript as text"
                      }
                    >
                      <DownloadIcon width={14} height={14} />
                      {row.type === "tts" ? "Audio" : "Transcript"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger !min-h-9 !px-3 text-xs"
                      onClick={() => void remove(row.id)}
                      disabled={busyId === row.id}
                      aria-label="Delete conversion"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
