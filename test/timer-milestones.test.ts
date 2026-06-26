import { describe, expect, it } from "vitest";
import { crossedThresholds, DEFAULT_MILESTONES } from "@/components/useTimerMilestones";

// C6 — the room-felt timer milestone crossing logic. Pure: a threshold fires only
// on a real above→below crossing, so it can't double-fire on a poll/re-render and
// won't fire on a fresh mount already past the threshold.

const T = DEFAULT_MILESTONES; // [120, 30]

describe("crossedThresholds", () => {
  it("fires a threshold once when the clock crosses it", () => {
    // 2:01 → 1:59 crosses the 120s mark.
    expect(crossedThresholds(121_000, 119_000, T)).toEqual([120]);
  });

  it("does NOT fire while staying above a threshold", () => {
    expect(crossedThresholds(200_000, 130_000, T)).toEqual([]);
  });

  it("does NOT re-fire while staying below a threshold (poll / re-render safe)", () => {
    expect(crossedThresholds(110_000, 100_000, T)).toEqual([]);
  });

  it("does NOT fire on a fresh mount already below a threshold", () => {
    // prev === now (the first-observation baseline) → no crossing.
    expect(crossedThresholds(90_000, 90_000, T)).toEqual([]);
  });

  it("fires multiple thresholds crossed in one big tick", () => {
    // 2:05 → 0:20 jumps past both 120 and 30.
    expect(crossedThresholds(125_000, 20_000, T)).toEqual([120, 30]);
  });

  it("fires the 30s mark on a 0:31 → 0:29 crossing", () => {
    expect(crossedThresholds(31_000, 29_000, T)).toEqual([30]);
  });

  it("exactly hitting the threshold counts as crossed (<=)", () => {
    expect(crossedThresholds(121_000, 120_000, T)).toEqual([120]);
    // but starting AT the threshold and staying does not re-fire
    expect(crossedThresholds(120_000, 119_000, T)).toEqual([]);
  });
});
