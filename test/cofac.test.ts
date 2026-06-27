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
    const input = s({ timerEndsAt: NOW - 20_000 }) as unknown as Record<string, unknown>;
    expect("submissions" in input).toBe(false);
    expect("tokens" in input).toBe(false);
  });
});

describe("C7 full — enable, sensitivity, dismissal", () => {
  it("OFF: a disabled co-facilitator is always silent", () => {
    const n = computeCofac(
      s({ timerEndsAt: NOW - 60_000, cofacEnabled: false }),
      NOW,
    );
    expect(n).toBeNull();
  });

  it("KEEN fires inside the standard grace; CALM stays quiet there", () => {
    // 10s past the deadline: keen grace is 5s (fires), calm grace is 45s (silent),
    // standard grace is 15s (silent).
    const at = NOW - 10_000;
    expect(computeCofac(s({ timerEndsAt: at, cofacSensitivity: "keen" }), NOW)?.kind).toBe(
      "overrunning",
    );
    expect(computeCofac(s({ timerEndsAt: at, cofacSensitivity: "standard" }), NOW)).toBeNull();
    expect(computeCofac(s({ timerEndsAt: at, cofacSensitivity: "calm" }), NOW)).toBeNull();
  });

  it("CALM needs a bigger room (minPresent 4) for the low-response nudge", () => {
    const base = {
      participation: { present: 3, responded: 0, typing: 0, quiet: 0 },
      timerEndsAt: NOW + 10_000,
      config: { timerSeconds: 100 } as In["config"],
    };
    // present=3: standard coaches, calm does not (needs 4).
    expect(computeCofac(s({ ...base, cofacSensitivity: "standard" }), NOW)?.kind).toBe(
      "low-response",
    );
    expect(computeCofac(s({ ...base, cofacSensitivity: "calm" }), NOW)).toBeNull();
  });

  it("DISMISSED: a persisted dismissal suppresses that kind for that phase", () => {
    const input = s({
      timerEndsAt: NOW - 60_000,
      phaseId: "p1",
      cofacDismissed: [{ phaseId: "p1", kind: "overrunning" }],
    });
    expect(computeCofac(input, NOW)).toBeNull();
    // The same dismissal on a DIFFERENT phase does not suppress it.
    expect(
      computeCofac({ ...input, cofacDismissed: [{ phaseId: "pX", kind: "overrunning" }] }, NOW)?.kind,
    ).toBe("overrunning");
  });
});
