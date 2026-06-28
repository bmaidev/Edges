import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as roomsPOST, GET as roomsGET } from "@/app/api/admin/rooms/route";
import { createRoom, getRoom } from "@/lib/rooms";
import { createWorkspace, addMember } from "@/lib/workspaces";

// Phase C3 — shared rooms are stamped "created by <name>" when a named member
// makes them; the bootstrap owner / legacy creates stay clean (no empty line).

const SUPER = "test-super-admin-createdby";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

const post = (body: unknown) =>
  roomsPOST(new NextRequest("http://x/api/admin/rooms", { method: "POST", body: JSON.stringify(body) }));

describe("room createdBy attribution", () => {
  it("a member-created room records who made it", async () => {
    const ws = await createWorkspace("Org");
    const dana = (await addMember(ws.workspace.id, "Dana", "member"))!;
    const res = await post({ code: dana.code, name: "Dana's room", topic: "t" });
    expect(res.status).toBe(200);
    const slug = (await res.json()).slug;
    const room = await getRoom(slug);
    expect(room?.createdBy?.name).toBe("Dana");
    expect(room?.createdBy?.memberId).toBe(dana.member.id);

    // it surfaces in the workspace rooms list projection
    const list = await roomsGET(
      new NextRequest(`http://x/api/admin/rooms?code=${encodeURIComponent(dana.code)}`),
    );
    const row = (await list.json()).rooms.find((r: { slug: string }) => r.slug === slug);
    expect(row.createdBy).toBe("Dana");
  });

  it("a bootstrap-owner create has no attribution (clean, not empty)", async () => {
    const ws = await createWorkspace("Org2");
    const res = await post({ code: ws.adminCode, name: "Owner room", topic: "t" });
    const slug = (await res.json()).slug;
    expect((await getRoom(slug))?.createdBy).toBeUndefined();
  });

  it("a direct createRoom without a creator omits createdBy (legacy path)", async () => {
    const { room } = await createRoom("Legacy", "t");
    expect(room.createdBy).toBeUndefined();
  });
});
