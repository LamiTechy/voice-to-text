"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { DownloadIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatDuration } from "@/lib/utils/formatters";

interface AudioPlayerProps {
  src: string | null;
  audioRef?: RefObject<HTMLAudioElement | null>;
  autoPlay?: boolean;
  downloadUrl?: string | null;
  downloadFilename?: string;
  label?: string;
  onEnded?: () => void;
  onPlayStateChange?: (playing: boolean) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  children?: React.ReactNode;
}

export function AudioPlayer({
  src,
  audioRef,
  autoPlay = false,
  downloadUrl,
  downloadFilename = "voicebridge-speech.mp3",
  label = "Generated speech",
  onEnded,
  onPlayStateChange,
  onProgress,
  children,
}: AudioPlayerProps) {
  const internalRef = useRef<HTMLAudioElement | null>(null);
  const ref = audioRef ?? internalRef;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  const emitState = (next: boolean) => {
    setPlaying(next);
    onPlayStateChange?.(next);
  };

  const toggle = () => {
    const element = ref.current;
    if (!element || !src) return;
    if (element.paused) {
      void element.play().catch(() => emitState(false));
    } else {
      element.pause();
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-xl border border-line bg-subtle p-3">
      <audio
        ref={ref}
        src={src ?? undefined}
        preload="metadata"
        autoPlay={autoPlay}
        onPlay={() => emitState(true)}
        onPause={() => emitState(false)}
        onEnded={() => {
          emitState(false);
          onEnded?.();
        }}
        onTimeUpdate={(event) => {
          const element = event.currentTarget;
          setCurrentTime(element.currentTime);
          if (Number.isFinite(element.duration) && element.duration > 0) {
            setDuration(element.duration);
          }
          onProgress?.(element.currentTime, element.duration);
        }}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
      >
        Your browser does not support the audio element.
      </audio>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!src}
          className="btn btn-primary btn-icon"
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
          aria-pressed={playing}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="min-w-0 flex-1">
          <label htmlFor={`${label.replace(/\W+/g, "-").toLowerCase()}-seek`} className="sr-only">
            Seek within {label}
          </label>
          <input
            id={`${label.replace(/\W+/g, "-").toLowerCase()}-seek`}
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.1}
            value={currentTime}
            disabled={!src || duration === 0}
            onChange={(event) => {
              const element = ref.current;
              if (!element) return;
              const next = Number(event.target.value);
              element.currentTime = next;
              setCurrentTime(next);
            }}
            className="w-full accent-[var(--primary)]"
            aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
          />
          <div className="mt-0.5 flex justify-between text-xs text-muted">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <label htmlFor={`${label.replace(/\W+/g, "-").toLowerCase()}-volume`} className="sr-only">
            Volume
          </label>
          <input
            id={`${label.replace(/\W+/g, "-").toLowerCase()}-volume`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              if (ref.current) ref.current.volume = next;
            }}
            className="w-20 accent-[var(--primary)]"
            aria-label={`${label} volume`}
          />
        </div>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={downloadFilename}
            className="btn btn-secondary !min-h-9 !px-3 !py-1.5 text-xs"
            aria-label={`Download ${label}`}
          >
            <DownloadIcon width={16} height={16} />
            <span className="hidden sm:inline">Download</span>
          </a>
        )}
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-card"
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {children}
    </div>
  );
}
