import { beforeAll, describe, expect, it } from "vitest";
import {
  getFacilitatorState,
  getPublicState,
  getState,
  mutateActionItems,
  replaceState,
  roomSignature,
  setPhase,
  endSession,
} from "@/lib/store";
import {
  archiveRoom,
  createRoomWithSlug,
  freshPasscodes,
  getArchive,
} from "@/lib/rooms";
import type { SessionState } from "@/lib/types";

// F2 — action items. In-memory store, no AI. The load-bearing test is the
// rev-correct single mutation path.
const ADMIN = "test-super-admin-F2";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

const phases: SessionState["phases"] = [
  { id: "p1", moduleId: "capture", config: { label: "A", prompt: "x" } },
  { id: "p2", moduleId: "capture", config: { label: "B", prompt: "y" } },
];
async function seed(room: string) {
  await replaceState(
    {
      mode: null,
      sessionName: "T",
      phases,
      phaseId: "p1",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      topic: "",
      ended: false,
      actionItems: [],
    },
    room,
  );
}
async function firstId(room: string) {
  return (await getState(room)).actionItems![0].id;
}

describe("action-item mutation (rev-correct single path)", () => {
  it("every mutation stamps a strictly higher rev (anti-flash guarantee)", async () => {
    const room = "f2-rev";
    await seed(room);
    let rev = (await getState(room)).rev ?? 0;
    const s1 = await mutateActionItems({ kind: "add", text: "Ship it" }, room);
    expect(s1.rev!).toBeGreaterThan(rev);
    rev = s1.rev!;
    const id = s1.actionItems![0].id;
    const s2 = await mutateActionItems({ kind: "setStatus", id, status: "done" }, room);
    expect(s2.rev!).toBeGreaterThan(rev);
  });

  it("add round-trips with owner + due", async () => {
    const room = "f2-add";
    await seed(room);
    await mutateActionItems(
      { kind: "add", text: "Email the client", ownerName: "Ada", due: "2026-07-01" },
      room,
    );
    const a = (await getState(room)).actionItems![0];
    expect(a).toMatchObject({ text: "Email the client", ownerName: "Ada", due: "2026-07-01", status: "open" });
  });

  it("persists across a phase advance", async () => {
    const room = "f2-persist";
    await seed(room);
    await mutateActionItems({ kind: "add", text: "Carry me forward" }, room);
    await setPhase("p2", room);
    expect((await getState(room)).actionItems!.length).toBe(1);
  });

  it("update + setStatus + remove", async () => {
    const room = "f2-crud";
    await seed(room);
    await mutateActionItems({ kind: "add", text: "first" }, room);
    const id = await firstId(room);
    await mutateActionItems({ kind: "update", id, text: "renamed", ownerName: "Bo" }, room);
    let a = (await getState(room)).actionItems![0];
    expect(a.text).toBe("renamed");
    expect(a.ownerName).toBe("Bo");
    await mutateActionItems({ kind: "setStatus", id, status: "done" }, room);
    a = (await getState(room)).actionItems![0];
    expect(a.status).toBe("done");
    await mutateActionItems({ kind: "remove", id }, room);
    expect((await getState(room)).actionItems!.length).toBe(0);
  });

  it("concurrent adds both land (lock retries, no dropped capture)", async () => {
    const room = "f2-race";
    await seed(room);
    await Promise.all([
      mutateActionItems({ kind: "add", text: "A" }, room),
      mutateActionItems({ kind: "add", text: "B" }, room),
    ]);
    const texts = (await getState(room)).actionItems!.map((a) => a.text).sort();
    expect(texts).toEqual(["A", "B"]);
  });
});

describe("role scoping + lifecycle", () => {
  it("facilitator sees the register; participant + projector get null", async () => {
    const room = "f2-roles";
    await seed(room);
    await mutateActionItems({ kind: "add", text: "secret-ish" }, room);
    expect((await getFacilitatorState(room)).actionItems!.length).toBe(1);
    expect((await getPublicState("tok", room, "participant")).actionItems).toBeNull();
    expect((await getPublicState(null, room, "projector")).actionItems).toBeNull();
  });

  it("promote: the projector gets the board only when promoted", async () => {
    const room = "f2-promote";
    await seed(room);
    await mutateActionItems({ kind: "add", text: "Book the venue" }, room);
    // not promoted → projector sees nothing
    expect((await getPublicState(null, room, "projector")).actionItems).toBeNull();
    await mutateActionItems({ kind: "promote", on: true }, room);
    const proj = await getPublicState(null, room, "projector");
    expect(proj.actionItems?.length).toBe(1);
    expect(proj.actionItemsPromoted).toBe(true);
    // participants still never see it mid-session
    expect((await getPublicState("a", room, "participant")).actionItems).toBeNull();
    await mutateActionItems({ kind: "promote", on: false }, room);
    expect((await getPublicState(null, room, "projector")).actionItems).toBeNull();
  });

  it("roomSignature changes when the register changes (SSE ticks)", async () => {
    const room = "f2-sig";
    await seed(room);
    const before = await roomSignature(room);
    await mutateActionItems({ kind: "add", text: "x" }, room);
    expect(await roomSignature(room)).not.toBe(before);
  });

  it("endSession wipes the register", async () => {
    const room = "f2-wipe";
    await seed(room);
    await mutateActionItems({ kind: "add", text: "gone soon" }, room);
    await endSession(room);
    expect((await getState(room)).actionItems ?? []).toEqual([]);
  });
});

describe("flows into the archive", () => {
  it("archiveRoom carries action items verbatim", async () => {
    const room = "f2-archive";
    const { hashes } = freshPasscodes();
    await createRoomWithSlug(room, "Offsite", "topic", { passcodeHashes: hashes });
    await seed(room);
    await mutateActionItems({ kind: "add", text: "Book the venue", ownerName: "Sam" }, room);
    await archiveRoom(room);
    const arch = await getArchive(room);
    expect(arch!.actionItems).toEqual([
      { text: "Book the venue", ownerName: "Sam", due: undefined, status: "open" },
    ]);
  });
});
