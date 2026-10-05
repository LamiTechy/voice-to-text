import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About & System Architecture",
  description:
    "How VoiceBridge implements text-to-speech and speech-to-text: architecture, data flows, database design and the speech technologies used.",
};

const ARCHITECTURE = [
  {
    layer: "Presentation layer",
    items: ["Landing", "TTS page", "STT page", "Round-trip demo", "Dashboard", "Admin"],
    note: "Next.js App Router pages with Tailwind, dark/light theming and accessible controls.",
  },
  {
    layer: "Client speech layer",
    items: ["SpeechSynthesis (TTS)", "SpeechRecognition (STT live)", "MediaRecorder capture"],
    note: "Zero-cost browser engines used by default, with graceful feature detection.",
  },
  {
    layer: "API layer",
    items: ["/api/auth/*", "/api/tts", "/api/stt", "/api/history", "/api/admin/stats"],
    note: "Route handlers validate with Zod, rate-limit per IP and return consistent JSON errors.",
  },
  {
    layer: "Provider abstraction",
    items: ["TTSProvider interface", "STTProvider interface", "Free web TTS · edge-tts bridge · Groq Whisper"],
    note: "Engines are swappable without touching any UI code — the pluggable provider layer.",
  },
  {
    layer: "Data layer",
    items: ["Neon Postgres", "Drizzle ORM", "JWT session cookie (httpOnly)"],
    note: "Users, conversions and usage statistics; no server-side session table is required.",
  },
];

const USE_CASES = [
  { actor: "Guest", goal: "Convert written text into audible speech", type: "Primary" },
  { actor: "Guest", goal: "Dictate speech into editable text", type: "Primary" },
  { actor: "Guest", goal: "Upload an audio file for transcription", type: "Primary" },
  { actor: "Guest", goal: "Measure round-trip accuracy with a WER score", type: "Primary" },
  { actor: "Registered user", goal: "Keep a permanent history of conversions", type: "Extension" },
  { actor: "Registered user", goal: "Re-open, re-download or delete past conversions", type: "Extension" },
  { actor: "Registered user", goal: "Review usage statistics (totals, minutes, language)", type: "Extension" },
  { actor: "Administrator", goal: "View total users, conversions and recent activity", type: "Admin" },
  { actor: "System", goal: "Fall back to the browser voice when the server engine fails", type: "Automatic" },
  { actor: "System", goal: "Reject oversized, unsupported or rate-limited requests", type: "Automatic" },
];

const MERMAID_ERD = `erDiagram
  users ||--o{ conversions : "owns"
  users {
    uuid id PK
    varchar name
    varchar email UK
    text password_hash
    user_role role
    timestamp created_at
  }
  conversions {
    uuid id PK
    uuid user_id FK
    conversion_type type
    text input_text
    text output_text
    text audio_url
    varchar language
    varchar voice
    int duration_seconds
    jsonb settings
    timestamp created_at
  }`;

function DiagramStep({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <li className="relative flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
        {index}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="max-w-3xl">
        <span className="chip">Project documentation</span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          About VoiceBridge &amp; system architecture
        </h1>
        <p className="mt-4 text-lg text-muted">
          VoiceBridge implements <em>“Design and Implementation of a Text-to-Speech / Audio System
          and Vice-Versa”</em>: one system that writes speech from text, writes text from speech,
          and measures how faithfully the message survives the trip.
        </p>
      </header>

      <section className="mt-12" aria-labelledby="architecture-heading">
        <h2 id="architecture-heading" className="text-2xl font-bold tracking-tight">
          1. System architecture
        </h2>
        <p className="mt-2 max-w-3xl text-muted">
          A layered Next.js application. Each layer depends only on the layer beneath it, which is
          what lets speech engines be replaced without rewriting the interface.
        </p>

        <div className="mt-6 space-y-3">
          {ARCHITECTURE.map((row, index) => (
            <div
              key={row.layer}
              className="card overflow-hidden"
              style={{ marginLeft: `${index * 12}px` }}
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-subtle px-4 py-3">
                <span className="chip">{index + 1}</span>
                <h3 className="text-sm font-semibold">{row.layer}</h3>
              </div>
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                <div className="flex flex-wrap gap-2">
                  {row.items.map((item) => (
                    <span key={item} className="chip">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted">{row.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2" aria-label="Data flow diagrams">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">2. TTS data flow</h2>
          <ol className="mt-4 space-y-4">
            <DiagramStep
              index={1}
              title="Input"
              body="The user types or pastes text (≤ 5,000 characters) or uploads a .txt file, then chooses voice, speed, pitch and volume."
            />
            <DiagramStep
              index={2}
              title="Validation"
              body="The client checks limits for instant feedback; the /api/tts route re-validates with Zod and applies a per-IP rate limit."
            />
            <DiagramStep
              index={3}
              title="Provider selection"
              body="synthesizeSpeech() walks the configured TTSProvider chain (free web engine, optional edge-tts bridge) and returns streamed audio bytes."
            />
            <DiagramStep
              index={4}
              title="Response"
              body="Audio streams back as audio/mpeg with a download filename; failures return JSON errors so the UI can fall back to the browser SpeechSynthesis engine."
            />
            <DiagramStep
              index={5}
              title="Persistence"
              body="Signed-in users get a conversions row (type = tts) with language, estimated duration and the synthesis settings used."
            />
          </ol>
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">3. STT data flow</h2>
          <ol className="mt-4 space-y-4">
            <DiagramStep
              index={1}
              title="Two entry points"
              body="Live dictation streams microphone audio through the browser SpeechRecognition API; file upload sends a multipart body to /api/stt."
            />
            <DiagramStep
              index={2}
              title="File validation"
              body="Extension allow-list (mp3, wav, m4a, webm, ogg), 25 MB cap and magic-byte sniffing reject corrupt or mismatched files before any provider is called."
            />
            <DiagramStep
              index={3}
              title="Transcription"
              body="The STTProvider (Groq Whisper, whisper-large-v3) receives the audio and returns text, segments with timestamps, language, duration and confidence."
            />
            <DiagramStep
              index={4}
              title="Editing & export"
              body="The transcript is editable and exportable as .txt, .docx or timestamped .srt subtitles, with copy-to-clipboard."
            />
            <DiagramStep
              index={5}
              title="Persistence"
              body="Signed-in users get a conversions row (type = stt) storing the transcript, segments and confidence inside the jsonb settings column."
            />
          </ol>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="erd-heading">
        <h2 id="erd-heading" className="text-2xl font-bold tracking-tight">
          4. Database design (ERD)
        </h2>
        <p className="mt-2 max-w-3xl text-muted">
          Two tables keep the model intentionally small: <code>users</code> for accounts and roles,{" "}
          <code>conversions</code> for every TTS/STT job. Sessions are stateless JWTs, so no
          session table is required.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Mermaid source (paste into any Mermaid renderer)
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
              <code>{MERMAID_ERD}</code>
            </pre>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold">Column notes</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                <code>users.role</code> is a Postgres enum (<code>user | admin</code>) — the admin
                account is seeded from <code>ADMIN_EMAIL</code>/<code>ADMIN_PASSWORD</code>.
              </li>
              <li>
                <code>conversions.user_id</code> is nullable so guests can still be logged for
                auditing if desired; history queries always filter by the signed-in user.
              </li>
              <li>
                <code>settings</code> is jsonb: rate/pitch/engine for TTS, segments and confidence
                for STT — flexible without extra migrations.
              </li>
              <li>
                <code>audio_url</code> is reserved for object-storage URLs; the current build
                regenerates audio on demand instead of storing binaries in the database.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="usecases-heading">
        <h2 id="usecases-heading" className="text-2xl font-bold tracking-tight">
          5. Use cases
        </h2>
        <div className="card mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Actor
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Goal
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Kind
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {USE_CASES.map((useCase) => (
                  <tr key={useCase.goal} className="hover:bg-subtle">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{useCase.actor}</td>
                    <td className="px-4 py-3 text-muted">{useCase.goal}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="chip">{useCase.type}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="tech-heading">
        <h2 id="tech-heading" className="text-2xl font-bold tracking-tight">
          6. Speech technologies
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <article className="card p-5">
            <h3 className="text-base font-semibold">Synthesis (TTS)</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The default engine is the browser <code>SpeechSynthesis</code> API: free, private and
              able to render locally installed voices (US/UK/Nigerian English where the OS provides
              them). For downloadable MP3 files, the server walks a{" "}
              <code>TTSProvider</code> chain — a free web endpoint by default, or a self-hosted{" "}
              <code>edge-tts</code> bridge configured through <code>TTS_API_URL</code>. Long texts
              are chunked on word boundaries and streamed so first audio arrives quickly.
            </p>
          </article>

          <article className="card p-5">
            <h3 className="text-base font-semibold">Recognition (STT, live)</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Live dictation uses <code>SpeechRecognition</code> / <code>webkitSpeechRecognition</code>{" "}
              with <code>continuous</code> and <code>interimResults</code> enabled, giving instant
              partial hypotheses that are promoted to final text as the recogniser commits them. A
              light auto-restart loop keeps listening through long silences, and permission denials
              are turned into actionable on-screen instructions.
            </p>
          </article>

          <article className="card p-5">
            <h3 className="text-base font-semibold">Recognition (STT, files — Whisper)</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Uploaded audio is transcribed server-side by <code>whisper-large-v3</code> served by
              the Groq API (<code>GROQ_API_KEY</code>). Verbose responses supply word timings for
              SRT export, an ISO-639-1 language code, total duration and per-segment log
              probabilities that we convert into a confidence score.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="quality-heading">
        <h2 id="quality-heading" className="text-2xl font-bold tracking-tight">
          7. Quality, security &amp; reliability
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Security</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>bcrypt hashing at cost 12 for every password, including the seeded admin.</li>
              <li>JWT sessions in httpOnly, secure, SameSite=Lax cookies — never readable by JS.</li>
              <li>Zod validation on every route input, with typed JSON error envelopes.</li>
              <li>File type sniffing, 25 MB caps and per-IP rate limits on synthesis/transcription.</li>
              <li>No API key is ever exposed to the browser; providers run only on the server.</li>
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Reliability &amp; performance</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>Provider failures fall back to the browser voice instead of dead-ending.</li>
              <li>Audio responses stream instead of buffering whole files where possible.</li>
              <li>Lazy database client keeps static builds working without a configured database.</li>
              <li>Feature detection banners steer unsupported browsers to file transcription.</li>
              <li>Strict TypeScript with no <code>any</code> in application code.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-line bg-subtle p-6">
        <h2 className="text-xl font-bold tracking-tight">Try the showcase</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          The round-trip page demonstrates both directions in one click and reports the Word Error
          Rate — the clearest way to defend the system’s accuracy during a project presentation.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/roundtrip" className="btn btn-primary">
            Open round-trip demo
          </Link>
        </div>
      </section>
    </div>
  );
}
