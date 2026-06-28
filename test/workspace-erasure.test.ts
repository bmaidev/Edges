import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE as wsDELETE } from "@/app/api/admin/workspaces/route";
import {
  createWorkspace,
  deleteWorkspace,
  resolveWorkspace,
  addMember,
  setWorkspaceAiKey,
  DEFAULT_WORKSPACE_ID,
} from "@/lib/workspaces";
import {
  createRoom,
  getRoom,
  getArchive,
  listRooms,
  updateRoom,
  captureSessionMetrics,
  listSessionMetrics,
} from "@/lib/rooms";
import { saveDesign, listDesignMeta } from "@/lib/userTemplates";
import { addParticipant, addSubmission, setPhase, setPhases } from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// Phase D4 — workspace erasure (the right to erasure). Deletes a workspace + ALL
// its data; the default can never be deleted; cross-workspace callers are denied.

const SUPER = "test-super-admin-erasure";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
  process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret-d4";
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

const del = (body: unknown) =>
  wsDELETE(new NextRequest("http://x/api/admin/workspaces", { method: "DELETE", body: JSON.stringify(body) }));

describe("deleteWorkspace (lib)", () => {
  it("erases the workspace + all its rooms, archives, metrics, designs", async () => {
    const ws = await createWorkspace("DoomedOrg");
    await addMember(ws.workspace.id, "Dana", "member");
    await setWorkspaceAiKey(ws.workspace.id, "sk-ant-byo-key-1234567890");
    await saveDesign("A design", PHASES, { workspaceId: ws.workspace.id });

    const { room } = await createRoom("R", "t", null, null, ws.workspace.id);
    await setPhases(PHASES, "S", room.slug);
    await setPhase("p1", room.slug);
    await addParticipant("a", "Ada", room.slug);
    await addSubmission("Ada", "x", "p1", null, "a", room.slug);
    await updateRoom(room.slug, { status: "archived" });
    await captureSessionMetrics(room.slug);

    expect(await deleteWorkspace(ws.workspace.id)).toBe(true);

    // everything is gone
    expect(await resolveWorkspace(ws.adminCode)).toMatchObject({ workspaceId: null });
    expect(await getRoom(room.slug)).toBeNull();
    expect(await getArchive(room.slug)).toBeNull();
    expect(await listRooms(ws.workspace.id)).toHaveLength(0);
    expect(await listSessionMetrics(ws.workspace.id)).toHaveLength(0);
    expect(await listDesignMeta(ws.workspace.id)).toHaveLength(0);
  });

  it("refuses to delete the default workspace", async () => {
    expect(await deleteWorkspace(DEFAULT_WORKSPACE_ID)).toBe(false);
  });

  it("returns false for an unknown workspace", async () => {
    expect(await deleteWorkspace("w-does-not-exist")).toBe(false);
  });
});

describe("DELETE /api/admin/workspaces", () => {
  it("an owner can erase their own workspace", async () => {
    const ws = await createWorkspace("SelfErase");
    const res = await del({ code: ws.adminCode, workspaceId: ws.workspace.id });
    expect(res.status).toBe(200);
    expect((await resolveWorkspace(ws.adminCode)).workspaceId).toBeNull();
  });

  it("a member (non-owner) cannot erase the workspace", async () => {
    const ws = await createWorkspace("Protected");
    const dana = (await addMember(ws.workspace.id, "Dana", "member"))!;
    const res = await del({ code: dana.code, workspaceId: ws.workspace.id });
    expect(res.status).toBe(403);
    expect((await resolveWorkspace(ws.adminCode)).workspaceId).toBe(ws.workspace.id); // untouched
  });

  it("an owner of one workspace cannot erase another (cross-tenant denied)", async () => {
    const a = await createWorkspace("Aorg");
    const b = await createWorkspace("Borg");
    const res = await del({ code: a.adminCode, workspaceId: b.workspace.id });
    expect(res.status).toBe(403);
    expect((await resolveWorkspace(b.adminCode)).workspaceId).toBe(b.workspace.id);
  });

  it("the default workspace can't be deleted via the route", async () => {
    const res = await del({ code: SUPER, workspaceId: DEFAULT_WORKSPACE_ID });
    expect(res.status).toBe(400);
  });
});
