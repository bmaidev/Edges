import { describe, expect, it } from "vitest";
import {
  PROJECTOR_FLOOR,
  computeParticipationSignal,
} from "@/lib/modules/registry.server";
import {
  addParticipant,
  addSubmission,
  castVote,
  getFacilitatorState,
  getPublicState,
  replaceState,
  roomSignature,
  touchParticipant,
} from "@/lib/store";
import type { ModuleContext, ModuleStore } from "@/lib/modules/types";
import type { Participant, SessionState, Submission } from "@/lib/types";

// C2 — live participation signals. In-memory store, no KV/AI.

function parts(...tokens: string[]): Participant[] {
  return tokens.map((t, i) => ({ token: t, handle: t.toUpperCase(), joinedAt: i }));
}
function subs(phaseId: string, ...tokens: (string | null)[]): Submission[] {
  return tokens.map((t, i) => ({
    id: `s${i}`,
    handle: "x",
    text: "y",
    phaseId,
    tag: null,
    token: t,
    createdAt: i,
  }));
}
function ctx(partial: Partial<ModuleContext>): ModuleContext {
  const store = {
    readVotes: async () => ({}),
  } as unknown as ModuleStore;
  return {
    roomId: "t",
    role: "facilitator",
    phase: { id: "p1", moduleId: "capture", config: {} },
    config: {},
    state: {} as SessionState,
    participants: [],
    visibleContent: [],
    patterns: [],
    submissions: [],
    me: null,
    store,
    ...partial,
  };
}

describe("computeParticipationSignal", () => {
  it("none gatherSource → null", async () => {
    expect(await computeParticipationSignal(ctx({}), "none", {})).toBeNull();
  });

  it("submissions: distinct tokens (multiSubmit-safe)", async () => {
    const c = ctx({
      participants: parts("a", "b", "c"),
      submissions: subs("p1", "a", "a", "a", "b"), // a submitted 3x
    });
    const s = await computeParticipationSignal(c, "submissions", {});
    expect(s).toMatchObject({ present: 3, responded: 2 });
  });

  it("submissions: only counts THIS phase", async () => {
    const c = ctx({
      participants: parts("a", "b"),
      submissions: [...subs("p1", "a"), ...subs("other", "b")],
    });
    const s = await computeParticipationSignal(c, "submissions", {});
    expect(s?.responded).toBe(1);
  });

  it("votes: excludes __markers__ and non-participants, clamps <= present", async () => {
    const c = ctx({
      participants: parts("a", "b", "c", "d"),
      store: {
        readVotes: async () => ({
          a: 1,
          b: 1,
          c: 1,
          d: 1,
          __constraint__: 1,
          __nudge__: 1,
          __host__: 1,
          stranger: 1, // not a participant
        }),
      } as unknown as ModuleStore,
    });
    const s = await computeParticipationSignal(c, "votes", {});
    expect(s?.responded).toBe(4); // never 5+, no "8 of 4"
    expect(s?.responded).toBeLessThanOrEqual(s!.present);
  });

  it("quiet: stale heartbeat counts, missing heartbeat does not", async () => {
    const now = 1_000_000;
    const c = ctx({ participants: parts("a", "b", "c") });
    const hb = { a: now - 26_000, b: now - 10_000 }; // c has no heartbeat
    const s = await computeParticipationSignal(c, "submissions", hb, now);
    expect(s?.quiet).toBe(1); // only a is stale; b fresh; c unknown→present
  });
});

describe("getPublicState role scoping", () => {
  const phase = {
    id: "p1",
    moduleId: "capture" as const,
    config: { label: "Ideas", prompt: "go" },
  };
  async function seed(room: string, cfg: Record<string, unknown> = {}) {
    await replaceState(
      {
        mode: null,
        sessionName: "Test",
        phases: [{ ...phase, config: { ...phase.config, ...cfg } }],
        phaseId: "p1",
        readaroundIndex: 0,
        timerEndsAt: null,
        topic: "",
        ended: false,
      },
      room,
    );
    await addParticipant("a", "A", room);
    await addParticipant("b", "B", room);
    await addParticipant("c", "C", room);
    await addSubmission("A", "hi", "p1", null, "a", room);
  }

  it("facilitator sees full numbers; participant sees null", async () => {
    const room = "role-1";
    await seed(room);
    const fs = await getFacilitatorState(room);
    expect(fs.participation).toMatchObject({ present: 3, responded: 1 });
    const pub = await getPublicState("a", room, "participant");
    expect(pub.participation).toBeNull();
  });

  it("projector: hidden by default, shown only when showLiveCount && present>=floor", async () => {
    const off = "role-2";
    await seed(off);
    expect((await getPublicState(null, off, "projector")).participation).toBeNull();

    const on = "role-3";
    await seed(on, { showLiveCount: true });
    const proj = await getPublicState(null, on, "projector");
    expect(proj.participation).toMatchObject({ present: 3, responded: 1, quiet: 0 });
    expect(PROJECTOR_FLOOR).toBe(3);
  });

  it("anonymous phase: facilitator gets present+responded but quiet suppressed", async () => {
    const room = "role-4";
    await seed(room, { anonymity: "anonymous" });
    await touchParticipant("a", room); // make a heartbeat exist
    const fs = await getFacilitatorState(room);
    expect(fs.participation?.quiet).toBe(0);
    expect(fs.participation?.present).toBe(3);
  });

  it("non-gather phase (readaround) → participation null", async () => {
    const room = "role-5";
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases: [
          {
            id: "r1",
            moduleId: "readaround",
            config: {
              label: "Read",
              readaround: { source: "submissions", sourcePhaseId: "p1" },
            },
          },
        ],
        phaseId: "r1",
        readaroundIndex: 0,
        timerEndsAt: null,
        topic: "",
        ended: false,
      },
      room,
    );
    await addParticipant("a", "A", room);
    const fs = await getFacilitatorState(room);
    expect(fs.participation).toBeNull();
  });
});

describe("heartbeat never destabilises realtime", () => {
  it("a heartbeat write does NOT change roomSignature; a vote does", async () => {
    const room = "sig-1";
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases: [{ id: "p1", moduleId: "poll", config: { label: "P" } }],
        phaseId: "p1",
        readaroundIndex: 0,
        timerEndsAt: null,
        topic: "",
        ended: false,
      },
      room,
    );
    await addParticipant("a", "A", room);
    const before = await roomSignature(room);
    await touchParticipant("a", room);
    expect(await roomSignature(room)).toBe(before); // seen excluded from signature
    await castVote("p1", "a", 1, room);
    expect(await roomSignature(room)).not.toBe(before);
  });
});
