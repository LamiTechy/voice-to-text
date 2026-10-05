import type { NextRequest } from "next/server";
import { saveConversion } from "@/lib/api/history";
import { transcribeAudio } from "@/lib/speech/stt";
import { validateAudioFile } from "@/lib/utils/audio";
import { errorResponse, jsonError, jsonOk, ApiError } from "@/lib/utils/errors";
import { sanitizeFilename } from "@/lib/utils/formatters";
import { clientIp, rateLimit } from "@/lib/utils/rate-limit";
import { LANGUAGE_RE } from "@/lib/utils/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`stt:${clientIp(request)}`, 10, 60_000);
    if (!limit.ok) {
      return jsonError(
        "RATE_LIMITED",
        "Too many transcription requests. Please wait a moment and try again.",
        429,
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Expected a multipart/form-data upload with an audio file.",
        400,
      );
    }

    const fileValue = formData.get("file");
    if (typeof fileValue === "string" || fileValue === null || fileValue === undefined) {
      throw new ApiError("VALIDATION_ERROR", "Missing audio file field \"file\".", 422);
    }

    const languageValue = formData.get("language");
    const language =
      typeof languageValue === "string" && LANGUAGE_RE.test(languageValue.trim())
        ? languageValue.trim()
        : null;

    const includeTimestamps = formData.get("includeTimestamps") !== "false";

    await validateAudioFile(fileValue);

    const result = await transcribeAudio({
      file: fileValue,
      language,
      includeTimestamps,
    });

    await saveConversion({
      type: "stt",
      inputText: "",
      outputText: result.text,
      language: result.language,
      voice: null,
      durationSeconds: Math.max(0, Math.round(result.duration)),
      settings: {
        filename: sanitizeFilename(fileValue.name),
        provider: result.provider,
        confidence: result.confidence ?? null,
        segments: result.segments,
      },
    });

    return jsonOk(
      {
        text: result.text,
        segments: result.segments,
        language: result.language,
        duration: result.duration,
        provider: result.provider,
        confidence: result.confidence ?? null,
      },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
