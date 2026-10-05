"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AudioPlayer } from "@/components/audio/audio-player";
import { Waveform } from "@/components/audio/waveform";
import { BrowserSupportBanner } from "@/components/browser-support-banner";
import { FileDrop } from "@/components/speech/file-drop";
import { TranscriptBox } from "@/components/speech/transcript-box";
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  FileAudioIcon,
  MicIcon,
  MicOffIcon,
  StopIcon,
  WaveIcon,
} from "@/components/ui/icons";
import { LoadingBlock } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  LiveDictation,
  describeRecognitionError,
  isSpeechRecognitionSupported,
} from "@/lib/speech/providers/browser-stt";
import type { STTSegment } from "@/lib/speech/types";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration } from "@/lib/utils/formatters";
import { ALLOWED_AUDIO_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/utils/validators";

type Tab = "live" | "file";
type MicState = "idle" | "listening";

const LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-NG", label: "English (Nigeria)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-IN", label: "English (India)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
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

interface UploadResult {
  text: string;
  segments: STTSegment[];
  language: string;
  duration: number;
  provider: string;
  confidence: number | null;
}

function SttWorkspace() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get("tab") === "file" ? "file" : "live",
  );
  const [language, setLanguage] = useState("en-US");
  const [transcript, setTranscript] = useState(() => searchParams.get("text") ?? "");
  const [segments, setSegments] = useState<STTSegment[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [showTimestamps, setShowTimestamps] = useState(false);

  // live state
  const [micState, setMicState] = useState<MicState>("idle");
  const [interim, setInterim] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [liveStatus, setLiveStatus] = useState("Ready to listen");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // file state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [resultMeta, setResultMeta] = useState<{ language: string; duration: number; provider: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const dictationRef = useRef<LiveDictation | null>(null);
  const loggedInRef = useRef(false);
  const transcriptRef = useRef("");
  const finalSegmentsRef = useRef<STTSegment[]>([]);
  const liveStartedAtRef = useRef(0);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((payload: { user: unknown }) => {
        loggedInRef.current = Boolean(payload.user);
      })
      .catch(() => {
        loggedInRef.current = false;
      });

    return () => {
      dictationRef.current?.stop();
      if (micStream) micStream.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const saveLiveHistory = useCallback(
    async (finalText: string) => {
      if (!loggedInRef.current || !finalText.trim()) return;
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "stt",
            input_text: "",
            output_text: finalText.slice(0, 120000),
            language,
            settings: { mode: "live", engine: "browser" },
          }),
        });
      } catch {
        // best-effort
      }
    },
    [language],
  );

  const stopListening = useCallback(() => {
    dictationRef.current?.stop();
    setMicState("idle");
    setInterim("");
    setLiveStatus("Stopped");
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);
    }
    if (finalSegmentsRef.current.length > 0) {
      setSegments(finalSegmentsRef.current);
    }
    void saveLiveHistory(transcriptRef.current);
  }, [micStream, saveLiveHistory]);

  const startListening = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      setMicError(describeRecognitionError("unsupported"));
      toast.error(describeRecognitionError("unsupported"));
      setTab("file");
      return;
    }

    setMicError(null);
    setPermissionDenied(false);
    setLiveStatus("Requesting microphone access…");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      setPermissionDenied(denied);
      setMicError(
        denied
          ? describeRecognitionError("not-allowed")
          : name === "NotFoundError"
            ? describeRecognitionError("audio-capture")
            : "Could not access your microphone. Check your input device and try again.",
      );
      setLiveStatus("Microphone unavailable");
      return;
    }

    setMicStream(stream);
    setTranscript((current) => current);
    liveStartedAtRef.current = Date.now();
    finalSegmentsRef.current = [];
    setSegments([]);

    if (!dictationRef.current) dictationRef.current = new LiveDictation();
    setLiveStatus("Listening…");

    const started = dictationRef.current.start(language, {
      onInterim: (value) => setInterim(value),
      onFinal: (value, confidenceValue) => {
        const duration = (Date.now() - liveStartedAtRef.current) / 1000;
        finalSegmentsRef.current.push({
          start: Math.max(0, duration - Math.max(1, value.split(/\s+/).length / 2.6)),
          end: duration,
          text: value,
          ...(confidenceValue !== undefined && confidenceValue > 0
            ? { confidence: confidenceValue }
            : {}),
        });
        setTranscript((current) => (current ? `${current} ${value}` : value));
        setInterim("");
      },
      onError: (code, message) => {
        if (code === "not-allowed" || code === "service-not-allowed") {
          setPermissionDenied(true);
        }
        if (code !== "aborted") {
          setMicError(message);
          toast.error(message);
        }
        setLiveStatus("Listening stopped");
        setMicState("idle");
        setInterim("");
        stream.getTracks().forEach((track) => track.stop());
        setMicStream(null);
      },
      onEnd: () => {
        if (dictationRef.current?.active) return;
        setMicState("idle");
        setInterim("");
        stream.getTracks().forEach((track) => track.stop());
        setMicStream(null);
      },
    });

    if (started) {
      setMicState("listening");
      setLiveStatus("Listening… speak now");
    }
  }, [language, toast]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setProgress(0);
      setFileError(null);
      setResultMeta(null);
      setFileMeta({ name: file.name, size: file.size });
      setSegments([]);
      setConfidence(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", language);
      formData.append("includeTimestamps", "true");

      await new Promise<void>((resolve) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/stt");
        request.responseType = "json";

        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.min(0.99, event.loaded / event.total));
          }
        };
        request.onload = () => {
          const payload = request.response as
            | UploadResult
            | { error?: { message?: string } }
            | null;
          if (request.status >= 200 && request.status < 300 && payload && "text" in payload) {
            const result = payload as UploadResult;
            setTranscript(result.text);
            setSegments(result.segments ?? []);
            setConfidence(result.confidence);
            setShowTimestamps((result.segments ?? []).length > 0);
            setResultMeta({
              language: result.language,
              duration: result.duration,
              provider: result.provider,
            });
            setPreviewUrl(URL.createObjectURL(file));
            setProgress(1);
            toast.success("Transcription complete.");
          } else {
            const message =
              payload && "error" in payload && payload.error?.message
                ? payload.error.message
                : `Transcription failed (HTTP ${request.status}).`;
            setFileError(message);
            toast.error(message);
          }
          resolve();
        };
        request.onerror = () => {
          const message =
            "Network error while uploading the audio. Check your connection and try again.";
          setFileError(message);
          toast.error(message);
          resolve();
        };
        request.ontimeout = () => {
          const message = "The transcription request timed out. Try a shorter audio file.";
          setFileError(message);
          toast.error(message);
          resolve();
        };

        request.send(formData);
      });

      setBusy(false);
    },
    [language, previewUrl, toast],
  );

  const supported = isSpeechRecognitionSupported();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">Audio → Text</span>
          <span className="chip">MP3 · WAV · M4A · WebM · OGG</span>
          <span className="chip">max {formatBytes(MAX_UPLOAD_BYTES)}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Speech to Text</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Dictate live with your microphone or upload an audio file for server-side transcription.
          Edit the result, then copy or download it as .txt, .docx or .srt.
        </p>
      </header>

      {tab === "live" && <BrowserSupportBanner />}

      <div
        role="tablist"
        aria-label="Transcription mode"
        className="mt-4 inline-flex rounded-xl border border-line bg-subtle p-1 text-sm font-semibold"
      >
        <button
          type="button"
          role="tab"
          id="tab-live"
          aria-selected={tab === "live"}
          aria-controls="panel-live"
          onClick={() => setTab("live")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
            tab === "live" ? "bg-card text-fg shadow-sm" : "text-muted",
          )}
        >
          <MicIcon width={16} height={16} />
          Live dictation
        </button>
        <button
          type="button"
          role="tab"
          id="tab-file"
          aria-selected={tab === "file"}
          aria-controls="panel-file"
          onClick={() => setTab("file")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
            tab === "file" ? "bg-card text-fg shadow-sm" : "text-muted",
          )}
        >
          <FileAudioIcon width={16} height={16} />
          Upload file
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          {tab === "live" ? (
            <div id="panel-live" role="tabpanel" aria-labelledby="tab-live" className="card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="stt-language" className="label !mb-0">
                  Recognition language
                </label>
                <select
                  id="stt-language"
                  className="select max-w-xs"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={micState === "listening"}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex flex-col items-center gap-4">
                <button
                  type="button"
                  onClick={() => (micState === "listening" ? stopListening() : void startListening())}
                  disabled={!supported}
                  aria-pressed={micState === "listening"}
                  aria-label={
                    micState === "listening" ? "Stop dictation" : "Start dictation with microphone"
                  }
                  className={cn(
                    "flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all",
                    micState === "listening"
                      ? "animate-pulse-ring border-danger bg-danger text-white"
                      : "border-line bg-subtle text-primary hover:border-primary",
                    !supported && "cursor-not-allowed opacity-50",
                  )}
                >
                  {micState === "listening" ? (
                    <StopIcon width={40} height={40} />
                  ) : supported ? (
                    <MicIcon width={40} height={40} />
                  ) : (
                    <MicOffIcon width={40} height={40} />
                  )}
                </button>

                <p className="text-sm font-medium" role="status" aria-live="polite">
                  {liveStatus}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-subtle p-3">
                <Waveform stream={micStream} active={micState === "listening"} />
                <p className="mt-1 text-center text-xs text-muted">
                  {micState === "listening" ? "Live input level" : "Microphone idle"}
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-card p-4">
                <p className="label">Live transcript</p>
                <div
                  aria-live="polite"
                  aria-atomic="false"
                  className="min-h-24 text-sm leading-relaxed"
                >
                  {transcript && <span className="text-fg">{transcript} </span>}
                  <span className="text-muted italic">{interim}</span>
                  {!transcript && !interim && (
                    <span className="text-muted">
                      Press the microphone and start speaking — words appear here in real time.
                    </span>
                  )}
                </div>
              </div>

              {permissionDenied && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                  <p className="flex items-center gap-2 font-semibold text-fg">
                    <span className="text-warning">
                      <AlertIcon width={16} height={16} />
                    </span>
                    Microphone permission needed
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                    <li>Click the lock/padlock icon in the browser address bar.</li>
                    <li>Set “Microphone” to <strong>Allow</strong>.</li>
                    <li>Reload this page and press the microphone button again.</li>
                  </ol>
                  <button
                    type="button"
                    className="btn btn-secondary mt-3 !min-h-9"
                    onClick={() => window.location.reload()}
                  >
                    Reload page
                  </button>
                </div>
              )}

              {!permissionDenied && micError && (
                <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  {micError}
                </p>
              )}
            </div>
          ) : (
            <div id="panel-file" role="tabpanel" aria-labelledby="tab-file" className="card p-5">
              <FileDrop
                onFile={(file) => void handleFile(file)}
                onError={(message) => {
                  setFileError(message);
                  toast.error(message);
                }}
                accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
                allowedExtensions={ALLOWED_AUDIO_EXTENSIONS}
                maxBytes={MAX_UPLOAD_BYTES}
                busy={busy}
                idleLabel="Drop an audio file here to transcribe it"
                hint="MP3, WAV, M4A, WebM or OGG — up to 25 MB. Files are sent securely to the Whisper model."
              />

              {busy && (
                <div className="mt-5" aria-live="polite">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Uploading &amp; transcribing…</span>
                    <span>{Math.round(progress * 100)}%</span>
                  </div>
                  <div
                    className="mt-1 h-2 w-full overflow-hidden rounded-full bg-subtle"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    aria-label="Upload progress"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {fileError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
                >
                  <span className="mt-0.5 shrink-0">
                    <AlertIcon width={16} height={16} />
                  </span>
                  {fileError}
                </div>
              )}

              {fileMeta && !busy && (
                <div className="mt-5 rounded-xl border border-line bg-subtle p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-primary">
                      <FileAudioIcon />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{fileMeta.name}</p>
                      <p className="text-xs text-muted">{formatBytes(fileMeta.size)}</p>
                    </div>
                    {resultMeta && (
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <span className="chip">
                          <ClockIcon width={12} height={12} />
                          {formatDuration(resultMeta.duration)}
                        </span>
                        <span className="chip">{resultMeta.language}</span>
                        <span className="chip text-success">
                          <CheckIcon width={12} height={12} />
                          done
                        </span>
                      </div>
                    )}
                  </div>

                  {previewUrl && (
                    <div className="mt-3">
                      <AudioPlayer src={previewUrl} label="Uploaded audio" />
                    </div>
                  )}

                  {segments.length > 0 && (
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showTimestamps}
                          onChange={(event) => setShowTimestamps(event.target.checked)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        Show timestamps
                      </label>

                      {showTimestamps && (
                        <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line bg-card p-2 text-sm">
                          {segments.map((segment, index) => (
                            <li key={index} className="flex gap-3 rounded-md px-1 py-1 hover:bg-subtle">
                              <span className="shrink-0 font-mono text-xs text-primary">
                                {formatDuration(segment.start)}
                              </span>
                              <span className="text-fg">{segment.text}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6">
            <TranscriptBox
              value={transcript}
              onChange={setTranscript}
              segments={segments}
              confidence={confidence}
              filename={fileMeta?.name ?? "voicebridge-transcript"}
              onClear={() => {
                setSegments([]);
                setConfidence(null);
                setResultMeta(null);
                setFileMeta(null);
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
              }}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">How it works</h2>
            <ol className="space-y-3 text-sm text-muted">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  1
                </span>
                <span>
                  <strong className="text-fg">Live dictation</strong> uses the browser Speech
                  Recognition API for instant, on-device streaming results.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  2
                </span>
                <span>
                  <strong className="text-fg">File upload</strong> sends the audio to the server,
                  which transcribes it with Groq Whisper <code>whisper-large-v3</code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
                  3
                </span>
                <span>
                  Results are editable — copy them, or download as .txt, .docx or timestamped .srt
                  subtitles.
                </span>
              </li>
            </ol>
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Tips for accurate results</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
              <li>Speak close to the microphone in a quiet room.</li>
              <li>Use punctuation words: “comma”, “full stop”, “question mark”.</li>
              <li>Keep files under 25 MB — trim long recordings first.</li>
              <li>
                Need to check accuracy? Try the{" "}
                <Link href="/roundtrip" className="underline">
                  Round-Trip demo
                </Link>
                .
              </li>
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-line bg-subtle p-4 text-xs text-muted">
            <span className="mt-0.5 shrink-0 text-primary">
              <WaveIcon width={16} height={16} />
            </span>
            Guests can use every tool freely — create an account to keep a permanent history of
            conversions.
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function SttPage() {
  return (
    <Suspense fallback={<div className="p-8"><LoadingBlock label="Loading speech-to-text…" /></div>}>
      <SttWorkspace />
    </Suspense>
  );
}
