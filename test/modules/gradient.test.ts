import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  setPhase,
  setPhases,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";
import type { GradientScale } from "@/lib/modules/defs/gradient.server";

async function setup(
  scale: GradientScale,
  config: Record<string, unknown> = { requireReasonForConcern: true },
) {
  const { room } = await createRoom("Gradient test", "Consent");
  const phase: PhaseInstance = {
    id: "gradient",
    moduleId: "gradient",
    config: {
      label: "Consent",
      proposal: "Proceed with the proposal",
      scale,
      ...config,
    },
  };
  await setPhases([phase], "Gradient", room.slug);
  await setPhase(phase.id, room.slug);
  await addParticipant("p1", "Participant", room.slug);
  return room.slug;
}

describe("gradient concern semantics", () => {
  it.each([
    ["fist5", 0, 5],
    ["kaner8", 8, 0],
    ["consent", 2, 0],
  ] as const)(
    "requires context at the concern end of %s, regardless of scale direction",
    async (scale, concernLevel, supportLevel) => {
      const room = await setup(scale);
      const concern = await dispatchAction(
        room,
        { type: "vote", token: "p1", payload: { level: concernLevel } },
        "participant",
      );
      expect(concern).toMatchObject({ ok: false, reason: "reason required" });

      const support = await dispatchAction(
        room,
        { type: "vote", token: "p1", payload: { level: supportLevel } },
        "participant",
      );
      expect(support.ok).toBe(true);
    },
  );

  it("preserves the intent of legacy threshold configs after a scale switch", async () => {
    const room = await setup("consent", { requireReasonBelow: 2 });
    const objection = await dispatchAction(
      room,
      { type: "vote", token: "p1", payload: { level: 2 } },
      "participant",
    );
    expect(objection).toMatchObject({ ok: false, reason: "reason required" });

    const consent = await dispatchAction(
      room,
      { type: "vote", token: "p1", payload: { level: 0 } },
      "participant",
    );
    expect(consent.ok).toBe(true);
  });
});
