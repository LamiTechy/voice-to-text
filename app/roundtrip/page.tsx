"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AudioPlayer } from "@/components/audio/audio-player";
import { AlertIcon, ArrowRightIcon, CheckIcon, RefreshIcon, SparkIcon } from "@/components/ui/icons";
import { LoadingBlock, Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { STTSegment } from "@/lib/speech/types";
import { cn } from "@/lib/utils/cn";
import { copyToClipboard, downloadText } from "@/lib/utils/download";
import { formatDuration, wordCount } from "@/lib/utils/formatters";
import { wordErrorRate, type WerResult } from "@/lib/utils/wer";
import { MAX_TTS_CHARS } from "@/lib/utils/validators";

type Stage = "idle" | "synthesizing" | "transcribing" | "done" | "error";
type StepState = "pending" | "running" | "done" | "error";

const SAMPLE =
  "VoiceBridge demonstrates the complete round trip from written language to spoken audio and back again, measuring how accurately the system recovers the original message.";

interface TranscribeResponse {
  text: string;
  segments: STTSegment[];
  duration: number;
  language: string;
  confidence: number | null;
}

function StepBadge({ state, index }: { state: StepState; index: number }) {
  const style =
    state === "done"
      ? "bg-success text-white"
      : state === "error"
        ? "bg-danger text-white"
        : state === "running"
          ? "bg-primary text-on-primary"
          : "bg-subtle text-muted border border-line";
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        style,
      )}
      aria-hidden="true"
    >
      {state === "done" ? <CheckIcon width={14} height={14} /> : index}
    </span>
  );
}

function DiffParagraph({
  title,
  items,
}: {
  title: string;
  items: Array<{ token: string; type: "equal" | "sub" | "del" | "ins" }>;
}) {
  return (
    <div className="rounded-xl border border-line bg-subtle p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="text-sm leading-7">
        {items.length === 0 && <span className="text-muted">— empty —</span>}
        {items.map((item, index) => (
          <span key={index}>
            <span
              className={cn(
                "rounded px-0.5",
                item.type === "equal" && "text-fg",
                item.type === "sub" && "bg-warning/25 text-warning underline decoration-warning/60",
                item.type === "del" &&
                  "bg-danger/15 text-danger line-through decoration-danger/70",
                item.type === "ins" && "bg-primary/20 text-primary underline decoration-primary/60",
              )}
            >
              {item.token}
            </span>{" "}
          </span>
        ))}
      </p>
    </div>
  );
}

function RoundtripWorkspace() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [text, setText] = useState(() => searchParams.get("text") ?? SAMPLE);
  const [rate, setRate] = useState(1);
  const [stage, setStage] = useState<Stage>("idle");
  const [step1, setStep1] = useState<StepState>("pending");
  const [step2, setStep2] = useState<StepState>("pending");
  const [step3, setStep3] = useState<StepState>("pending");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribed, setTranscribed] = useState<string | null>(null);
  const [segments, setSegments] = useState<STTSegment[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [wer, setWer] = useState<WerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = stage === "synthesizing" || stage === "transcribing";
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const resetOutput = useCallback(() => {
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setAudioBlob(null);
    setTranscribed(null);
    setSegments([]);
    setDuration(null);
    setConfidence(null);
    setWer(null);
    setError(null);
    setStep1("pending");
    setStep2("pending");
    setStep3("pending");
    setStage("idle");
  }, []);

  const generateAudio = useCallback(async (): Promise<Blob | null> => {
    if (!text.trim()) {
      toast.error("Enter some text to synthesise first.");
      return null;
    }
    setStep1("running");
    setStep2("pending");
    setStep3("pending");
    setStage("synthesizing");
    setError(null);
    setTranscribed(null);
    setWer(null);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, MAX_TTS_CHARS),
          rate,
          pitch: 1,
          volume: 1,
          format: "mp3",
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? `Synthesis failed (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      setAudioBlob(blob);
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      setStep1("done");
      setStage("idle");
      return blob;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Synthesis failed.";
      setStep1("error");
      setStage("error");
      setError(message);
      toast.error(message);
      return null;
    }
  }, [rate, text, toast]);

  const transcribeAudio = useCallback(
    async (blob: Blob | null): Promise<void> => {
      if (!blob) {
        toast.error("Generate the audio before transcribing it.");
        return;
      }
      setStep2("running");
      setStage("transcribing");

      try {
        const formData = new FormData();
        formData.append(
          "file",
          new File([blob], "roundtrip.mp3", { type: "audio/mpeg" }),
        );
        formData.append("language", "en");
        formData.append("includeTimestamps", "true");

        const response = await fetch("/api/stt", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(payload?.error?.message ?? `Transcription failed (HTTP ${response.status}).`);
        }

        const result = (await response.json()) as TranscribeResponse;
        setTranscribed(result.text);
        setSegments(result.segments ?? []);
        setDuration(result.duration);
        setConfidence(result.confidence);
        setStep2("done");

        const score = wordErrorRate(text, result.text);
        setWer(score);
        setStep3("done");
        setStage("done");
        toast.success(`Round-trip complete — WER ${(score.wer * 100).toFixed(1)}%.`);
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : "Transcription failed.";
        setStep2("error");
        setStage("error");
        setError(message);
        toast.error(message);
      }
    },
    [text, toast],
  );

  const runRoundTrip = useCallback(async () => {
    const blob = await generateAudio();
    if (blob) await transcribeAudio(blob);
  }, [generateAudio, transcribeAudio]);

  const referenceItems = useMemo(() => {
    if (!wer) return [];
    return wer.ops
      .filter((op) => op.type !== "insert")
      .map((op) => ({
        token: op.ref ?? "",
        type: op.type === "equal" ? "equal" : op.type === "substitute" ? "sub" : "del",
      })) as Array<{ token: string; type: "equal" | "sub" | "del" | "ins" }>;
  }, [wer]);

  const hypothesisItems = useMemo(() => {
    if (!wer) return [];
    return wer.ops
      .filter((op) => op.type !== "delete")
      .map((op) => ({
        token: op.hyp ?? "",
        type: op.type === "equal" ? "equal" : op.type === "substitute" ? "sub" : "ins",
      })) as Array<{ token: string; type: "equal" | "sub" | "del" | "ins" }>;
  }, [wer]);

  const werTone =
    wer === null
      ? "text-fg"
      : wer.wer === 0
        ? "text-success"
        : wer.wer <= 0.15
          ? "text-success"
          : wer.wer <= 0.35
            ? "text-warning"
            : "text-danger";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">Text → Audio → Text</span>
          <span className="chip">Word Error Rate</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Round-Trip Demo</h1>
        <p className="mt-2 max-w-3xl text-muted">
          The “vice-versa” showcase: write a sentence, synthesise it into audio, feed that exact
          audio back into the recogniser, then compare the recovered text against the original with
          a Word Error Rate (WER) score.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <label htmlFor="roundtrip-text" className="label">
              Step 1 · Original text (max {MAX_TTS_CHARS} characters)
            </label>
            <textarea
              id="roundtrip-text"
              className="textarea min-h-36"
              rows={5}
              maxLength={MAX_TTS_CHARS}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Type the sentence you want to send around the loop…"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
              <span>
                {text.length}/{MAX_TTS_CHARS} characters · {wordCount(text)} words
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="roundtrip-rate" className="text-xs">
                  Speed
                </label>
                <input
                  id="roundtrip-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="w-28 accent-[var(--primary)]"
                  aria-valuetext={`${rate.toFixed(2)} times`}
                />
                <span className="font-semibold text-fg">{rate.toFixed(2)}×</span>
                <button
                  type="button"
                  className="btn btn-ghost !min-h-8 !px-2 !py-1 text-xs"
                  onClick={() => {
                    setText(SAMPLE);
                    resetOutput();
                  }}
                >
                  <SparkIcon width={14} height={14} />
                  Example
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => void runRoundTrip()}
                disabled={busy || !text.trim()}
                aria-label="Run the full round-trip demonstration"
              >
                {stage === "synthesizing" || stage === "transcribing" ? <Spinner /> : <SparkIcon />}
                {busy ? (stage === "synthesizing" ? "Generating audio…" : "Transcribing…") : "Run round-trip"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void generateAudio()}
                disabled={busy || !text.trim()}
              >
                Generate audio only
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void transcribeAudio(audioBlob)}
                disabled={busy || !audioBlob}
              >
                Transcribe only
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetOutput}
                disabled={busy || stage === "idle"}
              >
                <RefreshIcon />
                Reset
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
              >
                <span className="mt-0.5 shrink-0">
                  <AlertIcon width={16} height={16} />
                </span>
                <span>
                  {error}{" "}
                  <Link href="/tts" className="underline">
                    Try the browser voice engine instead
                  </Link>
                  .
                </span>
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pipeline progress</h2>
              <span className="chip" role="status" aria-live="polite">
                {stage === "idle" && "Idle"}
                {stage === "synthesizing" && "Synthesising…"}
                {stage === "transcribing" && "Transcribing…"}
                {stage === "done" && "Complete"}
                {stage === "error" && "Stopped on error"}
              </span>
            </div>

            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <StepBadge index={1} state={step1} />
                <div>
                  <p className="text-sm font-semibold">Text → Speech (TTS)</p>
                  <p className="text-xs text-muted">
                    The server synthesises a streaming MP3 from your text.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <StepBadge index={2} state={step2} />
                <div>
                  <p className="text-sm font-semibold">Audio → Text (STT)</p>
                  <p className="text-xs text-muted">
                    The generated MP3 is uploaded to Whisper <code>whisper-large-v3</code>.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <StepBadge index={3} state={step3} />
                <div>
                  <p className="text-sm font-semibold">Accuracy analysis</p>
                  <p className="text-xs text-muted">
                    Both texts are aligned word-by-word to compute the WER score.
                  </p>
                </div>
              </li>
            </ol>

            {audioUrl && (
              <div className="mt-5">
                <p className="label">Step 2 input · generated audio</p>
                <AudioPlayer
                  src={audioUrl}
                  audioRef={audioRef}
                  downloadUrl={audioUrl}
                  downloadFilename="voicebridge-roundtrip.mp3"
                  label="Round-trip audio"
                />
                {duration !== null && (
                  <p className="mt-2 text-xs text-muted">
                    Transcribed duration: {formatDuration(duration)}
                    {confidence !== null ? ` · confidence ${(confidence * 100).toFixed(0)}%` : ""}
                    {segments.length > 0 ? ` · ${segments.length} timestamped segments` : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold">Result comparison</h2>

            {!wer ? (
              <div className="rounded-xl border border-dashed border-line bg-subtle p-6 text-center text-sm text-muted">
                <p className="font-medium text-fg">No results yet</p>
                <p className="mt-1">
                  Run the round-trip to see the original and transcribed text side by side with a
                  WER score.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl border border-line bg-subtle p-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">
                      Word Error Rate
                    </p>
                    <p className={`text-4xl font-bold tabular-nums ${werTone}`}>
                      {(wer.wer * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>
                      <strong className="text-fg">{wer.hits}</strong> correct words
                    </p>
                    <p>
                      <strong className="text-fg">{wer.referenceTokens}</strong> reference words
                    </p>
                    <p>
                      distance <strong className="text-fg">{wer.distance}</strong>
                    </p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-line bg-subtle p-2">
                    <dt className="text-muted">Substitutions</dt>
                    <dd className="font-bold text-warning">{wer.substitutions}</dd>
                  </div>
                  <div className="rounded-lg border border-line bg-subtle p-2">
                    <dt className="text-muted">Deletions</dt>
                    <dd className="font-bold text-danger">{wer.deletions}</dd>
                  </div>
                  <div className="rounded-lg border border-line bg-subtle p-2">
                    <dt className="text-muted">Insertions</dt>
                    <dd className="font-bold text-primary">{wer.insertions}</dd>
                  </div>
                </dl>

                <div className="mt-4 space-y-3">
                  <DiffParagraph title="Original" items={referenceItems} />
                  <DiffParagraph title="Transcribed" items={hypothesisItems} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-warning/60" /> substituted
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-danger/60" /> missing
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary/60" /> extra
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary !min-h-9 flex-1 text-xs"
                    onClick={() => {
                      void copyToClipboard(
                        `Original: ${text}\n\nTranscribed: ${transcribed ?? ""}\n\nWER: ${(wer.wer * 100).toFixed(1)}%`,
                      ).then((ok) =>
                        toast[ok ? "success" : "error"](
                          ok ? "Comparison copied." : "Copy failed.",
                        ),
                      );
                    }}
                  >
                    Copy comparison
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary !min-h-9 flex-1 text-xs"
                    onClick={() =>
                      downloadText(
                        `ORIGINAL\n${text}\n\nTRANSCRIBED\n${transcribed ?? ""}\n\nWER: ${(wer.wer * 100).toFixed(1)}%\nS=${wer.substitutions} D=${wer.deletions} I=${wer.insertions}\n`,
                        "voicebridge-roundtrip.txt",
                      )
                    }
                  >
                    Download report
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card p-5 text-sm text-muted">
            <h2 className="mb-2 text-sm font-semibold text-fg">How WER is calculated</h2>
            <p className="font-mono text-xs">WER = (S + D + I) / N</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>
                <strong className="text-fg">S</strong> — words substituted
              </li>
              <li>
                <strong className="text-fg">D</strong> — words deleted (missing)
              </li>
              <li>
                <strong className="text-fg">I</strong> — words inserted (extra)
              </li>
              <li>
                <strong className="text-fg">N</strong> — words in the reference text
              </li>
            </ul>
            <p className="mt-3 text-xs">
              Both texts are lower-cased and stripped of punctuation before alignment, which is the
              standard convention for ASR benchmarking.{" "}
              <Link href="/about" className="underline">
                Read the full design
              </Link>
              .
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-line bg-subtle p-4 text-xs text-muted">
            <span className="mt-0.5 shrink-0 text-primary">
              <ArrowRightIcon width={16} height={16} />
            </span>
            A low WER means the speech pipeline preserves meaning accurately. Names, numbers and
            rare words usually produce the largest errors.
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function RoundtripPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <LoadingBlock label="Loading round-trip demo…" />
        </div>
      }
    >
      <RoundtripWorkspace />
    </Suspense>
  );
}
