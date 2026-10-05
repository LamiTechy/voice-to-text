import { ApiError } from "@/lib/utils/errors";
import { ProviderError, type STTProvider, type STTRequest, type STTResult } from "./types";
import { groqSttProvider } from "./providers/groq-stt";

const PROVIDERS: STTProvider[] = [groqSttProvider];

export function getSttChain(): STTProvider[] {
  const choice = (process.env.STT_PROVIDER ?? "groq").toLowerCase();
  if (choice === "off") return [];
  return PROVIDERS;
}

/** Transcribes an audio file using the first available server provider. */
export async function transcribeAudio(request: STTRequest): Promise<STTResult> {
  const chain = getSttChain();
  if (chain.length === 0) {
    throw new ApiError(
      "PROVIDER_UNAVAILABLE",
      "Server-side transcription is disabled. Try live dictation instead.",
      503,
    );
  }

  const failures: string[] = [];
  for (const provider of chain) {
    try {
      if (!(await provider.isAvailable())) {
        failures.push(`${provider.id}: unavailable`);
        continue;
      }
      return await provider.transcribe(request);
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.status === 400) {
          throw new ApiError("VALIDATION_ERROR", error.message, 422);
        }
        if (error.status === 413) {
          throw new ApiError("PAYLOAD_TOO_LARGE", error.message, 413);
        }
        failures.push(`${provider.id}: ${error.message}`);
      } else {
        failures.push(`${provider.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  throw new ApiError(
    "PROVIDER_ERROR",
    `No transcription engine could handle this file (${failures.join("; ")}).`,
    502,
  );
}
