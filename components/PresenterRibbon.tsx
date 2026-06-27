"use client";

import { Countdown } from "@/components/Countdown";
import { TimerDrainBar } from "@/components/TimerDrainBar";
import { phaseNav, type SequenceItem } from "@/lib/sequence";

// E2 — the bottom-of-wall presenter ribbon: a slim progress bar of the whole
// sequence with the active phase named (NOW), the next one previewed (NEXT), the
// position (N / total) and the live clock. Pure derivation from PublicState —
// no server work. Replaces the old top status bar on the projector.

export function PresenterRibbon({
  sequence,
  phaseId,
  fallbackLabel,
  timerEndsAt,
  timerRemainingMs,
  lowLevel = null,
  warnSeconds = 120,
  onElapsed,
}: {
  sequence: SequenceItem[];
  phaseId: string | null;
  fallbackLabel: string; // when there's no sequence (a single-mode / lobby run)
  timerEndsAt: number | null;
  timerRemainingMs: number | null;
  // C6 — the room-felt low-time level (smallest breached threshold, or null) for a
  // calm amber tint on the projector clock, + a chime when the clock hits zero
  // (the projector was silent before).
  lowLevel?: number | null;
  // C6 full — the builder-authored amber threshold (seconds remaining), driving the
  // drain bar's window.
  warnSeconds?: number;
  onElapsed?: () => void;
}) {
  const nav = phaseNav(sequence, phaseId);
  const hasTimer = timerEndsAt != null || timerRemainingMs != null;
  const paused = timerEndsAt == null && timerRemainingMs != null;
  const lowTime = lowLevel != null;
  const nowLabel = nav.current?.label ?? fallbackLabel;

  // Above ~10 phases the dot-segments get too dense — collapse to a single bar.
  const dense = nav.total > 10;

  return (
    <div className="border-t border-border bg-bg/70 backdrop-blur">
      {/* C6 — the drain bar rides the top edge of the ribbon, full-bleed, so the
          whole room feels the window closing without reading the clock. */}
      <TimerDrainBar endsAt={timerEndsAt} warnSeconds={warnSeconds} />
      <div className="flex items-center gap-5 px-8 py-3">
      {/* progress */}
      {nav.total > 0 &&
        (dense ? (
          <div className="h-1.5 w-40 shrink-0 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{
                width: `${(((nav.index < 0 ? 0 : nav.index + 1) / nav.total) * 100).toFixed(1)}%`,
              }}
            />
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {nav.phases.map((p) => (
              <span
                key={p.id}
                title={p.label}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  p.status === "current"
                    ? "w-7 bg-accent"
                    : p.status === "done"
                      ? "w-3 bg-accent/40"
                      : "w-3 bg-surface"
                }`}
              />
            ))}
          </div>
        ))}

      {/* now / next */}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-wide text-accent">Now</span>
        {/* E2 — re-key on the phase so the label "breathes" once when it changes
            (the a11y-reduce-motion class neutralises it for reduce-motion users). */}
        <span key={phaseId ?? "none"} className="truncate text-lg font-semibold text-white/90 animate-nowBreathe">
          {nowLabel}
        </span>
        {nav.next && (
          <span className="hidden min-w-0 items-baseline gap-2 text-muted sm:flex">
            <span className="text-[11px] uppercase tracking-wide">Next</span>
            <span className="truncate text-sm">{nav.next.label}</span>
          </span>
        )}
      </div>

      {/* position + clock */}
      <div className="flex shrink-0 items-center gap-4">
        {nav.total > 0 && nav.index >= 0 && (
          <span className="font-mono text-sm text-muted">
            {nav.index + 1} / {nav.total}
          </span>
        )}
        {hasTimer && (
          <span className={`flex items-center gap-2 font-mono ${lowTime ? "text-[#ffb454]" : "text-accent"}`}>
            {paused && (
              <span className="text-[10px] uppercase tracking-wide text-muted">paused</span>
            )}
            <Countdown
              endsAt={timerEndsAt}
              remainingMs={timerRemainingMs}
              onElapsed={onElapsed}
            />
          </span>
        )}
      </div>
      </div>
    </div>
  );
}
