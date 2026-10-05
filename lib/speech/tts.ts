import { ApiError } from "@/lib/utils/errors";
import {
  ProviderError,
  type TTSProvider,
  type TTSRequest,
  type TTSResult,
} from "./types";
import { googleTtsProvider } from "./providers/google-tts";
import { edgeTtsProvider } from "./providers/edge-tts";

const PROVIDERS: Record<string, TTSProvider> = {
  google: googleTtsProvider,
  edge: edgeTtsProvider,
};

/**
 * Ordered provider chain. `TTS_PROVIDER` selects the primary engine
 * ("google" | "edge" | "off"); configured fallbacks are tried afterwards.
 */
export function getTtsChain(): TTSProvider[] {
  const choice = (process.env.TTS_PROVIDER ?? "google").toLowerCase();
  if (choice === "off") return [];

  const chain: TTSProvider[] = [];
  const primary = PROVIDERS[choice];
  if (primary) chain.push(primary);

  for (const provider of Object.values(PROVIDERS)) {
    if (!chain.includes(provider)) chain.push(provider);
  }
  return chain;
}

export function hasServerTts(): boolean {
  return getTtsChain().length > 0;
}

/** Synthesizes speech using the first available server provider. */
export async function synthesizeSpeech(request: TTSRequest): Promise<TTSResult> {
  const chain = getTtsChain();
  if (chain.length === 0) {
    throw new ApiError(
      "PROVIDER_UNAVAILABLE",
      "Server-side text-to-speech is disabled. Use the browser voice engine instead.",
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
      return await provider.synthesize(request);
    } catch (error) {
      if (error instanceof ProviderError) {
        failures.push(`${provider.id}: ${error.message}`);
      } else {
        failures.push(`${provider.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
  }

  throw new ApiError(
    "PROVIDER_ERROR",
    `No text-to-speech engine could handle this request (${failures.join("; ")}).`,
    502,
  );
}
