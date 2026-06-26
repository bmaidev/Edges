import { describe, expect, it } from "vitest";
import {
  isRehearsalRoom,
  seedRehearsal,
  shadowRoomId,
  tearDownRehearsal,
} from "@/lib/rehearsal";
import {
  addParticipant,
  addSubmission,
  getPublicState,
  getState,
  listParticipants,
  listSubmissions,
  setPhase,
  setPhases,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import { roleHasCapability } from "@/lib/auth";
import type { PhaseInstance } from "@/lib/types";

// B5 — rehearsal. The load-bearing guarantee is ISOLATION: a dry-run runs in a
// shadow room that (1) leaves the live room byte-for-byte untouched and (2) leaves
// no data of its own after teardown. Plus a synthetic cast that actually populates
// the room-facing surfaces.

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Brainstorm", prompt: "Go" } },
  { id: "p2", moduleId: "worldcafe", config: { label: "Café", prompt: "?", tables: 2 } },
];

describe("shadow room identity", () => {
  it("is collision-proof against real word-xxxx slugs", () => {
    expect(isRehearsalRoom(shadowRoomId("amber-1a2b", "n1"))).toBe(true);
    expect(isRehearsalRoom("amber-1a2b")).toBe(false);
    expect(shadowRoomId("amber-1a2b", "n1")).toContain("::rehearsal:");
  });
});

describe("isolation — the live room is never touched", () => {
  it("seeding + stepping a shadow leaves the live room byte-identical", async () => {
    const { room } = await createRoom("Live", "t");
    // a real live session with a real participant + submission
    await setPhases(PHASES, "Real session", room.slug);
    await addParticipant("realtok", "RealPerson", room.slug);
    await addSubmission("RealPerson", "a real idea", "p1", null, "realtok", room.slug);
    const liveBefore = await getState(room.slug);
    const partsBefore = await listParticipants(room.slug);
    const subsBefore = await listSubmissions(room.slug);

    // run a whole rehearsal in the shadow
    const shadow = shadowRoomId(room.slug, "n1");
    await seedRehearsal(shadow, PHASES, 8);
    await setPhase("p2", shadow);

    // live room is untouched
    expect(await getState(room.slug)).toEqual(liveBefore);
    expect(await listParticipants(room.slug)).toEqual(partsBefore); // still just RealPerson
    expect(await listSubmissions(room.slug)).toEqual(subsBefore);
    expect((await listParticipants(room.slug)).length).toBe(1);
  });
});

describe("seeding — the shadow is populated", () => {
  it("seeds a synthetic roster and sample contributions, so the projector reads as live", async () => {
    const { room } = await createRoom("R", "t");
    const shadow = shadowRoomId(room.slug, "n2");
    const { tokens } = await seedRehearsal(shadow, PHASES, 8);
    expect(tokens.length).toBe(8);
    expect((await listParticipants(shadow)).length).toBe(8);
    // capture phase (submissions-gather) is populated
    expect((await listSubmissions(shadow)).filter((s) => s.phaseId === "p1").length).toBeGreaterThan(0);
    // the world-café projector view forms real tables from the roster
    await setPhase("p2", shadow);
    const proj = (await getPublicState(null, shadow, "projector")).view?.data as { tables: unknown[] };
    expect(Array.isArray(proj.tables)).toBe(true);
    expect(proj.tables.length).toBeGreaterThan(0);
  });
});

describe("teardown — nothing is left behind", () => {
  it("purges every shadow key including state", async () => {
    const { room } = await createRoom("R", "t");
    const shadow = shadowRoomId(room.slug, "n3");
    await seedRehearsal(shadow, PHASES, 6);
    await tearDownRehearsal(shadow);
    expect(await listParticipants(shadow)).toEqual([]);
    expect(await listSubmissions(shadow)).toEqual([]);
    // getState returns the DEFAULT (no phases) — the shadow state key is gone.
    expect((await getState(shadow)).phaseId).toBeNull();
  });

  it("REFUSES to purge a non-rehearsal (real) room", async () => {
    const { room } = await createRoom("Precious", "t");
    await setPhases(PHASES, "Real", room.slug);
    await addParticipant("t", "P", room.slug);
    await tearDownRehearsal(room.slug); // wrong id — must no-op
    expect((await listParticipants(room.slug)).length).toBe(1);
    expect((await getState(room.slug)).phaseId).toBe("p1");
  });
});

describe("capability matrix", () => {
  it("facilitator + cohost can rehearse; participant + projector cannot", () => {
    expect(roleHasCapability("facilitator", "rehearse")).toBe(true);
    expect(roleHasCapability("admin", "rehearse")).toBe(true);
    expect(roleHasCapability("cohost", "rehearse")).toBe(true);
    expect(roleHasCapability("participant", "rehearse")).toBe(false);
    expect(roleHasCapability("projector", "rehearse")).toBe(false);
  });
});
