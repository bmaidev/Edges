import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/rooms";
import {
  DEFAULT_WORKSPACE_ID,
  createWorkspace,
  ensureDefaultWorkspace,
  getWorkspace,
  listWorkspaces,
  resolveWorkspace,
  wsRoomsIndexKey,
} from "@/lib/workspaces";

// Phase A1 — the workspace (tenant) layer. A workspace is identified by its own
// admin passcode; the env super-admin administers the default workspace and can
// act across all. The legacy global room index is migrated into the default
// workspace once, on first touch (no key-scan, so copy-on-first-access).

const SUPER = "test-super-admin-workspaces";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

// FIRST: prove the lazy migration copies the legacy global index into the default
// workspace. Runs before any other ensureDefaultWorkspace call in this file so the
// ws:default:rooms key is still absent (the migration only fires once).
describe("ensureDefaultWorkspace — legacy index migration", () => {
  it("copies the legacy rooms:index into ws:default:rooms (on first touch)", async () => {
    const db = getDb();
    // Append a unique marker to whatever legacy index exists (don't clobber).
    const legacy = (await db.get<string[]>("rooms:index")) ?? [];
    const marker = "ZZ-legacy-marker-slug";
    await db.set("rooms:index", [...legacy, marker]);

    await ensureDefaultWorkspace();

    const migrated = (await db.get<string[]>(wsRoomsIndexKey(DEFAULT_WORKSPACE_ID))) ?? [];
    expect(migrated).toContain(marker);
  });

  it("creates the default workspace record and is idempotent", async () => {
    await ensureDefaultWorkspace();
    await ensureDefaultWorkspace(); // twice — must not duplicate
    const def = await getWorkspace(DEFAULT_WORKSPACE_ID);
    expect(def?.id).toBe(DEFAULT_WORKSPACE_ID);
    const all = await listWorkspaces();
    expect(all.filter((w) => w.id === DEFAULT_WORKSPACE_ID)).toHaveLength(1);
  });
});

describe("createWorkspace + resolveWorkspace", () => {
  it("mints a workspace with its own admin code that resolves to it", async () => {
    const { workspace, adminCode } = await createWorkspace("ANU Cybernetics");
    expect(workspace.id).toMatch(/^w-[0-9a-f]+$/);
    expect(workspace.name).toBe("ANU Cybernetics");
    expect(adminCode).toMatch(/^wsa-[0-9a-f]+$/);

    const r = await resolveWorkspace(adminCode);
    expect(r.workspaceId).toBe(workspace.id);
    expect(r.isSuperAdmin).toBe(false);

    // it shows up in the list and is fetchable
    expect((await listWorkspaces()).some((w) => w.id === workspace.id)).toBe(true);
    expect((await getWorkspace(workspace.id))?.name).toBe("ANU Cybernetics");
  });

  it("two workspaces' admin codes never resolve to each other", async () => {
    const a = await createWorkspace("Alliance");
    const b = await createWorkspace("School");
    expect((await resolveWorkspace(a.adminCode)).workspaceId).toBe(a.workspace.id);
    expect((await resolveWorkspace(b.adminCode)).workspaceId).toBe(b.workspace.id);
    expect(a.workspace.id).not.toBe(b.workspace.id);
  });
});

describe("resolveWorkspace — super-admin + rejection", () => {
  it("the env super-admin resolves to the default workspace, flagged super", async () => {
    const r = await resolveWorkspace(SUPER);
    expect(r.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
    expect(r.isSuperAdmin).toBe(true);
  });

  it("an unknown or empty code resolves to null", async () => {
    expect((await resolveWorkspace("not-a-real-code")).workspaceId).toBeNull();
    expect((await resolveWorkspace(undefined)).workspaceId).toBeNull();
    expect((await resolveWorkspace("")).workspaceId).toBeNull();
  });
});
