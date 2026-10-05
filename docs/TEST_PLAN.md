# VoiceBridge — Test Plan

Manual and automated verification for the VoiceBridge system. Run the automated suite first
(`npm test`), then walk the manual cases below on **desktop Chrome**, **desktop Edge** and
**mobile Chrome**. Cases marked *Automated* are covered by Vitest.

**Entry criteria:** `npm run typecheck && npm run lint && npm test && npm run build` all pass.

| # | Area | Test case | Steps | Expected result | Type |
| --- | --- | --- | --- | --- | --- |
| T-01 | TTS | Play speaks the typed text | Open `/tts`, type “Hello VoiceBridge”, press **Play** | Audio is heard; status shows “Speaking…”; progress bar advances; the current word is highlighted | Functional |
| T-02 | TTS | Speed control changes rate | Set **Speed** to 0.5×, play; repeat at 2× | 0.5× speaks noticeably slower, 2× faster; slider label updates (e.g. `1.25×`); no error | Functional |
| T-03 | TTS | Pitch and volume sliders apply | Move **Pitch** to 0.2 and 1.8, **Volume** to 30 %, press Play | Voice becomes lower/higher; output is quieter; labels show the current values | Functional |
| T-04 | TTS | Voice selector lists grouped voices | Open the **Voice** dropdown | Voices are grouped by language/accent (e.g. English (United Kingdom), English (United States), English (Nigeria) where the OS provides them); selecting one changes the voice on the next Play | Functional |
| T-05 | TTS | Pause / Resume / Stop | Start playback → **Pause** → wait 2 s → **Resume** → **Stop** | Pause freezes the highlight and progress; Resume continues from that point; Stop returns to idle with progress reset and status “Stopped” | Functional |
| T-06 | TTS | Character limit enforced | Paste 6 000 characters | Textarea stops at 5 000 characters; counter shows `5000/5000` and turns amber near the limit | Edge |
| T-07 | TTS | Blank text cannot be played | Leave the editor empty | **Play**, **Stop** and **Generate & download MP3** are disabled; no request is sent | Edge |
| T-08 | TTS | Upload a `.txt` file fills the editor | Click the upload area, choose a UTF-8 `.txt` | Text appears in the editor, toast confirms the file name; a `.md`/`.pdf` file is rejected with an allowed-types message | Functional / Edge |
| T-09 | TTS | Example text button | Click **Try an example** | The sample sentence is inserted and a success toast appears | Functional |
| T-10 | TTS | Server MP3 download | Switch engine to **Server MP3**, click **Generate & download MP3** | An `.mp3` file downloads; response headers include `Content-Type: audio/mpeg`, `X-TTS-Provider` and a `Content-Disposition` filename; the in-page player can play it | Functional |
| T-11 | TTS | Fallback when the server engine fails | Block the free TTS endpoint (or set `TTS_PROVIDER=off`) and press **Play** with *Server MP3* selected | An error toast explains the failure, the UI switches to **Browser voice** and playback still works | Edge / Reliability |
| T-12 | TTS | Record & download availability | With a browser lacking `getDisplayMedia`, open `/tts` | The **Record & download** button is disabled with an explanatory note; in Chrome it records tab audio and downloads a `.webm` | Browser compat |
| T-13 | TTS | Live word highlight matches speech | Play a 3-sentence paragraph | The current word is marked while speaking and the active sentence gets a tinted background; highlight resets after Stop | Functional |
| T-14 | STT live | Live dictation streams text | Open `/stt`, press the microphone, allow access, speak | The level meter animates, interim words appear in italics, final words are appended to the transcript, status shows “Listening…” | Functional |
| T-15 | STT live | Stop ends recording and meters | Press the stop button | Waveform flattens, status shows “Stopped”, tracks are released (microphone indicator in the browser chrome turns off) | Functional |
| T-16 | STT live | Microphone permission denied | Block the microphone via the padlock icon, press the mic | A numbered permission checklist appears with a **Reload page** button; no unhandled exception in the console | Edge / Security |
| T-17 | STT live | Unsupported browser banner | Open `/stt` in Firefox (no `SpeechRecognition`) | A banner explains that live dictation is unavailable and links to `/stt?tab=file`; the mic button is disabled | Browser compat |
| T-18 | STT file | Upload a valid MP3 | Drag an `.mp3` onto the drop zone | Progress bar advances, a toast reports success, transcript text appears, the file card shows name, size, duration, language and a success chip; the audio preview plays | Functional |
| T-19 | STT file | Reject unsupported extension | Upload `notes.txt` | Error: “Unsupported file type txt. Allowed types: mp3, wav, m4a, webm, ogg.” (HTTP 415); no network request to the provider | Edge / Security |
| T-20 | STT file | Reject non-audio content with an audio extension | Rename a PNG to `photo.mp3` and upload it; repeat with an arbitrary text/binary payload named `payload.mp3` | Error: “That file is a PNG image, not an audio recording…” (HTTP 415); the payload file errors with “The file contents do not look like a supported audio file…” (HTTP 415) — both rejected locally, never sent to the provider | Edge / Security |
| T-21 | STT file | Reject oversized file | Upload a 30 MB audio file | Error stating the 25 MB maximum and the received size (HTTP 413) | Edge |
| T-22 | STT file | Timestamps toggle and SRT export | After transcription, enable **Show timestamps**, then Download → *Subtitles (.srt)* | A segment list with start times appears; the `.srt` file contains numbered cues in `00:00:01,000 --> 00:00:03,500` format | Functional |
| T-23 | STT box | Copy / download / clear | Type or transcribe text → **Copy** → Download `.txt` → Download `.docx` → **Clear** | Clipboard receives the text (toast confirms); `.txt` and valid `.docx` files download; the box empties and buttons disable | Functional |
| T-24 | STT box | Confidence indicator | Transcribe a clean recording | A confidence chip appears (e.g. `confidence 83 %`), coloured green ≥ 80 %, amber ≥ 50 %, red below | Functional |
| T-25 | Round-trip | Full round-trip produces a WER score | Open `/roundtrip`, click **Run round-trip** | Step badges turn green in order (TTS → STT → analysis), the generated audio plays, the transcript appears, and a WER % with S/D/I counts and a coloured diff is shown | Functional |
| T-26 | Round-trip | Identical round-trip scores 0 % | Use a short sentence with no rare words, run the demo | WER shows `0.0 %`, all diff tokens are plain, “correct words” equals “reference words” | Edge |
| T-27 | Round-trip | Transcription failure is handled | Unset `GROQ_API_KEY`, run the demo | Step 2 turns red, an error explains the provider problem, and a link offers the browser-voice path; no page crash | Edge / Reliability |
| T-28 | Auth | Register creates an account | `/register` with a valid name, email and password | Account is created, an httpOnly session cookie is set, toast greets the user, redirect to the dashboard | Functional |
| T-29 | Auth | Weak password and bad email rejected | Submit `password = "abc"` and `email = "nope"` | Inline field errors appear under each input; no request is sent; no toast success | Edge / Security |
| T-30 | Auth | Duplicate email rejected | Register twice with the same email | Second attempt shows “An account with this email already exists.” (HTTP 409) | Edge |
| T-31 | Auth | Login / logout round-trip | Log out, log in with the same credentials, log out again | Each state change is reflected in the navbar (name menu ↔ Log in); `/dashboard` redirects to `/login` while logged out | Functional |
| T-32 | Auth | Wrong password rejected | Log in with an incorrect password | Generic “Invalid email or password.” (HTTP 401) — does not reveal whether the email exists | Security |
| T-33 | Auth | Forged cookie rejected | Set `voicebridge_session=not.a.jwt` and visit `/dashboard` | Redirect to `/login?next=%2Fdashboard`; `/api/auth/me` returns `{ "user": null }` | Security |
| T-34 | History | Conversions are saved per user | Sign in, run one TTS and one STT conversion, open `/dashboard` | Both rows appear with type badge, language, duration and timestamp; statistics cards update | Functional |
| T-35 | History | Guest history is not stored | While signed out, run conversions, then sign in with a different account | The new account’s dashboard shows no rows from the guest session | Functional |
| T-36 | History | Delete removes only your row | Click the delete icon on a row and confirm | Row disappears after refresh; deleting another user’s id via the API returns 404 | Functional / Security |
| T-37 | History | Re-open and re-download | Click **Re-open** on a TTS row, then **Audio** | `/tts` loads with the original text; **Audio** regenerates and downloads an MP3; STT rows download a `.txt` transcript | Functional |
| T-38 | Admin | Non-admin cannot access `/admin` | Visit `/admin` while signed in as a normal user | Middleware redirects to `/dashboard?denied=admin` and the dashboard explains the admin role is required | Security |
| T-39 | Admin | Admin console shows statistics | Sign in as the seeded admin, visit `/admin` | Cards show total users, total conversions (TTS/STT split), audio processed and most-used language; the recent-activity table lists the latest 15 rows | Functional |
| T-40 | Admin | Stats API enforces the role | `GET /api/admin/stats` as guest / user / admin | Guest → 401, user → 403, admin → 200 with a JSON payload | Security |
| T-41 | Rate limit | Auth and synthesis endpoints are limited | Send 11 register requests within a minute | The 11th returns HTTP 429 with `retryAfterSeconds` and a readable message | Security / Edge |
| T-42 | UI | Dark/light toggle persists | Click the theme toggle, reload, open a new tab | Theme stays applied on reload and on other pages; no flash of the wrong theme on first paint | Functional |
| T-43 | UI | Keyboard accessibility | Tab through `/tts` and `/stt` using only the keyboard | Every control is reachable, has a visible focus ring, and can be activated with Enter/Space; skip-to-content link appears on first Tab | Accessibility |
| T-44 | UI | Screen-reader live regions | With a screen reader, dictate on `/stt` and speak on `/tts` | Transcript updates are announced via `aria-live`; progress and status changes use `role="status"`; audio controls expose ARIA labels | Accessibility |
| T-45 | UI | Mobile layout (375 px viewport) | Open every page at 375 × 667 | No horizontal scrolling, tap targets ≥ 44 px, hamburger menu opens/closes, tables switch to card layouts | Browser compat |
| T-46 | Build | Production build is clean | `npm run typecheck && npm run lint && npm test && npm run build` | Zero TypeScript errors, zero ESLint errors, all tests pass, build completes with static/dynamic routes listed | Functional |
| T-47 | Config | Database down is survivable | Stop/withdraw the database and load pages | API routes return `DATABASE_ERROR` 503 with a clear message; the dashboard shows a “History is unavailable” banner; landing, TTS and STT still work | Reliability |
| T-48 | Config | Missing audio API key is survivable | Unset `GROQ_API_KEY` and upload a file | Clear provider message (no stack trace), UI keeps the transcript box usable | Reliability |

### Automated coverage (Vitest)

| Suite | File | Coverage |
| --- | --- | --- |
| WER engine | `tests/wer.test.ts` | Normalisation, tokenising, identical/blank texts, substitutions, deletions, insertions, counts consistency, alignment order, >100 % WER |
| Validators | `tests/validators.test.ts` | Registration (name/email/password rules), login, TTS limits and defaults, history schema, delete-id schema, issue reporting |
| Upload validation | `tests/audio.test.ts` | Extension allow-list, 25 MB cap, empty files, magic-byte sniffing (PNG/PDF rejection), container detection (MP3/WAV/OGG/M4A/WebM), extension/content mismatch, unknown content |

```bash
npm test          # 65 assertions (3 suites)
npm run lint      # 0 errors
npm run typecheck # 0 errors
```

### Sign-off checklist

- [ ] T-01 … T-13 pass on desktop Chrome **and** Edge
- [ ] T-14 … T-24 pass on desktop Chrome; T-17 verified on Firefox
- [ ] T-25 … T-27 pass (round-trip showcase)
- [ ] T-28 … T-41 pass with a configured database
- [ ] T-42 … T-45 pass on mobile Chrome
- [ ] T-46 … T-48 pass on the production build
