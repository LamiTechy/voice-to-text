import {
  ProviderError,
  type TTSProvider,
  type TTSRequest,
  type TTSResult,
} from "../types";
import { normalizeLanguageTag } from "../types";

const TIMEOUT_MS = 30_000;

/**
 * Talks to a self-hosted, edge-tts compatible HTTP bridge.
 * Contract: POST { text, voice, rate, pitch, format } -> audio bytes.
 * Set TTS_API_URL to enable this provider.
 */
export const edgeTtsProvider: TTSProvider = {
  id: "edge",
  label: "edge-tts bridge (server)",
  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.TTS_API_URL?.trim());
  },
  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const baseUrl = process.env.TTS_API_URL?.trim();
    if (!baseUrl) {
      throw new ProviderError("TTS_API_URL is not configured.", "edge", 503);
    }

    const payload = {
      text: request.text,
      voice: request.voice ?? "en-US-AriaNeural",
      rate: request.rate ?? 1,
      pitch: request.pitch ?? 1,
      format: request.format ?? "mp3",
    };

    let response: Response;
    try {
      response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg, audio/wav, */*" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ProviderError(
        `Could not reach the edge-tts bridge (${error instanceof Error ? error.message : "unknown"}).`,
        "edge",
        502,
        error,
      );
    }

    if (!response.ok) {
      throw new ProviderError(`edge-tts bridge responded with HTTP ${response.status}.`, "edge", 502);
    }

    const contentType = response.headers.get("content-type") ?? "audio/mpeg";
    const wantsWav = contentType.includes("wav") || (request.format ?? "mp3") === "wav";

    if (response.body) {
      return {
        stream: response.body,
        contentType,
        extension: wantsWav ? "wav" : "mp3",
        provider: "edge",
        language: normalizeLanguageTag(request.voice, "en"),
      };
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength < 256) {
      throw new ProviderError("edge-tts bridge returned an empty audio payload.", "edge", 502);
    }

    return {
      data: buffer,
      contentType,
      extension: wantsWav ? "wav" : "mp3",
      provider: "edge",
      language: normalizeLanguageTag(request.voice, "en"),
    };
  },
};
