// Phase A — the workspace (tenant) layer that sits ABOVE rooms. A workspace owns
// rooms, metrics, and saved designs; isolation is enforced at the ownership +
// gate layer (slugs stay globally unique — they're the public /r/{slug} URL and
// the live roomId). A workspace is identified by its own admin passcode (the same
// passcode-tier ethos as rooms); facilitator identity layers on in Phase B.
//
// This file is a PURE ADDITION in slice A1 — nothing calls it yet. A2 threads
// `workspaceId` onto rooms/metrics/designs and the per-workspace indexes below.

import { randomBytes } from "node:crypto";
import { checkSuperAdmin, getDb, getRoom, safeEqualHex, sha256 } from "./rooms";
import { withLock } from "./store";
import { decrypt, encrypt, secretsConfigured } from "./secrets";

// The single env super-admin (ADMIN_PASSCODE) administers this workspace, which
// owns every room that predates the tenancy layer ("absent workspaceId = default").
export const DEFAULT_WORKSPACE_ID = "default";

// Phase C — a role WITHIN a workspace. "owner" manages members + settings; a
// "member" creates and runs the workspace's (shared) rooms but can't manage
// membership. The legacy bootstrap admin code (adminHashes) is an implicit owner.
export type WorkspaceRole = "owner" | "member";

// Phase C — a named person in a workspace, with their own personal code. Lets the
// workspace see WHO did what, add/revoke one person without rotating a shared code.
export interface Member {
  id: string; // m-xxxx
  name: string; // display name (attribution: "created by <name>")
  codeHash: string; // sha256 of their personal `wsm-…` code (plaintext never stored)
  role: WorkspaceRole;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  // sha256 of each admin passcode (plaintext never stored). The DEFAULT workspace
  // keeps this empty — it's administered by the env super-admin via checkSuperAdmin.
  // Phase C — these are the root OWNER codes (the create/bootstrap code); named
  // members are layered additively in `members`.
  adminHashes: string[];
  // Phase C — named members with per-person codes + roles (absent on pre-C
  // workspaces → just the adminHashes owner).
  members?: Member[];
  // Phase D — the workspace's BYO Anthropic key, ENCRYPTED at rest (AES-256-GCM).
  // last4 is the only plaintext kept, for a "····1234" display. Absent → the
  // workspace uses the platform's global ANTHROPIC_API_KEY baseline.
  aiKey?: import("./secrets").SealedSecret & { last4: string };
}

// What a resolved code grants: its workspace, role, and (for a named member) who.
export interface WorkspaceContext {
  workspaceId: string | null;
  isSuperAdmin: boolean;
  role: WorkspaceRole | null;
  memberId: string | null;
  memberName: string | null;
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
function genMemberId(): string {
  return `m-${randomBytes(5).toString("hex")}`;
}
function genMemberCode(): string {
  return `wsm-${randomBytes(5).toString("hex")}`;
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

// ---- per-workspace index helpers (used by rooms.ts + userTemplates.ts) ------
// One uniform family so every index mutator (room/metrics/design create, delete,
// rename) edits exactly one key per workspace — no "is this the default?" branch.
// Each ensures the default workspace's migration has run before touching an index.

type IndexKind = "rooms" | "metrics" | "designs";

function indexKeyFor(kind: IndexKind, workspaceId: string): string {
  return kind === "rooms"
    ? wsRoomsIndexKey(workspaceId)
    : kind === "metrics"
      ? wsMetricsIndexKey(workspaceId)
      : wsDesignIndexKey(workspaceId);
}

export async function wsIndexList(kind: IndexKind, workspaceId: string): Promise<string[]> {
  await ensureDefaultWorkspace();
  return (await getDb().get<string[]>(indexKeyFor(kind, workspaceId))) ?? [];
}

export async function wsIndexAdd(kind: IndexKind, workspaceId: string, id: string): Promise<void> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const key = indexKeyFor(kind, workspaceId);
  const idx = (await db.get<string[]>(key)) ?? [];
  if (!idx.includes(id)) await db.set(key, [...idx, id]);
}

export async function wsIndexRemove(kind: IndexKind, workspaceId: string, id: string): Promise<void> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const key = indexKeyFor(kind, workspaceId);
  const idx = (await db.get<string[]>(key)) ?? [];
  if (idx.includes(id)) await db.set(key, idx.filter((x) => x !== id));
}

export async function wsIndexReplace(
  kind: IndexKind,
  workspaceId: string,
  oldId: string,
  newId: string,
): Promise<void> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const key = indexKeyFor(kind, workspaceId);
  const idx = (await db.get<string[]>(key)) ?? [];
  await db.set(key, Array.from(new Set(idx.map((x) => (x === oldId ? newId : x)))));
}

// Empty a workspace's index, returning the ids it held (so the caller can delete
// the underlying records).
export async function wsIndexDrain(kind: IndexKind, workspaceId: string): Promise<string[]> {
  await ensureDefaultWorkspace();
  const db = getDb();
  const key = indexKeyFor(kind, workspaceId);
  const idx = (await db.get<string[]>(key)) ?? [];
  await db.set(key, []);
  return idx;
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

const NONE: WorkspaceContext = {
  workspaceId: null,
  isSuperAdmin: false,
  role: null,
  memberId: null,
  memberName: null,
};

// ---- Phase C: member management (read-modify-write on the workspace record) ----
// Serialised under a per-workspace lock so concurrent adds/removes never clobber
// the members array (the durable backend has no atomic list op). Mirrors the
// design-library lock in userTemplates.ts.
async function withWorkspaceLock<T>(
  workspaceId: string,
  fn: () => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 10; i++) {
    const res = await withLock(workspaceId, "members", fn, { ttlSeconds: 5 });
    if (res.ok) return res.value;
    await new Promise((r) => setTimeout(r, 40));
  }
  return fn(); // last-resort unlocked run rather than fail an owner action
}

export interface MemberMeta {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: number;
}

// Add a named member to a workspace, minting their personal code. Returns the
// plaintext ONCE (handed off as a magic link). Only the hash is stored.
export async function addMember(
  workspaceId: string,
  name: string,
  role: WorkspaceRole,
): Promise<{ member: MemberMeta; code: string } | null> {
  const clean = name.trim().slice(0, 60) || "Member";
  const code = genMemberCode();
  return withWorkspaceLock(workspaceId, async () => {
    const db = getDb();
    const ws = await db.get<Workspace>(workspaceKey(workspaceId));
    if (!ws) return null;
    const member: Member = {
      id: genMemberId(),
      name: clean,
      codeHash: sha256(code),
      role,
      createdAt: Date.now(),
    };
    const members = [...(ws.members ?? []), member];
    await db.set(workspaceKey(workspaceId), { ...ws, members });
    return {
      member: { id: member.id, name: member.name, role: member.role, createdAt: member.createdAt },
      code,
    };
  });
}

// List a workspace's members — names/roles/ids only, NEVER code hashes.
export async function listMembers(workspaceId: string): Promise<MemberMeta[]> {
  const ws = await getDb().get<Workspace>(workspaceKey(workspaceId));
  return (ws?.members ?? [])
    .map((m) => ({ id: m.id, name: m.name, role: m.role, createdAt: m.createdAt }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Revoke a member: drop them from the workspace so their code stops resolving.
export async function removeMember(
  workspaceId: string,
  memberId: string,
): Promise<boolean> {
  return withWorkspaceLock(workspaceId, async () => {
    const db = getDb();
    const ws = await db.get<Workspace>(workspaceKey(workspaceId));
    if (!ws) return false;
    const members = (ws.members ?? []).filter((m) => m.id !== memberId);
    if (members.length === (ws.members ?? []).length) return false; // no such member
    await db.set(workspaceKey(workspaceId), { ...ws, members });
    return true;
  });
}

// ---- Phase D: per-workspace BYO Anthropic key (encrypted at rest) ----------

// Set (or replace) a workspace's BYO Anthropic key — encrypted before storage.
// Refused when no master key is configured (we never store a secret we can't
// protect). Returns false if the workspace is missing or secrets are off.
export async function setWorkspaceAiKey(
  workspaceId: string,
  plaintext: string,
): Promise<boolean> {
  if (!secretsConfigured()) return false;
  const key = plaintext.trim();
  if (!key) return false;
  return withWorkspaceLock(workspaceId, async () => {
    const db = getDb();
    const ws = await db.get<Workspace>(workspaceKey(workspaceId));
    if (!ws) return false;
    const aiKey = { ...encrypt(key), last4: key.slice(-4) };
    await db.set(workspaceKey(workspaceId), { ...ws, aiKey });
    return true;
  });
}

export async function clearWorkspaceAiKey(workspaceId: string): Promise<boolean> {
  return withWorkspaceLock(workspaceId, async () => {
    const db = getDb();
    const ws = await db.get<Workspace>(workspaceKey(workspaceId));
    if (!ws) return false;
    const next = { ...ws };
    delete next.aiKey;
    await db.set(workspaceKey(workspaceId), next);
    return true;
  });
}

// Decrypt a workspace's BYO key for use in an AI call. SERVER-ONLY — the plaintext
// must never leave the process. Null when unset or the master key can't decrypt it.
export async function getWorkspaceAiKey(workspaceId: string): Promise<string | null> {
  const ws = await getDb().get<Workspace>(workspaceKey(workspaceId));
  if (!ws?.aiKey) return null;
  return decrypt(ws.aiKey);
}

// Safe-to-surface info for the portal: whether a key is set + its last4. Never
// the ciphertext or plaintext.
export async function workspaceAiKeyInfo(
  workspaceId: string,
): Promise<{ set: boolean; last4: string | null }> {
  const ws = await getDb().get<Workspace>(workspaceKey(workspaceId));
  return { set: Boolean(ws?.aiKey), last4: ws?.aiKey?.last4 ?? null };
}

// The EFFECTIVE Anthropic key for a workspace: its own BYO key if set, else the
// global env baseline. Null when neither exists (AI unavailable). Server-only.
export async function resolveAiKeyForWorkspace(
  workspaceId: string,
): Promise<string | null> {
  return (await getWorkspaceAiKey(workspaceId)) ?? process.env.ANTHROPIC_API_KEY ?? null;
}

// The effective key for a room, via its owning workspace. Used at the request
// boundaries (host route, design route) to set the AI key for the whole handler.
export async function resolveAiKeyForRoom(slug: string): Promise<string | null> {
  const room = await getRoom(slug);
  return resolveAiKeyForWorkspace(room?.workspaceId ?? DEFAULT_WORKSPACE_ID);
}

// Resolve a code to the workspace it administers + the ROLE it grants. The env
// super-admin → the default workspace as an owner, isSuperAdmin (can act across
// workspaces). A named member's code → that member's role/id/name. The legacy
// bootstrap admin code (adminHashes) → owner with no member identity. Else null.
// Members live IN the workspace record (already loaded in the scan) → no extra
// lookups vs the pre-C resolve.
export async function resolveWorkspace(
  code: string | null | undefined,
): Promise<WorkspaceContext> {
  if (!code) return NONE;
  if (checkSuperAdmin(code))
    return {
      workspaceId: DEFAULT_WORKSPACE_ID,
      isSuperAdmin: true,
      role: "owner",
      memberId: null,
      memberName: null,
    };
  await ensureDefaultWorkspace();
  const db = getDb();
  const h = sha256(code);
  const idx = (await db.get<string[]>(WORKSPACE_INDEX_KEY)) ?? [];
  for (const id of idx) {
    const ws = await db.get<Workspace>(workspaceKey(id));
    if (!ws) continue;
    // A named member wins (carries their identity); else the root owner code.
    const member = (ws.members ?? []).find((m) => safeEqualHex(h, m.codeHash));
    if (member)
      return {
        workspaceId: id,
        isSuperAdmin: false,
        role: member.role,
        memberId: member.id,
        memberName: member.name,
      };
    if (ws.adminHashes.some((stored) => safeEqualHex(h, stored)))
      return {
        workspaceId: id,
        isSuperAdmin: false,
        role: "owner",
        memberId: null,
        memberName: null,
      };
  }
  return NONE;
}
