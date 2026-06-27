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

describe("B5 — vote-phase response seeding", () => {
  it("a rehearsed poll previews a POPULATED tally (config-true options)", async () => {
    const shadow = shadowRoomId("seed-poll", "n1");
    await tearDownRehearsal(shadow);
    const phases: PhaseInstance[] = [
      { id: "v", moduleId: "poll", config: { label: "P", question: "Pick", options: ["A", "B", "C"] } },
    ];
    const { tokens } = await seedRehearsal(shadow, phases, 8);
    await setPhase("v", shadow);
    const view = (await getPublicState(null, shadow, "projector")).view?.data as {
      counts: Record<string, number>;
      total: number;
    };
    expect(Object.keys(view.counts)).toEqual(["A", "B", "C"]); // config-true
    expect(view.total).toBeGreaterThan(0); // populated, not blank
    expect(Object.values(view.counts).reduce((s, n) => s + n, 0)).toBe(view.total);
    await tearDownRehearsal(shadow);
  });

  it("a rehearsed scale previews non-zero means", async () => {
    const shadow = shadowRoomId("seed-scale", "n2");
    await tearDownRehearsal(shadow);
    const phases: PhaseInstance[] = [
      { id: "s", moduleId: "scale", config: { label: "S", statements: ["A", "B"], min: 1, max: 5 } },
    ];
    await seedRehearsal(shadow, phases, 8);
    await setPhase("s", shadow);
    const view = (await getPublicState(null, shadow, "projector")).view?.data as {
      stats: { mean: number; count: number }[];
    };
    expect(view.stats).toHaveLength(2);
    expect(view.stats.every((st) => st.count > 0)).toBe(true);
    await tearDownRehearsal(shadow);
  });
});

describe("B5 — reseed (teardown + fresh seed) at a new cast size", () => {
  it("re-rolls cleanly without accumulating prior data", async () => {
    const shadow = shadowRoomId("reseed", "n3");
    const phases: PhaseInstance[] = [
      { id: "c", moduleId: "capture", config: { label: "C", prompt: "Go" } },
    ];
    await tearDownRehearsal(shadow);
    const first = await seedRehearsal(shadow, phases, 8);
    expect(first.tokens).toHaveLength(8);
    const subs1 = (await listSubmissions(shadow)).length;

    // A reseed = teardown + a fresh seed at a new size; counts reflect the NEW
    // cast only (no accumulation from the prior run).
    await tearDownRehearsal(shadow);
    const second = await seedRehearsal(shadow, phases, 4);
    expect(second.tokens).toHaveLength(4);
    expect((await listParticipants(shadow)).length).toBe(4); // not 12
    const subs2 = (await listSubmissions(shadow)).length;
    expect(subs2).toBeLessThanOrEqual(subs1); // fewer (smaller cast), never additive
    await tearDownRehearsal(shadow);
  });
});

describe("B5 — canned AI for the dry-run", () => {
  // The AI modules only READ their cached result when AI is configured (the case
  // where canned-AI's value is skipping the slow/costly REAL generation).
  const SYN: PhaseInstance[] = [
    { id: "ideas", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
    { id: "syn", moduleId: "synthesis", config: { label: "Synthesis", sourcePhaseId: "ideas" } },
  ];
  async function withAiKey<T>(fn: () => Promise<T>): Promise<T> {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  }

  it("a rehearsed synthesis previews a canned result by default (no real AI call)", async () => {
    await withAiKey(async () => {
      const shadow = shadowRoomId("ai-canned", "n6");
      await tearDownRehearsal(shadow);
      await seedRehearsal(shadow, SYN, 8); // cannedAi defaults on
      await setPhase("syn", shadow);
      const view = (await getPublicState(null, shadow, "projector")).view?.data as {
        hasResult: boolean;
        bullets?: string[];
      };
      expect(view.hasResult).toBe(true);
      expect((view.bullets ?? []).length).toBeGreaterThan(0);
      await tearDownRehearsal(shadow);
    });
  });

  it("with cannedAi off, the AI phase has no seeded result (a real generate would run)", async () => {
    await withAiKey(async () => {
      const shadow = shadowRoomId("ai-real", "n7");
      await tearDownRehearsal(shadow);
      await seedRehearsal(shadow, SYN, 8, { cannedAi: false });
      await setPhase("syn", shadow);
      const view = (await getPublicState(null, shadow, "projector")).view?.data as { hasResult: boolean };
      expect(view.hasResult).toBe(false);
      await tearDownRehearsal(shadow);
    });
  });
});

describe("B5 — auto punch-list (readiness over the shadow session)", () => {
  it("flags an empty required prompt as a blocker during rehearsal", async () => {
    const { getFacilitatorState } = await import("@/lib/store");
    const shadow = shadowRoomId("punch", "n4");
    await tearDownRehearsal(shadow);
    await seedRehearsal(
      shadow,
      [{ id: "c", moduleId: "capture", config: { label: "C", prompt: "   " } }], // blank prompt
      6,
    );
    const fs = await getFacilitatorState(shadow);
    const issue = fs.readiness?.checks.find((c) => c.id === "empty:c");
    expect(issue?.severity).toBe("blocker");
    await tearDownRehearsal(shadow);
  });

  it("a sound session has no blocker/warning issues in the punch list", async () => {
    const { getFacilitatorState } = await import("@/lib/store");
    const shadow = shadowRoomId("punch-ok", "n5");
    await tearDownRehearsal(shadow);
    await seedRehearsal(
      shadow,
      [{ id: "c", moduleId: "capture", config: { label: "C", prompt: "What stands out?" } }],
      6,
    );
    const fs = await getFacilitatorState(shadow);
    const actionable = (fs.readiness?.checks ?? []).filter(
      (c) => c.severity === "blocker" || c.severity === "warning",
    );
    expect(actionable).toHaveLength(0);
    await tearDownRehearsal(shadow);
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
