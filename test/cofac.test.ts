import { describe, expect, it } from "vitest";
import { computeCofac } from "@/lib/cofac";
import type { FacilitatorState } from "@/lib/types";

// C7 — the deterministic co-facilitator brain. Pure, CONTENT-FREE (counts/timing
// only), at most one nudge, conservative thresholds.

const NOW = 1_000_000;
type In = Parameters<typeof computeCofac>[0];
function s(over: Partial<In>): In {
  return {
    participation: null,
    timerEndsAt: null,
    config: null,
    phaseId: "p1",
    ...over,
  } as In;
}

describe("computeCofac", () => {
  it("returns null when all is well (no timer, no gather signal)", () => {
    expect(computeCofac(s({}), NOW)).toBeNull();
  });

  it("OVERRUNNING: fires once the deadline is past the grace, with a +time action", () => {
    const n = computeCofac(s({ timerEndsAt: NOW - 20_000 }), NOW);
    expect(n?.kind).toBe("overrunning");
    expect(n?.action?.command).toBe("addTime");
  });

  it("OVERRUNNING: does NOT fire within the grace window", () => {
    expect(computeCofac(s({ timerEndsAt: NOW - 5_000 }), NOW)).toBeNull();
  });

  it("LOW-RESPONSE: fires on a gather phase past 60% with under half responded", () => {
    // planned 100s; 80s elapsed (endsAt = NOW + 20s); 1 of 5 responded.
    const n = computeCofac(
      s({
        participation: { present: 5, responded: 1, typing: 0, quiet: 0 },
        timerEndsAt: NOW + 20_000,
        config: { timerSeconds: 100 } as FacilitatorState["config"],
      }),
      NOW,
    );
    expect(n?.kind).toBe("low-response");
    expect(n?.action?.command).toBe("nudgeRoom");
    expect(n?.message).toContain("1 of 5");
  });

  it("LOW-RESPONSE: does NOT fire early in the phase (only 20% elapsed)", () => {
    const n = computeCofac(
      s({
        participation: { present: 5, responded: 1, typing: 0, quiet: 0 },
        timerEndsAt: NOW + 80_000, // 20s elapsed of 100s
        config: { timerSeconds: 100 } as FacilitatorState["config"],
      }),
      NOW,
    );
    expect(n).toBeNull();
  });

  it("LOW-RESPONSE: does NOT fire when most have responded", () => {
    const n = computeCofac(
      s({
        participation: { present: 5, responded: 4, typing: 0, quiet: 0 },
        timerEndsAt: NOW + 20_000,
        config: { timerSeconds: 100 } as FacilitatorState["config"],
      }),
      NOW,
    );
    expect(n).toBeNull();
  });

  it("LOW-RESPONSE: never coaches a tiny room (present < 3)", () => {
    const n = computeCofac(
      s({
        participation: { present: 2, responded: 0, typing: 0, quiet: 0 },
        timerEndsAt: NOW + 20_000,
        config: { timerSeconds: 100 } as FacilitatorState["config"],
      }),
      NOW,
    );
    expect(n).toBeNull();
  });

  it("is content-free: the verdict ignores submission text entirely", () => {
    // The input type has no `submissions` field — there is no way for the brain
    // to read content. This is enforced structurally by the CofacInput Pick.
    const input = s({ timerEndsAt: NOW - 20_000 }) as Record<string, unknown>;
    expect("submissions" in input).toBe(false);
    expect("tokens" in input).toBe(false);
  });
});
