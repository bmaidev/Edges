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
