// E2 — pure navigation maths over a phase sequence. One source of truth for
// "where are we, what's next, how many" so the presenter ribbon and the host
// PhaseStepper agree exactly (no DOM, no React, no store — trivially testable).

import type { ModuleKind } from "./types";

export type SequenceItem = { id: string; label: string; moduleId: ModuleKind };

export type PhaseStatus = "done" | "current" | "upcoming";

export interface PhaseNavItem extends SequenceItem {
  index: number; // 0-based position in the sequence
  status: PhaseStatus;
}

export interface PhaseNav {
  phases: PhaseNavItem[];
  index: number; // current phase index, or -1 if phaseId isn't in the sequence
  total: number;
  current: PhaseNavItem | null;
  prev: PhaseNavItem | null; // the phase before current (null at the start)
  next: PhaseNavItem | null; // the phase after current (null at the end)
}

// Resolve a sequence + the active phaseId into everything a navigator needs.
// When phaseId is null/unknown, index is -1, current/prev/next are null, and
// every phase is "upcoming" — the lobby/pre-session state.
export function phaseNav(
  sequence: SequenceItem[] | null | undefined,
  phaseId: string | null | undefined,
): PhaseNav {
  const seq = sequence ?? [];
  const index = phaseId ? seq.findIndex((p) => p.id === phaseId) : -1;
  const phases: PhaseNavItem[] = seq.map((p, i) => ({
    ...p,
    index: i,
    status:
      index < 0 || i > index ? "upcoming" : i === index ? "current" : "done",
  }));
  return {
    phases,
    index,
    total: seq.length,
    current: index >= 0 ? phases[index] : null,
    prev: index > 0 ? phases[index - 1] : null,
    next: index >= 0 && index < seq.length - 1 ? phases[index + 1] : null,
  };
}
