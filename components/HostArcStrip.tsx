"use client";

import { useState } from "react";
import { AgendaArc } from "@/components/AgendaArc";
import type { FacilitatorState, ModuleKind } from "@/lib/types";
import type { PhaseTiming } from "@/lib/timing";

// B1 — reconstruct the AgendaArc input from the live sequence (module per phase)
// + the F4 plan timings (planned seconds per phase). The host never receives raw
// phase configs, so we synthesise the minimum the arc needs: moduleId (for the
// stage/energy) and timerSeconds (for the time ledger, where a plan exists). Pure
// + exported for test.
export function arcPhasesFromState(
  sequence: { id: string; label: string; moduleId: ModuleKind }[],
  phaseTimings: PhaseTiming[] | null | undefined,
): { moduleId: ModuleKind; config: Record<string, unknown> }[] {
  const plannedById = new Map(
    (phaseTimings ?? []).map((t) => [t.phaseId, t.plannedSec] as const),
  );
  return sequence.map((s) => {
    const planned = plannedById.get(s.id);
    return {
      moduleId: s.moduleId,
      config: {
        label: s.label,
        ...(planned != null ? { timerSeconds: planned } : {}),
      },
    };
  });
}

// B1 — the agenda arc, on the host's Session tab during the run: a glanceable
// "does this session still breathe?" (open → diverge → converge → close) over the
// phases the room will actually move through. Read-only.
export function HostArcStrip({ state }: { state: FacilitatorState }) {
  const [sel, setSel] = useState<number | null>(null);
  const seq = state.sequence ?? [];
  if (seq.length < 2) return null; // an arc needs a few phases to mean anything
  const phases = arcPhasesFromState(seq, state.phaseTimings);
  return <AgendaArc phases={phases} selectedIndex={sel} onSelect={setSel} />;
}
