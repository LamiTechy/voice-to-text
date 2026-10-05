import {
  ProviderError,
  type TTSProvider,
  type TTSRequest,
  type TTSResult,
} from "../types";
import { normalizeLanguageTag } from "../types";

const ENDPOINT = "https://translate.google.com/translate_tts";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX_CHUNK_CHARS = 180;
const TIMEOUT_MS = 15_000;

/** Splits text into provider-sized chunks on word boundaries. */
export function splitTextForTts(text: string, max = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let current = "";

  for (const word of clean.split(" ")) {
    if (current.length + word.length + 1 > max) {
      if (current) chunks.push(current);
      current = word;
      while (current.length > max) {
        chunks.push(current.slice(0, max));
        current = current.slice(max);
      }
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function resolveLanguage(voice: string | null | undefined): string {
  return normalizeLanguageTag(voice, "en");
}

async function fetchChunk(text: string, language: string): Promise<Uint8Array> {
  const url =
    `${ENDPOINT}?ie=UTF-8&q=${encodeURIComponent(text)}` +
    `&tl=${encodeURIComponent(language)}&client=tw-ob`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://translate.google.com/",
        Accept: "audio/mpeg, audio/*;q=0.9, */*;q=0.5",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(
      `Network error while contacting the free TTS endpoint (${error instanceof Error ? error.message : "unknown"}).`,
      "google",
      502,
      error,
    );
  }

  if (!response.ok) {
    throw new ProviderError(
      `Free TTS endpoint responded with HTTP ${response.status}.`,
      "google",
      502,
    );
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength < 256) {
    throw new ProviderError("Free TTS endpoint returned an empty audio payload.", "google", 502);
  }
  return buffer;
}

let availability: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  try {
    await fetchChunk("hi", "en");
    return true;
  } catch {
    return false;
  }
}

export const googleTtsProvider: TTSProvider = {
  id: "google",
  label: "Free web TTS (MP3)",
  async isAvailable(): Promise<boolean> {
    if (!availability) availability = probe();
    return availability;
  },
  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const language = resolveLanguage(request.voice);
    const chunks = splitTextForTts(request.text);
    if (chunks.length === 0) {
      throw new ProviderError("No speakable text was provided.", "google", 400);
    }

    let usedLanguage = language;

    // Validate the provider with the first chunk before any bytes are sent.
    let first: Uint8Array;
    try {
      first = await fetchChunk(chunks[0], usedLanguage);
    } catch (error) {
      const base = language.split("-")[0];
      if (base && base !== language) {
        usedLanguage = base;
        first = await fetchChunk(chunks[0], base);
      } else {
        throw error;
      }
    }

    let index = 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
      },
      async pull(controller) {
        try {
          if (index >= chunks.length) {
            controller.close();
            return;
          }
          const chunk = chunks[index];
          index += 1;
          controller.enqueue(await fetchChunk(chunk, usedLanguage));
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      contentType: "audio/mpeg",
      extension: "mp3",
      provider: "google",
      language,
    };
  },
};
