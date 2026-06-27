import { describe, expect, it } from "vitest";
import { arcPhasesFromState } from "@/components/HostArcStrip";
import { analyzeAgenda } from "@/lib/arc";
import type { ModuleKind } from "@/lib/types";
import type { PhaseTiming } from "@/lib/timing";

// B1 — the host-side arc reconstructs its input from the live sequence + F4
// plan timings (the host never gets raw phase configs).

const seq = [
  { id: "p1", label: "Open", moduleId: "lobby" as ModuleKind },
  { id: "p2", label: "Diverge", moduleId: "capture" as ModuleKind },
  { id: "p3", label: "Converge", moduleId: "dotvote" as ModuleKind },
];

const timing = (phaseId: string, plannedSec: number | null): PhaseTiming =>
  ({ phaseId, label: phaseId, plannedSec, actualSec: null, open: false, verdict: "pending" });

describe("arcPhasesFromState", () => {
  it("maps each phase's planned seconds through as timerSeconds", () => {
    const out = arcPhasesFromState(seq, [
      timing("p1", 120),
      timing("p2", 600),
      timing("p3", 300),
    ]);
    expect(out.map((p) => p.config.timerSeconds)).toEqual([120, 600, 300]);
    expect(out.map((p) => p.moduleId)).toEqual(["lobby", "capture", "dotvote"]);
  });

  it("omits timerSeconds where no plan exists (arc falls back to its default)", () => {
    const out = arcPhasesFromState(seq, [timing("p2", 600)]);
    expect(out[0].config).not.toHaveProperty("timerSeconds"); // p1 unplanned
    expect(out[1].config.timerSeconds).toBe(600);
  });

  it("feeds analyzeAgenda a usable agenda (real minutes where planned)", () => {
    const out = arcPhasesFromState(seq, [timing("p1", 120), timing("p2", 600), timing("p3", 300)]);
    const a = analyzeAgenda(out);
    expect(a.points).toHaveLength(3);
    expect(a.totalMinutes).toBe(17); // (120+600+300)/60 = 1020/60
  });
});
