export interface BrowserVoice {
  uri: string;
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

export interface SpeakOptions {
  text: string;
  voiceURI?: string | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  onBoundary?: (charIndex: number, charLength?: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onError?: (message: string) => void;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

/** Resolves the browser voice list (Chrome loads it asynchronously). */
export function listVoices(): Promise<BrowserVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve([]);
      return;
    }
    const synth = window.speechSynthesis;
    let settled = false;
    const read = (): void => {
      if (settled) return;
      settled = true;
      resolve(
        synth.getVoices().map((voice) => ({
          uri: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          default: voice.default,
          localService: voice.localService,
        })),
      );
    };

    const existing = synth.getVoices();
    if (existing.length > 0) {
      read();
      return;
    }
    synth.addEventListener("voiceschanged", read, { once: true });
    window.setTimeout(read, 1000);
  });
}

let activeUtterance: SpeechSynthesisUtterance | null = null;
let keepAliveTimer: number | null = null;

function clearKeepAlive(): void {
  if (keepAliveTimer !== null) {
    window.clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

/**
 * Speaks text with the browser engine. Chrome pauses long utterances after
 * ~15 seconds, so a lightweight keep-alive resumes playback while active.
 */
export function speakText(options: SpeakOptions): Promise<void> {
  if (!isSpeechSynthesisSupported()) {
    options.onError?.("Speech synthesis is not supported in this browser.");
    return Promise.reject(new Error("SpeechSynthesis unsupported"));
  }

  stopSpeaking();

  return new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(options.text);

    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;

    const voices = synth.getVoices();
    if (options.voiceURI) {
      const match = voices.find((voice) => voice.voiceURI === options.voiceURI);
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => {
      options.onStart?.();
      clearKeepAlive();
      keepAliveTimer = window.setInterval(() => {
        if (synth.speaking && !synth.paused) synth.resume();
      }, 8000);
    };

    utterance.onboundary = (event) => {
      options.onBoundary?.(event.charIndex, event.charLength);
    };

    utterance.onpause = () => options.onPause?.();
    utterance.onresume = () => options.onResume?.();

    utterance.onend = () => {
      clearKeepAlive();
      activeUtterance = null;
      options.onEnd?.();
      resolve();
    };

    utterance.onerror = (event) => {
      clearKeepAlive();
      activeUtterance = null;
      const message = event.error === "interrupted" ? "" : `Speech synthesis error: ${event.error}`;
      if (message) options.onError?.(message);
      options.onEnd?.();
      resolve();
    };

    activeUtterance = utterance;
    synth.speak(utterance);
  });
}

export function pauseSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.pause();
}

export function resumeSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.resume();
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  clearKeepAlive();
  window.speechSynthesis.cancel();
  activeUtterance = null;
}

export function isSpeaking(): boolean {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking;
}

export function hasActiveUtterance(): boolean {
  return activeUtterance !== null;
}
