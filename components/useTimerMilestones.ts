"use client";

import { useEffect, useRef, useState } from "react";

// C6 — the "room-felt" timer milestones. The synced countdown already ships
// (Countdown + setTimer/pause/resume); this is the felt layer on top: a gentle
// cue when time crosses a threshold ("2 minutes left", "30 seconds"), derived
// entirely CLIENT-side from the already-transported timerEndsAt — no server
// change, no state, no rev churn.

// Seconds-remaining thresholds. A module-level const (stable reference) so the
// effect deps don't churn — callers should not pass a fresh inline array.
export const DEFAULT_MILESTONES = [120, 30];

// C6 full — build the milestone set from a builder-authored amber threshold
// (`timerWarnSeconds`). The authored value is the moment the projector goes amber;
// a 30s final cue is always folded in (deduped, descending). Falls back to the
// defaults when unset/zero. Pure → callers should `useMemo` it for a stable ref.
export function warnThresholds(warnSeconds?: number | null): number[] {
  if (!warnSeconds || warnSeconds <= 0) return DEFAULT_MILESTONES;
  const set = new Set<number>([warnSeconds, 30].filter((n) => n > 0));
  return Array.from(set).sort((a, b) => b - a);
}

// C6 full — the projector "drain bar": once the clock enters the authored warning
// window, deplete a slim bar from full→empty over that window, amber through it and
// red in the final 30s. Pure (ms in, geometry out) so it's unit-tested; returns
// null outside the window or with no live timer.
export function drainState(
  ms: number | null,
  warnSeconds: number,
): { pct: number; urgent: boolean } | null {
  if (ms == null || warnSeconds <= 0) return null;
  const windowMs = warnSeconds * 1000;
  if (ms > windowMs) return null;
  return {
    pct: Math.max(0, Math.min(100, (ms / windowMs) * 100)),
    urgent: ms <= 30_000,
  };
}

// Pure: which thresholds were crossed going from prevMs → nowMs (a real
// above→below crossing only). Exported for tests.
export function crossedThresholds(
  prevMs: number,
  nowMs: number,
  thresholds: number[],
): number[] {
  return thresholds.filter((t) => {
    const tm = t * 1000;
    return prevMs > tm && nowMs <= tm;
  });
}

// Fires onCross(threshold) once per crossing while the timer is RUNNING. Returns
// the current "low-time level" — the smallest breached threshold (or null) — for
// a calm visual treatment. Suppressed while paused (remainingMs set, endsAt null)
// and never fires on a fresh mount already below a threshold (reload-safe).
export function useTimerMilestones(
  endsAt: number | null,
  remainingMs: number | null | undefined,
  onCross: (threshold: number) => void,
  thresholds: number[] = DEFAULT_MILESTONES,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  const prevMs = useRef<number | null>(null);
  const fired = useRef<{ key: number | null; set: Set<number> }>({ key: null, set: new Set() });

  // Tick only while RUNNING (a live deadline). Paused/idle → no ticking.
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  // Re-arm when the deadline changes (a +time / resume mints a new endsAt), so a
  // re-crossing from above fires again — but a still-below extend stays silent.
  if (fired.current.key !== endsAt) {
    fired.current = { key: endsAt, set: new Set() };
    prevMs.current = null;
  }

  const ms = endsAt != null ? Math.max(0, endsAt - now) : null;

  useEffect(() => {
    if (ms == null) {
      prevMs.current = null;
      return;
    }
    const prev = prevMs.current;
    prevMs.current = ms;
    if (prev == null) return; // first observation — establish a baseline, no fire
    for (const t of crossedThresholds(prev, ms, thresholds)) {
      if (!fired.current.set.has(t)) {
        fired.current.set.add(t);
        onCross(t);
      }
    }
  }, [ms, thresholds, onCross]);

  if (ms == null) return null;
  // The smallest threshold currently breached = the most urgent visual level.
  let level: number | null = null;
  for (const t of thresholds) if (ms <= t * 1000 && (level == null || t < level)) level = t;
  return level;
}
