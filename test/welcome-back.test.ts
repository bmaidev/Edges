import { describe, expect, it } from "vitest";
import { deriveOrientation } from "@/components/WelcomeBackCard";
import type { PublicState } from "@/lib/types";

// D4-PR2 — the orientation trigger. Fires ONLY when a (re)joiner's first state is
// an active, mid-sequence phase — never the lobby/pre-session, never step 1.

const base: Partial<PublicState> = {
  sequence: [
    { id: "p1", label: "Open", moduleId: "capture" },
    { id: "p2", label: "Diverge", moduleId: "capture" },
    { id: "p3", label: "Converge", moduleId: "poll" },
  ],
};
const st = (over: Partial<PublicState>): PublicState =>
  ({ ...base, ...over } as PublicState);

describe("deriveOrientation", () => {
  it("returns null at the lobby / pre-session (no active module)", () => {
    expect(deriveOrientation(st({ moduleId: null, phaseId: "p1" }))).toBeNull();
  });

  it("returns null at the opening phase (step 1 — nothing to catch up on)", () => {
    expect(deriveOrientation(st({ moduleId: "capture", phaseId: "p1" }))).toBeNull();
  });

  it("returns orientation for a mid-sequence phase", () => {
    expect(
      deriveOrientation(st({ moduleId: "poll", phaseId: "p3", config: { label: "Converge now" } as PublicState["config"] })),
    ).toEqual({ label: "Converge now", step: 3, total: 3 });
  });

  it("falls back to the sequence label when config has none", () => {
    expect(deriveOrientation(st({ moduleId: "capture", phaseId: "p2" }))).toEqual({
      label: "Diverge",
      step: 2,
      total: 3,
    });
  });

  it("returns null when the phase isn't in the sequence", () => {
    expect(deriveOrientation(st({ moduleId: "capture", phaseId: "zzz" }))).toBeNull();
  });

  it("returns null with an empty sequence", () => {
    expect(deriveOrientation(st({ moduleId: "capture", phaseId: "p1", sequence: [] }))).toBeNull();
  });
});
