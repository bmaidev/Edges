import { describe, expect, it } from "vitest";
import {
  createRoom,
  getRoom,
  renameRoom,
  resolveRedirect,
  updateRoom,
} from "@/lib/rooms";
import { getState, setPhases } from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// A4 — slug rename + redirect. Non-live only; the durable record (+ a draft's
// session state) moves, old links redirect.

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

describe("renameRoom", () => {
  it("moves a draft to a new slug, redirects the old, updates the index", async () => {
    const { room } = await createRoom("Rename me", "Topic");
    const old = room.slug;
    await setPhases(PHASES, "Built", old); // a built-but-unlaunched draft has state

    const res = await renameRoom(old, "quarterly-offsite-aa");
    expect(res.ok).toBe(true);
    const slug = res.ok ? res.slug : "";
    expect(slug).toBe("quarterly-offsite-aa");

    // the record lives at the new slug, gone from the old
    expect((await getRoom(slug))?.name).toBe("Rename me");
    expect(await getRoom(old)).toBeNull();
    // the draft's session state came along
    expect((await getState(slug)).sessionName).toBe("Built");
    // old → new redirect resolves
    expect(await resolveRedirect(old)).toBe(slug);
  });

  it("refuses to rename a LIVE room (quiesce gate)", async () => {
    const { room } = await createRoom("Live one", "Topic");
    await updateRoom(room.slug, { status: "live" });
    const res = await renameRoom(room.slug, "some-new-slug-aa");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/live session/i);
    // unchanged
    expect(await getRoom(room.slug)).not.toBeNull();
  });

  it("rejects an already-taken target slug", async () => {
    const a = (await createRoom("A", "t")).room;
    const b = (await createRoom("B", "t")).room;
    const res = await renameRoom(a.slug, b.slug);
    expect(res.ok).toBe(false);
    // a is untouched
    expect(await getRoom(a.slug)).not.toBeNull();
  });

  it("rejects an invalid slug and is a no-op renaming to the same slug", async () => {
    const { room } = await createRoom("C", "t");
    expect((await renameRoom(room.slug, "x")).ok).toBe(false); // too short
    const same = await renameRoom(room.slug, room.slug);
    expect(same.ok).toBe(true);
  });
});
