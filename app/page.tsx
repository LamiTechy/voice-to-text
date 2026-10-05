import Link from "next/link";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  FileAudioIcon,
  MicIcon,
  RefreshIcon,
  SparkIcon,
  WaveIcon,
} from "@/components/ui/icons";

const FEATURES = [
  {
    icon: <WaveIcon />,
    title: "Natural text to speech",
    body: "Paste up to 5,000 characters, choose a voice by language or accent, and control speed, pitch and volume with live word highlighting.",
    href: "/tts",
    cta: "Open Text → Speech",
  },
  {
    icon: <MicIcon />,
    title: "Live dictation",
    body: "Speak into your microphone and watch interim results stream into the transcript in real time, with a live input level meter.",
    href: "/stt",
    cta: "Open Speech → Text",
  },
  {
    icon: <FileAudioIcon />,
    title: "File transcription",
    body: "Drag-and-drop MP3, WAV, M4A, WebM or OGG files up to 25 MB and get an accurate transcript with optional timestamps.",
    href: "/stt?tab=file",
    cta: "Transcribe a file",
  },
  {
    icon: <RefreshIcon />,
    title: "Round-trip analysis",
    body: "Send text to audio and back to text again, then measure the loss with a word-by-word diff and a Word Error Rate score.",
    href: "/roundtrip",
    cta: "Run the demo",
  },
  {
    icon: <ClockIcon />,
    title: "History & statistics",
    body: "Signed-in users keep every conversion with language, duration and settings, plus usage cards for totals and most-used language.",
    href: "/dashboard",
    cta: "View dashboard",
  },
  {
    icon: <CheckIcon />,
    title: "Accessible everywhere",
    body: "Dark and light themes, keyboard navigation, ARIA-labelled controls, live regions and friendly fallbacks when a browser API is missing.",
    href: "/about",
    cta: "See how it works",
  },
];

const STEPS = [
  {
    title: "Write or speak",
    body: "Type text into the editor, dictate with the microphone, or drop an audio file onto the page.",
  },
  {
    title: "Engine converts",
    body: "TTS synthesises audio with the browser voice engine or a server provider; STT streams results or calls Whisper.",
  },
  {
    title: "Use the result",
    body: "Play, highlight, compare with WER, then copy or download as MP3, TXT, DOCX or SRT.",
  },
];

export default function HomePage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_55%)]"
        />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:pt-24">
          <div>
            <span className="chip">
              <SparkIcon width={14} height={14} />
              Design &amp; Implementation of a TTS / STT system
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Turn text into voice —
              <span className="text-primary"> and voice back into text</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              VoiceBridge is a single, polished interface for speech synthesis, transcription and
              accuracy measurement. Free browser engines by default, optional server providers for
              MP3 downloads and Whisper-grade file transcription.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/tts" className="btn btn-primary btn-lg">
                Try text to speech
                <ArrowRightIcon width={18} height={18} />
              </Link>
              <Link href="/roundtrip" className="btn btn-secondary btn-lg">
                <RefreshIcon width={18} height={18} />
                Round-trip demo
              </Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <span className="text-success">
                  <CheckIcon width={16} height={16} />
                </span>
                No sign-up required to try
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">
                  <CheckIcon width={16} height={16} />
                </span>
                Dark &amp; light mode
              </li>
              <li className="flex items-center gap-2">
                <span className="text-success">
                  <CheckIcon width={16} height={16} />
                </span>
                Works on mobile Chrome
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <span className="chip">Live preview</span>
                <span className="chip text-success">WER 3.2%</span>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Original</p>
                <p className="mt-1 text-sm leading-6">
                  VoiceBridge converts written language into speech and back again.
                </p>
              </div>

              <div className="mt-3 flex items-center justify-center text-primary" aria-hidden="true">
                <ArrowRightIcon />
              </div>

              <div className="mt-3 rounded-xl border border-line bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Transcribed
                </p>
                <p className="mt-1 text-sm leading-6">
                  Voice bridge converts written language into{" "}
                  <span className="rounded bg-warning/25 px-0.5 text-warning underline">speech</span>{" "}
                  and back{" "}
                  <span className="rounded bg-danger/15 px-0.5 text-danger line-through">agin</span>.
                </p>
              </div>

              <div className="mt-4 flex h-16 items-end gap-1" aria-hidden="true">
                {Array.from({ length: 36 }).map((_, index) => (
                  <span
                    key={index}
                    className="flex-1 rounded-full bg-primary/70"
                    style={{
                      height: `${18 + Math.abs(Math.sin(index * 0.7)) * 80}%`,
                      opacity: 0.35 + Math.abs(Math.cos(index * 0.5)) * 0.55,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="absolute -bottom-5 -left-4 hidden rounded-xl border border-line bg-card px-4 py-3 text-xs shadow-lg sm:block">
              <p className="flex items-center gap-2 font-semibold">
                <span className="text-warning">
                  <AlertIcon width={14} height={14} />
                </span>
                Server failed?{" "}
              </p>
              <p className="mt-1 text-muted">Automatic browser-voice fallback keeps you speaking.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-line bg-subtle py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything in one interface</h2>
            <p className="mt-3 text-muted">
              Both directions of the speech pipeline, wired together with a pluggable provider
              layer, accounts, history and an admin console.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Link
                key={feature.title}
                href={feature.href}
                className="card group p-6 transition-transform hover:-translate-y-0.5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  {feature.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {feature.cta}
                  <span className="transition-transform group-hover:translate-x-0.5">
                    <ArrowRightIcon width={16} height={16} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">How VoiceBridge works</h2>
            <p className="mt-3 text-muted">
              A short pipeline with clear fallbacks — every step reports its state back to you.
            </p>
          </div>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative card p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line bg-subtle py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            Ready to hear your words — or read them back?
          </h2>
          <p className="max-w-xl text-muted">
            Start with a sample sentence, then run the round-trip to see exactly how much of the
            message survives the trip through audio.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/stt" className="btn btn-primary btn-lg">
              <MicIcon width={18} height={18} />
              Start dictating
            </Link>
            <Link href="/register" className="btn btn-secondary btn-lg">
              Create a free account
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
