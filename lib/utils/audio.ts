import { ApiError } from "./errors";
import { formatBytes } from "./formatters";
import { ALLOWED_AUDIO_EXTENSIONS, MAX_UPLOAD_BYTES } from "./validators";

export type AudioFileFormat = "mp3" | "wav" | "m4a" | "webm" | "ogg";

/** Signatures of common non-audio files that must never reach a provider. */
const NON_AUDIO_SIGNATURES: Array<{ name: string; matches: (bytes: Uint8Array) => boolean }> = [
  {
    name: "PNG image",
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    name: "JPEG image",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    name: "GIF image",
    matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    name: "PDF document",
    matches: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    name: "ZIP archive",
    matches: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05),
  },
  {
    name: "text file",
    matches: (b) => b[0] === 0x3c && b[1] === 0x21 && b[2] === 0x44 && b[3] === 0x4f, // <!DO
  },
];

/** Returns the detected non-audio file type, or null when nothing matches. */
export function detectNonAudioFormat(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  for (const signature of NON_AUDIO_SIGNATURES) {
    if (signature.matches(bytes)) return signature.name;
  }
  return null;
}

const FORMAT_BY_EXTENSION: Record<string, AudioFileFormat> = {
  mp3: "mp3",
  wav: "wav",
  m4a: "m4a",
  webm: "webm",
  ogg: "ogg",
};

export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index + 1).toLowerCase();
}

/** Detects the audio container from magic bytes (null when unknown). */
export function sniffAudioFormat(bytes: Uint8Array): AudioFileFormat | null {
  if (bytes.length < 12) return null;

  const ascii = (offset: number, length: number): string =>
    String.fromCharCode(...bytes.slice(offset, offset + length));

  if (ascii(0, 3) === "ID3") return "mp3";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "wav";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(4, 4) === "ftyp") return "m4a";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm";
  }
  // MPEG frame sync: 0xFF followed by five bits set (0xFF 0xFB, 0xFF 0xF3, ...)
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return "mp3";

  return null;
}

/**
 * Validates an uploaded audio file: presence, extension allow-list, size cap
 * and magic-byte consistency. Throws an `ApiError` with a user-friendly message.
 */
export async function validateAudioFile(file: File): Promise<AudioFileFormat> {
  if (file.size === 0) {
    throw new ApiError("VALIDATION_ERROR", "The uploaded file is empty.", 422);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(
      "PAYLOAD_TOO_LARGE",
      `Audio files must be ${formatBytes(MAX_UPLOAD_BYTES)} or smaller (received ${formatBytes(file.size)}).`,
      413,
    );
  }

  const extension = extensionOf(file.name);
  if (!extension || !ALLOWED_AUDIO_EXTENSIONS.includes(extension as AudioFileFormat)) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      `Unsupported file type "${extension || "unknown"}". Allowed types: ${ALLOWED_AUDIO_EXTENSIONS.join(", ")}.`,
      415,
    );
  }

  const declared = FORMAT_BY_EXTENSION[extension];
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  const nonAudio = detectNonAudioFormat(header);
  if (nonAudio) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      `That file is a ${nonAudio}, not an audio recording. Choose an audio file (${ALLOWED_AUDIO_EXTENSIONS.join(", ")}).`,
      415,
    );
  }

  const sniffed = sniffAudioFormat(header);

  if (!sniffed) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      `The file contents do not look like a supported audio file. Expected MP3, WAV, M4A, WebM or OGG (${ALLOWED_AUDIO_EXTENSIONS.join(", ")}).`,
      415,
    );
  }

  if (sniffed !== declared) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      `The file contents (${sniffed}) do not match its "${extension}" extension.`,
      415,
    );
  }

  return declared;
}
