export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function charCount(text: string): number {
  return text.length;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const ms = Math.round((safe % 1) * 1000);
  const total = Math.floor(safe);
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss},${String(ms).padStart(3, "0")}`;
}

export interface TimedSegment {
  start: number;
  end: number;
  text: string;
}

export function segmentsToSrt(segments: TimedSegment[]): string {
  return segments
    .map(
      (segment, index) =>
        `${index + 1}\n${toSrtTimestamp(segment.start)} --> ${toSrtTimestamp(
          segment.end,
        )}\n${segment.text.trim()}`,
    )
    .join("\n\n")
    .concat("\n");
}

export function sanitizeFilename(name: string, fallback = "voicebridge"): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base.length > 0 ? base : fallback;
}

export function withExtension(filename: string, extension: string): string {
  const clean = filename.replace(/\.[^.]+$/, "");
  return `${clean}.${extension.replace(/^\./, "")}`;
}

/** Rough spoken-audio duration in seconds for a given rate (1.0 = normal). */
export function estimateSpeechSeconds(text: string, rate = 1): number {
  const safeRate = Math.min(2, Math.max(0.5, rate));
  const words = wordCount(text);
  const seconds = words / (2.6 * safeRate);
  return Math.max(1, Math.round(seconds));
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 1000) / 10}%`;
}
