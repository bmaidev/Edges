import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  getFacilitatorState,
  getPublicState,
  setPhase,
  setPhases,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// W2/C1 — a per-phase facilitator script note (config.scriptNote) rendered in the
// cockpit centre band. Load-bearing privacy: it reaches the host, and is
// stripped for every non-host role (a private cue must never leak to the room).

const PHASE: PhaseInstance = {
  id: "p1",
  moduleId: "capture",
  config: { label: "Ideas", prompt: "Go", scriptNote: "Read the room before advancing" },
};

async function seeded() {
  const { room } = await createRoom("T", "Topic");
  await setPhases([PHASE], "S", room.slug);
  await setPhase(PHASE.id, room.slug);
  await addParticipant("tok", "Ada", room.slug);
  return room.slug;
}

describe("per-phase script note (config.scriptNote)", () => {
  it("reaches the facilitator's config", async () => {
    const slug = await seeded();
    const fac = await getFacilitatorState(slug);
    expect(fac.config?.scriptNote).toBe("Read the room before advancing");
  });

  it("is stripped from the participant config", async () => {
    const slug = await seeded();
    const pub = await getPublicState("tok", slug, "participant");
    expect((pub.config as Record<string, unknown> | null)?.scriptNote).toBeUndefined();
    // a public field on the same config is untouched
    expect((pub.config as Record<string, unknown> | null)?.label).toBe("Ideas");
  });

  it("is stripped from the projector config", async () => {
    const slug = await seeded();
    const proj = await getPublicState(null, slug, "projector");
    expect((proj.config as Record<string, unknown> | null)?.scriptNote).toBeUndefined();
  });
});
