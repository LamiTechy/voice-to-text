import {
  ProviderError,
  toBaseLanguage,
  type STTProvider,
  type STTRequest,
  type STTResult,
  type STTSegment,
} from "../types";

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3";
const TIMEOUT_MS = 120_000;

interface GroqSegment {
  start?: number;
  end?: number;
  text?: string;
  confidence?: number;
  avg_logprob?: number;
}

interface GroqResponse {
  text?: string;
  language?: string;
  duration?: number;
  segments?: GroqSegment[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function segmentConfidence(segment: GroqSegment): number | undefined {
  if (typeof segment.confidence === "number") return clamp01(segment.confidence);
  if (typeof segment.avg_logprob === "number") return clamp01(Math.exp(segment.avg_logprob));
  return undefined;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  webm: "audio/webm",
  ogg: "audio/ogg",
};

function mimeForFile(file: File): string {
  if (file.type && file.type.startsWith("audio/")) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export const groqSttProvider: STTProvider = {
  id: "groq-whisper",
  label: "Groq Whisper (whisper-large-v3)",
  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.GROQ_API_KEY?.trim());
  },
  async transcribe(request: STTRequest): Promise<STTResult> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      throw new ProviderError(
        "GROQ_API_KEY is not configured — server transcription is unavailable.",
        "groq-whisper",
        503,
      );
    }

    const language = toBaseLanguage(request.language) ?? undefined;
    const form = new FormData();
    const safeName = request.file.name.replace(/[/\\]/g, "_");
    const fileWithMeta = new File([request.file], safeName, {
      type: mimeForFile(request.file),
    });
    form.append("file", fileWithMeta);
    form.append("model", MODEL);
    form.append("response_format", "verbose_json");
    if (language) form.append("language", language);
    if (request.includeTimestamps !== false) {
      form.append("timestamp_granularities[]", "segment");
    }

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(
        `Could not reach the transcription API (${error instanceof Error ? error.message : "unknown"}).`,
        "groq-whisper",
        502,
        error,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("The transcription API rejected the configured key.", "groq-whisper", 502);
    }
    if (response.status === 413) {
      throw new ProviderError("The audio file is too large for the transcription API.", "groq-whisper", 413);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ProviderError(
        `Transcription failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
        "groq-whisper",
        502,
      );
    }

    let payload: GroqResponse;
    try {
      payload = (await response.json()) as GroqResponse;
    } catch (error) {
      throw new ProviderError("Transcription API returned malformed JSON.", "groq-whisper", 502, error);
    }

    const text = (payload.text ?? "").trim();
    const rawSegments = request.includeTimestamps === false ? [] : (payload.segments ?? []);

    const segments: STTSegment[] = rawSegments
      .filter((segment) => typeof segment.text === "string")
      .map((segment) => {
        const confidence = segmentConfidence(segment);
        return {
          start: typeof segment.start === "number" ? segment.start : 0,
          end: typeof segment.end === "number" ? segment.end : 0,
          text: (segment.text ?? "").trim(),
          ...(confidence !== undefined ? { confidence } : {}),
        };
      });

    const confidences = segments
      .map((segment) => segment.confidence)
      .filter((value): value is number => typeof value === "number");

    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : undefined;

    return {
      text,
      segments,
      language: toBaseLanguage(payload.language ?? request.language) ?? "unknown",
      duration: typeof payload.duration === "number" ? payload.duration : 0,
      provider: "groq-whisper",
      ...(confidence !== undefined ? { confidence } : {}),
    };
  },
};
