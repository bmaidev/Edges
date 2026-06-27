"use client";

import { useCallback, useRef } from "react";

// Soft chime via WebAudio — no asset, no autoplay surprise. Shared by the
// participant status bar, the facilitate cockpit (chime-on-zero), and the phase
// dissolve. A nicety, never a requirement: any failure is swallowed.
//
// C6 — the optional variant softens the cue for a milestone: "warn" is a single
// gentle note (a "2 minutes left" nudge), "done" the original two-note arrival.
// The default is "done", so every existing bare `chime()` call is unchanged.
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  // E2 — debounce: at most one chime per ~1.5s, so a flurry of rapid advances (or
  // an advance landing on a milestone) doesn't stack overlapping tones.
  const lastRef = useRef(0);
  return useCallback((variant: "done" | "warn" = "done") => {
    try {
      const t = Date.now();
      if (t - lastRef.current < 1500) return;
      lastRef.current = t;
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!ctxRef.current) ctxRef.current = new Ctor();
      const ctx = ctxRef.current;
      (variant === "warn" ? [440] : [660, 880]).forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch {
      // chime is a nicety, never a requirement
    }
  }, []);
}
