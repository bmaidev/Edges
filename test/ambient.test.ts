import { describe, expect, it } from "vitest";
import {
  endSession,
  getPublicState,
  getState,
  listContent,
  resumeAmbient,
  setAmbient,
  setPhases,
  setTimer,
  addContent,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import type { PhaseInstance } from "@/lib/types";

// E3 — the calm ambient break/hold. The load-bearing property: resume is
// NON-DESTRUCTIVE (restores the exact prior phase + timer, releases no queued
// content), and the screen is a synthetic module that never touches the sequence.

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
  { id: "p2", moduleId: "poll", config: { label: "Vote", options: ["a", "b"] } },
];

async function room() {
  const { room } = await createRoom("T", "t");
  await setPhases(PHASES, "S", room.slug);
  return room.slug;
}

describe("setAmbient", () => {
  it("summons a synthetic ambient phase and bumps rev", async () => {
    const slug = await room();
    const before = (await getState(slug)).rev ?? 0;
    const s = await setAmbient("break", 300, "Back soon", slug);
    expect(s.phaseId).toBe("__ambient__");
    expect(s.ambient?.kind).toBe("break");
    expect(s.ambient?.returnPhaseId).toBe("p1");
    expect(s.timerEndsAt).toBeGreaterThan(Date.now()); // server-stamped countdown
    expect(s.rev!).toBeGreaterThan(before);
  });

  it("the projector view resolves to the ambient module (not a sequence phase)", async () => {
    const slug = await room();
    await setAmbient("hold", null, undefined, slug);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.moduleId).toBe("ambient");
    const view = pub.view?.data as { kind: string; headline: string };
    expect(view.kind).toBe("hold");
    expect(view.headline).toContain("resume");
  });

  it("a hold has no countdown; a break does", async () => {
    const slug = await room();
    const hold = await setAmbient("hold", null, undefined, slug);
    expect(hold.timerEndsAt).toBeNull();
    const brk = await setAmbient("break", 120, undefined, slug);
    expect(brk.timerEndsAt).not.toBeNull();
  });

  // E3 scene engine — the new scenes.
  it("a breathe scene is open-ended (hold), records its scene + a startedAt anchor", async () => {
    const slug = await room();
    const s = await setAmbient("breathe", null, undefined, slug);
    expect(s.ambient?.scene).toBe("breathe");
    expect(s.ambient?.kind).toBe("hold"); // no duration → open-ended timer
    expect(typeof s.ambient?.startedAt).toBe("number");
    const view = (await getPublicState(null, slug, "projector")).view?.data as {
      scene: string;
      startedAt: number | null;
    };
    expect(view.scene).toBe("breathe");
    expect(view.startedAt).toBe(s.ambient?.startedAt);
  });

  it("a countdown scene is timed and carries endsAt to the view", async () => {
    const slug = await room();
    const s = await setAmbient("countdown", 300, undefined, slug);
    expect(s.ambient?.scene).toBe("countdown");
    expect(s.timerEndsAt).not.toBeNull();
    const view = (await getPublicState(null, slug, "projector")).view?.data as {
      scene: string;
      endsAt: number | null;
    };
    expect(view.scene).toBe("countdown");
    expect(view.endsAt).toBe(s.timerEndsAt);
  });

  it("a cue card leads with the note as its headline", async () => {
    const slug = await room();
    await setAmbient("cuecard", null, "Find a partner for the next round", slug);
    const view = (await getPublicState(null, slug, "projector")).view?.data as {
      scene: string;
      headline: string;
      note: string | null;
    };
    expect(view.scene).toBe("cuecard");
    expect(view.headline).toBe("Find a partner for the next round");
  });

  it("re-entry keeps the ORIGINAL return pointer (extending can't strand the room)", async () => {
    const slug = await room();
    await setTimer(Date.now() + 60_000, slug); // a live timer on p1
    const first = await setAmbient("break", 300, undefined, slug);
    const returnTo = first.ambient?.returnPhaseId;
    const returnTimer = first.ambient?.returnTimerEndsAt;
    const extended = await setAmbient("break", 600, undefined, slug); // extend
    expect(extended.ambient?.returnPhaseId).toBe(returnTo); // still p1, not __ambient__
    expect(extended.ambient?.returnTimerEndsAt).toBe(returnTimer);
  });
});

describe("resumeAmbient — non-destructive", () => {
  it("restores the exact prior phase + timer, releasing NO queued content", async () => {
    const slug = await room();
    const deadline = Date.now() + 60_000;
    await setTimer(deadline, slug);
    // queue some content that must NOT be dumped by a break/resume
    await addContent("note", "Queued slide", "later", "queue", slug);
    await setAmbient("break", 300, undefined, slug);
    const resumed = await resumeAmbient(slug);
    expect(resumed.phaseId).toBe("p1"); // back to the exact phase
    expect(resumed.timerEndsAt).toBe(deadline); // timer restored, not nulled
    expect(resumed.ambient ?? null).toBeNull();
    // the queued content is still queued (a break never released it)
    const queued = (await listContent(slug)).filter((c) => c.queued);
    expect(queued.length).toBe(1);
  });

  it("is a no-op when not in an ambient state", async () => {
    const slug = await room();
    const s = await resumeAmbient(slug);
    expect(s.phaseId).toBe("p1");
  });
});

describe("lifecycle", () => {
  it("ending the session clears ambient", async () => {
    const slug = await room();
    await setAmbient("hold", null, undefined, slug);
    await endSession(slug);
    expect((await getState(slug)).ambient ?? null).toBeNull();
  });
});

// E3 — ambient is also PLACEABLE in a builder sequence (a scheduled break), not
// just summoned live; the normal phase path renders it from its config.
describe("placed ambient phase", () => {
  it("renders the configured scene via the normal sequence path", async () => {
    const { room } = await createRoom("T", "t");
    const { setPhase } = await import("@/lib/store");
    await setPhases(
      [
        { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
        { id: "rest", moduleId: "ambient", config: { label: "Reset", kind: "hold", scene: "breathe", note: "Shoulders down" } },
      ],
      "S",
      room.slug,
    );
    await setPhase("rest", room.slug); // a real advance, NOT setAmbient
    const pub = await getPublicState(null, room.slug, "projector");
    expect(pub.phaseId).toBe("rest"); // a normal sequence phase, not __ambient__
    expect(pub.moduleId).toBe("ambient");
    const view = pub.view?.data as { scene: string; note: string | null };
    expect(view.scene).toBe("breathe");
    expect(view.note).toBe("Shoulders down");
  });
});
