"use client";

import Link from "next/link";
import { AlertIcon } from "@/components/ui/icons";
import { isSpeechRecognitionSupported } from "@/lib/speech/providers/browser-stt";
import { useIsHydrated } from "@/components/ui/toast";

interface BrowserSupportBannerProps {
  compact?: boolean;
}

export function BrowserSupportBanner({ compact = false }: BrowserSupportBannerProps) {
  const hydrated = useIsHydrated();
  if (!hydrated || isSpeechRecognitionSupported()) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <span className="mt-0.5 shrink-0 text-warning" aria-hidden="true">
        <AlertIcon width={18} height={18} />
      </span>
      <div>
        <p className="font-semibold text-fg">Live dictation is unavailable in this browser</p>
        <p className="mt-0.5 text-muted">
          {compact ? null : "Your browser does not expose the Web Speech Recognition API. "}
          Chrome and Edge support live dictation — or you can transcribe an uploaded audio file
          instead.
        </p>
        <Link href="/stt?tab=file" className="mt-1 inline-block font-medium text-primary underline">
          Switch to file transcription →
        </Link>
      </div>
    </div>
  );
}
