"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AudioPlayer } from "@/components/audio/audio-player";
import { FileDrop } from "@/components/speech/file-drop";
import { VoiceSelect } from "@/components/speech/voice-select";
import { AlertIcon, DownloadIcon, PauseIcon, PlayIcon, SparkIcon, StopIcon } from "@/components/ui/icons";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  isSpeechSynthesisSupported,
  listVoices,
  pauseSpeaking,
  resumeSpeaking,
  speakText,
  stopSpeaking,
  type BrowserVoice,
} from "@/lib/speech/providers/browser-tts";
import { cn } from "@/lib/utils/cn";
import { downloadBlob } from "@/lib/utils/download";
import { estimateSpeechSeconds, formatDuration, wordCount } from "@/lib/utils/formatters";
import { MAX_TTS_CHARS } from "@/lib/utils/validators";

type Engine = "browser" | "server";
type Status = "idle" | "playing" | "paused";

interface Token {
  start: number;
  end: number;
  sentence: number;
}

const SAMPLE_TEXT =
  "Welcome to VoiceBridge. Type or paste any text you like, choose a voice, then press play to hear it read aloud. The system shows the current word while speaking, and you can download the generated audio at any time.";

const SERVER_LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-NG", label: "English (Nigeria)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-IN", label: "English (India)" },
  { code: "en-IE", label: "English (Ireland)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "de-DE", label: "German (Germany)" },
  { code: "it-IT", label: "Italian (Italy)" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "nl-NL", label: "Dutch (Netherlands)" },
  { code: "pl-PL", label: "Polish (Poland)" },
  { code: "tr-TR", label: "Turkish (Turkey)" },
  { code: "ru-RU", label: "Russian (Russia)" },
  { code: "sv-SE", label: "Swedish (Sweden)" },
  { code: "ar-SA", label: "Arabic (Saudi Arabia)" },
  { code: "hi-IN", label: "Hindi (India)" },
  { code: "ja-JP", label: "Japanese (Japan)" },
  { code: "ko-KR", label: "Korean (Korea)" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "id-ID", label: "Indonesian (Indonesia)" },
  { code: "vi-VN", label: "Vietnamese (Vietnam)" },
  { code: "fil-PH", label: "Filipino (Philippines)" },
];

function buildTokens(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  let sentence = 0;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, sentence });
    if (/[.!?。！？]["')\]]?$/.test(match[0])) sentence += 1;
  }
  return tokens;
}

function tokenIndexAt(tokens: Token[], charIndex: number): number {
  for (let index = 0; index < tokens.length; index += 1) {
    if (charIndex < tokens[index].end) return index;
  }
  return Math.max(0, tokens.length - 1);
}

function HighlightedText({
  text,
  tokens,
  wordIndex,
}: {
  text: string;
  tokens: Token[];
  wordIndex: number | null;
}) {
  if (!text.trim()) return null;
  const activeSentence = wordIndex !== null ? tokens[wordIndex]?.sentence ?? -1 : -1;

  return (
    <div
      aria-hidden="true"
      className="max-h-44 overflow-y-auto rounded-xl border border-line bg-subtle p-4 text-sm leading-7 text-fg"
    >
      {tokens.map((token, index) => (
        <span key={token.start}>
          <span
            className={cn(
              "rounded px-0.5",
              index === wordIndex
                ? "bg-primary text-on-primary"
                : token.sentence === activeSentence
                  ? "bg-primary/12"
                  : "",
            )}
          >
            {text.slice(token.start, token.end)}
          </span>{" "}
        </span>
      ))}
    </div>
  );
}

function TtsWorkspace() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [text, setText] = useState(() => searchParams.get("text") ?? "");
  const [engine, setEngine] = useState<Engine>("browser");
  const [voices, setVoices] = useState<BrowserVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [serverLanguage, setServerLanguage] = useState("en-US");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [status, setStatus] = useState<Status>("idle");
  const [charIndex, setCharIndex] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [canRecord, setCanRecord] = useState(false);
  const [message, setMessage] = useState("Ready");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const baseElapsedRef = useRef(0);
  const textRef = useRef(text);
  const loggedInRef = useRef(false);

  const tokens = useMemo(() => buildTokens(text), [text]);
  const chars = text.length;
  const words = wordCount(text);
  const estimatedDuration = useMemo(() => estimateSpeechSeconds(text, rate), [text, rate]);
  const isSupported = isSpeechSynthesisSupported();
  const wordIndex =
    status !== "idle" || audioProgress > 0
      ? charIndex !== null
        ? tokenIndexAt(tokens, charIndex)
        : tokens.length > 0 && estimatedDuration > 0
          ? tokenIndexAt(tokens, Math.floor((audioProgress || elapsed / estimatedDuration) * text.length))
          : null
      : null;

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await listVoices();
      if (cancelled) return;
      setVoices(list);
      setVoiceURI((current) => {
        if (current) return current;
        const preferred =
          list.find((voice) => /en[-_]GB/i.test(voice.lang)) ??
          list.find((voice) => /en[-_]US/i.test(voice.lang)) ??
          list.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
          list[0];
        return preferred?.uri ?? null;
      });
    };
    void load();

    const onChange = () => void load();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", onChange);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.removeEventListener("voiceschanged", onChange);
      }
    };
  }, []);

  useEffect(() => {
    setCanRecord(
      typeof navigator !== "undefined" &&
        typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getDisplayMedia),
    );
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((payload: { user: unknown }) => {
        loggedInRef.current = Boolean(payload.user);
      })
      .catch(() => {
        loggedInRef.current = false;
      });

    return () => {
      stopSpeaking();
      if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const stopTicker = useCallback(() => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    startedAtRef.current = Date.now();
    tickerRef.current = window.setInterval(() => {
      const next = baseElapsedRef.current + (Date.now() - startedAtRef.current) / 1000;
      setElapsed(next);
      const ratio = Math.min(1, next / Math.max(1, estimateSpeechSeconds(textRef.current, rate)));
      setCharIndex(Math.floor(ratio * textRef.current.length));
    }, 200);
  }, [rate, stopTicker]);

  const saveBrowserHistory = useCallback(async () => {
    if (!loggedInRef.current) return;
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tts",
          input_text: textRef.current.slice(0, MAX_TTS_CHARS),
          output_text: "",
          language: "en",
          voice: voiceURI ?? null,
          duration_seconds: estimateSpeechSeconds(textRef.current, rate),
          settings: { engine: "browser", rate, pitch, volume },
        }),
      });
    } catch {
      // history is best-effort
    }
  }, [pitch, rate, voiceURI, volume]);

  const playBrowser = useCallback(async () => {
    if (!isSupported) {
      toast.error("This browser cannot synthesise speech. Try Chrome or Edge.");
      return;
    }
    if (!textRef.current.trim()) {
      toast.error("Enter some text first.");
      return;
    }
    setStatus("playing");
    setMessage("Speaking…");
    setCharIndex(0);
    baseElapsedRef.current = 0;
    setElapsed(0);
    startTicker();

    await speakText({
      text: textRef.current,
      voiceURI,
      rate,
      pitch,
      volume,
      onBoundary: (index) => setCharIndex(index),
      onEnd: () => {
        stopTicker();
        setStatus("idle");
        setMessage("Finished");
        setCharIndex(null);
        setElapsed(0);
        void saveBrowserHistory();
      },
      onError: (errorMessage) => {
        stopTicker();
        setStatus("idle");
        setMessage("Stopped");
        if (errorMessage) toast.error(errorMessage);
      },
    });
  }, [isSupported, pitch, rate, saveBrowserHistory, startTicker, stopTicker, toast, voiceURI, volume]);

  const pause = () => {
    if (engine === "server") {
      audioRef.current?.pause();
      setMessage("Paused");
      return;
    }
    pauseSpeaking();
    if (tickerRef.current !== null) {
      baseElapsedRef.current += (Date.now() - startedAtRef.current) / 1000;
      stopTicker();
    }
    setStatus("paused");
    setMessage("Paused");
  };

  const resume = () => {
    if (engine === "server") {
      void audioRef.current?.play();
      setMessage("Playing…");
      return;
    }
    resumeSpeaking();
    setStatus("playing");
    setMessage("Speaking…");
    startTicker();
  };

  const stopAll = () => {
    stopSpeaking();
    stopTicker();
    setStatus("idle");
    setCharIndex(null);
    setElapsed(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setAudioProgress(0);
    setMessage("Stopped");
  };

  const generateServerAudio = useCallback(async (): Promise<boolean> => {
    if (!textRef.current.trim()) {
      toast.error("Enter some text first.");
      return false;
    }
    setGenerating(true);
    setMessage("Generating audio…");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textRef.current.slice(0, MAX_TTS_CHARS),
          voice: serverLanguage,
          rate,
          pitch,
          volume,
          format: "mp3",
        }),
      });

      if (!response.ok) {
        let detail = "Server synthesis failed.";
        try {
          const payload = (await response.json()) as { error?: { message?: string } };
          if (payload.error?.message) detail = payload.error.message;
        } catch {
          // non-JSON error body
        }
        throw new Error(detail);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
      setMessage("Audio ready — press play");
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Server synthesis failed.";
      toast.error(`${detail} Falling back to the browser voice.`);
      setEngine("browser");
      setMessage("Using browser voice");
      return false;
    } finally {
      setGenerating(false);
    }
  }, [pitch, rate, serverLanguage, toast, volume]);

  const onPrimaryAction = async () => {
    if (status === "playing") {
      pause();
      return;
    }
    if (status === "paused") {
      resume();
      return;
    }
    if (engine === "server") {
      const ok = await generateServerAudio();
      if (ok) {
        window.setTimeout(() => {
          void audioRef.current?.play();
        }, 60);
        setMessage("Playing…");
      }
      return;
    }
    await playBrowser();
  };

  const onDownloadServer = async () => {
    if (audioUrl) {
      downloadBlobUrl(audioUrl, "voicebridge-speech.mp3");
      return;
    }
    const ok = await generateServerAudio();
    if (ok) {
      toast.success("Audio generated — starting download.");
    }
  };

  const downloadBlobUrl = (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const onRecordAndDownload = async () => {
    if (!canRecord) {
      toast.error("Recording is not supported in this browser.");
      return;
    }
    if (status === "playing") {
      toast.info("Stop playback before starting a recording.");
      return;
    }

    let display: MediaStream | null = null;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch {
      toast.error("Screen/tab sharing was cancelled.");
      return;
    }

    const audioTracks = display.getAudioTracks();
    if (audioTracks.length === 0) {
      display.getTracks().forEach((track) => track.stop());
      toast.error("No audio track was shared — enable “Share tab audio” and try again.");
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
    const recorder = new MediaRecorder(
      new MediaStream(audioTracks),
      mimeType ? { mimeType } : undefined,
    );
    const chunks: BlobPart[] = [];
    const cleanup = () => {
      display?.getTracks().forEach((track) => track.stop());
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      cleanup();
      toast.error("Recording failed unexpectedly.");
    };
    recorder.onstop = () => {
      cleanup();
      if (chunks.length === 0) {
        toast.error("No audio was captured.");
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      downloadBlob(blob, "voicebridge-recording.webm");
      toast.success("Recording downloaded as a WebM audio file.");
    };

    recorder.start(250);
    setMessage("Recording playback…");
    toast.info("Sharing this tab's audio — speak output will be recorded.");
    await playBrowser();
    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, 400);
  };

  const onTextFile = async (file: File) => {
    try {
      const content = await file.text();
      setText(content.slice(0, MAX_TTS_CHARS));
      if (content.length > MAX_TTS_CHARS) {
        toast.info(`File truncated to ${MAX_TTS_CHARS} characters.`);
      } else {
        toast.success(`Loaded ${file.name}.`);
      }
    } catch {
      toast.error("Could not read that file. Choose a UTF-8 .txt file.");
    }
  };

  const primaryLabel =
    status === "playing" ? "Pause" : status === "paused" ? "Resume" : generating ? "Generating…" : "Play";

  const primaryIcon =
    status === "playing" ? <PauseIcon /> : status === "paused" ? <PlayIcon /> : <PlayIcon />;

  const progressRatio =
    engine === "server"
      ? audioProgress
      : estimatedDuration > 0
        ? Math.min(1, elapsed / estimatedDuration)
        : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">Text → Audio</span>
          <span className="chip">{MAX_TTS_CHARS.toLocaleString()} character limit</span>
          {!isSupported && <span className="chip text-warning">Browser engine unavailable</span>}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Text to Speech</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Turn any written text into spoken audio. Pick a voice, adjust speed, pitch and volume,
          follow the highlighted words, then download the result.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2" aria-labelledby="tts-editor-heading">
          <div className="card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="tts-editor-heading" className="text-sm font-semibold">
                Voice engine
              </h2>
              <div
                role="radiogroup"
                aria-label="Voice engine"
                className="inline-flex rounded-lg border border-line bg-subtle p-1 text-xs font-semibold"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={engine === "browser"}
                  onClick={() => setEngine("browser")}
                  className={cn(
                    "rounded-md px-3 py-1.5 transition-colors",
                    engine === "browser" ? "bg-card text-fg shadow-sm" : "text-muted",
                  )}
                >
                  Browser voice
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={engine === "server"}
                  onClick={() => setEngine("server")}
                  className={cn(
                    "rounded-md px-3 py-1.5 transition-colors",
                    engine === "server" ? "bg-card text-fg shadow-sm" : "text-muted",
                  )}
                >
                  Server MP3
                </button>
              </div>
            </div>

            <label htmlFor="tts-text" className="label">
              Text to speak
            </label>
            <textarea
              id="tts-text"
              className="textarea min-h-52 text-base"
              rows={10}
              maxLength={MAX_TTS_CHARS}
              placeholder="Type or paste the text you want to convert into speech…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-describedby="tts-counter"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
              <span id="tts-counter" aria-live="polite">
                <strong className={chars > MAX_TTS_CHARS - 200 ? "text-warning" : "text-fg"}>
                  {chars.toLocaleString()}
                </strong>
                /{MAX_TTS_CHARS.toLocaleString()} characters · {words.toLocaleString()} words
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary !min-h-9 !px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setText(SAMPLE_TEXT);
                    toast.success("Example text inserted.");
                  }}
                >
                  <SparkIcon width={16} height={16} />
                  Try an example
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !min-h-9 !px-3 !py-1.5 text-xs"
                  onClick={() => {
                    setText("");
                    stopAll();
                    setMessage("Ready");
                  }}
                  disabled={!text}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-3">
              <FileDrop
                onFile={(file) => void onTextFile(file)}
                onError={(messageText) => toast.error(messageText)}
                accept=".txt,text/plain"
                allowedExtensions={["txt"]}
                maxBytes={1024 * 1024}
                idleLabel="Upload a .txt file to fill this box"
                hint="Plain text, up to 1 MB"
              />
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => void onPrimaryAction()}
                disabled={generating || !text.trim() || (engine === "browser" && !isSupported)}
                aria-label={`${primaryLabel} speech`}
              >
                {generating ? null : primaryIcon}
                {primaryLabel}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={stopAll}
                disabled={status === "idle" && !audioUrl && !generating}
                aria-label="Stop speech playback"
              >
                <StopIcon />
                Stop
              </button>

              <div
                className="ml-auto flex items-center gap-2 text-xs text-muted"
                role="status"
                aria-live="polite"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    status === "playing" ? "animate-pulse bg-success" : "bg-muted",
                  )}
                  aria-hidden="true"
                />
                {message}
              </div>
            </div>

            <div
              className="mt-4"
              role="progressbar"
              aria-label="Speech playback progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progressRatio * 100)}
            >
              <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.min(100, progressRatio * 100)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{formatDuration(engine === "server" ? audioProgress * (audioRef.current?.duration || 0) : elapsed)}</span>
                <span>≈ {formatDuration(estimatedDuration)}</span>
              </div>
            </div>

            {text.trim() && (
              <div className="mt-4">
                <p className="label">Live highlight</p>
                <HighlightedText text={text} tokens={tokens} wordIndex={wordIndex} />
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4" aria-labelledby="tts-settings-heading">
          <div className="card p-4 sm:p-5">
            <h2 id="tts-settings-heading" className="mb-4 text-sm font-semibold">
              Voice settings
            </h2>

            {engine === "browser" ? (
              <div className="space-y-1">
                <label htmlFor="voice-select" className="label">
                  Voice
                </label>
                <VoiceSelect
                  voices={voices}
                  value={voiceURI}
                  onChange={setVoiceURI}
                  id="voice-select"
                />
                {voices.length === 0 && (
                  <p className="mt-2 text-xs text-muted" role="status">
                    {isSupported
                      ? "Loading available voices…"
                      : "Your browser does not support speech synthesis."}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <label htmlFor="server-voice" className="label">
                  Language / accent
                </label>
                <select
                  id="server-voice"
                  className="select"
                  value={serverLanguage}
                  onChange={(event) => setServerLanguage(event.target.value)}
                >
                  {SERVER_LANGUAGES.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label} ({language.code})
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted">
                  Server voices are generated as a streaming MP3 file that you can download.
                </p>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="tts-rate" className="label !mb-0">
                    Speed
                  </label>
                  <span className="text-xs font-semibold text-fg">{rate.toFixed(2)}×</span>
                </div>
                <input
                  id="tts-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="w-full accent-[var(--primary)]"
                  aria-valuetext={`${rate.toFixed(2)} times`}
                />
                <div className="flex justify-between text-[11px] text-muted">
                  <span>0.5×</span>
                  <span>2×</span>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="tts-pitch" className="label !mb-0">
                    Pitch
                  </label>
                  <span className="text-xs font-semibold text-fg">{pitch.toFixed(2)}</span>
                </div>
                <input
                  id="tts-pitch"
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={pitch}
                  onChange={(event) => setPitch(Number(event.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
                <div className="flex justify-between text-[11px] text-muted">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="tts-volume" className="label !mb-0">
                    Volume
                  </label>
                  <span className="text-xs font-semibold text-fg">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  id="tts-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-full accent-[var(--primary)]"
                />
              </div>
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold">Download</h2>

            <div className="space-y-3">
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={() => void onDownloadServer()}
                disabled={generating || !text.trim()}
              >
                <DownloadIcon />
                {generating ? "Generating…" : audioUrl ? "Download MP3" : "Generate & download MP3"}
              </button>

              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => void onRecordAndDownload()}
                disabled={!canRecord || !text.trim()}
                title={
                  canRecord
                    ? "Play the speech while capturing this tab's audio"
                    : "Not supported in this browser"
                }
              >
                <DownloadIcon />
                Record &amp; download
              </button>

              {!canRecord && (
                <p className="text-xs text-muted">
                  In-browser capture needs <code>MediaRecorder</code> plus tab audio sharing —
                  available in Chrome and Edge. The server MP3 download always works.
                </p>
              )}
            </div>

            {audioUrl && (
              <div className="mt-4">
                <p className="label">Server audio preview</p>
                <AudioPlayer
                  src={audioUrl}
                  audioRef={audioRef}
                  downloadUrl={audioUrl}
                  downloadFilename="voicebridge-speech.mp3"
                  label="Server generated speech"
                  onProgress={(current, duration) => {
                    if (duration > 0) setAudioProgress(current / duration);
                  }}
                  onPlayStateChange={(playing) => {
                    setMessage(playing ? "Playing…" : "Paused");
                    if (playing) setStatus("playing");
                    else if (status === "playing") setStatus("paused");
                  }}
                  onEnded={() => {
                    setStatus("idle");
                    setAudioProgress(0);
                    setCharIndex(null);
                    setMessage("Finished");
                  }}
                />
              </div>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs text-muted">
              <span className="mt-0.5 shrink-0 text-warning">
                <AlertIcon width={14} height={14} />
              </span>
              Signed-in users automatically keep every conversion in{" "}
              <Link href="/dashboard" className="underline">
                their dashboard
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function TtsPage() {
  return (
    <Suspense fallback={<div className="p-8"><LoadingBlock label="Loading text-to-speech…" /></div>}>
      <TtsWorkspace />
    </Suspense>
  );
}
