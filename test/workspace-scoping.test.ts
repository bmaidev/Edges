import { beforeAll, describe, expect, it } from "vitest";
import {
  captureSessionMetrics,
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  listSessionMetrics,
  renameRoom,
  updateRoom,
} from "@/lib/rooms";
import {
  deleteDesign,
  listDesignMeta,
  saveDesign,
} from "@/lib/userTemplates";
import {
  addParticipant,
  addSubmission,
  setPhase,
  setPhases,
} from "@/lib/store";
import { createWorkspace, DEFAULT_WORKSPACE_ID } from "@/lib/workspaces";
import type { PhaseInstance } from "@/lib/types";

// Phase A2 — rooms / metrics / designs are owned by a workspace and listed via
// per-workspace indexes. A workspace never sees another's. Legacy (workspaceId-
// absent) records read as the default workspace.

const SUPER = "test-super-admin-ws-scoping";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

describe("room ownership + per-workspace listing", () => {
  it("a room created in a workspace lists ONLY there (and default never sees it)", async () => {
    const ws = await createWorkspace("Tenant A");
    const { room } = await createRoom("Tenant room", "topic", null, null, ws.workspace.id);
    expect(room.workspaceId).toBe(ws.workspace.id);

    const inWs = await listRooms(ws.workspace.id);
    expect(inWs.some((r) => r.slug === room.slug)).toBe(true);

    const inDefault = await listRooms(); // default workspace
    expect(inDefault.some((r) => r.slug === room.slug)).toBe(false);
  });

  it("a default-workspace room lists in default, not in another tenant", async () => {
    const ws = await createWorkspace("Tenant B");
    const { room } = await createRoom("Default room", "topic"); // no workspaceId → default
    expect(room.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect((await listRooms()).some((r) => r.slug === room.slug)).toBe(true);
    expect((await listRooms(ws.workspace.id)).some((r) => r.slug === room.slug)).toBe(false);
  });

  it("rename keeps the room in its own workspace index (no cross-index orphan)", async () => {
    const ws = await createWorkspace("Tenant C");
    const { room } = await createRoom("Renamable", "t", null, null, ws.workspace.id);
    const res = await renameRoom(room.slug, "tenant-c-renamed-xy");
    expect(res.ok).toBe(true);
    const slug = res.ok ? res.slug : "";
    const inWs = await listRooms(ws.workspace.id);
    expect(inWs.some((r) => r.slug === slug)).toBe(true);
    expect(inWs.some((r) => r.slug === room.slug)).toBe(false); // old gone
    // never leaked into default
    expect((await listRooms()).some((r) => r.slug === slug)).toBe(false);
  });

  it("delete removes from the owning workspace index", async () => {
    const ws = await createWorkspace("Tenant D");
    const { room } = await createRoom("Deletable", "t", null, null, ws.workspace.id);
    expect(await deleteRoom(room.slug)).toBe(true);
    expect((await listRooms(ws.workspace.id)).some((r) => r.slug === room.slug)).toBe(false);
    expect(await getRoom(room.slug)).toBeNull();
  });
});

describe("metrics scoping", () => {
  it("a tenant's session metrics never appear in another workspace's list", async () => {
    const ws = await createWorkspace("Tenant E");
    const { room } = await createRoom("Metrics room", "t", null, null, ws.workspace.id);
    await setPhases(PHASES, "S", room.slug);
    await setPhase("p1", room.slug);
    await addParticipant("tok", "Ada", room.slug);
    await addSubmission("Ada", "an idea", "p1", null, "tok", room.slug);
    await updateRoom(room.slug, { status: "archived" });
    await captureSessionMetrics(room.slug);

    expect((await listSessionMetrics(ws.workspace.id)).some((m) => m.slug === room.slug)).toBe(true);
    expect((await listSessionMetrics()).some((m) => m.slug === room.slug)).toBe(false);
  });
});

describe("design library scoping", () => {
  it("a workspace's saved design is invisible to other workspaces; built-in scope is per-workspace", async () => {
    const a = await createWorkspace("Lib A");
    const b = await createWorkspace("Lib B");
    const saved = await saveDesign("A's design", PHASES, { workspaceId: a.workspace.id });
    expect(saved.ok).toBe(true);
    const id = saved.ok ? saved.id : "";

    expect((await listDesignMeta(a.workspace.id)).some((d) => d.id === id)).toBe(true);
    expect((await listDesignMeta(b.workspace.id)).some((d) => d.id === id)).toBe(false);
    expect((await listDesignMeta()).some((d) => d.id === id)).toBe(false); // default

    // delete removes it from A's library
    expect(await deleteDesign(id)).toBe(true);
    expect((await listDesignMeta(a.workspace.id)).some((d) => d.id === id)).toBe(false);
  });
});
