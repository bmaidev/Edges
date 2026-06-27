import { describe, expect, it } from "vitest";
import { STALE_MS, resolveConn } from "@/components/useConnection";
import { computeRoomHealth } from "@/lib/health";
import {
  addParticipant,
  endSession,
  getFacilitatorState,
  readHeartbeats,
  replaceState,
  touchParticipant,
} from "@/lib/store";
import type { Participant } from "@/lib/types";

// H1 — the room never breaks. Pure resolver + room-health + liveness lifecycle.

const NOW = 1_000_000;
function parts(...tokens: string[]): Participant[] {
  return tokens.map((t, i) => ({ token: t, handle: t, joinedAt: i }));
}

describe("connection tri-state resolver", () => {
  it("device offline → offline (instant), regardless of other signals", () => {
    expect(
      resolveConn({ online: false, error: false, lastAppliedAt: NOW, now: NOW }),
    ).toBe("offline");
  });
  it("online, fresh, no error → online", () => {
    expect(
      resolveConn({ online: true, error: false, lastAppliedAt: NOW, now: NOW }),
    ).toBe("online");
  });
  it("poll error → reconnecting", () => {
    expect(
      resolveConn({ online: true, error: true, lastAppliedAt: NOW, now: NOW }),
    ).toBe("reconnecting");
  });
  it("silent stall (stale last-applied, no error) → reconnecting", () => {
    expect(
      resolveConn({
        online: true,
        error: false,
        lastAppliedAt: NOW,
        now: NOW + STALE_MS + 1,
      }),
    ).toBe("reconnecting");
  });
  it("flap suppression: a brief blip under the threshold stays online", () => {
    expect(
      resolveConn({
        online: true,
        error: false,
        lastAppliedAt: NOW,
        now: NOW + 3000, // < 6s
      }),
    ).toBe("online");
  });
  it("null lastAppliedAt (never applied yet) is not treated as stale", () => {
    expect(
      resolveConn({ online: true, error: false, lastAppliedAt: null, now: NOW }),
    ).toBe("online");
  });
});

describe("computeRoomHealth", () => {
  it("all fresh → here === present", () => {
    const h = { a: NOW, b: NOW, c: NOW };
    expect(computeRoomHealth(parts("a", "b", "c"), h, NOW)).toEqual({
      present: 3,
      here: 3,
      dropped: [], // H1 full — names who dropped; nobody here
    });
  });
  it("a stale heartbeat drops from `here`; a missing heartbeat stays present", () => {
    const h = { a: NOW - 30_000, b: NOW }; // a stale; c missing
    const result = computeRoomHealth(parts("a", "b", "c"), h, NOW);
    expect(result.present).toBe(3);
    expect(result.here).toBe(2); // a gone quiet; b fresh; c unknown→counted here
    expect(result.dropped.map((d) => d.handle)).toEqual(["a"]); // a is the dropped one
  });
});

describe("liveness lifecycle", () => {
  it("getFacilitatorState reports roomHealth from the C2 heartbeat hash", async () => {
    const room = "h1-health";
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases: [{ id: "p1", moduleId: "content", config: { label: "C" } }],
        phaseId: "p1",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "",
        ended: false,
      },
      room,
    );
    await addParticipant("a", "A", room);
    await addParticipant("b", "B", room);
    await touchParticipant("a", room); // a is fresh; b has no heartbeat yet
    const fs = await getFacilitatorState(room);
    expect(fs.roomHealth?.present).toBe(2);
    expect(fs.roomHealth?.here).toBe(2); // missing heartbeat counts present
  });

  it("endSession wipes the liveness hash (off-the-record)", async () => {
    const room = "h1-wipe";
    await addParticipant("a", "A", room);
    await touchParticipant("a", room);
    expect(Object.keys(await readHeartbeats(room)).length).toBe(1);
    await endSession(room);
    expect(Object.keys(await readHeartbeats(room)).length).toBe(0);
  });
});
