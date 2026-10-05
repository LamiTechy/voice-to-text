export type AudioFormat = "mp3" | "wav";

export interface TTSRequest {
  text: string;
  voice?: string | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  format?: AudioFormat;
}

export interface TTSResult {
  /** Pre-buffered audio. Either `data` or `stream` is always present. */
  data?: Uint8Array<ArrayBuffer>;
  /** Incremental audio body — preferred by routes so responses can stream. */
  stream?: ReadableStream<Uint8Array>;
  contentType: string;
  extension: AudioFormat;
  provider: string;
  language: string;
}

/** Server-side text-to-speech engine (swappable without touching UI code). */
export interface TTSProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  synthesize(request: TTSRequest): Promise<TTSResult>;
}

export interface STTSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface STTRequest {
  file: File;
  language?: string | null;
  includeTimestamps?: boolean;
}

export interface STTResult {
  text: string;
  segments: STTSegment[];
  language: string;
  duration: number;
  provider: string;
  confidence?: number;
}

/** Server-side speech-to-text engine (swappable without touching UI code). */
export interface STTProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  transcribe(request: STTRequest): Promise<STTResult>;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number;

  constructor(message: string, provider: string, status = 502, cause?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

/** ISO-639-1 language code expected by transcription APIs ("en-US" -> "en"). */
export function toBaseLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const base = tag.split("-")[0]?.split("_")[0]?.toLowerCase();
  return base && /^[a-z]{2,3}$/.test(base) ? base : null;
}

/** Keeps only region/language tags the provider can reasonably accept. */
export function normalizeLanguageTag(tag: string | null | undefined, fallback = "en"): string {
  if (!tag) return fallback;
  const cleaned = tag.trim();
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(cleaned) ? cleaned : fallback;
}
