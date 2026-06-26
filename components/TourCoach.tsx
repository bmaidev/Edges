"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { stepsForSurface, type TourSurface } from "@/lib/tour";

// The authoritative, rev-guarded slice the host console already holds. The coach
// reads THIS to detect progress (phase advanced, session ended) — it never
// fetches /state, so it's correct under eventual consistency by construction.
export interface RoomTourState {
  phaseId: string | null;
  ended: boolean;
  rev: number;
  patternsCount?: number;
}

// A slim, non-blocking, dismissible coach. Spotlights one real element at a time
// with a pointer-events:none ring + dim backdrop, so the live UI stays pokeable
// between steps. Persists per-surface so the narrative survives a tab change.
export function TourCoach({
  surface,
  roomState,
  onComplete,
}: {
  surface: TourSurface;
  roomState?: RoomTourState | null;
  onComplete?: () => void;
}) {
  const steps = stepsForSurface(surface);
  const stepKey = `edges_tour_step_${surface}`;
  const doneKey = `edges_tour_done_${surface}`;

  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [satisfied, setSatisfied] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // Baseline captured the moment a step is shown, so an `await` gate fires on a
  // CHANGE from that baseline (not on the ambient state already on screen).
  const baseline = useRef<{ phase: string | null; rev: number; ended: boolean }>({
    phase: null,
    rev: 0,
    ended: false,
  });

  // Hydration-safe: read persisted progress only after mount.
  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(doneKey) === "1") setDone(true);
      const saved = Number(localStorage.getItem(stepKey));
      if (Number.isFinite(saved) && saved > 0 && saved < steps.length) setIdx(saved);
    } catch {
      /* private mode / no storage — start fresh */
    }
  }, [doneKey, stepKey, steps.length]);

  const step = steps[idx];

  // Reset the await gate + recapture baseline whenever the active step changes.
  useEffect(() => {
    setSatisfied(false);
    baseline.current = {
      phase: roomState?.phaseId ?? null,
      rev: roomState?.rev ?? 0,
      ended: Boolean(roomState?.ended),
    };
    // Intentionally NOT depending on roomState — baseline is a one-shot snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, done]);

  // Fire the gate once the authoritative state changes from the baseline.
  useEffect(() => {
    if (satisfied || !step?.await || !roomState) return;
    const ok =
      step.await === "phaseChanged"
        ? roomState.phaseId !== baseline.current.phase &&
          roomState.rev > baseline.current.rev
        : step.await === "sessionEnded"
          ? roomState.ended && !baseline.current.ended
          : false;
    if (ok) setSatisfied(true);
  }, [roomState, step?.await, satisfied]);

  // Spotlight: measure the anchored element and keep the ring glued to it.
  useEffect(() => {
    if (done || !step?.anchor) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-tour-id="${step.anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const mo = new MutationObserver(onChange); // coalesced via rAF
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    const iv = window.setInterval(measure, 600); // safety net for missed reflows
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      mo.disconnect();
      window.clearInterval(iv);
      cancelAnimationFrame(raf);
    };
  }, [step?.anchor, idx, done]);

  const persistStep = useCallback(
    (n: number) => {
      try {
        localStorage.setItem(stepKey, String(n));
      } catch {
        /* ignore */
      }
    },
    [stepKey],
  );

  const finish = useCallback(() => {
    setDone(true);
    try {
      localStorage.setItem(doneKey, "1");
    } catch {
      /* ignore */
    }
    onComplete?.();
  }, [doneKey, onComplete]);

  const next = useCallback(() => {
    if (idx >= steps.length - 1) {
      finish();
      return;
    }
    const n = idx + 1;
    setIdx(n);
    persistStep(n);
  }, [idx, steps.length, finish, persistStep]);

  const back = useCallback(() => {
    const n = Math.max(0, idx - 1);
    setIdx(n);
    persistStep(n);
  }, [idx, persistStep]);

  const replay = useCallback(() => {
    setDone(false);
    setIdx(0);
    persistStep(0);
    try {
      localStorage.removeItem(doneKey);
    } catch {
      /* ignore */
    }
  }, [doneKey, persistStep]);

  if (!mounted || steps.length === 0) return null;

  // Completed → a quiet floating pill to replay.
  if (done) {
    return (
      <button
        onClick={replay}
        aria-label="Replay the guided tour"
        className="fixed bottom-4 right-4 z-50 h-9 w-9 rounded-full border border-accent/50 bg-surface text-sm font-semibold text-accent shadow-lg"
      >
        ?
      </button>
    );
  }

  if (!step) return null;
  const isLast = idx >= steps.length - 1;
  const gated = Boolean(step.await) && !satisfied;
  const bodyText = satisfied && step.doneBody ? step.doneBody : step.body;

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            // The 9999px shadow dims the whole page EXCEPT the cut-out — a
            // spotlight. pointer-events:none means clicks fall through to the UI.
            boxShadow: "0 0 0 9999px rgba(8,8,20,0.55)",
          }}
        />
      )}
      <aside
        role="complementary"
        aria-label="Guided tour"
        className="fixed bottom-4 right-4 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-accent/50 bg-surface p-4 shadow-xl"
      >
        <div aria-live="polite">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {idx + 1} / {steps.length}
          </p>
          <p className="mt-1 font-display text-base font-semibold leading-tight">
            {step.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{bodyText}</p>
        </div>

        {step.cta?.href && (
          <a
            href={step.cta.href}
            className="mt-3 inline-block rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
          >
            {step.cta.label}
          </a>
        )}

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={finish}
            className="text-xs text-muted underline hover:text-white/80"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {idx > 0 && (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            <Button onClick={next} disabled={gated}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>

        {gated && (
          <p className="mt-2 text-[11px] text-muted">
            Do it above to continue ✨
          </p>
        )}
      </aside>
    </>
  );
}
