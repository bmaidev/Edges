// The Module contract — the keystone of the modular platform.
//
// A "module" is one facilitation tool (a phase primitive). Every module is
// self-describing. Because Next.js can't share one import graph between server
// logic (which touches the KV store) and client React renderers, the contract
// is split in two:
//   - ModuleServerDef  (this file's server half) — schema, computeView, handleAction
//   - ModuleClientDef  (registry.client.tsx)     — the per-role React renderers
// Both are keyed by the same ModuleKind, so the two halves line up.

import type { ZodType } from "zod";
import type {
  ContentItem,
  ModuleKind,
  ModuleView,
  Participant,
  Pattern,
  PhaseInstance,
  Role,
  SessionState,
  Submission,
  Visibility,
} from "@/lib/types";

// Re-export the base types so `from "@/lib/modules/types"` imports keep working.
export type { ModuleKind, ModuleView, PhaseInstance, Role, Visibility };

export const ALL_ROLES: Role[] = [
  "admin",
  "facilitator",
  "cohost",
  "participant",
  "projector",
];

// A write facade passed into handleAction so modules never import the store
// directly (avoids a module<->store import cycle). roomId is pre-bound.
export interface ModuleStore {
  addSubmission(
    handle: string,
    text: string,
    phaseId: string,
    tag?: string | null,
    token?: string | null,
  ): Promise<Submission>;
  allocate(
    token: string,
    kind: "lens" | "side",
    value: string,
    cap?: number,
  ): Promise<{ ok: boolean; reason?: string }>;
  // Votes: one value per (phase, token). value is module-specific (string,
  // string[], number, or a map) — stored/read as JSON.
  castVote(phaseId: string, token: string, value: unknown): Promise<void>;
  readVotes(phaseId: string): Promise<Record<string, unknown>>;
  // Word cloud: append-only words per phase.
  addWord(phaseId: string, token: string, word: string): Promise<void>;
  readWords(phaseId: string): Promise<{ token: string; word: string }[]>;
  // Run fn while holding a named, room-scoped lock; returns { ok: false, busy }
  // without running it if contended. Use to make read-modify-write control
  // actions (round advance, single AI generation) safe against concurrent taps.
  withLock<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: { ttlSeconds?: number },
  ): Promise<{ ok: true; value: T } | { ok: false; busy: true }>;
}

// Read snapshot + identity handed to computeView / handleAction. The store
// fetches the shared data once and passes it in, so modules don't re-query.
export interface ModuleContext {
  roomId: string;
  role: Role;
  phase: PhaseInstance;
  config: Record<string, unknown>;
  state: SessionState;
  participants: Participant[];
  visibleContent: ContentItem[];
  patterns: Pattern[];
  submissions: Submission[]; // facilitator-only data; [] for participant role
  me: Participant | null; // the calling participant, if any
  store: ModuleStore;
}

// A participant action routed through /api/action.
export interface ModuleAction {
  type: string; // e.g. "submit" | "allocate" | "vote"
  token?: string;
  handle?: string;
  payload?: Record<string, unknown>;
}

export interface ModuleCapabilities {
  acceptsActions: boolean; // participants can submit/vote
  liveResults: boolean; // results can stream vs reveal-on-advance
  needsTimer: boolean;
  projectable: boolean; // has a projector renderer
}

// The server half of a module.
export interface ModuleServerDef<Config = Record<string, unknown>> {
  id: ModuleKind;
  meta: { name: string; description: string; icon?: string };
  schema: ZodType<Config>;
  defaultConfig: Config;
  defaultVisibility: Record<Role, Visibility>;
  capabilities: ModuleCapabilities;
  // Compute the role-scoped view payload for the active phase.
  computeView(ctx: ModuleContext): Promise<unknown> | unknown;
  // Validate + apply a participant action. Omit for display-only modules.
  handleAction?(
    ctx: ModuleContext,
    action: ModuleAction,
  ): Promise<{ ok: boolean; reason?: string }>;
}

// Helper: a phase's effective visibility for a role, given an optional
// per-phase override matrix and the module's defaults.
export function resolveVisibility(
  module: Pick<ModuleServerDef, "defaultVisibility">,
  role: Role,
  override?: Partial<Record<Role, Visibility>>,
): Visibility {
  return override?.[role] ?? module.defaultVisibility[role];
}
