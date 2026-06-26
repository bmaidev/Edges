import { describe, expect, it } from "vitest";
import {
  blueprintSummary,
  createRoom,
  duplicateRoom,
  getRoom,
  saveBlueprint,
  stripCopy,
} from "@/lib/rooms";
import { addParticipant, addSubmission } from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// A5 — duplicate-a-room clones the DESIGN only (sequence + theme), with fresh
// passcodes and ZERO participant data. The blueprint is the durable design that
// survives the 24h live-state wipe.

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Brainstorm", prompt: "Go" } },
  { id: "p2", moduleId: "poll", config: { label: "Vote", options: ["a", "b"] } },
];

describe("stripCopy", () => {
  it("trims a trailing (copy) so copies don't stack", () => {
    expect(stripCopy("Retro")).toBe("Retro");
    expect(stripCopy("Retro (copy)")).toBe("Retro");
    expect(stripCopy("Retro (Copy)")).toBe("Retro");
  });
});

describe("blueprintSummary", () => {
  it("labels each phase by its config label, falling back to module id", () => {
    expect(blueprintSummary(PHASES)).toEqual(["Brainstorm", "Vote"]);
    expect(blueprintSummary([{ id: "x", moduleId: "lobby", config: {} }])).toEqual(["lobby"]);
  });
});

describe("saveBlueprint", () => {
  it("persists the design on the room record (survives the live wipe)", async () => {
    const { room } = await createRoom("Design Room", "t");
    await saveBlueprint(room.slug, { name: "My session", phases: PHASES });
    const r = await getRoom(room.slug);
    expect(r?.blueprint?.name).toBe("My session");
    expect(r?.blueprint?.phases).toHaveLength(2);
  });
});

describe("duplicateRoom", () => {
  it("clones the design + theme with FRESH passcodes and a deduped name", async () => {
    const { room, passcodes } = await createRoom("Workshop", "Topic", "tmpl-1");
    await saveBlueprint(room.slug, { name: "S", phases: PHASES });
    // give the source a theme + some live participant data (must NOT be copied)
    const { updateRoom } = await import("@/lib/rooms");
    await updateRoom(room.slug, { theme: { headline: "Hi" } });
    await addParticipant("tokA", "Dana", room.slug);
    await addSubmission("Dana", "an idea", "p1", null, "tokA", room.slug);

    const dup = await duplicateRoom(room.slug);
    expect(dup).not.toBeNull();
    expect(dup!.room.slug).not.toBe(room.slug); // new slug
    expect(dup!.room.name).toBe("Workshop (copy)");
    // fresh passcodes on every tier
    expect(dup!.passcodes.facilitator).not.toBe(passcodes.facilitator);
    expect(dup!.passcodes.cohost).not.toBe(passcodes.cohost);
    // design carried over
    expect(dup!.room.blueprint?.phases).toHaveLength(2);
    expect(dup!.room.theme?.headline).toBe("Hi");
    expect(dup!.room.templateId).toBe("tmpl-1");
    expect(dup!.room.status).toBe("draft");
  });

  it("never copies participants or submissions (design only)", async () => {
    const { room } = await createRoom("Live", "t");
    await saveBlueprint(room.slug, { name: "S", phases: PHASES });
    await addParticipant("tokB", "Eli", room.slug);
    await addSubmission("Eli", "secret", "p1", null, "tokB", room.slug);

    const dup = await duplicateRoom(room.slug);
    const { listParticipants, listSubmissions } = await import("@/lib/store");
    expect(await listParticipants(dup!.room.slug)).toEqual([]);
    expect(await listSubmissions(dup!.room.slug)).toEqual([]);
  });

  it("duplicating a copy stays '(copy)', never doubled", async () => {
    const { room } = await createRoom("Retro (copy)", "t");
    const dup = await duplicateRoom(room.slug);
    expect(dup!.room.name).toBe("Retro (copy)");
  });

  it("returns null for an unknown room", async () => {
    expect(await duplicateRoom("no-such-room")).toBeNull();
  });
});
