import type { NextRequest } from "next/server";
import { saveConversion } from "@/lib/api/history";
import { synthesizeSpeech, hasServerTts } from "@/lib/speech/tts";
import { errorResponse, jsonError, isApiError } from "@/lib/utils/errors";
import { estimateSpeechSeconds } from "@/lib/utils/formatters";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { collectIssues, firstIssueMessage, ttsSchema } from "@/lib/utils/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!hasServerTts()) {
      return jsonError(
        "PROVIDER_UNAVAILABLE",
        "Server-side text-to-speech is disabled. Use the browser voice engine instead.",
        503,
      );
    }

    const limit = rateLimit(`tts:${clientIp(request)}`, 20, 60_000);
    if (!limit.ok) {
      return jsonError(
        "RATE_LIMITED",
        "Too many synthesis requests. Please wait a moment and try again.",
        429,
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = ttsSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("VALIDATION_ERROR", firstIssueMessage(parsed.error), 422, {
        issues: collectIssues(parsed.error),
      });
    }

    const { text, voice, rate, pitch, format } = parsed.data;
    const result = await synthesizeSpeech({ text, voice, rate, pitch, format });

    await saveConversion({
      type: "tts",
      inputText: text,
      outputText: "",
      language: result.language,
      voice: voice ?? null,
      durationSeconds: estimateSpeechSeconds(text, rate),
      settings: { rate, pitch, format, provider: result.provider, engine: "server" },
    });

    const bodyInit: BodyInit =
      result.stream ??
      result.data ??
      new Uint8Array();

    return new Response(bodyInit, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="voicebridge-speech.${result.extension}"`,
        "Cache-Control": "no-store",
        "X-TTS-Provider": result.provider,
        "X-Audio-Format": result.extension,
        "X-RateLimit-Remaining": String(limit.remaining),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isApiError(error)) return errorResponse(error);
    return errorResponse(error);
  }
}
