"use client";

import type { RunSheet } from "@/lib/types";

// B3 — the facilitator's private script for the CURRENT phase, shown inline in
// the host Run tab above the controls (so they speak from Edges, not a Google
// Doc in another tab). Plus a one-line peek at what's next.
export function RunSheetPanel({
  runsheet,
  nextPeek,
  timing,
}: {
  runsheet?: RunSheet | null;
  nextPeek?: string | null;
  // B3 — live pacing: the phase's planned seconds (its timer preset) + the live
  // deadline, so the facilitator can run from the sheet AND watch the clock.
  timing?: { plannedSec?: number; timerEndsAt: number | null; timerRemainingMs: number | null };
}) {
  const has = Boolean(
    runsheet && (runsheet.script || runsheet.talkingPoints || runsheet.contingency),
  );
  const chip = timingChip(timing);
  if (!has && !nextPeek && !chip) return null;
  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          🎙 Your run-sheet
        </p>
        {chip && (
          <span className={`text-xs ${chip.over ? "text-[#ff8a8a]" : "text-muted"}`}>{chip.text}</span>
        )}
      </div>
      {has ? (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {runsheet?.script && (
            <p className="leading-relaxed text-white/90">{runsheet.script}</p>
          )}
          {runsheet?.talkingPoints && (
            <p className="whitespace-pre-line text-muted">{runsheet.talkingPoints}</p>
          )}
          {runsheet?.contingency && (
            <p className="text-xs text-muted">
              <span className="text-[#ffd27a]">If it goes quiet:</span>{" "}
              {runsheet.contingency}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">No notes for this phase.</p>
      )}
      {nextPeek && (
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
          Next → <span className="text-white/80">{nextPeek}</span>
        </p>
      )}
    </section>
  );
}

// B3 — the live pacing chip. Recomputed each poll (2s granularity is plenty for
// pacing, so no ticker needed). Honest about not-started / paused / over states.
function timingChip(
  timing?: { plannedSec?: number; timerEndsAt: number | null; timerRemainingMs: number | null },
): { text: string; over: boolean } | null {
  if (!timing?.plannedSec || timing.plannedSec <= 0) return null;
  const planned = Math.round(timing.plannedSec / 60);
  if (timing.timerEndsAt == null && timing.timerRemainingMs != null)
    return { text: `Planned ${planned}m · paused`, over: false };
  if (timing.timerEndsAt == null)
    return { text: `Planned ${planned}m · timer not started`, over: false };
  const remMs = timing.timerEndsAt - Date.now();
  if (remMs <= 0) return { text: `Planned ${planned}m · time's up`, over: true };
  return { text: `Planned ${planned}m · ${Math.ceil(remMs / 60000)}m left`, over: false };
}
