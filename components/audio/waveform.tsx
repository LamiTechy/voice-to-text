"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  stream: MediaStream | null;
  active: boolean;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

export function Waveform({
  stream,
  active,
  height = 76,
  className = "",
  ariaLabel = "Live microphone level meter",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;

    if (active && stream && stream.active && stream.getAudioTracks().length > 0) {
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
          window.AudioContext;
        audioContext = new Ctor();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        data = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        analyser = null;
      }
    }

    const primary =
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
      "#4f46e5";
    const muted =
      getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() ||
      "#64748b";

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const bars = 56;
      const gap = 3;
      const barWidth = Math.max(2, (rect.width - gap * (bars - 1)) / bars);

      context.clearRect(0, 0, rect.width, rect.height);

      if (analyser && data) {
        analyser.getByteFrequencyData(data);
      }

      for (let index = 0; index < bars; index += 1) {
        let level = 0.05;
        if (analyser && data) {
          const sample = data[Math.floor((index / bars) * data.length)] ?? 0;
          level = Math.max(0.04, sample / 255);
        }
        const barHeight = Math.max(4, level * rect.height * 0.95);
        const x = index * (barWidth + gap);
        const y = (rect.height - barHeight) / 2;

        context.fillStyle = level > 0.08 ? primary : muted;
        context.globalAlpha = level > 0.08 ? 0.95 : 0.45;
        context.beginPath();
        if (typeof context.roundRect === "function") {
          context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        } else {
          context.rect(x, y, barWidth, barHeight);
        }
        context.fill();
      }
      context.globalAlpha = 1;

      rafRef.current = window.requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      try {
        source?.disconnect();
        void audioContext?.close();
      } catch {
        // audio context may already be closed
      }
    };
  }, [stream, active, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={active ? `${ariaLabel} (recording)` : `${ariaLabel} (idle)`}
      style={{ height: `${height}px`, width: "100%" }}
      className={className}
    />
  );
}
