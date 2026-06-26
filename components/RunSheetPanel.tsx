"use client";

import type { RunSheet } from "@/lib/types";

// B3 — the facilitator's private script for the CURRENT phase, shown inline in
// the host Run tab above the controls (so they speak from Edges, not a Google
// Doc in another tab). Plus a one-line peek at what's next.
export function RunSheetPanel({
  runsheet,
  nextPeek,
}: {
  runsheet?: RunSheet | null;
  nextPeek?: string | null;
}) {
  const has = Boolean(
    runsheet && (runsheet.script || runsheet.talkingPoints || runsheet.contingency),
  );
  if (!has && !nextPeek) return null;
  return (
    <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        🎙 Your run-sheet
      </p>
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
