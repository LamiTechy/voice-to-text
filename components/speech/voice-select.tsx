"use client";

import { useMemo } from "react";
import type { BrowserVoice } from "@/lib/speech/providers/browser-tts";

interface VoiceSelectProps {
  voices: BrowserVoice[];
  value: string | null;
  onChange: (voiceURI: string) => void;
  id?: string;
  includeAuto?: boolean;
  autoLabel?: string;
}

function languageName(tag: string): string {
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" });
    return display.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export function VoiceSelect({
  voices,
  value,
  onChange,
  id = "voice-select",
  includeAuto = false,
  autoLabel = "Automatic (browser default)",
}: VoiceSelectProps) {
  const groups = useMemo(() => {
    const map = new Map<string, BrowserVoice[]>();
    for (const voice of voices) {
      const key = voice.lang || "other";
      const list = map.get(key) ?? [];
      list.push(voice);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [voices]);

  return (
    <>
      <select
        id={id}
        className="select"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
      >
        {includeAuto && <option value="">{autoLabel}</option>}
        {groups.length === 0 && !includeAuto && <option value="">No voices available</option>}
        {groups.map(([lang, list]) => (
          <optgroup key={lang} label={`${languageName(lang)} (${lang})`}>
            {[...list]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((voice) => (
                <option key={voice.uri} value={voice.uri}>
                  {voice.name}
                  {voice.default ? " — default" : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <span id={`${id}-hint`} className="sr-only">
        Choose a synthesis voice. Voices are grouped by language and accent.
      </span>
    </>
  );
}
