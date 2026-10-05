"use client";

import { useCallback, useRef, useState } from "react";
import { UploadIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/formatters";

interface FileDropProps {
  onFile: (file: File) => void;
  onError?: (message: string) => void;
  accept?: string;
  allowedExtensions?: readonly string[];
  maxBytes?: number;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  idleLabel?: string;
}

export function FileDrop({
  onFile,
  onError,
  accept,
  allowedExtensions,
  maxBytes,
  disabled = false,
  busy = false,
  hint,
  idleLabel = "Drag & drop an audio file here, or click to browse",
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const validateAndEmit = useCallback(
    (file: File | undefined | null) => {
      if (!file || disabled || busy) return;

      const extension = file.name.includes(".")
        ? file.name.split(".").pop()?.toLowerCase() ?? ""
        : "";

      if (allowedExtensions && allowedExtensions.length > 0) {
        if (!allowedExtensions.includes(extension)) {
          onError?.(
            `Unsupported file type "${extension || "unknown"}". Allowed: ${allowedExtensions.join(", ")}.`,
          );
          return;
        }
      }
      if (maxBytes && file.size > maxBytes) {
        onError?.(`File is too large (${formatBytes(file.size)}). Maximum size is ${formatBytes(maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        onError?.("That file is empty. Choose a valid audio file.");
        return;
      }
      onFile(file);
    },
    [allowedExtensions, busy, disabled, maxBytes, onError, onFile],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || busy}
        aria-label={idleLabel}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !busy) inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          if (!disabled && !busy) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setDragging(false);
          validateAndEmit(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/10"
            : "border-line bg-subtle hover:border-primary/60",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-primary shadow-sm">
          <UploadIcon width={22} height={22} />
        </span>
        <span className="text-sm font-medium">{idleLabel}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          disabled={disabled || busy}
          onChange={(event) => {
            validateAndEmit(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
