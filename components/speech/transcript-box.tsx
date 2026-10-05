"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, CopyIcon, DownloadIcon, TrashIcon } from "@/components/ui/icons";
import { copyToClipboard, downloadDocx, downloadSrt, downloadTranscriptTxt } from "@/lib/utils/download";
import { wordCount } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import type { STTSegment } from "@/lib/speech/types";

interface TranscriptBoxProps {
  value: string;
  onChange?: (value: string) => void;
  segments?: STTSegment[];
  confidence?: number | null;
  label?: string;
  filename?: string;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
  id?: string;
  onClear?: () => void;
}

export function TranscriptBox({
  value,
  onChange,
  segments,
  confidence,
  label = "Transcript",
  filename = "transcript",
  placeholder = "Your transcript will appear here…",
  readOnly = false,
  rows = 9,
  id = "transcript-box",
  onClear,
}: TranscriptBoxProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSegments = (segments?.length ?? 0) > 0;

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      toast.success("Transcript copied to clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Copy failed — select the text and copy manually.");
    }
  };

  const handleDocx = async () => {
    setMenuOpen(false);
    try {
      await downloadDocx(value, filename, label);
      toast.success("Downloaded Word document.");
    } catch {
      toast.error("Could not generate the .docx file.");
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-sm font-semibold">
            {label}
          </label>
          <span className="chip">{wordCount(value)} words</span>
          {typeof confidence === "number" && (
            <span
              className={cn(
                "chip",
                confidence >= 0.8 ? "text-success" : confidence >= 0.5 ? "text-warning" : "text-danger",
              )}
              title="Average confidence reported by the recognition engine (0–1)"
            >
              confidence {(confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value}
            className="btn btn-secondary !min-h-9 !px-3 !py-1.5 text-xs"
            aria-label="Copy transcript to clipboard"
          >
            {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
            {copied ? "Copied" : "Copy"}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={!value}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="btn btn-secondary !min-h-9 !px-3 !py-1.5 text-xs"
              aria-label="Download transcript"
            >
              <DownloadIcon width={16} height={16} />
              Download
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    downloadTranscriptTxt(value, filename);
                    toast.success("Downloaded .txt file.");
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"
                >
                  Plain text (.txt)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDocx}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"
                >
                  Word document (.docx)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!hasSegments}
                  title={hasSegments ? undefined : "Timestamps are not available for this result"}
                  onClick={() => {
                    if (!segments) return;
                    setMenuOpen(false);
                    downloadSrt(segments, filename);
                    toast.success("Downloaded .srt subtitles.");
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Subtitles (.srt)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange?.("");
              onClear?.();
            }}
            disabled={!value}
            className="btn btn-ghost !min-h-9 !px-3 !py-1.5 text-xs"
            aria-label="Clear transcript"
          >
            <TrashIcon width={16} height={16} />
            Clear
          </button>
        </div>
      </div>

      <textarea
        id={id}
        className="textarea"
        rows={rows}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
        aria-label={label}
      />
    </div>
  );
}
