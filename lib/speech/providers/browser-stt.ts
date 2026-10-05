export type RecognitionErrorCode =
  | "not-allowed"
  | "service-not-allowed"
  | "no-speech"
  | "network"
  | "aborted"
  | "audio-capture"
  | "unsupported"
  | "unknown";

export interface LiveHandlers {
  onInterim: (transcript: string) => void;
  onFinal: (transcript: string, confidence?: number) => void;
  onError: (code: RecognitionErrorCode, message: string) => void;
  onEnd?: () => void;
}

interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: { transcript: string; confidence?: number };
}

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scoped = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getCtor() !== null;
}

export function describeRecognitionError(code: RecognitionErrorCode): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Click the padlock icon in the address bar, allow the microphone, then try again.";
    case "no-speech":
      return "No speech was detected. Check your microphone and speak a little louder.";
    case "network":
      return "The speech recognition service needs a network connection. Check your internet access or use file transcription instead.";
    case "audio-capture":
      return "No microphone was found. Connect a microphone and re-grant permission.";
    case "aborted":
      return "Listening stopped.";
    case "unsupported":
      return "Live dictation is not supported in this browser. Use file transcription instead.";
    default:
      return "Speech recognition failed unexpectedly. Please try again.";
  }
}

/**
 * Continuous live dictation with automatic restart (Chrome stops the
 * recognizer after long silences even in continuous mode).
 */
export class LiveDictation {
  private recognition: RecognitionLike | null = null;
  private shouldListen = false;
  private handlers: LiveHandlers | null = null;
  private language = "en-US";

  get active(): boolean {
    return this.shouldListen;
  }

  start(language: string, handlers: LiveHandlers): boolean {
    const Ctor = getCtor();
    if (!Ctor) {
      handlers.onError("unsupported", describeRecognitionError("unsupported"));
      return false;
    }

    this.stop();
    this.shouldListen = true;
    this.handlers = handlers;
    this.language = language;

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result || result.length === 0) continue;
        const transcript = result[0].transcript;
        if (result.isFinal) {
          const confidence = typeof result[0].confidence === "number" ? result[0].confidence : undefined;
          handlers.onFinal(transcript.trim(), confidence);
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) handlers.onInterim(interim.trim());
    };

    recognition.onerror = (event) => {
      const raw = event.error ?? "unknown";
      const known: RecognitionErrorCode[] = [
        "not-allowed",
        "service-not-allowed",
        "no-speech",
        "network",
        "aborted",
        "audio-capture",
      ];
      const code: RecognitionErrorCode = known.includes(raw as RecognitionErrorCode)
        ? (raw as RecognitionErrorCode)
        : "unknown";

      if (code === "not-allowed" || code === "service-not-allowed" || code === "network" || code === "audio-capture") {
        this.shouldListen = false;
        handlers.onError(code, describeRecognitionError(code));
      }
    };

    recognition.onend = () => {
      if (this.shouldListen) {
        window.setTimeout(() => {
          if (!this.shouldListen) return;
          try {
            recognition.start();
          } catch {
            this.shouldListen = false;
            this.handlers?.onEnd?.();
          }
        }, 120);
        return;
      }
      handlers.onEnd?.();
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch {
      this.shouldListen = false;
      handlers.onError("unknown", describeRecognitionError("unknown"));
      return false;
    }
    return true;
  }

  stop(): void {
    this.shouldListen = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // recognizer already stopped
      }
      this.recognition = null;
    }
  }
}
