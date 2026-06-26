import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  getPublicState,
  readVotes,
  setPhase,
  setPhases,
} from "@/lib/store";
import {
  appendCafeExtras,
  appendExtras,
  cohortTokens,
  readCohort,
} from "@/lib/modules/groups";
import type { PhaseInstance } from "@/lib/types";

// D4 — the cohort freeze. The rotation modules (World Café, Stations, 1-2-4-All,
// 25/10) used to group from the LIVE roster every round, so a mid-session join
// reshuffled everyone's groups and re-pointed positional tags. The freeze
// snapshots the roster on phase entry; these tests prove that a latecomer joining
// mid-activity NEVER moves anyone already seated, and is folded in as an extra.

// ---- pure helpers ---------------------------------------------------------

describe("groups: cohort-freeze helpers", () => {
  it("readCohort returns the frozen string[] or null", () => {
    expect(readCohort({ __cohort__: ["b", "a"] })).toEqual(["b", "a"]);
    expect(readCohort({})).toBeNull();
    expect(readCohort({ __cohort__: "nope" })).toBeNull();
    expect(readCohort({ __cohort__: [1, 2] })).toBeNull();
  });

  it("cohortTokens splits live into the frozen cohort + sorted extras", () => {
    const votes = { __cohort__: ["a", "b", "c"] };
    const { cohort, extras } = cohortTokens(votes, ["c", "a", "z", "b", "m"]);
    expect(cohort).toEqual(["a", "b", "c"]); // frozen order preserved
    expect(extras).toEqual(["m", "z"]); // latecomers, sorted, in join-order-free order
  });

  it("cohortTokens falls back to the live roster when nothing is frozen", () => {
    const { cohort, extras } = cohortTokens({}, ["c", "a", "b"]);
    expect(cohort).toEqual(["a", "b", "c"]);
    expect(extras).toEqual([]);
  });

  it("an empty frozen cohort falls back to live (no one was present at entry)", () => {
    const { cohort, extras } = cohortTokens({ __cohort__: [] }, ["b", "a"]);
    expect(cohort).toEqual(["a", "b"]);
    expect(extras).toEqual([]);
  });

  it("appendExtras folds each latecomer into the smallest group, never moving seated members", () => {
    const seated = [
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ];
    const out = appendExtras(seated, ["x", "y"]);
    // Each extra independently joins the CURRENT smallest group: x → ["e"] (now
    // size 2), then all groups are size 2 so y → the lowest-index one. Seated
    // members never move; latecomers balance out rather than piling up.
    expect(out).toEqual([
      ["a", "b", "y"],
      ["c", "d"],
      ["e", "x"],
    ]);
    // every seated member is still present at their original group index
    expect(out[0].slice(0, 2)).toEqual(["a", "b"]);
    expect(out[2].slice(0, 1)).toEqual(["e"]);
    // input not mutated
    expect(seated[2]).toEqual(["e"]);
  });

  it("appendCafeExtras adds latecomers as travellers (never hosts) at the smallest table", () => {
    const tables = [
      { host: "h1", members: ["h1", "t1"] },
      { host: "h2", members: ["h2"] },
    ];
    const out = appendCafeExtras(tables, ["x"]);
    expect(out[1].members).toEqual(["h2", "x"]);
    expect(out[1].host).toBe("h2"); // host unchanged
    expect(out[0].members).toEqual(["h1", "t1"]); // other table untouched
  });
});

// ---- integration: join-invariance through the real store ------------------

function phase(moduleId: string, config: Record<string, unknown>): PhaseInstance {
  return { id: "p1", moduleId: moduleId as PhaseInstance["moduleId"], config };
}

// Mirror the real flow: people are in the lobby, THEN the host opens the
// rotation phase. setPhases activates the phase with no one present (so the
// freeze that fires there is empty), people join, then the host (re-)enters the
// phase — onEnter now snapshots the full roster as the seated cohort.
async function room(p: PhaseInstance, n: number): Promise<string> {
  const { room } = await createRoom("Test", "Topic");
  await setPhases([p], "Test session", room.slug);
  for (let i = 0; i < n; i++) {
    await addParticipant(`t${i}`, `P${i}`, room.slug);
  }
  await setPhase(p.id, room.slug); // onEnter freezes the now-present roster
  return room.slug;
}

describe("World Café: a mid-session join never reshuffles seated tables", () => {
  const P = phase("worldcafe", { label: "Café", prompt: "?", tables: 2 });

  it("keeps every seated traveller at their table across a join (round 1)", async () => {
    const roomId = await room(P, 6);
    await dispatchAction(roomId, { type: "nextRound" }, "facilitator"); // → round 1

    const before = (await getPublicState(null, roomId, "projector")).view
      ?.data as { tables: { members: string[] }[] };
    const beforeSeated = before.tables.map((t) => [...t.members]);

    await addParticipant("LATE", "Latecomer", roomId);

    const after = (await getPublicState(null, roomId, "projector")).view
      ?.data as { tables: { members: string[] }[] };

    // Every originally-seated handle stays at the same table, in place.
    after.tables.forEach((t, i) => {
      const seatedOnly = t.members.filter((m) => m !== "Latecomer");
      expect(seatedOnly).toEqual(beforeSeated[i]);
    });
    // The latecomer is actually placed (folded in), not dropped.
    const placed = after.tables.some((t) => t.members.includes("Latecomer"));
    expect(placed).toBe(true);
  });

  it("freezes a __cohort__ snapshot on entry", async () => {
    const roomId = await room(P, 6);
    const votes = await readVotes(P.id, roomId);
    expect(readCohort(votes)).toHaveLength(6);
  });
});

describe("Stations: intact groups survive a join mid-tour", () => {
  const P = phase("stations", {
    label: "Stations",
    stations: ["A", "B", "C"],
    groupSize: 3,
  });

  it("keeps every group's seated membership identical across a join", async () => {
    const roomId = await room(P, 6);
    await dispatchAction(roomId, { type: "nextRound" }, "facilitator");

    const before = (await getPublicState(null, roomId, "projector")).view
      ?.data as { rotation: { members: string[] }[] };
    const beforeSeated = before.rotation.map((r) => [...r.members]);

    await addParticipant("LATE", "Latecomer", roomId);

    const after = (await getPublicState(null, roomId, "projector")).view
      ?.data as { rotation: { members: string[] }[] };

    after.rotation.forEach((r, i) => {
      expect(r.members.filter((m) => m !== "Latecomer")).toEqual(beforeSeated[i]);
    });
    expect(after.rotation.some((r) => r.members.includes("Latecomer"))).toBe(true);
  });
});

describe("1-2-4-All: a join at the pairs stage makes a triad, not a reshuffle", () => {
  const P = phase("onetwofour", { label: "1-2-4-All", prompt: "?" });

  it("keeps each seated participant's partner across a join", async () => {
    const roomId = await room(P, 4);
    await dispatchAction(roomId, { type: "nextRound" }, "facilitator"); // → pairs

    const partnersBefore = new Map<string, string[]>();
    for (let i = 0; i < 4; i++) {
      const v = (await getPublicState(`t${i}`, roomId, "participant")).view
        ?.data as { groupMembers: string[] };
      partnersBefore.set(`P${i}`, [...v.groupMembers].sort());
    }

    await addParticipant("LATE", "Latecomer", roomId);

    for (let i = 0; i < 4; i++) {
      const v = (await getPublicState(`t${i}`, roomId, "participant")).view
        ?.data as { groupMembers: string[] };
      const seatedOnly = v.groupMembers.filter((m) => m !== "Latecomer").sort();
      // their original group (minus any folded-in latecomer) is unchanged.
      expect(seatedOnly).toEqual(partnersBefore.get(`P${i}`));
    }
  });
});

describe("25/10: a join during scoring never changes who holds which card", () => {
  const P = phase("twentyfive10", {
    label: "25/10",
    prompt: "?",
    passes: 3,
    maxScore: 5,
  });

  it("keeps every original voter's assigned card stable across a late join", async () => {
    const roomId = await room(P, 5);
    // Everyone writes an idea (so there are cards to hand out).
    for (let i = 0; i < 5; i++) {
      await dispatchAction(
        roomId,
        { type: "submit", token: `t${i}`, payload: { text: `Idea ${i}` } },
        "participant",
      );
    }
    // Open scoring — this is where the voter cohort freezes.
    await dispatchAction(roomId, { type: "nextRound" }, "facilitator"); // round 1

    const cardBefore = new Map<string, string | null>();
    for (let i = 0; i < 5; i++) {
      const v = (await getPublicState(`t${i}`, roomId, "participant")).view
        ?.data as { assignedCard?: { id: string } | null };
      cardBefore.set(`t${i}`, v.assignedCard?.id ?? null);
    }

    // A latecomer joins mid-scoring (writing is closed; they get no card vote).
    await addParticipant("LATE", "Latecomer", roomId);

    for (let i = 0; i < 5; i++) {
      const v = (await getPublicState(`t${i}`, roomId, "participant")).view
        ?.data as { assignedCard?: { id: string } | null };
      expect(v.assignedCard?.id ?? null).toBe(cardBefore.get(`t${i}`));
    }
  });
});
