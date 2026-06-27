// F4 — plan-vs-actual phase timing, derived purely from the content-free phase-
// advance log ({phaseId, at} stamps) and the built sequence's planned minutes. No
// names, no answers — only how long each phase actually ran vs how long it was
// planned. Used by the host Session tab to learn from the run (and afterwards).

export interface PhaseLogEntry {
  phaseId: string;
  at: number;
}

export type TimingVerdict =
  | "pending" // never reached
  | "open" // currently running
  | "on" // within tolerance of plan
  | "over" // ran long
  | "under" // ran short
  | "unplanned"; // no planned duration to compare against

export interface PhaseTiming {
  phaseId: string;
  label: string;
  plannedSec: number | null;
  actualSec: number | null; // summed across any re-entries; null if never reached
  open: boolean; // the currently-running phase (actual is still accruing)
  verdict: TimingVerdict;
}

// Within ±10% (and at least ±15s) of plan counts as "on".
function classify(plannedSec: number | null, actualSec: number, open: boolean): TimingVerdict {
  if (open) return "open";
  if (plannedSec == null || plannedSec <= 0) return "unplanned";
  const tol = Math.max(15, plannedSec * 0.1);
  if (actualSec > plannedSec + tol) return "over";
  if (actualSec < plannedSec - tol) return "under";
  return "on";
}

export function planVsActual(
  log: PhaseLogEntry[],
  phases: { id: string; label: string; plannedSec?: number | null }[],
  now: number,
): PhaseTiming[] {
  // Sum measured durations per phase across the chronological log. Each entry's
  // segment runs until the NEXT stamp (or `now` for the final, still-open one).
  const measured = new Map<string, number>();
  for (let i = 0; i < log.length; i++) {
    const start = log[i].at;
    const end = i + 1 < log.length ? log[i + 1].at : now;
    const dur = Math.max(0, Math.round((end - start) / 1000));
    measured.set(log[i].phaseId, (measured.get(log[i].phaseId) ?? 0) + dur);
  }
  const openPhaseId = log.length ? log[log.length - 1].phaseId : null;

  return phases.map((p) => {
    const reached = measured.has(p.id);
    const actualSec = reached ? measured.get(p.id)! : null;
    const open = p.id === openPhaseId;
    const plannedSec = p.plannedSec ?? null;
    const verdict: TimingVerdict = !reached
      ? "pending"
      : classify(plannedSec, actualSec!, open);
    return { phaseId: p.id, label: p.label, plannedSec, actualSec, open, verdict };
  });
}
