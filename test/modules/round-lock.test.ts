import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  readVotes,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// Concurrency regression test for the round-advance race. nextRound is a
// read-modify-write of votes["__round__"]; without withLock, two simultaneous
// taps (double-tap, or host+cohost) could both read N and both write N+1,
// collapsing two advances into one — or, worse, fanning a single intended
// advance across several taps. The lock must collapse N concurrent calls so the
// round advances by EXACTLY 1.

const PHASE: PhaseInstance = {
  id: "wc1",
  moduleId: "worldcafe",
  config: { label: "World Café", prompt: "What matters?", tables: 2 },
};

async function setup() {
  const { room } = await createRoom("Test", "Topic");
  await setPhases([PHASE], "Test session", room.slug);
  await setPhase(PHASE.id, room.slug);
  // A few participants so tables form.
  for (let i = 0; i < 6; i++) {
    await addParticipant(`t${i}`, `P${i}`, room.slug);
  }
  return room.slug;
}

async function currentRound(roomId: string): Promise<number> {
  const votes = await readVotes(PHASE.id, roomId);
  return (votes["__round__"] as number) ?? 0;
}

describe("worldcafe nextRound — lock collapses the double-tap race", () => {
  it("advances by exactly 1 under 5 concurrent facilitator taps", async () => {
    const roomId = await setup();
    expect(await currentRound(roomId)).toBe(0);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatchAction(roomId, { type: "nextRound" }, "facilitator"),
      ),
    );

    // Exactly one tap wins the lock; the rest are reported busy (ok:false).
    const wins = results.filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect(await currentRound(roomId)).toBe(1);
  });

  it("rejects nextRound from a participant", async () => {
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      { type: "nextRound", token: "t0" },
      "participant",
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("forbidden");
    expect(await currentRound(roomId)).toBe(0);
  });
});
