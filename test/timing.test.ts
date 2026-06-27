import { describe, expect, it } from "vitest";
import { planVsActual } from "@/lib/timing";
import {
  endSession,
  readPhaseLog,
  setPhase,
  setPhases,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import type { PhaseInstance } from "@/lib/types";

// F4 — plan-vs-actual phase timing from the content-free advance log.

describe("planVsActual (pure)", () => {
  const phases = [
    { id: "p1", label: "Open", plannedSec: 120 },
    { id: "p2", label: "Diverge", plannedSec: 300 },
    { id: "p3", label: "Close", plannedSec: 60 },
  ];

  it("measures each phase from its stamp to the next; last phase is open", () => {
    const t0 = 1_000_000;
    const log = [
      { phaseId: "p1", at: t0 },
      { phaseId: "p2", at: t0 + 130_000 }, // p1 ran 130s (planned 120 → ~on, tol 15)
      { phaseId: "p3", at: t0 + 130_000 + 600_000 }, // p2 ran 600s (planned 300 → over)
    ];
    const now = t0 + 130_000 + 600_000 + 30_000; // p3 open 30s so far
    const out = planVsActual(log, phases, now);
    expect(out[0]).toMatchObject({ phaseId: "p1", actualSec: 130, verdict: "on" });
    expect(out[1]).toMatchObject({ phaseId: "p2", actualSec: 600, verdict: "over" });
    expect(out[2]).toMatchObject({ phaseId: "p3", open: true, verdict: "open" });
  });

  it("flags a phase that ran short", () => {
    const t0 = 0;
    const log = [
      { phaseId: "p2", at: t0 },
      { phaseId: "p3", at: t0 + 60_000 }, // p2 ran 60s vs planned 300 → under
    ];
    const out = planVsActual(log, phases, t0 + 60_000 + 1000);
    expect(out.find((r) => r.phaseId === "p2")).toMatchObject({ verdict: "under" });
  });

  it("an unreached phase is pending; an unplanned closed phase has no verdict to compare", () => {
    const noPlan = [
      { id: "x", label: "X", plannedSec: null },
      { id: "y", label: "Y", plannedSec: null },
    ];
    // x is closed (a later stamp exists), y is the open one.
    const out = planVsActual(
      [{ phaseId: "x", at: 0 }, { phaseId: "y", at: 50_000 }],
      noPlan,
      60_000,
    );
    expect(out[0].verdict).toBe("unplanned"); // x: reached, closed, no plan
    expect(out[1].verdict).toBe("open"); // y: currently running
    const out2 = planVsActual([], phases, 1000);
    expect(out2.every((r) => r.verdict === "pending")).toBe(true);
  });

  it("sums re-entries of the same phase", () => {
    const log = [
      { phaseId: "p1", at: 0 },
      { phaseId: "p2", at: 10_000 },
      { phaseId: "p1", at: 20_000 }, // re-entered p1
      { phaseId: "p3", at: 35_000 },
    ];
    const out = planVsActual(log, phases, 40_000);
    // p1: 10s + 15s = 25s
    expect(out.find((r) => r.phaseId === "p1")?.actualSec).toBe(25);
  });
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "content", config: { label: "A" } },
  { id: "p2", moduleId: "content", config: { label: "B" } },
];

describe("phase-advance log lifecycle (store)", () => {
  it("setPhase appends a stamp; endSession wipes the log (off-the-record)", async () => {
    const { room } = await createRoom("Timing", "Topic");
    await setPhases(PHASES, "T", room.slug);
    await setPhase("p1", room.slug);
    await setPhase("p2", room.slug);
    const log = await readPhaseLog(room.slug);
    expect(log.map((e) => e.phaseId)).toEqual(["p1", "p2"]);
    expect(log.every((e) => typeof e.at === "number")).toBe(true);
    await endSession(room.slug);
    expect((await readPhaseLog(room.slug)).length).toBe(0);
  });
});
