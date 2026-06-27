// H2 — pure pre-flight readiness engine. Computes a calm, single-glance "is this
// session sound?" check from the built phases + a few injected environment facts.
// PURE: no store / AI / env / clock reads inside (everything is passed in), so it
// is fully unit-testable and cheap to fold into the facilitator-state path.
//
// Every result is ADVISORY — the host surfaces it as a pill + sheet and NEVER
// physically blocks advancing. Severity is purely how loudly it's shown.

import { z } from "zod";
import { SERVER_MODULES, getServerModule } from "./modules/registry.server";
import type { ModuleKind, Readiness, ReadinessCheck, Severity } from "./types";

// Load-bearing text fields (a prompt/message/etc.) are `z.string()` with no
// `.min(1)`, so an EMPTY one passes zod yet ships a blank to the room — this
// heuristic catches that. Kept here as the single source of truth; BuilderApp
// re-imports it so the builder and pre-flight never drift.
export const LONG_TEXT =
  /prompt|message|body|desc|question|instruction|statement|placeholder|headline|tagline|heading|note/i;

function unwrap(zt: any): any {
  let t = zt;
  for (let i = 0; i < 6 && t?._def; i++) {
    const inner = t._def.innerType ?? t._def.schema;
    if (inner) t = inner;
    else break;
  }
  return t;
}
function isOptional(zt: any): boolean {
  try {
    return typeof zt.isOptional === "function" ? zt.isOptional() : false;
  } catch {
    return false;
  }
}

function schemaShape(moduleId: ModuleKind): Record<string, any> | null {
  try {
    const schema = SERVER_MODULES[moduleId]?.schema as any;
    return schema?.shape ?? schema?._def?.shape?.() ?? null;
  } catch {
    return null;
  }
}

// Structural validity (zod). Shared with BuilderApp's save-time validation.
export function validatePhaseConfig(
  moduleId: ModuleKind,
  config: unknown,
): { ok: boolean; msg?: string } {
  const schema = SERVER_MODULES[moduleId]?.schema;
  if (!schema) return { ok: true };
  const r = schema.safeParse(config);
  if (r.success) return { ok: true };
  const issue = r.error.issues[0];
  return { ok: false, msg: `${issue.path.join(".") || "config"}: ${issue.message}` };
}

// Does this module consume an earlier phase's contributions (a required
// `sourcePhaseId`)? Derived from the zod schema — mirrors design.ts's sourceNeed
// but kept local so pre-flight stays decoupled from the AI design path.
function sourceNeed(moduleId: ModuleKind): { has: boolean; required: boolean } {
  const shape = schemaShape(moduleId);
  const f = shape?.sourcePhaseId;
  if (!f) return { has: false, required: false };
  return { has: true, required: !isOptional(f) };
}

// The first required, load-bearing text field left empty/whitespace, or null.
function emptyRequiredText(
  moduleId: ModuleKind,
  config: Record<string, unknown>,
): string | null {
  const shape = schemaShape(moduleId);
  if (!shape) return null;
  for (const [key, zt] of Object.entries(shape)) {
    if (!LONG_TEXT.test(key)) continue;
    if (isOptional(zt)) continue;
    if (!(unwrap(zt) instanceof z.ZodString)) continue;
    const v = config[key];
    if (typeof v !== "string" || !v.trim()) return key;
  }
  return null;
}

export interface PreflightInput {
  phases: { id: string; moduleId: ModuleKind; config: Record<string, unknown> }[];
  participantCount: number;
  isProd: boolean;
  kvConfigured: boolean;
  aiConfigured: boolean;
  blobConfigured: boolean;
  // H2 — projector liveness: the last time the big screen polled (epoch ms), or
  // null if no projector has ever connected, plus `now` to age it. A null is NOT
  // flagged (plenty of sessions run without a projector); a STALE one is — the
  // screen was here and dropped, the "presenting to a dark wall" failure.
  projectorSeen?: number | null;
  now?: number;
}

// A projector that hasn't polled in this long is treated as lost (it beats on its
// own 2s poll, throttled to ≤8s, so ~3 missed beats).
export const PROJECTOR_LOST_MS = 20_000;

const RANK: Record<Severity, number> = { blocker: 3, warning: 2, info: 1, pass: 0 };

function label(p: { moduleId: ModuleKind; config: Record<string, unknown> }): string {
  return (p.config.label as string) || getServerModule(p.moduleId)?.meta.name || p.moduleId;
}

export function computeReadiness(input: PreflightInput): Readiness {
  const checks: ReadinessCheck[] = [];

  // 0) Empty session — nothing built to run. A warning (not a blocker): the host
  // may simply not have composed it yet, and pre-flight never blocks.
  if (input.phases.length === 0) {
    checks.push({
      id: "empty",
      severity: "warning",
      title: "No session built yet",
      detail: "Pick a mode or build a custom session before the room arrives.",
      remedyTab: "session",
    });
  }

  // 1) Storage — the off-the-record / 24h-TTL promise depends on real KV. In dev
  // the in-memory fallback is expected, so it's info, not a red alarm.
  if (!input.kvConfigured) {
    checks.push({
      id: "kv",
      severity: input.isProd ? "blocker" : "info",
      title: input.isProd
        ? "Storage isn't connected"
        : "Using in-memory storage (dev only)",
      detail: input.isProd
        ? "Set the KV/Upstash env vars — without them the room can't persist and the off-the-record guarantees don't hold."
        : "Fine for local dev; production needs the KV env vars.",
      remedyTab: "session",
    });
  }

  const idToIndex = new Map(input.phases.map((p, i) => [p.id, i]));

  input.phases.forEach((p, idx) => {
    const mod = getServerModule(p.moduleId);
    if (!mod) return;
    const name = label(p);

    // 2) Structural config validity.
    const v = validatePhaseConfig(p.moduleId, p.config);
    if (!v.ok) {
      checks.push({
        id: `cfg:${p.id}`,
        severity: "blocker",
        title: `“${name}” isn't configured`,
        detail: v.msg,
        phaseId: p.id,
        remedyTab: "session",
      });
    }

    // 3) Empty required prompt (zod passes an empty string; the room wouldn't).
    const empty = emptyRequiredText(p.moduleId, p.config);
    if (empty) {
      checks.push({
        id: `empty:${p.id}`,
        severity: "blocker",
        title: `“${name}” has an empty ${empty}`,
        detail: "This phase ships a blank to every screen — fill it in before going live.",
        phaseId: p.id,
        remedyTab: "session",
      });
    }

    // 4) Dependency wiring — a phase that consumes an earlier phase's input.
    const need = sourceNeed(p.moduleId);
    if (need.has && need.required) {
      const src = p.config.sourcePhaseId as string | undefined;
      const srcIdx = src != null ? idToIndex.get(src) : undefined;
      if (!src || srcIdx === undefined) {
        checks.push({
          id: `dep:${p.id}`,
          severity: "blocker",
          title: `“${name}” has no source phase`,
          detail: "It reads an earlier phase's contributions — point it at one that runs before it.",
          phaseId: p.id,
          remedyTab: "session",
        });
      } else if (srcIdx >= idx) {
        checks.push({
          id: `dep:${p.id}`,
          severity: "blocker",
          title: `“${name}” reads a phase that hasn't run yet`,
          detail: "Its source phase comes after it (or is itself) — there'll be nothing to show.",
          phaseId: p.id,
          remedyTab: "session",
        });
      }
    }

    // 5) AI not configured — a warning, never a blocker (the phase still runs,
    // just without its AI assist).
    if (mod.capabilities.usesAi && !input.aiConfigured) {
      checks.push({
        id: `ai:${p.id}`,
        severity: "warning",
        title: `“${name}” uses AI, which isn't set up`,
        detail: "It'll run, but its AI step is unavailable until an API key is configured.",
        phaseId: p.id,
      });
    }

    // 6) Media without blob storage — uploads won't work.
    if (p.moduleId === "media" && !input.blobConfigured) {
      checks.push({
        id: `media:${p.id}`,
        severity: "warning",
        title: `“${name}” needs image/file storage`,
        detail: "Blob storage isn't configured, so uploads in this media phase won't work.",
        phaseId: p.id,
        remedyTab: "content",
      });
    }
  });

  // 7) Projector connection — the "presenting to a dark screen" guard. Only fires
  // once a projector HAS connected and then gone quiet (a null is left silent, so
  // a projector-less session is never nagged).
  if (input.projectorSeen != null) {
    const age = (input.now ?? input.projectorSeen) - input.projectorSeen;
    if (age > PROJECTOR_LOST_MS) {
      checks.push({
        id: "projector",
        severity: "warning",
        title: "The projector looks disconnected",
        detail:
          "The big screen was connected but has stopped responding — it may have slept or closed. Re-open the screen link before you present.",
        remedyTab: "session",
      });
    }
  }

  // 8) Who's here (neutral context).
  checks.push({
    id: "joined",
    severity: "info",
    title: `${input.participantCount} ${input.participantCount === 1 ? "person" : "people"} joined`,
  });

  const overall = checks.reduce<Severity>(
    (worst, c) => (RANK[c.severity] > RANK[worst] ? c.severity : worst),
    "pass",
  );
  return { overall, checks };
}
