import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as stateGET } from "@/app/api/r/[room]/state/route";
import {
  addContent,
  addParticipant,
  addSubmission,
  addWord,
  bumpRoomVersion,
  castVote,
  getRoomVersion,
  heartbeatProjector,
  replaceState,
  roomSignature,
  setPhases,
  setTimerSound,
  touchParticipant,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-realtime";
});

// R1 — the monotonic per-room change counter is the backbone of the push tier:
// it ETags the /state poll (304s), feeds the Pusher tick, and backs roomSignature.
// These tests pin the contract the rest of the system trusts: it starts at 0,
// strictly increases, bumps on every participant-VISIBLE write, and does NOT bump
// on liveness/heartbeat churn (which would defeat the 304s at 300 phones/room).

async function withPhase(room: string) {
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
}

describe("room version counter", () => {
  it("starts at 0 for an untouched room", async () => {
    expect(await getRoomVersion("ver-untouched")).toBe(0);
  });

  it("is strictly increasing across bumps", async () => {
    const room = "ver-mono";
    const a = await bumpRoomVersion(room);
    const b = await bumpRoomVersion(room);
    const c = await bumpRoomVersion(room);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(await getRoomVersion(room)).toBe(c);
  });

  it("bumps on every participant-visible write", async () => {
    const room = "ver-visible";
    await withPhase(room); // a state write
    const afterState = await getRoomVersion(room);
    expect(afterState).toBeGreaterThan(0);

    await addParticipant("a", "A", room);
    const afterJoin = await getRoomVersion(room);
    expect(afterJoin).toBeGreaterThan(afterState);

    await addSubmission("A", "hello", "p1", null, "a", room);
    const afterSub = await getRoomVersion(room);
    expect(afterSub).toBeGreaterThan(afterJoin);

    await castVote("p1", "a", 1, room);
    const afterVote = await getRoomVersion(room);
    expect(afterVote).toBeGreaterThan(afterSub);

    await addWord("p1", "a", "calm", room);
    const afterWord = await getRoomVersion(room);
    expect(afterWord).toBeGreaterThan(afterVote);

    await addContent("note", "Title", "Body", "now", room);
    const afterContent = await getRoomVersion(room);
    expect(afterContent).toBeGreaterThan(afterWord);

    await setTimerSound(true, room); // a state write
    expect(await getRoomVersion(room)).toBeGreaterThan(afterContent);
  });

  it("does NOT bump on heartbeat / projector liveness", async () => {
    const room = "ver-heartbeat";
    await withPhase(room);
    await addParticipant("a", "A", room);
    const before = await getRoomVersion(room);

    await touchParticipant("a", room); // C2 liveness — must not churn the counter
    await heartbeatProjector(room); // H2 liveness — likewise
    expect(await getRoomVersion(room)).toBe(before);

    // ...but a real visible write still moves it.
    await castVote("p1", "a", 2, room);
    expect(await getRoomVersion(room)).toBeGreaterThan(before);
  });

  it("roomSignature is the stringified version (cheap, 1 read)", async () => {
    const room = "ver-sig";
    await withPhase(room);
    expect(await roomSignature(room)).toBe(String(await getRoomVersion(room)));
    await addParticipant("z", "Z", room);
    expect(await roomSignature(room)).toBe(String(await getRoomVersion(room)));
  });

  it("keeps rooms independent (a write to one never bumps another)", async () => {
    const r1 = "ver-iso-1";
    const r2 = "ver-iso-2";
    await withPhase(r1);
    await withPhase(r2);
    const r2Before = await getRoomVersion(r2);
    await addParticipant("a", "A", r1);
    await addSubmission("A", "x", "p1", null, "a", r1);
    expect(await getRoomVersion(r2)).toBe(r2Before); // untouched neighbour holds
  });
});

// Push is a pure accelerator now: the participant route always returns a full
// body (no conditional 304s), so a stale eventually-consistent read can never get
// locked in. It just must serve the participant view. Drives the real route.
describe("participant /state always returns a full body", () => {
  function partReq(slug: string) {
    return new NextRequest(`http://x/api/r/${slug}/state?token=tok-1`);
  }

  it("returns 200 with the participant view, no ETag/304 gating", async () => {
    const { room } = await createRoom("Sync", "topic");
    await setPhases(
      [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      "S",
      room.slug,
    );
    const res = await stateGET(partReq(room.slug), { params: { room: room.slug } });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeNull();
    const body = await res.json();
    expect(body.role).toBe("participant");

    // A second identical poll is still a full 200 (never a 304), so a fresh read
    // always wins and self-heals — never a stale-locked view.
    const again = await stateGET(partReq(room.slug), { params: { room: room.slug } });
    expect(again.status).toBe(200);
    expect((await again.json()).role).toBe("participant");
  });
});

// The /api/health "realtime" capability flag: splits server (can publish) from
// client (browser can subscribe) so an asymmetric setup is obvious.
describe("realtimeHealth() + /api/health", () => {
  const KEYS = [
    "PUSHER_APP_ID",
    "PUSHER_APP_KEY",
    "PUSHER_APP_SECRET",
    "PUSHER_APP_CLUSTER",
    "NEXT_PUBLIC_PUSHER_APP_KEY",
    "NEXT_PUBLIC_PUSHER_APP_CLUSTER",
  ] as const;

  function withEnv(vars: Record<string, string>, fn: () => void) {
    const saved: Record<string, string | undefined> = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    Object.assign(process.env, vars);
    try {
      fn();
    } finally {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  }

  it("reports polling when nothing is configured", async () => {
    const { realtimeHealth } = await import("@/lib/realtime");
    withEnv({}, () => {
      expect(realtimeHealth()).toEqual({
        mode: "polling",
        server: false,
        client: false,
      });
    });
  });

  it("reports polling when ONLY the server half is set (the NEXT_PUBLIC mistake)", async () => {
    const { realtimeHealth } = await import("@/lib/realtime");
    withEnv(
      {
        PUSHER_APP_ID: "id",
        PUSHER_APP_KEY: "k",
        PUSHER_APP_SECRET: "s",
        PUSHER_APP_CLUSTER: "mt1",
      },
      () => {
        expect(realtimeHealth()).toEqual({
          mode: "polling",
          server: true,
          client: false,
        });
      },
    );
  });

  it("reports pusher when both halves are set", async () => {
    const { realtimeHealth } = await import("@/lib/realtime");
    withEnv(
      {
        PUSHER_APP_ID: "id",
        PUSHER_APP_KEY: "k",
        PUSHER_APP_SECRET: "s",
        PUSHER_APP_CLUSTER: "mt1",
        NEXT_PUBLIC_PUSHER_APP_KEY: "k",
        NEXT_PUBLIC_PUSHER_APP_CLUSTER: "mt1",
      },
      () => {
        expect(realtimeHealth()).toEqual({
          mode: "pusher",
          server: true,
          client: true,
        });
      },
    );
  });

  it("/api/health includes the realtime flag and never leaks a secret", async () => {
    const { GET: healthGET } = await import("@/app/api/health/route");
    const res = await healthGET();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.realtime).toMatchObject({
      mode: expect.stringMatching(/^(pusher|polling)$/),
      server: expect.any(Boolean),
      client: expect.any(Boolean),
    });
    // No secret ever appears in the public payload.
    expect(JSON.stringify(body)).not.toContain("PUSHER_APP_SECRET");
  });
});
