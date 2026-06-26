import { beforeAll, describe, expect, it } from "vitest";
import { createRoomWithSlug, deleteRoom, freshPasscodes, getRoom, listRooms, updateRoom } from "@/lib/rooms";

const ADMIN = "test-super-admin-A1lc";
beforeAll(() => { process.env.ADMIN_PASSCODE = ADMIN; });

describe("room lifecycle", () => {
  it("mark live: updateRoom flips a draft to live", async () => {
    const { hashes } = freshPasscodes();
    const room = await createRoomWithSlug("lc-live", "X", "t", { passcodeHashes: hashes });
    expect(room.status).toBe("live"); // createRoomWithSlug defaults live; force draft then flip
    await updateRoom("lc-live", { status: "draft" });
    expect((await getRoom("lc-live"))?.status).toBe("draft");
    await updateRoom("lc-live", { status: "live" });
    expect((await getRoom("lc-live"))?.status).toBe("live");
  });
  it("deleteRoom removes the record + drops it from the index", async () => {
    const { hashes } = freshPasscodes();
    await createRoomWithSlug("lc-del", "Y", "t", { passcodeHashes: hashes });
    expect(await getRoom("lc-del")).not.toBeNull();
    expect(await deleteRoom("lc-del")).toBe(true);
    expect(await getRoom("lc-del")).toBeNull();
    expect((await listRooms()).some((r) => r.slug === "lc-del")).toBe(false);
    expect(await deleteRoom("lc-del")).toBe(false); // already gone
  });
});
