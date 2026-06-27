"use client";

import type { Cmd } from "@/components/HostConsole";
import type { FacilitatorState } from "@/lib/types";

// D4 — latecomer placement. On a grouping phase set to "hold", anyone who arrives
// after the cohort froze waits (they see a calm "joining in a moment" state) until
// the facilitator seats them here — one tap each, or all at once. Handles only
// (which the host already sees); placement folds them into the smallest group on
// the next poll without disturbing anyone already seated.
export function LatecomerPanel({
  state,
  cmd,
}: {
  state: FacilitatorState;
  cmd: Cmd;
}) {
  const held = state.heldLatecomers ?? [];
  if (held.length === 0 || !state.phaseId) return null;
  const phaseId = state.phaseId;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-accent">
          {held.length} waiting to join
        </h3>
        <button
          onClick={() =>
            cmd("placeLatecomer", { phaseId, tokens: held.map((h) => h.token) })
          }
          className="rounded-lg border border-accent bg-accent/15 px-2.5 py-1 text-xs text-accent hover:bg-accent/25"
        >
          Place all
        </button>
      </div>
      <p className="text-xs text-muted">
        They joined after the groups formed — place them into the smallest group
        when there&apos;s a natural moment.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {held.map((h) => (
          <li key={h.token}>
            <button
              onClick={() => cmd("placeLatecomer", { phaseId, tokens: [h.token] })}
              className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs hover:border-accent"
              title={`Place ${h.handle}`}
            >
              {h.handle} <span className="text-accent">+ place</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
