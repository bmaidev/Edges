// Phase A — the workspace (tenant) layer that sits ABOVE rooms. A workspace owns
// rooms, metrics, and saved designs; isolation is enforced at the ownership +
// gate layer (slugs stay globally unique — they're the public /r/{slug} URL and
// the live roomId). A workspace is identified by its own admin passcode (the same
// passcode-tier ethos as rooms); facilitator identity layers on in Phase B.
//
// This file is a PURE ADDITION in slice A1 — nothing calls it yet. A2 threads
// `workspaceId` onto rooms/metrics/designs and the per-workspace indexes below.

import { randomBytes } from "node:crypto";
import { checkSuperAdmin, getDb, safeEqualHex, sha256 } from "./rooms";

// The single env super-admin (ADMIN_PASSCODE) administers this workspace, which
// owns every room that predates the tenancy layer ("absent workspaceId = default").
export const DEFAULT_WORKSPACE_ID = "default";

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  // sha256 of each admin passcode (plaintext never stored). The DEFAULT workspace
  // keeps this empty — it's administered by the env super-admin via checkSuperAdmin.
  adminHashes: string[];
  // Phase D — a per-workspace BYO Anthropic key reference. Reserved, unused in A.
  aiKeyRef?: string;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
}

const WORKSPACE_INDEX_KEY = "workspaces:index";
const workspaceKey = (id: string) => `workspace:${id}`;

// Per-workspace durable index keys. A2 reads/writes these; A1 defines them + the
// one-time lazy migration of the legacy GLOBAL indexes into the default workspace.
export const wsRoomsIndexKey = (id: string) => `ws:${id}:rooms`;
export const wsMetricsIndexKey = (id: string) => `ws:${id}:metricsidx`;
export const wsDesignIndexKey = (id: string) => `ws:${id}:designidx`;

// The legacy global index keys (pre-tenancy). After A1's migration they live on
// only as migration sources — there's no key-scan, so the copy is on-first-touch.
const LEGACY_ROOMS_INDEX = "rooms:index";
const LEGACY_METRICS_INDEX = "rooms:metricsidx";
const LEGACY_DESIGN_INDEX = "rooms:designidx";

function genWorkspaceId(): string {
  return `w-${randomBytes(5).toString("hex")}`;
}
function genAdminCode(): string {
  return `wsa-${randomBytes(5).toString("hex")}`;
}

// Copy a legacy global index into its per-workspace key ONCE. Idempotent: if the
// target already exists we never re-copy (so later edits to the workspace index
// aren't clobbered by a stale legacy snapshot). setNX guards a concurrent racer.
async function migrateLegacyIndex(legacyKey: string, wsKey: string): Promise<void> {
  const db = getDb();
  if ((await db.get<string[]>(wsKey)) != null) return; // already migrated
  const legacy = (await db.get<string[]>(legacyKey)) ?? [];
  await db.setNX(wsKey, legacy);
}

// Ensure the default workspace exists and the legacy indexes have been migrated
// into it. Idempotent + cheap (short-circuits once done) — A2 calls it before any
// scoped read so the default index is always present. No data is mutated for
// existing rooms: they simply read as default-workspace via "absent = default".
export async function ensureDefaultWorkspace(): Promise<void> {
  const db = getDb();
  if ((await db.get<Workspace>(workspaceKey(DEFAULT_WORKSPACE_ID))) == null) {
    const ws: Workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "Default",
      createdAt: Date.now(),
      adminHashes: [], // administered by the env super-admin
    };
    if (await db.setNX(workspaceKey(DEFAULT_WORKSPACE_ID), ws)) {
      const idx = (await db.get<string[]>(WORKSPACE_INDEX_KEY)) ?? [];
      if (!idx.includes(DEFAULT_WORKSPACE_ID))
        await db.set(WORKSPACE_INDEX_KEY, [...idx, DEFAULT_WORKSPACE_ID]);
    }
  }
  await migrateLegacyIndex(LEGACY_ROOMS_INDEX, wsRoomsIndexKey(DEFAULT_WORKSPACE_ID));
  await migrateLegacyIndex(LEGACY_METRICS_INDEX, wsMetricsIndexKey(DEFAULT_WORKSPACE_ID));
  await migrateLegacyIndex(LEGACY_DESIGN_INDEX, wsDesignIndexKey(DEFAULT_WORKSPACE_ID));
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  return getDb().get<Workspace>(workspaceKey(id));
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const idx = (await db.get<string[]>(WORKSPACE_INDEX_KEY)) ?? [];
  const out: WorkspaceMeta[] = [];
  for (const id of idx) {
    const ws = await db.get<Workspace>(workspaceKey(id));
    if (ws) out.push({ id: ws.id, name: ws.name, createdAt: ws.createdAt });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

// Create a new workspace with its own freshly-minted admin passcode. The plaintext
// is returned ONCE (shown to the super-admin, then only the hash is stored).
export async function createWorkspace(
  name: string,
): Promise<{ workspace: Workspace; adminCode: string }> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const adminCode = genAdminCode();
  let id = genWorkspaceId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const ws: Workspace = {
      id,
      name: name.trim().slice(0, 80) || "Workspace",
      createdAt: Date.now(),
      adminHashes: [sha256(adminCode)],
    };
    if (await db.setNX(workspaceKey(id), ws)) {
      const idx = (await db.get<string[]>(WORKSPACE_INDEX_KEY)) ?? [];
      await db.set(WORKSPACE_INDEX_KEY, [...idx, id]);
      // Seed an empty rooms index so listRooms(id) is coherent immediately.
      await db.setNX(wsRoomsIndexKey(id), []);
      return { workspace: ws, adminCode };
    }
    id = genWorkspaceId();
  }
  throw new Error("Could not allocate a workspace id");
}

// Resolve a code to the workspace it administers. The env super-admin resolves to
// the default workspace AND carries isSuperAdmin (can act across workspaces); a
// workspace admin code resolves to exactly its own workspace; anything else → null.
export async function resolveWorkspace(
  code: string | null | undefined,
): Promise<{ workspaceId: string | null; isSuperAdmin: boolean }> {
  if (!code) return { workspaceId: null, isSuperAdmin: false };
  if (checkSuperAdmin(code))
    return { workspaceId: DEFAULT_WORKSPACE_ID, isSuperAdmin: true };
  await ensureDefaultWorkspace();
  const db = getDb();
  const h = sha256(code);
  const idx = (await db.get<string[]>(WORKSPACE_INDEX_KEY)) ?? [];
  for (const id of idx) {
    const ws = await db.get<Workspace>(workspaceKey(id));
    if (ws && ws.adminHashes.some((stored) => safeEqualHex(h, stored)))
      return { workspaceId: id, isSuperAdmin: false };
  }
  return { workspaceId: null, isSuperAdmin: false };
}
