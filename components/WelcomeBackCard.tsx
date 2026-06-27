"use client";

import { useA11y } from "@/components/A11yProvider";
import type { PublicState } from "@/lib/types";

export interface Orientation {
  label: string;
  step: number;
  total: number;
}

// D4-PR2 — pure: where is a (re)joining participant landing? Returns an orientation
// ONLY when the first state they see is an active, mid-sequence phase (not the
// lobby/pre-session, and not the very first phase — there's nothing to catch up on
// at step 1). Derived entirely from already-public sequence/phaseId/label.
export function deriveOrientation(state: PublicState): Orientation | null {
  if (!state.moduleId) return null; // pre-session / lobby — no catch-up needed
  const seq = state.sequence ?? [];
  const i = seq.findIndex((s) => s.id === state.phaseId);
  if (i <= 0) return null; // not found, or the opening phase
  return {
    label: state.config?.label ?? seq[i].label,
    step: i + 1,
    total: seq.length,
  };
}

// A brief, dismissable "here's where we are" card for someone who joined or
// reconnected mid-session — so they aren't dropped cold into "step 3 of 6". H1
// already holds last-good-state and auto-rejoins; this just adds the first-second
// context. Visible-only (the D2 SR announcer carries the live region).
export function WelcomeBackCard({
  orientation,
  onDismiss,
}: {
  orientation: Orientation;
  onDismiss: () => void;
}) {
  const reduceMotion = useA11y()?.prefs.reduceMotion ?? false;
  return (
    <div
      className={`mx-3 mt-3 flex items-start justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 ${
        reduceMotion ? "" : "animate-fadeInUp"
      }`}
    >
      <p className="text-sm leading-relaxed text-white/90">
        Welcome — we&apos;re on{" "}
        <span className="font-medium text-accent">{orientation.label}</span>
        <span className="text-muted">
          {" "}
          (step {orientation.step} of {orientation.total}).
        </span>
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full px-2 text-muted hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
