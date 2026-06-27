// B4 — user-defined session templates: a global, durable library of designs a
// facilitator composed in the builder, sitting alongside the built-in TEMPLATES.
// Global (NOT room-scoped) so a design saved once is reusable in every room.
//
// Security is the whole game here: a design can arrive from an untrusted import,
// so EVERY phase is re-validated against its module's zod schema and REBUILT as
// exactly {id, moduleId, config: parsed.data}. zod's safeParse does not strip
// unknown keys, so we never persist the caller's object — only the parsed data.
// A design carries DESIGN only (prompts/timings), never participant material or
// passcodes.

import { randomBytes } from "node:crypto";
import { getDb } from "./rooms";
import { withLock } from "./store";
import {
  DEFAULT_WORKSPACE_ID,
  wsIndexAdd,
  wsIndexList,
  wsIndexRemove,
} from "./workspaces";
import { getServerModule } from "./modules/registry.server";
import type { ModuleKind, PhaseInstance } from "./types";

// B4 — a design is GLOBAL (the shared library, reusable in every room — the
// default, and what the A5 post-wipe rescue surfaces everywhere) or ROOM-scoped
// (private to the room that saved it, kept out of other rooms' libraries).
export type DesignScope = "global" | "room";

export interface UserTemplate {
  id: string;
  name: string;
  phases: PhaseInstance[];
  createdAt: number;
  scope?: DesignScope; // absent = "global" (back-compat)
  roomSlug?: string; // the owning room, when scope === "room"
  // Phase A — the owning workspace. "global"/"room" scope is WITHIN a workspace;
  // a workspace never sees another's library. Absent → default workspace.
  workspaceId?: string;
}
// Lightweight list projection — never ships the full phase configs.
export interface UserTemplateMeta {
  id: string;
  name: string;
  phaseCount: number;
  createdAt: number;
  scope: DesignScope;
}

const designKey = (id: string) => `rooms:design:${id}`;
const MAX_DESIGNS = 200; // soft cap on the per-workspace library
const MAX_PHASES = 60;

function newId(): string {
  return `d-${randomBytes(6).toString("hex")}`;
}

// The shared-library lock is non-blocking (SET NX), so a concurrent save would be
// dropped. Retry briefly (each op is one get+set, contention clears in ms), then
// fall back to an unlocked run rather than lose a write — mirrors withTimerLock.
async function withDesignLock<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 12; i++) {
    const res = await withLock("__designs__", "write", fn, { ttlSeconds: 10 });
    if (res.ok) return res.value;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fn();
}

// Validate + REBUILD an untrusted phase array against the module registry. Returns
// the sanitised phases (exactly {id, moduleId, config}) or a precise error. This
// is the single gate used by both save and import.
export function validatePhases(
  raw: unknown,
): { ok: true; phases: PhaseInstance[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0)
    return { ok: false, error: "A design needs at least one phase." };
  if (raw.length > MAX_PHASES)
    return { ok: false, error: `Too many phases (max ${MAX_PHASES}).` };
  const phases: PhaseInstance[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i] as { id?: unknown; moduleId?: unknown; config?: unknown };
    const moduleId = p?.moduleId;
    if (typeof moduleId !== "string")
      return { ok: false, error: `Phase ${i + 1} is missing a module.` };
    const mod = getServerModule(moduleId as ModuleKind);
    if (!mod) return { ok: false, error: `Unknown module: ${moduleId}.` };
    const parsed = mod.schema.safeParse(p?.config);
    if (!parsed.success)
      return { ok: false, error: `Phase ${i + 1} (${moduleId}) has invalid settings.` };
    const id = typeof p?.id === "string" && p.id ? p.id : `p${i + 1}`;
    // Rebuild from parsed.data ONLY — never the caller's object (drops any
    // injected keys; zod doesn't strip them on its own).
    phases.push({ id, moduleId: moduleId as ModuleKind, config: parsed.data as Record<string, unknown> });
  }
  return { ok: true, phases };
}

// Persist a validated design under the shared library lock (whole-object index
// replace, never a string[] read-modify-write, so concurrent saves don't lose one).
export async function saveDesign(
  name: string,
  rawPhases: unknown,
  // B4 — scope defaults to "global" (back-compat + the A5 rescue). A "room" scope
  // pins the design to `roomSlug`. Phase A — `workspaceId` confines the design to
  // its workspace's library; "global"/"room" scope is WITHIN that workspace.
  opts: { scope?: DesignScope; roomSlug?: string; workspaceId?: string } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const v = validatePhases(rawPhases);
  if (!v.ok) return v;
  const clean = name.trim().slice(0, 80) || "Untitled design";
  const scope: DesignScope = opts.scope === "room" ? "room" : "global";
  const workspaceId = opts.workspaceId ?? DEFAULT_WORKSPACE_ID;
  return withDesignLock(async () => {
    const db = getDb();
    const index = await wsIndexList("designs", workspaceId);
    if (index.length >= MAX_DESIGNS)
      return { ok: false as const, error: "The template library is full." };
    const id = newId();
    const tpl: UserTemplate = {
      id,
      name: clean,
      phases: v.phases,
      createdAt: Date.now(),
      scope,
      workspaceId,
      ...(scope === "room" && opts.roomSlug ? { roomSlug: opts.roomSlug } : {}),
    };
    await db.set(designKey(id), tpl);
    await wsIndexAdd("designs", workspaceId, id);
    return { ok: true as const, id };
  });
}

// B4/Phase A — list designs VISIBLE to a room WITHIN a workspace: every global
// design in the workspace, plus the room's own room-scoped ones. With no roomSlug,
// only the workspace's global designs (the safe default). Never crosses tenants.
export async function listDesignMeta(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
  roomSlug?: string,
): Promise<UserTemplateMeta[]> {
  const db = getDb();
  const index = await wsIndexList("designs", workspaceId);
  const out: UserTemplateMeta[] = [];
  for (const id of index) {
    const tpl = await db.get<UserTemplate>(designKey(id));
    if (!tpl) continue;
    const scope: DesignScope = tpl.scope === "room" ? "room" : "global";
    if (scope === "room" && tpl.roomSlug !== roomSlug) continue; // not this room's
    out.push({ id: tpl.id, name: tpl.name, phaseCount: tpl.phases.length, createdAt: tpl.createdAt, scope });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDesign(id: string): Promise<UserTemplate | null> {
  return getDb().get<UserTemplate>(designKey(id));
}

export async function deleteDesign(id: string): Promise<boolean> {
  return withDesignLock(async () => {
    const db = getDb();
    const tpl = await db.get<UserTemplate>(designKey(id));
    if (!tpl) return false;
    const workspaceId = tpl.workspaceId ?? DEFAULT_WORKSPACE_ID;
    await wsIndexRemove("designs", workspaceId, id);
    await db.del(designKey(id));
    return true;
  });
}

// A5 — rename a saved design in place (the phases are untouched). Returns false if
// the id is unknown. Under the same write lock as save/delete.
export async function renameDesign(id: string, name: string): Promise<boolean> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return false;
  return withDesignLock(async () => {
    const db = getDb();
    const tpl = await db.get<UserTemplate>(designKey(id));
    if (!tpl) return false;
    await db.set(designKey(id), { ...tpl, name: clean });
    return true;
  });
}
