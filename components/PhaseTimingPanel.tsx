"use client";

import type { FacilitatorState } from "@/lib/types";
import type { PhaseTiming, TimingVerdict } from "@/lib/timing";

// F4 — plan-vs-actual phase timing in the host Session tab. A calm, content-free
// readout (no names, no answers) of how long each phase actually ran versus its
// planned minutes — so the facilitator can adjust live and learn for next time.
// Renders nothing until the room has advanced at least once.

function fmt(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

const VERDICT_STYLE: Record<TimingVerdict, { label: string; cls: string }> = {
  open: { label: "running", cls: "text-accent" },
  on: { label: "on plan", cls: "text-emerald-300" },
  over: { label: "ran long", cls: "text-[#ffb454]" },
  under: { label: "ran short", cls: "text-[#7aa2ff]" },
  unplanned: { label: "no plan", cls: "text-muted" },
  pending: { label: "not yet", cls: "text-muted/60" },
};

function delta(t: PhaseTiming): string | null {
  if (t.plannedSec == null || t.actualSec == null || t.verdict === "on") return null;
  const d = Math.round((t.actualSec - t.plannedSec) / 60);
  if (d === 0) return null;
  return d > 0 ? `+${d}m` : `${d}m`;
}

export function PhaseTimingPanel({ state }: { state: FacilitatorState }) {
  const timings = state.phaseTimings;
  if (!timings || timings.length === 0) return null;
  // Only worth showing once at least one phase has actually been timed.
  if (!timings.some((t) => t.actualSec != null)) return null;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">Phase timing</h3>
      <p className="text-xs text-muted">
        How long each phase ran versus its plan — content-free, wiped when you end.
      </p>
      <ul className="mt-1 flex flex-col divide-y divide-border/60">
        {timings.map((t) => {
          const v = VERDICT_STYLE[t.verdict];
          const d = delta(t);
          return (
            <li
              key={t.phaseId}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              <span className="shrink-0 font-mono text-xs text-muted">
                {fmt(t.actualSec)}
                {t.plannedSec != null && (
                  <span className="text-muted/60"> / {fmt(t.plannedSec)}</span>
                )}
              </span>
              <span className={`shrink-0 w-20 text-right text-xs ${v.cls}`}>
                {v.label}
                {d && <span className="ml-1 tabular-nums">({d})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
