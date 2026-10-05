import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-subtle">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-on-primary">
              VB
            </span>
            VoiceBridge
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Design and implementation of a text-to-speech / audio system and vice-versa —
            natural speech synthesis, transcription and round-trip accuracy analysis in one app.
          </p>
        </div>

        <nav aria-label="Footer tools" className="text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Tools
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href="/tts" className="text-muted hover:text-fg">
                Text to Speech
              </Link>
            </li>
            <li>
              <Link href="/stt" className="text-muted hover:text-fg">
                Speech to Text
              </Link>
            </li>
            <li>
              <Link href="/roundtrip" className="text-muted hover:text-fg">
                Round-Trip Demo
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="text-muted hover:text-fg">
                History Dashboard
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Footer information" className="text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            Project
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href="/about" className="text-muted hover:text-fg">
                About &amp; architecture
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-muted hover:text-fg">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/register" className="text-muted hover:text-fg">
                Create account
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line px-4 py-4 text-center text-xs text-muted sm:px-6">
        © {new Date().getFullYear()} VoiceBridge. Built with Next.js, Drizzle ORM and Neon
        Postgres.
      </div>
    </footer>
  );
}
