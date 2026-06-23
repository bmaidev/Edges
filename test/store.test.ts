import { describe, expect, it } from "vitest";
import {
  addContent,
  addParticipant,
  addSubmission,
  allocate,
  castVote,
  createPattern,
  deleteContent,
  deletePattern,
  endSession,
  getState,
  listContent,
  listParticipants,
  listPatterns,
  listSubmissions,
  readVotes,
  renamePattern,
  setPhase,
  setPhases,
  updateContent,
} from "@/lib/store";

// Core state-layer contract. Note: most write fns take `roomId` as the LAST
// (optional) arg, so we pass it last everywhere below.
describe("getState (read-only)", () => {
  it("returns DEFAULT_STATE with rev 0 for an unknown room, and never writes", async () => {
    const s = await getState("never-seen");
    expect(s.rev).toBe(0);
    expect(s.ended).toBe(false);
    expect(s.mode).toBeNull();
    expect(s.phaseId).toBeNull();
    // A pure read must not persist DEFAULT_STATE — a second read still sees rev 0.
    const again = await getState("never-seen");
    expect(again.rev).toBe(0);
  });
});

describe("monotonic rev (anti-flashing invariant)", () => {
  it("strictly increases across writes and is always > 0", async () => {
    const room = "rev-room";
    const phase = { id: "p1", moduleId: "poll" as const, config: {} };

    const a = await setPhases([phase], "Custom", room);
    expect(a.rev).toBeGreaterThan(0);

    const b = await setPhase("p1", room);
    expect(b.rev).toBeGreaterThan(0);
    expect(b.rev).toBeGreaterThan(a.rev!);

    // getState reflects the latest written rev.
    const read = await getState(room);
    expect(read.rev).toBe(b.rev);
    expect(read.rev).toBeGreaterThan(0);

    // One more write keeps climbing.
    const c = await setPhase("p1", room);
    expect(c.rev).toBeGreaterThan(b.rev!);
  });
});

describe("votes round-trip + isolation", () => {
  it("round-trips a vote by phaseId/token", async () => {
    await castVote("phaseA", "tok1", { choice: "yes" }, "room1");
    const votes = await readVotes("phaseA", "room1");
    expect(votes["tok1"]).toEqual({ choice: "yes" });
  });

  it("isolates votes across phaseId", async () => {
    await castVote("phaseA", "tok1", 1, "room1");
    await castVote("phaseB", "tok1", 2, "room1");
    expect((await readVotes("phaseA", "room1"))["tok1"]).toBe(1);
    expect((await readVotes("phaseB", "room1"))["tok1"]).toBe(2);
    // phaseA read excludes phaseB tokens.
    expect(Object.keys(await readVotes("phaseA", "room1"))).toEqual(["tok1"]);
  });

  it("isolates votes across roomId", async () => {
    await castVote("phaseA", "tok1", "x", "room1");
    expect(await readVotes("phaseA", "room2")).toEqual({});
  });
});

describe("submissions round-trip", () => {
  it("addSubmission carries handle/text/tag/phaseId and lists in order", async () => {
    const room = "sub-room";
    const s1 = await addSubmission("Ada", "first idea", "ph1", "tagX", "t1", room);
    const s2 = await addSubmission("  ", "  second  ", "ph2", null, null, room);

    expect(s1.handle).toBe("Ada");
    expect(s1.text).toBe("first idea");
    expect(s1.tag).toBe("tagX");
    expect(s1.phaseId).toBe("ph1");
    // empty handle falls back to Anonymous; text is trimmed.
    expect(s2.handle).toBe("Anonymous");
    expect(s2.text).toBe("second");
    expect(s2.tag).toBeNull();

    const list = await listSubmissions(room);
    expect(list.map((s) => s.id)).toEqual([s1.id, s2.id]);
  });

  it("isolates submissions across roomId", async () => {
    await addSubmission("Ada", "hi", "ph1", null, null, "sub-room");
    expect(await listSubmissions("other-sub-room")).toEqual([]);
  });
});

describe("participants round-trip", () => {
  it("addParticipant + listParticipants, dedupes a token, sorts by joinedAt", async () => {
    const room = "part-room";
    await addParticipant("t1", "Ada", room);
    await addParticipant("t2", "Grace", room);
    await addParticipant("t1", "Ada-renamed", room); // dup token: ignored

    const list = await listParticipants(room);
    expect(list.map((p) => p.token)).toEqual(["t1", "t2"]);
    expect(list.find((p) => p.token === "t1")?.handle).toBe("Ada");
  });
});

describe("content CRUD", () => {
  it("add / update / delete round-trip", async () => {
    const room = "content-room";
    const item = await addContent("note", "Title", "Body", "now", room);
    expect(item.visible).toBe(true);
    expect(item.queued).toBe(false);
    expect(await listContent(room)).toHaveLength(1);

    await updateContent(item.id, { title: "Renamed", visible: false }, room);
    const updated = (await listContent(room)).find((c) => c.id === item.id);
    expect(updated?.title).toBe("Renamed");
    expect(updated?.visible).toBe(false);

    await deleteContent(item.id, room);
    expect(await listContent(room)).toEqual([]);
  });
});

describe("pattern CRUD", () => {
  it("create / rename / delete round-trip", async () => {
    const room = "pattern-room";
    const p = await createPattern("Theme A", ["s1", "s2"], room);
    expect(p.name).toBe("Theme A");
    expect(p.order).toBe(0);
    expect(p.submissionIds).toEqual(["s1", "s2"]);

    await renamePattern(p.id, "Theme B", room);
    expect((await listPatterns(room))[0].name).toBe("Theme B");

    await deletePattern(p.id, room);
    expect(await listPatterns(room)).toEqual([]);
  });
});

describe("allocate cap", () => {
  it("rejects the Nth claimant over a cap", async () => {
    const room = "alloc-room";
    const cap = 2;
    for (const t of ["a", "b", "c"]) await addParticipant(t, t, room);

    expect((await allocate("a", "lens", "red", cap, room)).ok).toBe(true);
    expect((await allocate("b", "lens", "red", cap, room)).ok).toBe(true);
    // 3rd claimant of "red" exceeds cap of 2 -> rejected.
    const third = await allocate("c", "lens", "red", cap, room);
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("full");
  });

  it("rejects an unknown participant", async () => {
    const res = await allocate("ghost", "lens", "red", 2, "alloc-room");
    expect(res.ok).toBe(false);
  });
});

describe("endSession", () => {
  it("sets ended:true and clears room data", async () => {
    const room = "end-room";
    await addParticipant("t1", "Ada", room);
    await addSubmission("Ada", "hi", "ph1", null, null, room);

    await endSession(room);
    const s = await getState(room);
    expect(s.ended).toBe(true);
    expect(s.rev).toBeGreaterThan(0);
    expect(await listParticipants(room)).toEqual([]);
    expect(await listSubmissions(room)).toEqual([]);
  });
});
