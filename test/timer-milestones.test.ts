import { describe, expect, it } from "vitest";
import {
  crossedThresholds,
  DEFAULT_MILESTONES,
  drainState,
  warnThresholds,
} from "@/components/useTimerMilestones";

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

// C6 full — the builder-authored amber threshold.
describe("warnThresholds", () => {
  it("falls back to the defaults when unset or zero", () => {
    expect(warnThresholds(undefined)).toBe(DEFAULT_MILESTONES);
    expect(warnThresholds(null)).toBe(DEFAULT_MILESTONES);
    expect(warnThresholds(0)).toBe(DEFAULT_MILESTONES);
  });
  it("authored amber threshold always folds in a 30s final cue, descending", () => {
    expect(warnThresholds(90)).toEqual([90, 30]);
    expect(warnThresholds(300)).toEqual([300, 30]);
  });
  it("dedupes when the authored value is the 30s cue", () => {
    expect(warnThresholds(30)).toEqual([30]);
  });
  it("a sub-30s authored value still sorts descending", () => {
    expect(warnThresholds(20)).toEqual([30, 20]);
  });
});

// C6 full — the projector drain bar geometry.
describe("drainState", () => {
  it("is null outside the warning window (or with no live timer)", () => {
    expect(drainState(null, 120)).toBeNull();
    expect(drainState(200_000, 120)).toBeNull(); // 3:20 left, 2:00 window
    expect(drainState(60_000, 0)).toBeNull(); // no window
  });
  it("fills proportionally inside the window", () => {
    expect(drainState(120_000, 120)).toEqual({ pct: 100, urgent: false });
    expect(drainState(60_000, 120)).toEqual({ pct: 50, urgent: false });
    expect(drainState(0, 120)).toEqual({ pct: 0, urgent: true });
  });
  it("turns urgent in the final 30 seconds", () => {
    expect(drainState(31_000, 120)!.urgent).toBe(false);
    expect(drainState(30_000, 120)!.urgent).toBe(true);
    expect(drainState(5_000, 120)!.urgent).toBe(true);
  });
});
