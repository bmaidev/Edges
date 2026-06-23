import { beforeEach, describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  listSubmissions,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// Drive capture through the real dispatchAction path (builds the ctx + store
// facade exactly as /api/action does) so we exercise the whole submit pipeline.

const PHASE: PhaseInstance = {
  id: "cap1",
  moduleId: "capture",
  config: { label: "Capture", prompt: "What stood out?" },
};

async function setup(config: Record<string, unknown> = PHASE.config) {
  const { room } = await createRoom("Test", "Topic");
  const phase = { ...PHASE, config };
  await setPhases([phase], "Test session", room.slug);
  await setPhase(phase.id, room.slug);
  await addParticipant("tok-a", "Alice", room.slug);
  return room.slug;
}

describe("capture module — submit", () => {
  it("stores a valid submission", async () => {
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "submit", token: "tok-a", payload: { text: "a real idea" } },
      "participant",
    );
    expect(res.ok).toBe(true);
    const subs = await listSubmissions(roomId);
    expect(subs).toHaveLength(1);
    expect(subs[0].text).toBe("a real idea");
    // Named (default): handle resolves from the participant record.
    expect(subs[0].handle).toBe("Alice");
  });

  it("rejects empty text", async () => {
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "submit", token: "tok-a", payload: { text: "   " } },
      "participant",
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("empty");
    expect(await listSubmissions(roomId)).toHaveLength(0);
  });

  it("rejects text over 2000 chars", async () => {
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "submit", token: "tok-a", payload: { text: "x".repeat(2001) } },
      "participant",
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("too long");
    expect(await listSubmissions(roomId)).toHaveLength(0);
  });

  it("strips the handle when anonymity is anonymous (off-the-record)", async () => {
    const roomId = await setup({ ...PHASE.config, anonymity: "anonymous" });
    const res = await dispatchAction(
      roomId,
      { type: "submit", token: "tok-a", payload: { text: "secret thought" } },
      "participant",
    );
    expect(res.ok).toBe(true);
    const subs = await listSubmissions(roomId);
    expect(subs[0].handle).toBe("Anonymous");
    expect(subs[0].handle).not.toBe("Alice");
  });
});
