import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as roomsGET, POST as roomsPOST } from "@/app/api/admin/rooms/route";
import { GET as roomGET, DELETE as roomDELETE } from "@/app/api/admin/rooms/[slug]/route";
import { GET as analyticsGET } from "@/app/api/admin/analytics/route";
import { createRoom, updateRoom, captureSessionMetrics } from "@/lib/rooms";
import { addParticipant, addSubmission, setPhase, setPhases } from "@/lib/store";
import { createWorkspace } from "@/lib/workspaces";
import type { PhaseInstance } from "@/lib/types";

// Phase A3 — the isolation gate. The admin routes resolve a code to a workspace
// and scope every read/write to it. The env super-admin administers the default
// workspace (and all legacy rooms); a workspace admin sees ONLY its own.

const SUPER = "test-super-admin-ws-routes";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

const getReq = (qs: string) =>
  new NextRequest(`http://x/api/admin/rooms${qs}`);
const jsonReq = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body) });

describe("admin/rooms — workspace-scoped listing", () => {
  it("a legacy (workspaceId-less) room is visible to the super-admin (default)", async () => {
    // createRoom with no workspaceId → default; the super-admin lists it.
    const { room } = await createRoom("Legacy default room", "t");
    const res = await roomsGET(getReq(`?code=${encodeURIComponent(SUPER)}`));
    expect(res.status).toBe(200);
    const slugs = (await res.json()).rooms.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain(room.slug);
  });

  it("a workspace admin sees only its OWN rooms, never the default's", async () => {
    const ws = await createWorkspace("Alliance");
    // create a room in the workspace via the route (its admin code)
    const created = await roomsPOST(
      jsonReq("http://x/api/admin/rooms", { name: "WS room", topic: "t", code: ws.adminCode }),
    );
    expect(created.status).toBe(200);
    const wsSlug = (await created.json()).slug;
    // a default room the workspace admin must NOT see
    const { room: defaultRoom } = await createRoom("Another default", "t");

    const res = await roomsGET(getReq(`?code=${encodeURIComponent(ws.adminCode)}`));
    const slugs = (await res.json()).rooms.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain(wsSlug);
    expect(slugs).not.toContain(defaultRoom.slug);
  });

  it("an unknown code is forbidden", async () => {
    const res = await roomsGET(getReq(`?code=not-a-real-code`));
    expect(res.status).toBe(403);
  });
});

describe("admin/rooms/[slug] — cross-workspace denial (404, not 403)", () => {
  it("a workspace admin gets 404 on a default-workspace room", async () => {
    const ws = await createWorkspace("School");
    const { room } = await createRoom("Default-only room", "t"); // default workspace
    const res = await roomGET(
      getReq(`/${room.slug}?code=${encodeURIComponent(ws.adminCode)}`),
      { params: { slug: room.slug } },
    );
    expect(res.status).toBe(404); // existence not disclosed across tenants
  });

  it("the super-admin can read the same room", async () => {
    const { room } = await createRoom("Readable by super", "t");
    const res = await roomGET(
      getReq(`/${room.slug}?code=${encodeURIComponent(SUPER)}`),
      { params: { slug: room.slug } },
    );
    expect(res.status).toBe(200);
  });

  it("a workspace admin cannot DELETE a default-workspace room", async () => {
    const ws = await createWorkspace("Probers");
    const { room } = await createRoom("Protected", "t");
    const res = await roomDELETE(
      getReq(`/${room.slug}?code=${encodeURIComponent(ws.adminCode)}`),
      { params: { slug: room.slug } },
    );
    expect(res.status).toBe(404);
  });
});

describe("admin/analytics — metrics never cross tenants", () => {
  it("a workspace's analytics + CSV export never contain another workspace's rooms", async () => {
    // a default room with metrics
    const { room: defRoom } = await createRoom("Default metrics room", "t");
    await setPhases(PHASES, "S", defRoom.slug);
    await setPhase("p1", defRoom.slug);
    await addParticipant("d", "D", defRoom.slug);
    await addSubmission("D", "x", "p1", null, "d", defRoom.slug);
    await updateRoom(defRoom.slug, { status: "archived" });
    await captureSessionMetrics(defRoom.slug);

    const ws = await createWorkspace("Lonely");
    const res = await analyticsGET(
      new NextRequest(`http://x/api/admin/analytics?code=${encodeURIComponent(ws.adminCode)}`),
    );
    expect(res.status).toBe(200);
    // the workspace has no rooms → its analytics never mention the default room
    expect(JSON.stringify(await res.json())).not.toContain(defRoom.slug);

    // CSV export for the workspace is likewise clean
    const csvRes = await analyticsGET(
      new NextRequest(
        `http://x/api/admin/analytics?export=csv&code=${encodeURIComponent(ws.adminCode)}`,
      ),
    );
    expect(await csvRes.text()).not.toContain(defRoom.slug);
  });
});
