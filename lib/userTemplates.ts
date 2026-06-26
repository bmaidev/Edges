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
import { getServerModule } from "./modules/registry.server";
import type { ModuleKind, PhaseInstance } from "./types";

export interface UserTemplate {
  id: string;
  name: string;
  phases: PhaseInstance[];
  createdAt: number;
}
// Lightweight list projection — never ships the full phase configs.
export interface UserTemplateMeta {
  id: string;
  name: string;
  phaseCount: number;
  createdAt: number;
}

const INDEX_KEY = "rooms:designidx";
const designKey = (id: string) => `rooms:design:${id}`;
const MAX_DESIGNS = 200; // soft cap on the shared library
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
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const v = validatePhases(rawPhases);
  if (!v.ok) return v;
  const clean = name.trim().slice(0, 80) || "Untitled design";
  return withDesignLock(async () => {
    const db = getDb();
    const index = (await db.get<string[]>(INDEX_KEY)) ?? [];
    if (index.length >= MAX_DESIGNS)
      return { ok: false as const, error: "The template library is full." };
    const id = newId();
    const tpl: UserTemplate = { id, name: clean, phases: v.phases, createdAt: Date.now() };
    await db.set(designKey(id), tpl);
    await db.set(INDEX_KEY, [...index, id]);
    return { ok: true as const, id };
  });
}

export async function listDesignMeta(): Promise<UserTemplateMeta[]> {
  const db = getDb();
  const index = (await db.get<string[]>(INDEX_KEY)) ?? [];
  const out: UserTemplateMeta[] = [];
  for (const id of index) {
    const tpl = await db.get<UserTemplate>(designKey(id));
    if (tpl) out.push({ id: tpl.id, name: tpl.name, phaseCount: tpl.phases.length, createdAt: tpl.createdAt });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDesign(id: string): Promise<UserTemplate | null> {
  return getDb().get<UserTemplate>(designKey(id));
}

export async function deleteDesign(id: string): Promise<boolean> {
  return withDesignLock(async () => {
    const db = getDb();
    const index = (await db.get<string[]>(INDEX_KEY)) ?? [];
    if (!index.includes(id)) return false;
    await db.set(INDEX_KEY, index.filter((x) => x !== id));
    await db.del(designKey(id));
    return true;
  });
}
