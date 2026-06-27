import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as wsGET,
  POST as wsPOST,
} from "@/app/api/admin/workspaces/route";
import { GET as roomsGET } from "@/app/api/admin/rooms/route";
import { createWorkspace } from "@/lib/workspaces";

// Phase A4 — workspace management API. Only the env super-admin may list/create
// workspaces; the rooms route reports the active workspace context.

const SUPER = "test-super-admin-ws-mgmt";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

describe("admin/workspaces — super-admin only", () => {
  it("the super-admin can create a workspace and gets its admin code once", async () => {
    const res = await wsPOST(
      new NextRequest("http://x/api/admin/workspaces", {
        method: "POST",
        body: JSON.stringify({ code: SUPER, name: "AI Collab Alliance" }),
      }),
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.name).toBe("AI Collab Alliance");
    expect(d.adminCode).toMatch(/^wsa-[0-9a-f]+$/);

    // it now appears in the list
    const list = await wsGET(
      new NextRequest(`http://x/api/admin/workspaces?code=${encodeURIComponent(SUPER)}`),
    );
    expect((await list.json()).workspaces.some((w: { id: string }) => w.id === d.id)).toBe(true);
  });

  it("a workspace admin cannot list or create workspaces (super-admin only)", async () => {
    const ws = await createWorkspace("Tenant");
    const list = await wsGET(
      new NextRequest(`http://x/api/admin/workspaces?code=${encodeURIComponent(ws.adminCode)}`),
    );
    expect(list.status).toBe(403);
    const create = await wsPOST(
      new NextRequest("http://x/api/admin/workspaces", {
        method: "POST",
        body: JSON.stringify({ code: ws.adminCode, name: "Sneaky" }),
      }),
    );
    expect(create.status).toBe(403);
  });

  it("a nameless create is rejected", async () => {
    const res = await wsPOST(
      new NextRequest("http://x/api/admin/workspaces", {
        method: "POST",
        body: JSON.stringify({ code: SUPER, name: "   " }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("admin/rooms — workspace context", () => {
  it("reports the active workspace + super-admin flag", async () => {
    const res = await roomsGET(
      new NextRequest(`http://x/api/admin/rooms?code=${encodeURIComponent(SUPER)}`),
    );
    const ctx = (await res.json()).context;
    expect(ctx.workspaceId).toBe("default");
    expect(ctx.isSuperAdmin).toBe(true);

    const ws = await createWorkspace("Context tenant");
    const res2 = await roomsGET(
      new NextRequest(`http://x/api/admin/rooms?code=${encodeURIComponent(ws.adminCode)}`),
    );
    const ctx2 = (await res2.json()).context;
    expect(ctx2.workspaceId).toBe(ws.workspace.id);
    expect(ctx2.isSuperAdmin).toBe(false);
    expect(ctx2.name).toBe("Context tenant");
  });
});
