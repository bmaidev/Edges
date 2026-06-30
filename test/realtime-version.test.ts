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

// The contract that actually carries the scale win: an unchanged participant poll
// is a 304 (no body, no snapshot) and a write busts it. Drives the real route.
describe("participant /state conditional 304 fast path", () => {
  function partReq(slug: string, etag?: string) {
    const headers: Record<string, string> = {};
    if (etag) headers["If-None-Match"] = etag;
    return new NextRequest(`http://x/api/r/${slug}/state?token=tok-1`, { headers });
  }

  it("304s an unchanged poll and 200s after a visible write", async () => {
    const { room } = await createRoom("Sync", "topic");
    await setPhases(
      [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      "S",
      room.slug,
    );

    // First poll: no validator → 200 full body, carries an ETag to echo back.
    const first = await stateGET(partReq(room.slug), { params: { room: room.slug } });
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const body = await first.json();
    expect(body.role).toBe("participant");
    expect(typeof body.ver).toBe("number");

    // Second poll with that ETag and nothing changed → 304, no body.
    const second = await stateGET(partReq(room.slug, etag!), {
      params: { room: room.slug },
    });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("ETag")).toBe(etag);

    // A participant-visible write bumps the version → the SAME ETag no longer
    // matches → the next poll is a full 200 with a new ETag.
    await addSubmission("A", "an idea", "p1", null, "tok-1", room.slug);
    const third = await stateGET(partReq(room.slug, etag!), {
      params: { room: room.slug },
    });
    expect(third.status).toBe(200);
    expect(third.headers.get("ETag")).not.toBe(etag);
  });

  it("busts the 304 when only the room topic changes (roomTag in the ETag)", async () => {
    const { room } = await createRoom("Topic", "first topic");
    await setPhases(
      [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      "S",
      room.slug,
    );
    const first = await stateGET(partReq(room.slug), { params: { room: room.slug } });
    const etag = first.headers.get("ETag")!;
    // Same version, but the topic (a Room-record field the counter doesn't track)
    // changes → roomTag changes → ETag changes → no stale 304.
    const { updateRoom } = await import("@/lib/rooms");
    await updateRoom(room.slug, { topic: "second topic" });
    const after = await stateGET(partReq(room.slug, etag), {
      params: { room: room.slug },
    });
    expect(after.status).toBe(200);
    expect(after.headers.get("ETag")).not.toBe(etag);
  });
});
