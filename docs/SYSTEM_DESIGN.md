# VoiceBridge — System Design Document

> Companion document for the project **“Design and Implementation of a Text-to-Speech / Audio
> System and Vice-Versa.”** The sections below are written so they can be adapted directly into
> the design chapters of a project report.

---

## 1. System architecture

VoiceBridge follows a **layered client–server architecture** implemented entirely within a single
Next.js application. Each layer only depends on the layer directly beneath it, which is what makes
the speech engines replaceable without touching the interface.

```mermaid
flowchart TB
  subgraph L1["Layer 1 — Presentation"]
    P1["Marketing / landing page"]
    P2["TTS workspace"]
    P3["STT workspace"]
    P4["Round-trip demo"]
    P5["Dashboard · Admin · Auth"]
  end

  subgraph L2["Layer 2 — Client speech engines"]
    C1["SpeechSynthesis (TTS)"]
    C2["SpeechRecognition (STT live)"]
    C3["MediaRecorder / tab-audio capture"]
    C4["Web Audio API level meter"]
  end

  subgraph L3["Layer 3 — Application API (route handlers)"]
    A1["auth routes"]
    A2["/api/tts"]
    A3["/api/stt"]
    A4["/api/history"]
    A5["/api/admin/stats"]
    A6["middleware.ts (JWT guard)"]
  end

  subgraph L4["Layer 4 — Speech provider abstraction"]
    S1["TTSProvider interface"]
    S2["STTProvider interface"]
    S3["free web TTS provider"]
    S4["edge-tts bridge provider"]
    S5["Groq Whisper provider"]
  end

  subgraph L5["Layer 5 — Persistence"]
    D1[("Neon Postgres")]
    D2["Drizzle ORM repositories"]
    D3["JWT stateless sessions"]
  end

  L1 --> L2
  L1 --> L3
  L3 --> L4
  L3 --> L5
  L4 --> L3
```

### 1.1 Component responsibilities

| Component | Responsibility |
| --- | --- |
| Pages (App Router) | Layout, state, accessibility, optimistic UI, error/empty/loading states |
| `lib/speech` | Provider **interfaces** + orchestrators (`synthesizeSpeech`, `transcribeAudio`) that pick the first available engine and aggregate failures |
| Route handlers | Input validation (Zod), per-IP rate limiting, authentication, history persistence, typed JSON errors |
| `middleware.ts` | Cheap signature verification of the session cookie for `/dashboard` and `/admin` before rendering |
| `lib/db` | Lazy Drizzle/Neon client, schema, admin seed script |
| `lib/utils` | WER engine, validators, audio sniffing, formatters, download builders |

### 1.2 Why a pluggable provider layer

Both directions of the pipeline are expressed as small interfaces:

```ts
export interface TTSProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  synthesize(request: TTSRequest): Promise<TTSResult>;
}

export interface STTProvider {
  readonly id: string;
  readonly label: string;
  isAvailable(): Promise<boolean>;
  transcribe(request: STTRequest): Promise<STTResult>;
}
```

The orchestrator walks an ordered chain (chosen by `TTS_PROVIDER` / `STT_PROVIDER`), records why
each engine was skipped or failed, and returns one aggregated, user-readable error only when the
whole chain fails. Adding a new engine is a single new file in `lib/speech/providers/`.

---

## 2. Data flow — Text-to-Speech pipeline

```mermaid
sequenceDiagram
  actor U as User
  participant UI as TTS page (client)
  participant API as POST /api/tts
  participant CH as Chain (lib/speech/tts.ts)
  participant PR as Provider (free web / edge-tts)
  participant DB as Neon Postgres
  participant BS as Browser SpeechSynthesis

  U->>UI: type text, choose voice + rate/pitch/volume
  UI->>UI: live counters, 5 000-char limit
  UI->>API: { text, voice, rate, pitch, format } (JSON)
  API->>API: Zod validation + per-IP rate limit
  API->>CH: synthesizeSpeech(request)
  CH->>PR: first available provider
  PR->>PR: chunk text on word boundaries, fetch chunk 1
  PR-->>API: ReadableStream (audio/mpeg)
  API--)DB: save conversion (only if session cookie present)
  API-->>UI: 200 audio/mpeg + X-TTS-Provider + filename
  UI->>UI: object URL → <audio>, progress, word highlight
  alt Server engine fails
    PR-->>CH: ProviderError
    CH-->>API: 502 PROVIDER_ERROR (JSON)
    API-->>UI: error JSON
    UI->>BS: automatic fallback → speak with browser voice
  end
```

**Key decisions**

1. **Validation twice.** The client enforces limits for instant feedback; the server re-validates
   because it is the only trustworthy boundary.
2. **Stream, don’t buffer.** The provider fetches the first chunk before the response headers are
   written, then streams the remaining chunks — first audio arrives in ~1 RTT.
3. **Fail soft.** Provider errors become typed JSON (`PROVIDER_ERROR`, `PROVIDER_UNAVAILABLE`,
   `RATE_LIMITED`) and the UI degrades to the free browser engine rather than dead-ending.
4. **History is best effort.** `saveConversion()` never throws: guests and database outages must
   not break synthesis.

---

## 3. Data flow — Speech-to-Text pipeline

### 3.1 Live dictation (browser engine)

```mermaid
sequenceDiagram
  actor U as User
  participant BR as SpeechRecognition
  participant UI as STT page (client)
  participant DB as Neon Postgres

  U->>UI: press microphone
  UI->>UI: getUserMedia (waveform/level meter)
  UI->>BR: start(lang, continuous, interimResults)
  BR-->>UI: interim hypothesis → live region (aria-live)
  BR-->>UI: final hypothesis → append to transcript
  BR-->>UI: error (not-allowed / no-speech / network)
  UI->>UI: show permission checklist or browser banner
  U->>UI: press stop
  UI->>BR: stop(), stop() tracks
  UI--)DB: POST /api/history (only when signed in)
```

### 3.2 File transcription (server engine)

```mermaid
sequenceDiagram
  actor U as User
  participant UI as STT page (client)
  participant API as POST /api/stt
  participant V as Validator
  participant PR as Groq Whisper provider
  participant DB as Neon Postgres

  U->>UI: drop audio file (≤ 25 MB)
  UI->>API: multipart/form-data (XHR with progress events)
  API->>V: validateAudioFile()
  V->>V: extension allow-list, size cap
  V->>V: magic-byte sniff (RIFF/ID3/ftyp/EBML/OggS)
  V-->>API: AudioFileFormat | 415/413 error
  API->>PR: transcribeAudio({ file, language, includeTimestamps })
  PR->>PR: POST /audio/transcriptions (model=whisper-large-v3, verbose_json)
  PR-->>API: { text, segments[], language, duration }
  API--)DB: save conversion (text, segments, confidence)
  API-->>UI: 200 JSON
  UI->>UI: editable transcript, timestamps, confidence, exports
```

**Key decisions**

1. **Sniff, don’t trust.** The declared extension is compared with the file’s magic bytes, so a
   PNG renamed to `.mp3` is rejected locally with a human-readable message before any provider is
   called (and before any bytes leave the server).
2. **Verbose responses.** `verbose_json` yields segment timings (for `.srt` export), the ISO-639-1
   language, total duration and `avg_logprob`, which is converted to a confidence score with
   `exp(avg_logprob)` when the provider does not report one directly.
3. **Progress.** Upload progress is taken from `XMLHttpRequest.upload.onprogress`, which `fetch`
   cannot observe.

---

## 4. Round-trip accuracy analysis

```mermaid
flowchart LR
  T[Original text] --> A[TTS provider]
  A --> B((MP3 audio))
  B --> C[Whisper STT]
  C --> D[Transcribed text]
  T --> E[Normalise]
  D --> F[Normalise]
  E --> G[Word alignment<br/>Levenshtein DP]
  F --> G
  G --> H[WER = S+D+I / N<br/>+ coloured diff]
```

Normalisation: Unicode NFKD → lower-case → strip punctuation (letters/numbers/apostrophes kept)
→ collapse whitespace. This is the standard convention for ASR benchmarking, so scores are
comparable with published WER figures. The alignment dynamic-programming table is back-tracked to
produce an operation list (`equal | substitute | delete | insert`) that powers both the diff UI and
the S/D/I counters.

---

## 5. Database design (ERD)

```mermaid
erDiagram
  users ||--o{ conversions : "owns"

  users {
    uuid id PK
    varchar name "2..80 chars"
    varchar email UK "lower-cased, unique"
    text password_hash "bcrypt cost 12"
    user_role role "user | admin"
    timestamp created_at "default now()"
  }

  conversions {
    uuid id PK
    uuid user_id FK "nullable → set null on user delete"
    conversion_type type "tts | stt"
    text input_text "source text (TTS)"
    text output_text "transcript (STT)"
    text audio_url "reserved for object storage"
    varchar language "BCP-47 / ISO-639-1"
    varchar voice "voice or language tag"
    int duration_seconds "estimated or measured"
    jsonb settings "rate/pitch/engine · segments/confidence"
    timestamp created_at "indexed"
  }
```

**Normalisation & indexing notes**

- The model is in **third normal form**: the only non-key attribute that depends on a JSON blob is
  intentionally flexible (`settings`), because TTS and STT need disjoint fields and a shared table
  keeps reporting queries simple.
- Composite-free foreign key `conversions.user_id` with `ON DELETE SET NULL` keeps historical
  records if an account is removed.
- Indexes: `users(email)` (login look-up), `conversions(user_id)`, `conversions(created_at)`
  (dashboard ordering), `conversions(type)` (filters and admin counts).
- **No `sessions` table**: sessions are stateless JWTs, so logout is a cookie deletion and there is
  nothing to garbage-collect.

---

## 6. Use cases

| ID | Actor | Goal | Type | Notes |
| --- | --- | --- | --- | --- |
| UC-01 | Guest | Convert written text into audible speech | Primary | Browser engine, no account |
| UC-02 | Guest | Generate a downloadable MP3 from text | Primary | Server provider chain |
| UC-03 | Guest | Control speed, pitch, volume and voice | Primary | 0.5×–2×, grouped voices |
| UC-04 | Guest | Follow the current word while audio plays | Primary | Boundary events or time estimate |
| UC-05 | Guest | Capture playback and download it | Secondary | `MediaRecorder` + tab audio; hidden if unsupported |
| UC-06 | Guest | Dictate speech into editable text | Primary | Live interim + final transcript |
| UC-07 | Guest | Upload an audio file for transcription | Primary | ≤ 25 MB, 5 formats |
| UC-08 | Guest | Export a transcript (txt/docx/srt) | Primary | Timestamps only when segments exist |
| UC-09 | Guest | Run text → audio → text and see a WER score | Primary | Show-case for project defence |
| UC-10 | User | Register / log in / log out | Primary | JWT httpOnly cookie |
| UC-11 | User | Review conversion history | Extension | Filter by type, re-open, re-download |
| UC-12 | User | Delete a stored conversion | Extension | Scoped to the owner by SQL predicate |
| UC-13 | User | View usage statistics | Extension | Totals, minutes, most-used language |
| UC-14 | Admin | View platform statistics and recent activity | Admin | `/admin` + `GET /api/admin/stats` |
| UC-15 | System | Reject oversized/invalid/rate-limited input | Automatic | Typed JSON errors |
| UC-16 | System | Fall back to the browser voice on provider failure | Automatic | Keeps the tool usable offline |
| UC-17 | System | Steer unsupported browsers to file transcription | Automatic | Feature-detection banner |

---

## 7. Speech technologies

### 7.1 Synthesis (text → speech)

Two complementary engines are implemented behind one interface:

| | Browser `SpeechSynthesis` | Server provider chain |
| --- | --- | --- |
| Cost | Free | Free web endpoint by default; `edge-tts` bridge optional |
| Privacy | Audio never leaves the device | Text is sent to the provider |
| Voices | Every voice installed on the OS/device (English US/UK/NG where available) | Language/accent tags (e.g. `en-NG`) |
| Output | In-memory playback | Streamable `audio/mpeg` download |
| Controls | rate, pitch, volume, boundary events | rate (affects duration estimate), language |
| Failure mode | n/a | Automatic fallback to the browser engine |

The browser path uses `SpeechSynthesisUtterance` events (`onstart`, `onboundary`, `onpause`,
`onend`, `onerror`). `onboundary` supplies the character index of the word being spoken, which
drives the highlight; when a browser omits boundary events (or during server playback) the UI
falls back to a time-proportional estimate derived from the word count and chosen rate. A small
keep-alive interval works around Chromium’s tendency to pause long utterances after ~15 s.

### 7.2 Recognition (speech → text, live)

Live dictation uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) in
**continuous** mode with **interim results** enabled:

- `onresult` yields partial hypotheses (rendered in an `aria-live` region) and final hypotheses
  (appended to the transcript, with `confidence` when provided).
- Chrome stops the recogniser after long silences, so the wrapper restarts it automatically while
  the user has not pressed stop.
- Error codes are mapped to actionable copy: `not-allowed`/`service-not-allowed` produces a
  numbered permission checklist, `audio-capture` reports a missing device, `network` points to the
  file-transcription path.
- Feature detection hides or disables the control where the API is absent (Firefox, Safari) and a
  banner steers users to `/stt?tab=file`.

### 7.3 Recognition (speech → text, files) — Whisper

Uploaded audio is transcribed server-side with **`whisper-large-v3`** served by the Groq API:

- `response_format=verbose_json` returns the transcript, segment timestamps, the detected ISO-639-1
  language and total duration.
- The request is a standard `multipart/form-data` POST with `Authorization: Bearer <GROQ_API_KEY>`;
  the key never reaches the browser.
- Segments drive the `.srt` exporter (`HH:MM:SS,mmm --> HH:MM:SS,mmm`) and the confidence chip
  (`segment.confidence` when present, otherwise `exp(avg_logprob)` averaged over segments).
- Whisper’s robustness to noise, accents and code-switching makes it the right choice for the
  file path, while the browser recogniser covers low-latency dictation.

### 7.4 Why both directions matter

Round-trip evaluation closes the loop: the same text is rendered to audio by the TTS engine and
read back by the ASR engine. Any mismatch — mispronunciation, acoustic colouring, homophone
confusion — shows up as substitutions, deletions or insertions in the WER score, giving an
objective, reproducible accuracy metric for the system as a whole.

---

## 8. Security design

| Threat | Counter-measure |
| --- | --- |
| Credential theft | bcrypt cost 12; hashes never leave the database |
| Session hijacking via XSS | JWT in `httpOnly` + `secure` + `SameSite=Lax` cookie — unreadable from JS |
| CSRF | SameSite=Lax cookie + JSON-only state-changing routes (no form posts) |
| SQL injection | Drizzle parameterised queries everywhere; no string concatenation |
| Malicious uploads | Extension allow-list, 25 MB cap, magic-byte sniffing, sanitised filenames |
| Brute force | Per-IP fixed-window rate limits on auth, TTS and STT routes |
| Privilege escalation | Role read from the *database* (not the token) for authorisation; middleware only pre-filters |
| Secret leakage | `GROQ_API_KEY`, `JWT_SECRET`, `TTS_API_URL` are server-only; no `NEXT_PUBLIC_` secrets |
| Clickjacking / MIME sniffing | `X-Frame-Options`, `X-Content-Type-Options: nosniff`, strict permissions policy |
| Oversized payloads | Body/file limits validated before provider calls; clear 413 responses |

---

## 9. Non-functional requirements

| Category | Requirement | How it is met |
| --- | --- | --- |
| Performance | Lighthouse ≥ 90 on the landing page | Static prerender, 103 kB shared JS, no blocking fonts, lazy client islands |
| Performance | Stream audio | Chunked provider streaming with `Content-Length` omitted (transfer encoding) |
| Reliability | Provider fallback | Chain + browser-voice fallback; typed JSON errors |
| Reliability | Database outage | Lazy client, `DATABASE_ERROR` 503 with a human message, dashboard banner, JWT fallback for `/api/auth/me` |
| Availability | Guests can always work | Every tool functions without an account; history is a bonus |
| Usability | Feedback everywhere | Spinners, skeletons, progress bars, toasts, empty states |
| Accessibility | Keyboard + AT support | ARIA labels, `role="tablist"`/`radiogroup`, live regions, focus-visible rings, skip link |
| Portability | Chromium, graceful elsewhere | Feature detection for SpeechRecognition and MediaRecorder |
| Maintainability | Strict TS, no `any` | `tsc --noEmit`, ESLint, small single-purpose modules |
| Testability | Pure logic isolated | WER and validators are dependency-free and unit-tested |

---

## 10. Sequence summary — authentication

```mermaid
sequenceDiagram
  actor U as User
  participant UI as Login form
  participant API as /api/auth/login
  participant DB as Neon Postgres
  participant C as httpOnly cookie

  U->>UI: email + password
  UI->>UI: Zod validation (instant feedback)
  UI->>API: POST { email, password }
  API->>API: rate limit (15/min/IP)
  API->>DB: SELECT user by email
  DB-->>API: password_hash
  API->>API: bcrypt.compare()
  alt credentials valid
    API->>API: sign JWT { sub, name, email, role } HS256, 7 d
    API->>C: Set-Cookie voicebridge_session (httpOnly, secure, SameSite=Lax)
    API-->>UI: 200 { user }
    UI->>UI: redirect to ?next or /dashboard
  else invalid
    API-->>UI: 401 UNAUTHORIZED "Invalid email or password"
  end
```

---

## 11. Deployment topology

```mermaid
flowchart LR
  U[User] --> V[Vercel Edge Network]
  V --> MW["middleware.ts (edge)<br/>JWT pre-filter"]
  V --> N["Next.js serverless functions<br/>pages + API routes"]
  N --> NE[("Neon Postgres<br/>HTTP driver")]
  N --> G["Groq API<br/>whisper-large-v3"]
  N --> W["Free web TTS endpoint<br/>or edge-tts bridge"]
  N -.optional.-> B[("Object storage<br/>future: audio_url")]
```

Everything deploys as a single Vercel project; no workers, queues or additional services are
required for the current scope.
