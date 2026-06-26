"use client";

import { Button } from "@/components/ui";
import { DEFAULT_MINUTES } from "@/lib/arc";
import type { FacilitatorState, ModuleKind } from "@/lib/types";

// B3 — print the facilitator run-sheet. Builds the one-sheet payload from the
// facilitator state (sequence + derived runsheets) and hands it to the print page
// via localStorage, so the private notes never leave this browser.
export function RunsheetPrint({
  state,
  slug,
}: {
  state: FacilitatorState;
  slug: string;
}) {
  const phases = state.sequence ?? [];
  if (phases.length === 0) return null;

  function print() {
    const phasePayload = phases.map((p, i) => {
      const rs = state.runsheets?.[p.id];
      return {
        n: i + 1,
        label: p.label,
        minutes: DEFAULT_MINUTES[p.moduleId as ModuleKind] ?? 5,
        script: rs?.script,
        talkingPoints: rs?.talkingPoints,
        contingency: rs?.contingency,
      };
    });
    const payload = {
      sessionName: state.modeName,
      totalMinutes: phasePayload.reduce((s, p) => s + p.minutes, 0),
      phases: phasePayload,
    };
    try {
      localStorage.setItem("edges_print", JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    window.open(`/r/${slug}/print`, "_blank", "noreferrer");
  }

  return (
    <Button variant="ghost" onClick={print}>
      🖨 Print run-sheet
    </Button>
  );
}
