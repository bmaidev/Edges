"use client";

import type { FacilitatorState } from "@/lib/types";
import { ghostDataCount } from "@/components/recovery/recovery";

// C3 — a calm, inline Run-tab warning shown when the active phase already holds
// answers that NONE of the present room produced (leftovers from an earlier run).
// Left unaddressed they'd surface to the room as-is on the next reveal, so the
// note offers a one-tap reset to a clean phase. Content-free: only a count. Renders
// nothing when the phase looks live or empty.
export function GhostDataNote({
  state,
  onReset,
}: {
  state: FacilitatorState;
  onReset: () => void;
}) {
  const n = ghostDataCount(state);
  if (n <= 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#ffd27a]/40 bg-[#ffd27a]/10 p-4 text-sm">
      <p className="font-semibold text-[#ffd27a]">
        This phase already holds {n} {n === 1 ? "answer" : "answers"} from an
        earlier run
      </p>
      <p className="text-muted">
        No one currently in the room submitted them — they’ll show to the room
        as-is when this phase reveals. Reset to start this phase clean.
      </p>
      <button
        onClick={onReset}
        className="self-start rounded-lg border border-[#ffd27a]/50 px-3 py-1.5 text-xs text-[#ffd27a] hover:bg-[#ffd27a]/15"
      >
        ↻ Reset this phase
      </button>
    </div>
  );
}
