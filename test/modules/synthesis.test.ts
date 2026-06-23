import { afterEach, describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  castVote,
  dispatchAction,
  getPublicState,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";
import type { SynthesisResult } from "@/lib/modules/defs/synthesis.server";

// Without AI we can't (and don't) call "generate" — it short-circuits with
// { ok:false, reason:"AI unavailable" }. So seed a cached result directly into
// the votes key synthesis.computeView reads ("__ai__") and test the non-AI
// gating: the promote toggle controls participant visibility.

const PHASE: PhaseInstance = {
  id: "syn1",
  moduleId: "synthesis",
  config: { label: "Synthesis", bulletCount: 3 },
};

const SEED: SynthesisResult = {
  bullets: ["The room values speed", "Trust is the open question"],
  tension: "Speed versus safety",
  generatedAt: Date.now(),
  inputCount: 4,
};

async function setup() {
  const { room } = await createRoom("Test", "Topic");
  await setPhases([PHASE], "Test session", room.slug);
  await setPhase(PHASE.id, room.slug);
  await addParticipant("t1", "A", room.slug);
  // Seed the cached AI result the way handleAction("generate") would.
  await castVote(PHASE.id, "__ai__", SEED, room.slug);
  return room.slug;
}

interface PartView {
  hasResult: boolean;
  promoted: boolean;
  waiting?: boolean;
  bullets?: string[];
  tension?: string;
}

function partData(state: { view: { data: unknown } | null }): PartView {
  return state.view!.data as PartView;
}

// computeView gates the cached result behind aiAvailable() (reads
// ANTHROPIC_API_KEY live), so a seeded result is only ever surfaced when AI is
// "configured". For the reveal assertions we set a DUMMY key — this flips
// aiAvailable() to true WITHOUT any network call (computeView/promote are pure
// reads; only "generate" would call Claude, and we never invoke it).
function withDummyKey() {
  process.env.ANTHROPIC_API_KEY = "test-dummy-key";
}

describe("synthesis module — promote gates participant visibility", () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("withholds the result from participants until promoted", async () => {
    withDummyKey();
    const roomId = await setup();
    const pub = await getPublicState("t1", roomId, "participant");
    const data = partData(pub);
    expect(data.promoted).toBe(false);
    expect(data.hasResult).toBe(false);
    expect(data.waiting).toBe(true);
    expect(data.bullets).toBeUndefined();
  });

  it("reveals the result to participants after promote is toggled on", async () => {
    withDummyKey();
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "promote" },
      "facilitator",
    );
    expect(res.ok).toBe(true);

    const pub = await getPublicState("t1", roomId, "participant");
    const data = partData(pub);
    expect(data.promoted).toBe(true);
    expect(data.hasResult).toBe(true);
    expect(data.bullets).toEqual(SEED.bullets);
    expect(data.tension).toBe(SEED.tension);
  });

  it("re-hides the result when promote is toggled back off", async () => {
    withDummyKey();
    const roomId = await setup();
    await dispatchAction(roomId, { type: "promote" }, "facilitator"); // on
    await dispatchAction(roomId, { type: "promote" }, "facilitator"); // off
    const pub = await getPublicState("t1", roomId, "participant");
    expect(partData(pub).promoted).toBe(false);
    expect(partData(pub).hasResult).toBe(false);
  });

  it("rejects promote from a participant", async () => {
    withDummyKey();
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "promote", token: "t1" },
      "participant",
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("forbidden");
  });

  it("withholds the result from participants when AI is unavailable, even if promoted", async () => {
    // No ANTHROPIC_API_KEY here (afterEach deletes it / setup never sets it):
    // computeView reads the cached result behind aiAvailable(), so with AI off
    // a promoted-but-seeded result still never reaches participants. Documents
    // the real coupling of the visibility gate to AI availability.
    const roomId = await setup();
    await dispatchAction(roomId, { type: "promote" }, "facilitator");
    const pub = await getPublicState("t1", roomId, "participant");
    const data = partData(pub);
    // Falls through to the waiting branch (which reports promoted:false),
    // because result was suppressed by aiAvailable()===false.
    expect(data.hasResult).toBe(false);
    expect(data.waiting).toBe(true);
    expect(data.bullets).toBeUndefined();
  });
});
