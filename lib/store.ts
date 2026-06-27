// State layer for v2. Vercel KV / Upstash Redis in prod; in-memory fallback for
// local dev (per-process, resets on reload — prod MUST set the KV env vars).

import {
  DEFAULT_ROOM_ID,
  roomKeys,
  SESSION_TOPIC,
  TTL_SECONDS,
  clusterAssistAvailable,
} from "./session";
import { getMode, getPhase } from "./modes";
import { computeRoomHealth } from "./health";
import { planVsActual } from "./timing";
import { PLACED_KEY, heldLatecomers, readPlaced } from "./modules/groups";
import { computeReadiness } from "./preflight";
import { aiAvailable } from "./ai";
import {
  extractRunsheet,
  hasRunsheet,
  stripRunsheet,
} from "./modules/runsheet";
import { resolveAttribution } from "./modules/attribution";
import { HEARTBEAT_THROTTLE_MS, isDriverLive, liveRoster } from "./presence";
import { computeCofac } from "./cofac";
import {
  PROJECTOR_FLOOR,
  computeParticipationSignal,
  getServerModule,
} from "./modules/registry.server";
import type {
  ModuleAction,
  ModuleContext,
  ModuleStore,
} from "./modules/types";
import type {
  AllocationSummary,
  ContentItem,
  ContentType,
  CoordinatorInfo,
  FacilitatorState,
  HostPresence,
  ModeId,
  ModuleKind,
  ModuleView,
  ParticipationSignal,
  Participant,
  Pattern,
  PublicState,
  Role,
  SessionState,
  SpotlightRef,
  Submission,
  TakeawaySnapshot,
} from "./types";

// Support both classic Vercel KV and Upstash Redis env names.
const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useKv = Boolean(KV_URL && KV_TOKEN);

interface Backend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  // Atomic set-if-absent with TTL. Returns true only if the caller acquired the
  // key — the basis for a real distributed lock (Redis SET NX EX). The memory
  // fallback is atomic by virtue of JS's single thread.
  setNX(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  // Atomic append (Redis RPUSH) — concurrency-safe for many writers.
  rpush<T>(key: string, value: T): Promise<void>;
  lrange<T>(key: string): Promise<T[]>;
  // Overwrite a whole list (del + rpush all). For low-concurrency edits/deletes.
  replaceList<T>(key: string, values: T[]): Promise<void>;
  // Per-field hash ops — concurrent writes to different fields don't collide.
  hset<T>(key: string, field: string, value: T): Promise<void>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  // Atomic per-field delete (Redis HDEL) — clears specific fields without a
  // whole-hash del window, so it never races writes to OTHER fields.
  hdel(key: string, ...fields: string[]): Promise<void>;
}

// Defensive: list/hash values may come back as objects (auto-deserialized) or
// JSON strings depending on the client — normalize both.
function coerce<T>(v: unknown): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return v as T;
    }
  }
  return v as T;
}

let backend: Backend;

if (useKv) {
  const { createClient } = require("@vercel/kv");
  const client = createClient({ url: KV_URL, token: KV_TOKEN });
  backend = {
    async get<T>(key: string): Promise<T | null> {
      return ((await client.get(key)) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      await client.set(key, value, { ex: TTL_SECONDS });
    },
    async setNX(key: string, value: unknown, ttlSeconds: number) {
      // Upstash/Vercel KV returns "OK" when the NX set lands, null otherwise.
      const res = await client.set(key, value, { nx: true, ex: ttlSeconds });
      return res === "OK" || res === true;
    },
    async del(...keys: string[]) {
      if (keys.length) await client.del(...keys);
    },
    async rpush<T>(key: string, value: T) {
      await client.rpush(key, value as unknown as string);
      await client.expire(key, TTL_SECONDS);
    },
    async lrange<T>(key: string): Promise<T[]> {
      const raw = (await client.lrange(key, 0, -1)) as unknown[];
      return (raw ?? []).map((v) => coerce<T>(v));
    },
    async replaceList<T>(key: string, values: T[]) {
      await client.del(key);
      if (values.length) {
        await client.rpush(key, ...(values as unknown as string[]));
        await client.expire(key, TTL_SECONDS);
      }
    },
    async hset<T>(key: string, field: string, value: T) {
      await client.hset(key, { [field]: value });
      await client.expire(key, TTL_SECONDS);
    },
    async hget<T>(key: string, field: string): Promise<T | null> {
      const v = await client.hget(key, field);
      return v == null ? null : coerce<T>(v);
    },
    async hgetall<T>(key: string): Promise<Record<string, T>> {
      const all = (await client.hgetall(key)) as Record<string, unknown> | null;
      if (!all) return {};
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(all)) out[k] = coerce<T>(v);
      return out;
    },
    async hdel(key: string, ...fields: string[]) {
      if (fields.length) await client.hdel(key, ...fields);
    },
  };
} else {
  // Pin to globalThis so all route-module instances share one map in dev
  // (Next can re-instantiate modules per route). Prod uses KV, never this.
  const g = globalThis as unknown as { __edgesMem?: Map<string, unknown> };
  const mem = (g.__edgesMem ??= new Map<string, unknown>());
  backend = {
    async get<T>(key: string) {
      return (mem.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      mem.set(key, value);
    },
    async setNX(key: string, value: unknown) {
      // Atomic in dev: JS is single-threaded, so the has()/set() pair can't be
      // interleaved. TTL is a no-op here (dev resets on reload; prod uses KV).
      if (mem.has(key)) return false;
      mem.set(key, value);
      return true;
    },
    async del(...keys: string[]) {
      keys.forEach((k) => mem.delete(k));
    },
    async rpush<T>(key: string, value: T) {
      const arr = (mem.get(key) as T[]) ?? [];
      arr.push(value);
      mem.set(key, arr);
    },
    async lrange<T>(key: string): Promise<T[]> {
      return ((mem.get(key) as T[]) ?? []).slice();
    },
    async replaceList<T>(key: string, values: T[]) {
      mem.set(key, values.slice());
    },
    async hset<T>(key: string, field: string, value: T) {
      const h = (mem.get(key) as Record<string, T>) ?? {};
      h[field] = value;
      mem.set(key, h);
    },
    async hget<T>(key: string, field: string): Promise<T | null> {
      const h = (mem.get(key) as Record<string, T>) ?? {};
      return h[field] ?? null;
    },
    async hgetall<T>(key: string): Promise<Record<string, T>> {
      return { ...((mem.get(key) as Record<string, T>) ?? {}) };
    },
    async hdel(key: string, ...fields: string[]) {
      const h = mem.get(key) as Record<string, unknown> | undefined;
      if (!h) return;
      for (const f of fields) delete h[f];
      mem.set(key, h);
    },
  };
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

// ---- State ----------------------------------------------------------------

const DEFAULT_STATE: SessionState = {
  mode: null,
  phaseId: null,
  timerEndsAt: null,
  timerRemainingMs: null,
  readaroundIndex: 0,
  topic: SESSION_TOPIC,
  ended: false,
  actionItems: [],
  spotlight: null, // C4 — so endSession ({...DEFAULT_STATE}) clears a spotlight for free
  driver: null, // C5 — the driving baton is cleared on end for free
  ambient: null, // E3 — a calm break is cleared on end for free
  rev: 0, // a real write always has rev > 0, so the fallback never wins a race
};

export async function getState(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  // IMPORTANT: never write here. This is called by every /api/state poll, and
  // KV reads can transiently return null (eventual consistency). Writing
  // DEFAULT_STATE on a stale read would clobber a live session's real state.
  const s = await backend.get<SessionState>(roomKeys(roomId).state);
  return s ?? DEFAULT_STATE;
}

async function writeState(
  next: SessionState,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  // Stamp a strictly-increasing rev. Date.now() handles the normal case;
  // max(prev.rev+1) guarantees monotonicity even across clock skew between
  // serverless instances, so clients can safely reject any older read.
  const prev = await backend.get<SessionState>(roomKeys(roomId).state);
  const rev = Math.max(Date.now(), (prev?.rev ?? 0) + 1);
  const withRev = { ...next, rev };
  await backend.set(roomKeys(roomId).state, withRev);
  return withRev;
}

// Convert a built-in mode's phases into the in-state PhaseInstance[] form.
function modePhaseInstances(mode: ModeId): import("./types").PhaseInstance[] {
  const m = getMode(mode);
  if (!m) return [];
  return m.phases.map((p) => ({
    id: p.id,
    moduleId: p.primitive,
    config: p.config as unknown as Record<string, unknown>,
  }));
}

// Resolve the active phase sequence: custom phases in state win; else the mode.
function resolvePhases(state: SessionState): import("./types").PhaseInstance[] {
  if (state.phases && state.phases.length) return state.phases;
  return state.mode ? modePhaseInstances(state.mode) : [];
}

// E3 — the synthetic phase id used while a calm ambient break/hold is on screen.
const AMBIENT_PHASE_ID = "__ambient__";

function resolveActive(
  state: SessionState,
): import("./types").PhaseInstance | null {
  // E3 — when ambient is active, the active phase is a SYNTHETIC ambient module
  // (never a real sequence phase), so the room shows the calm screen without
  // touching the underlying sequence.
  if (state.phaseId === AMBIENT_PHASE_ID && state.ambient) {
    return {
      id: AMBIENT_PHASE_ID,
      moduleId: "ambient",
      config: {
        label: state.ambient.kind === "hold" ? "Hold" : "Break",
        kind: state.ambient.kind,
        // E3 scene engine — carry the visual scene + its start anchor so the
        // ambient renderer can pace a breathing circle / show a big countdown.
        scene: state.ambient.scene ?? state.ambient.kind,
        startedAt: state.ambient.startedAt ?? null,
        note: state.ambient.note,
      },
    };
  }
  return resolvePhases(state).find((p) => p.id === state.phaseId) ?? null;
}

export async function setMode(
  mode: ModeId,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const phases = modePhaseInstances(mode);
  return writeState(
    {
      ...state,
      mode,
      sessionName: getMode(mode)?.name,
      phases,
      phaseId: phases[0]?.id ?? "lobby",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      spotlight: null, // C4 — a relaunch clears any lingering spotlight
      ended: false,
    },
    roomId,
  );
}

// Launch a custom (builder-composed) phase sequence.
export async function setPhases(
  phases: import("./types").PhaseInstance[],
  sessionName: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const written = await writeState(
    {
      ...state,
      mode: null,
      sessionName,
      phases,
      phaseId: phases[0]?.id ?? null,
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      spotlight: null, // C4 — a relaunch clears any lingering spotlight
      ended: false,
    },
    roomId,
  );
  await runOnEnter(roomId, written); // D4 — freeze a rotation first-phase's cohort
  return written;
}

// C3 — `release` is direction-aware: queued content is released ONLY on a
// forward move (the host route derives it from the sequence index). A backward
// move (Back / Re-open) must NOT dump queued slides onto the room — the headline
// footgun fix. Default true preserves the plain-advance behaviour for any other
// caller.
export async function setPhase(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
  // C5 — opts.claimDriver lets a take-over Advance claim the baton in the SAME
  // write as the phase change (one rev, no flap window).
  opts: { release?: boolean; claimDriver?: import("./types").DriverInfo } = {},
): Promise<SessionState> {
  const state = await getState(roomId);
  if (opts.release !== false) await releaseQueuedContent(roomId);
  const written = await writeState(
    {
      ...state,
      phaseId,
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      spotlight: null, // C4 — advancing clears any spotlight from the prior phase
      ...(opts.claimDriver ? { driver: opts.claimDriver } : {}), // C5 — co-claim
    },
    roomId,
  );
  await runOnEnter(roomId, written); // D4 — let the entered module freeze its cohort
  // F4 — append a content-free phase-entry stamp (phaseId + time) so the host can
  // review plan-vs-actual phase timing after the run. Best-effort: a logging hiccup
  // must never block the advance. Wiped with everything else on endSession.
  await backend
    .rpush(roomKeys(roomId).phaseLog, { phaseId, at: Date.now() })
    .catch(() => {});
  return written;
}

// F4 — a content-free phase-advance timing log: one {phaseId, at} stamp per
// setPhase, in chronological order. Off-the-record like everything else (wiped on
// endSession). Read by the host Session tab to show planned-vs-actual per phase.
export interface PhaseLogEntry {
  phaseId: string;
  at: number;
}
export async function readPhaseLog(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<PhaseLogEntry[]> {
  return backend.lrange<PhaseLogEntry>(roomKeys(roomId).phaseLog);
}

// C4 — set (or clear, with null) the spotlighted response. A read-modify-write of
// the state key, so it rides authoritative-apply: writeState stamps a fresh
// monotonic rev and the host route returns the just-written state (no KV read-back).
export async function setSpotlight(
  ref: SpotlightRef | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, spotlight: ref ?? null }, roomId);
}

// C7 — the lead's co-facilitator controls. A partial patch (enable and/or tune),
// so the off-switch and the sensitivity dial move independently. Rides
// authoritative-apply (writeState bumps rev).
export async function setCofac(
  patch: { enabled?: boolean; sensitivity?: import("./cofac").CofacSensitivity },
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const next = { ...state };
  if ("enabled" in patch) next.cofacEnabled = patch.enabled;
  if ("sensitivity" in patch) next.cofacSensitivity = patch.sensitivity;
  return writeState(next, roomId);
}

// C7 — persist a nudge dismissal ({phaseId, kind}) so it stays gone for that phase
// across polls / reloads / co-host devices. Deduped; capped to the recent few so
// the list can't grow unbounded over a long multi-phase session.
export async function dismissCofac(
  phaseId: string,
  kind: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const prev = state.cofacDismissed ?? [];
  if (prev.some((d) => d.phaseId === phaseId && d.kind === kind)) return state;
  const next = [...prev, { phaseId, kind }].slice(-20);
  return writeState({ ...state, cofacDismissed: next }, roomId);
}

// E1 — author the front-of-room lobby: the begin-cue line and whether the live
// "N here" count shows. A partial patch (only the provided keys change), so the
// host can set the cue and toggle the count independently. Rides authoritative-
// apply: writeState bumps rev, so an in-flight poll can't revert the authoring.
export async function setLobbyCue(
  patch: { cue?: string | null; countVisible?: boolean },
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const next = { ...state };
  if ("cue" in patch)
    next.lobbyCue = patch.cue ? patch.cue.slice(0, 200) : null;
  if ("countVisible" in patch) next.lobbyCountVisible = patch.countVisible;
  return writeState(next, roomId);
}

// D2 — toggle the projector into high-contrast / colour-safe mode for the whole
// room (the shared wall, where colour-blindness matters most, has no per-device
// prefs). Rides authoritative-apply (writeState bumps rev).
export async function setProjectorA11y(
  on: boolean,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, projectorA11y: on }, roomId);
}

// C6 — silence (or restore) the timer chime for the WHOLE room. Distinct from the
// per-device cockpit mute: this is the host's choice for every room surface.
// Rides authoritative-apply (writeState bumps rev).
export async function setTimerSound(
  off: boolean,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, timerSoundOff: off }, roomId);
}

// C5 — claim / hand off / release the driving baton. A read-modify-writeState, so
// the claim bumps the monotonic rev and rides authoritative-apply — an in-flight
// poll at the old rev can never revert it. `driver` is the target (self for a
// claim, someone else for a handoff) or null to release.
export async function setDriver(
  driver: import("./types").DriverInfo | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, driver: driver ?? null }, roomId);
}

// E3 — summon a calm ambient break/hold over the live sequence. Snapshots the
// current phase + timer so resume is non-destructive. A break runs a server-
// stamped countdown (durationSec); a hold is open-ended. Rides authoritative-apply
// (writeState bumps rev). Idempotent re-entry keeps the ORIGINAL return pointer so
// extending a break can't strand the room on the ambient screen.
export async function setAmbient(
  scene: import("./types").AmbientScene,
  durationSec: number | null,
  note: string | undefined,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const already = state.phaseId === AMBIENT_PHASE_ID && state.ambient;
  // A positive duration makes it a TIMED scene (kind "break" → endsAt); otherwise
  // it's open-ended (kind "hold"). The scene controls the VISUAL independently.
  const timed = Boolean(durationSec && durationSec > 0);
  const kind: "break" | "hold" = timed ? "break" : "hold";
  const endsAt = timed ? Date.now() + Math.floor(durationSec!) * 1000 : null;
  return writeState(
    {
      ...state,
      phaseId: AMBIENT_PHASE_ID,
      ambient: {
        kind,
        scene,
        // Keep the original start + snapshot across re-entry (extend / scene swap).
        startedAt: already ? state.ambient!.startedAt ?? Date.now() : Date.now(),
        note: note?.slice(0, 200),
        returnPhaseId: already ? state.ambient!.returnPhaseId : state.phaseId,
        returnTimerEndsAt: already ? state.ambient!.returnTimerEndsAt : state.timerEndsAt,
      },
      timerEndsAt: endsAt,
      timerRemainingMs: null,
    },
    roomId,
  );
}

// E3 — leave the ambient screen, restoring the EXACT prior phase + timer. Crucially
// NOT via setPhase (which nulls the timer and releases queued content) — a break
// must hand the room back exactly as it left it.
export async function resumeAmbient(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  if (!state.ambient) return state;
  return writeState(
    {
      ...state,
      phaseId: state.ambient.returnPhaseId,
      timerEndsAt: state.ambient.returnTimerEndsAt,
      timerRemainingMs: null,
      ambient: null,
    },
    roomId,
  );
}

// C1 — every timer mutation is a read-compute-write of the state key, so two
// drivers (lead + cohost) can otherwise read a stale state and drop time (a +2
// vs a pause). Serialise them all through the per-room "timer" lock. The lock is
// non-blocking, so a busy loser would silently no-op and DROP its action — to
// honour "never drops time" we retry briefly (each op is a single get+write, so
// contention clears in ms), then fall back to an unlocked run rather than lose it.
async function withTimerLock(
  roomId: string,
  fn: () => Promise<SessionState>,
): Promise<SessionState> {
  for (let i = 0; i < 10; i++) {
    const res = await withLock(roomId, "timer", fn, { ttlSeconds: 5 });
    if (res.ok) return res.value;
    await new Promise((r) => setTimeout(r, 30));
  }
  return fn(); // last resort: apply unlocked rather than silently drop the action
}

// Set (or clear) an absolute deadline. Clears any paused-remaining so the timer
// is unambiguously RUNNING (or IDLE when endsAt is null).
export async function setTimer(
  endsAt: number | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  return withTimerLock(roomId, async () => {
    const state = await getState(roomId);
    return writeState(
      { ...state, timerEndsAt: endsAt, timerRemainingMs: null },
      roomId,
    );
  });
}

// Add (or subtract) time. Extends the live deadline when RUNNING, the frozen
// remaining when PAUSED, and no-ops when IDLE (nothing to extend).
export async function addTime(
  addMs: number,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  return withTimerLock(roomId, async () => {
    const state = await getState(roomId);
    if (state.timerEndsAt != null)
      return writeState(
        { ...state, timerEndsAt: state.timerEndsAt + addMs },
        roomId,
      );
    if (state.timerRemainingMs != null)
      return writeState(
        { ...state, timerRemainingMs: Math.max(0, state.timerRemainingMs + addMs) },
        roomId,
      );
    return state; // idle
  });
}

// Freeze a running timer: capture the remaining ms, drop the deadline.
export async function pauseTimer(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  return withTimerLock(roomId, async () => {
    const state = await getState(roomId);
    if (state.timerEndsAt == null) return state; // not running
    const remaining = Math.max(0, state.timerEndsAt - Date.now());
    return writeState(
      { ...state, timerEndsAt: null, timerRemainingMs: remaining },
      roomId,
    );
  });
}

// Resume a paused timer: a fresh deadline now + the frozen remaining.
export async function resumeTimer(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  return withTimerLock(roomId, async () => {
    const state = await getState(roomId);
    if (state.timerRemainingMs == null) return state; // not paused
    return writeState(
      { ...state, timerEndsAt: Date.now() + state.timerRemainingMs, timerRemainingMs: null },
      roomId,
    );
  });
}

// Replace the ENTIRE session state in a single write, with a fresh monotonic
// rev. Unlike setPhase/setTimer/setReadaroundIndex (each a read-modify-write of
// the state key), this takes no `getState` and so can't tear under eventual
// consistency: the caller computes the whole target object once. Used by the
// sample-room seeder to land a believable mid-session snapshot atomically.
export async function replaceState(
  next: SessionState,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  return writeState(next, roomId);
}

// F2 — mutate the action-item register. The ONLY writer is writeState (via this
// fn), so every add/edit/status/remove stamps a fresh rev and the client applies
// it authoritatively — an in-flight 2s poll can never clobber a just-added item
// (the Upstash flash bug, designed out). Serialised so two drivers don't race the
// read-modify-write.
export type ActionItemOp =
  | { kind: "add"; text: string; ownerName?: string; due?: string }
  | { kind: "update"; id: string; text?: string; ownerName?: string; due?: string }
  | { kind: "setStatus"; id: string; status: import("./types").ActionItemStatus }
  | { kind: "remove"; id: string }
  | { kind: "promote"; on: boolean }; // F2 — show/hide the board on the projector

export async function mutateActionItems(
  op: ActionItemOp,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const apply = async () => {
      const state = await getState(roomId);
      if (op.kind === "promote")
        return writeState({ ...state, actionItemsPromoted: op.on }, roomId);
      const items = [...(state.actionItems ?? [])];
      const now = Date.now();
      if (op.kind === "add") {
        const text = op.text.trim().slice(0, 500);
        if (text)
          items.push({
            id: newId(),
            text,
            ownerName: op.ownerName?.trim() || undefined,
            due: op.due || undefined,
            status: "open",
            createdAt: now,
            updatedAt: now,
          });
      } else {
        const i = items.findIndex((a) => a.id === op.id);
        if (i >= 0) {
          if (op.kind === "remove") items.splice(i, 1);
          else if (op.kind === "setStatus")
            items[i] = { ...items[i], status: op.status, updatedAt: now };
          else
            items[i] = {
              ...items[i],
              text: op.text?.trim() ? op.text.trim().slice(0, 500) : items[i].text,
              ownerName:
                op.ownerName !== undefined ? op.ownerName.trim() || undefined : items[i].ownerName,
              due: op.due !== undefined ? op.due || undefined : items[i].due,
              updatedAt: now,
            };
        }
      }
      return writeState({ ...state, actionItems: items }, roomId);
  };
  // Retry on contention (don't drop a captured item) — same philosophy as the
  // timer lock; each op is one get+write, so contention clears in ms.
  for (let i = 0; i < 10; i++) {
    const res = await withLock(roomId, "actionItems", apply, { ttlSeconds: 5 });
    if (res.ok) return res.value;
    await new Promise((r) => setTimeout(r, 30));
  }
  return apply();
}

// C3 — ordered phase ids of the active sequence, so the host route can tell a
// forward move from a backward one (direction-aware content release).
export async function phaseSequence(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<string[]> {
  const state = await getState(roomId);
  return resolvePhases(state).map((p) => p.id);
}

// F3 — the set of phase ids configured anonymous. Used to EXCLUDE anonymous-phase
// contributions from a published take-away: an anonymous phase promised the
// participant their text wouldn't be durably linked to them, but the recap is
// token-keyed, so storing those contributions would re-attach the very identity
// the phase hid. (A participant seeing their OWN anonymous text back is harmless;
// the leak is the durable token→text record surviving the session wipe.)
export async function anonymousPhaseIds(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Set<string>> {
  const state = await getState(roomId);
  const out = new Set<string>();
  for (const p of resolvePhases(state)) {
    const anon = (p.config as { anonymity?: string } | null)?.anonymity;
    if (anon === "anonymous" || anon === "anonymous-strict") out.add(p.id);
  }
  return out;
}

export async function setReadaroundIndex(
  index: number,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, readaroundIndex: Math.max(0, index) }, roomId);
}

// ---- Participants (Redis hash: token -> record) ---------------------------
// Hash ops: a join (new field) or an allocation (existing field) for one token
// never collides with another participant's write. No read-modify-write of the
// whole set, so concurrent joins/allocations can't clobber each other.

export async function addParticipant(
  token: string,
  handle: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const key = roomKeys(roomId).participants;
  const existing = await backend.hget<Participant>(key, token);
  if (!existing) {
    await backend.hset<Participant>(key, token, {
      token,
      handle,
      joinedAt: Date.now(),
    });
  }
}

export async function listParticipants(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Participant[]> {
  const map = await backend.hgetall<Participant>(roomKeys(roomId).participants);
  return Object.values(map).sort((a, b) => a.joinedAt - b.joinedAt);
}

// Self-allocation with optional per-option cap (e.g. 3 per lens triad).
export async function allocate(
  token: string,
  kind: "lens" | "side",
  value: string,
  cap?: number,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<{ ok: boolean; reason?: string }> {
  const key = roomKeys(roomId).participants;
  const me = await backend.hget<Participant>(key, token);
  if (!me) return { ok: false, reason: "unknown participant" };

  if (cap && cap > 0) {
    const all = await backend.hgetall<Participant>(key);
    const current = Object.values(all).filter(
      (p) => p.token !== token && (kind === "lens" ? p.lens : p.side) === value,
    ).length;
    if (current >= cap) return { ok: false, reason: "full" };
  }

  if (kind === "lens") me.lens = value;
  else me.side = value;
  await backend.hset<Participant>(key, token, me);
  return { ok: true };
}

// Facilitator manual reassignment.
export async function reassign(
  token: string,
  kind: "lens" | "side",
  value: string | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const key = roomKeys(roomId).participants;
  const me = await backend.hget<Participant>(key, token);
  if (!me) return;
  if (kind === "lens") me.lens = value;
  else me.side = value;
  await backend.hset<Participant>(key, token, me);
}

// ---- Liveness heartbeat (C2) ----------------------------------------------
// A dedicated single-field hash (NOT folded into the Participant record, whose
// hget-then-hset would race a concurrent allocation on the same token). One
// genuine single-field hset per token; throttled so 50 pollers don't hammer KV.

const TOUCH_THROTTLE_SECONDS = 15; // also the cushion under the 25s quiet threshold

export async function touchParticipant(
  token: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  // setNX a short-lived throttle key; if we wrote within the window, skip. The
  // in-memory backend makes both ops free, so CI/test are unaffected.
  const ok = await backend.setNX(
    `${roomKeys(roomId).seen}:touch:${token}`,
    1,
    TOUCH_THROTTLE_SECONDS,
  );
  if (!ok) return;
  await backend.hset<number>(roomKeys(roomId).seen, token, Date.now());
}

export async function readHeartbeats(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Record<string, number>> {
  return backend.hgetall<number>(roomKeys(roomId).seen);
}

// H2 — projector liveness. The big screen already polls /state?role=projector
// every 2s; that poll stamps this single "last seen" timestamp (throttled), so
// pre-flight can tell a CONNECTED projector from a LOST one (the screen crashed /
// the laptop slept) and warn before the facilitator presents to a dark wall.
const PROJECTOR_THROTTLE_SECONDS = 8;
export async function heartbeatProjector(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const ok = await backend.setNX(
    `${roomKeys(roomId).projector}:touch`,
    1,
    PROJECTOR_THROTTLE_SECONDS,
  );
  if (!ok) return;
  await backend.set(roomKeys(roomId).projector, Date.now());
}
export async function readProjectorSeen(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<number | null> {
  return (await backend.get<number>(roomKeys(roomId).projector)) ?? null;
}

// C5 — host-presence heartbeat. A host console writes its presence on the
// privileged /state poll; role is the SERVER-resolved tier (never client-sent).
// Throttled like touchParticipant so 2s polls don't hammer KV. The whole record
// is one hset (field = presenceId), so co-hosts never race each other.
export async function heartbeatHost(
  presenceId: string,
  name: string,
  role: Role,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  if (!presenceId) return;
  const ok = await backend.setNX(
    `${roomKeys(roomId).hostPresence}:touch:${presenceId}`,
    1,
    Math.round(HEARTBEAT_THROTTLE_MS / 1000),
  );
  if (!ok) return;
  await backend.hset<HostPresence>(roomKeys(roomId).hostPresence, presenceId, {
    presenceId,
    name: typeof name === "string" ? name.slice(0, 40) : "",
    role,
    lastSeen: Date.now(),
  });
}

export async function readHostPresence(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<HostPresence[]> {
  const raw = await backend.hgetall<unknown>(roomKeys(roomId).hostPresence);
  return liveRoster(raw, Date.now());
}

// H1 — idempotency for the offline submit queue. A client tags each send with a
// stable `dedupeId`; `claimAction` setNX's it (true only the FIRST time). So a
// send that actually reached the server but whose response was lost — then gets
// replayed from the queue on reconnect — is recognised and skipped, never
// double-applied (critical for non-idempotent submissions). 1h TTL is ample.
export async function claimAction(
  roomId: string,
  dedupeId: string,
): Promise<boolean> {
  return backend.setNX(`${roomKeys(roomId).seen}:dedup:${dedupeId}`, 1, 3600);
}

// ---- Submissions (Redis list: atomic RPUSH append) ------------------------

export async function listSubmissions(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Submission[]> {
  return backend.lrange<Submission>(roomKeys(roomId).submissions);
}

export async function addSubmission(
  handle: string,
  text: string,
  phaseId: string,
  tag?: string | null,
  token?: string | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Submission> {
  const submission: Submission = {
    id: newId(),
    handle: handle.trim() || "Anonymous",
    text: text.trim(),
    phaseId,
    tag: tag ?? null,
    token: token ?? null,
    createdAt: Date.now(),
  };
  // Atomic append — concurrent Sends from the whole room can't drop each other.
  await backend.rpush<Submission>(roomKeys(roomId).submissions, submission);
  return submission;
}

export async function updateSubmission(
  id: string,
  patch: Partial<Pick<Submission, "text" | "tag">>,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const list = await listSubmissions(roomId);
  await backend.replaceList(
    roomKeys(roomId).submissions,
    list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  );
}

export async function deleteSubmission(
  id: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const list = await listSubmissions(roomId);
  await backend.replaceList(
    roomKeys(roomId).submissions,
    list.filter((s) => s.id !== id),
  );
}

// ---- Votes (poll/dotvote/rank/scale) — one hash, field `${phaseId}::${token}` ----

function voteField(phaseId: string, token: string): string {
  return `${phaseId}::${token}`;
}

export async function castVote(
  phaseId: string,
  token: string,
  value: unknown,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  await backend.hset(roomKeys(roomId).votes, voteField(phaseId, token), value);
}

// C2 nudge — record a "nudge the room" on a phase, with a 15s cooldown. setNX
// the cooldown key; only when fresh do we write the content-free __nudge__ marker
// (a Date.now() in the votes hash, excluded from responder counts) which ticks
// roomSignature so the re-pulse propagates. Returns false when within cooldown.
export async function tryNudge(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<boolean> {
  const fresh = await backend.setNX(`lock:${roomId}:nudgecd:${phaseId}`, 1, 15);
  if (fresh) await castVote(phaseId, "__nudge__", Date.now(), roomId);
  return fresh;
}

export async function readVotes(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Record<string, unknown>> {
  const all = await backend.hgetall<unknown>(roomKeys(roomId).votes);
  const prefix = `${phaseId}::`;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

// D4 — place / hold latecomers under the hold policy. Placement is stored in the
// phase's votes hash (PLACED_KEY), so a grouping module's cohortTokens folds the
// placed tokens in on its next poll. We bump rev with a no-op writeState so every
// screen re-syncs promptly (rather than waiting on the votes-only change).
export async function placeLatecomer(
  phaseId: string,
  tokens: string[],
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const votes = await readVotes(phaseId, roomId);
  const placed = new Set(readPlaced(votes));
  for (const t of tokens) placed.add(t);
  await castVote(phaseId, PLACED_KEY, Array.from(placed), roomId);
  return writeState({ ...(await getState(roomId)) }, roomId);
}

// D4 — send a placed latecomer back to "held" (the facilitator changed their mind
// before they were really seated). Removes the token(s) from PLACED_KEY.
export async function holdLatecomer(
  phaseId: string,
  tokens: string[],
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const votes = await readVotes(phaseId, roomId);
  const drop = new Set(tokens);
  const placed = readPlaced(votes).filter((t) => !drop.has(t));
  await castVote(phaseId, PLACED_KEY, placed, roomId);
  return writeState({ ...(await getState(roomId)) }, roomId);
}

// ---- Word cloud (append-only list, entries carry phaseId) -----------------

interface WordEntry {
  phaseId: string;
  token: string;
  word: string;
}

export async function addWord(
  phaseId: string,
  token: string,
  word: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  await backend.rpush<WordEntry>(roomKeys(roomId).words, { phaseId, token, word });
}

export async function readWords(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<{ token: string; word: string }[]> {
  const all = await backend.lrange<WordEntry>(roomKeys(roomId).words);
  return all
    .filter((w) => w.phaseId === phaseId)
    .map((w) => ({ token: w.token, word: w.word }));
}

// ---- Content (injected by the facilitator) --------------------------------

export async function listContent(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<ContentItem[]> {
  return (await backend.get<ContentItem[]>(roomKeys(roomId).content)) ?? [];
}

export async function addContent(
  type: ContentType,
  title: string,
  body: string,
  target: "now" | "queue" | "hold",
  roomId: string = DEFAULT_ROOM_ID,
): Promise<ContentItem> {
  const list = await listContent(roomId);
  const item: ContentItem = {
    id: newId(),
    type,
    title: title.trim().slice(0, 120),
    body: body.trim(),
    visible: target === "now",
    queued: target === "queue",
    addedAt: Date.now(),
  };
  list.push(item);
  await backend.set(roomKeys(roomId).content, list);
  return item;
}

export async function updateContent(
  id: string,
  patch: Partial<Pick<ContentItem, "title" | "body" | "visible" | "queued">>,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const list = await listContent(roomId);
  await backend.set(
    roomKeys(roomId).content,
    list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  );
}

export async function deleteContent(
  id: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const list = await listContent(roomId);
  await backend.set(
    roomKeys(roomId).content,
    list.filter((c) => c.id !== id),
  );
}

// Release any queued content to visible (called on phase advance).
// Returns the ids flipped queued→visible, so a forward move's release can be
// re-queued by a nav undo.
async function releaseQueuedContent(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<string[]> {
  const list = await listContent(roomId);
  const flipped = list.filter((c) => c.queued).map((c) => c.id);
  if (!flipped.length) return [];
  await backend.set(
    roomKeys(roomId).content,
    list.map((c) => (c.queued ? { ...c, visible: true, queued: false } : c)),
  );
  return flipped;
}

// ---- Patterns -------------------------------------------------------------

export async function listPatterns(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Pattern[]> {
  const list = (await backend.get<Pattern[]>(roomKeys(roomId).patterns)) ?? [];
  return list.sort((a, b) => a.order - b.order);
}

export async function createPattern(
  name: string,
  submissionIds: string[] = [],
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Pattern> {
  const patterns = await listPatterns(roomId);
  const pattern: Pattern = {
    id: newId(),
    name: name.trim().slice(0, 60),
    order: patterns.length,
    submissionIds,
  };
  patterns.push(pattern);
  await backend.set(roomKeys(roomId).patterns, patterns);
  return pattern;
}

export async function renamePattern(
  id: string,
  name: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const patterns = await listPatterns(roomId);
  await backend.set(
    roomKeys(roomId).patterns,
    patterns.map((p) =>
      p.id === id ? { ...p, name: name.trim().slice(0, 60) } : p,
    ),
  );
}

export async function reorderPatterns(
  orderedIds: string[],
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const patterns = await listPatterns(roomId);
  const byId = new Map(patterns.map((p) => [p.id, p]));
  const next = orderedIds
    .map((id, idx) => {
      const p = byId.get(id);
      return p ? { ...p, order: idx } : null;
    })
    .filter((p): p is Pattern => p !== null);
  await backend.set(roomKeys(roomId).patterns, next);
}

export async function deletePattern(
  id: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const patterns = await listPatterns(roomId);
  await backend.set(
    roomKeys(roomId).patterns,
    patterns.filter((p) => p.id !== id),
  );
}

// ---- C3 recovery: clear one phase's data + a nav-only depth-1 undo ---------

// Clear EVERY response for one phase (a contaminated poll, a mis-started round)
// without touching any other phase. Votes go via hdel of exactly this phase's
// fields (prefix `${phaseId}::`), which also clears reserved markers
// (__constraint__/__round__/__ai__/__stage__/__silent__) for free — so a
// re-opened 1-2-4-All restarts at round 0 with no stale AI synthesis. Submissions
// and words are filtered (no atomic predicate-delete exists). Bumps rev so the
// cleared state pushes to every screen via authoritative-apply.
export async function clearPhaseData(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const KEYS = roomKeys(roomId);
  const votes = await backend.hgetall<unknown>(KEYS.votes);
  const fields = Object.keys(votes).filter((k) => k.startsWith(`${phaseId}::`));
  if (fields.length) await backend.hdel(KEYS.votes, ...fields);
  const subs = await listSubmissions(roomId);
  await backend.replaceList(
    KEYS.submissions,
    subs.filter((s) => s.phaseId !== phaseId),
  );
  const words = await backend.lrange<{ phaseId: string }>(KEYS.words);
  await backend.replaceList(
    KEYS.words,
    words.filter((w) => w.phaseId !== phaseId),
  );
  const state = await getState(roomId);
  return writeState({ ...state }, roomId); // rev bump so clients re-sync
}

// The depth-1 nav undo snapshot. NAV-ONLY by design: it records where the room
// WAS (phase + timer + read-around position) and which content a forward move
// released — never any submission text, vote value, or word. Undo restores
// navigation and re-queues released content; a confirmed clear stays cleared.
export interface UndoSnapshot {
  prevPhaseId: string | null;
  prevTimerEndsAt: number | null;
  prevTimerRemainingMs: number | null;
  prevReadaroundIndex: number;
  releasedIds: string[];
  label: string;
  at: number;
}

export async function writeUndo(
  snap: UndoSnapshot,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  await backend.set(roomKeys(roomId).undo, snap);
}

export async function readUndo(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<UndoSnapshot | null> {
  return backend.get<UndoSnapshot>(roomKeys(roomId).undo);
}

export async function clearUndo(roomId: string = DEFAULT_ROOM_ID): Promise<void> {
  await backend.del(roomKeys(roomId).undo);
}

// Restore the last nav move: re-queue any content it released, return to the
// prior phase/timer/read-around index, then consume the snapshot. Never touches
// response data — cleared answers are NOT resurrected.
export async function undoLastAction(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<{ state: SessionState; undone: boolean }> {
  const snap = await readUndo(roomId);
  if (!snap) return { state: await getState(roomId), undone: false };

  if (snap.releasedIds.length) {
    const list = await listContent(roomId);
    const ids = new Set(snap.releasedIds);
    await backend.set(
      roomKeys(roomId).content,
      list.map((c) =>
        ids.has(c.id) ? { ...c, visible: false, queued: true } : c,
      ),
    );
  }

  const state = await getState(roomId);
  const restored = await writeState(
    {
      ...state,
      phaseId: snap.prevPhaseId,
      timerEndsAt: snap.prevTimerEndsAt,
      timerRemainingMs: snap.prevTimerRemainingMs,
      readaroundIndex: snap.prevReadaroundIndex,
    },
    roomId,
  );
  await clearUndo(roomId);
  return { state: restored, undone: true };
}

// ---- End / wipe -----------------------------------------------------------

// B5 — fully delete EVERY key for a room, including the state key (unlike
// endSession, which re-writes an empty ended state). Used to tear down a
// disposable rehearsal shadow room so it leaves nothing behind.
// A4 — move a NON-LIVE room's session state to a new room id (slug rename). Only
// the `state` key can hold data for a non-live room (a draft that's been built;
// a live room is gated out of rename, and an archived one's live keys are wiped),
// so this is a single plain-value copy + delete. Returns whether anything moved.
export async function migrateRoomState(
  oldId: string,
  newId: string,
): Promise<boolean> {
  const raw = await backend.get<SessionState>(roomKeys(oldId).state);
  if (raw == null) return false;
  await backend.set(roomKeys(newId).state, raw);
  await backend.del(roomKeys(oldId).state);
  return true;
}

export async function purgeRoom(roomId: string): Promise<void> {
  const KEYS = roomKeys(roomId);
  await backend.del(
    KEYS.state,
    KEYS.participants,
    KEYS.submissions,
    KEYS.content,
    KEYS.patterns,
    KEYS.votes,
    KEYS.words,
    KEYS.seen,
    KEYS.undo,
    KEYS.hostPresence,
  );
}

export async function endSession(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const KEYS = roomKeys(roomId);
  await backend.del(
    KEYS.participants,
    KEYS.submissions,
    KEYS.content,
    KEYS.patterns,
    KEYS.votes,
    KEYS.words,
    KEYS.seen,
    KEYS.undo,
    KEYS.hostPresence, // C5 — the "burn now" wipe clears co-facilitator presence too
    KEYS.phaseLog, // F4 — the timing log is off-the-record too; wiped with the rest
    KEYS.projector, // H2 — drop projector liveness so a new run starts clean
  );
  await writeState({ ...DEFAULT_STATE, ended: true }, roomId);
}

// ---- F3 take-away (the participant keep-recap) -----------------------------
// A separate session key (room-scoped, inherits the 24h TTL) that SURVIVES the
// end wipe so participants can read their recap; it self-destructs at 24h. The
// raw live data is still wiped.

function takeawayKey(roomId: string, token: string): string {
  return `room:${roomId}:takeaway:${token}`;
}

export async function getTakeaway(
  roomId: string,
  token: string,
): Promise<TakeawaySnapshot | null> {
  if (!token) return null;
  return backend.get<TakeawaySnapshot>(takeawayKey(roomId, token));
}

// Publish a take-away and end the session in the correct order: write the
// snapshot FIRST (so the ended+token state can never precede its data), wipe the
// live data, then flip state to ended + record the published token. The takeaway
// key is NOT wiped — it's the recap.
export async function publishAndEnd(
  roomId: string,
  token: string,
  snapshot: TakeawaySnapshot,
): Promise<void> {
  await backend.set(takeawayKey(roomId, token), snapshot); // inherits 24h TTL
  const KEYS = roomKeys(roomId);
  await backend.del(
    KEYS.participants,
    KEYS.submissions,
    KEYS.content,
    KEYS.patterns,
    KEYS.votes,
    KEYS.words,
    KEYS.seen,
    KEYS.undo,
    KEYS.hostPresence, // C5
  );
  await writeState(
    {
      ...DEFAULT_STATE,
      ended: true,
      publishedTakeaway: { token, publishedAt: snapshot.publishedAt },
    },
    roomId,
  );
}

// ---- Composed views -------------------------------------------------------

function contentVersion(visible: ContentItem[]): number {
  // Bumps whenever visible content changes — drives the "new content" pulse.
  return (
    visible.reduce((max, c) => Math.max(max, c.addedAt), 0) + visible.length
  );
}

// Run `fn` while holding a named, room-scoped lock. Returns { ok: false, busy:
// true } without running fn if another caller holds it — so read-modify-write
// control actions (advance a round, trigger one AI generation) can't race a
// double-tap or a host+cohost collision into a skipped round or a dup spend.
// The lock auto-expires after ttlSeconds so a crashed holder never wedges a room.
export async function withLock<T>(
  roomId: string,
  name: string,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number } = {},
): Promise<{ ok: true; value: T } | { ok: false; busy: true }> {
  const key = `lock:${roomId}:${name}`;
  const got = await backend.setNX(key, { at: Date.now() }, opts.ttlSeconds ?? 5);
  if (!got) return { ok: false, busy: true };
  try {
    return { ok: true, value: await fn() };
  } finally {
    await backend.del(key);
  }
}

// A roomId-bound write facade handed to module handleAction so modules never
// import the store directly (breaks the module<->store import cycle).
function storeFacade(roomId: string): ModuleStore {
  return {
    addSubmission: (handle, text, phaseId, tag, token) =>
      addSubmission(handle, text, phaseId, tag, token, roomId),
    allocate: (token, kind, value, cap) =>
      allocate(token, kind, value, cap, roomId),
    castVote: (phaseId, token, value) =>
      castVote(phaseId, token, value, roomId),
    readVotes: (phaseId) => readVotes(phaseId, roomId),
    addWord: (phaseId, token, word) => addWord(phaseId, token, word, roomId),
    readWords: (phaseId) => readWords(phaseId, roomId),
    withLock: (name, fn, opts) => withLock(roomId, name, fn, opts),
  };
}

// B3/C1 — only the host-tier roles (facilitator/admin/cohost) keep the private
// run-sheet AND the per-phase facilitator script note on a phase config; the room
// (participant/projector) gets both stripped, so a private cue can never leak.
// (scriptNote is distinct from ambient's public `note` cue-card message.)
function scopeConfigForRole(
  config: Record<string, unknown> | null,
  role: Role,
): Record<string, unknown> | null {
  if (role !== "participant" && role !== "projector") return config;
  const stripped = stripRunsheet(config);
  if (!stripped || !("scriptNote" in stripped)) return stripped;
  const clone = { ...stripped };
  delete clone.scriptNote;
  return clone;
}

async function buildContext(
  roomId: string,
  role: Role,
  token: string | null,
  // The just-written state, passed by command handlers so the response reflects
  // the write WITHOUT a read-back (eventually-consistent stores can serve a stale
  // read right after a write). When omitted, read the live state as usual.
  stateOverride?: SessionState,
): Promise<{
  ctx: ModuleContext | null;
  state: SessionState;
  participants: Participant[];
  visible: ContentItem[];
  patterns: Pattern[];
  me: Participant | null;
  submissions: Submission[];
}> {
  const [state, content, participants, patterns, submissions] =
    await Promise.all([
      stateOverride ? Promise.resolve(stateOverride) : getState(roomId),
      listContent(roomId),
      listParticipants(roomId),
      listPatterns(roomId),
      listSubmissions(roomId),
    ]);
  const me = token ? participants.find((p) => p.token === token) ?? null : null;
  const visible = content
    .filter((c) => c.visible)
    .sort((a, b) => a.addedAt - b.addedAt);

  const phase = resolveActive(state);
  let ctx: ModuleContext | null = null;
  if (phase) {
    ctx = {
      roomId,
      role,
      phase,
      // B3 — strip the facilitator-private run-sheet BEFORE computeView sees it,
      // so a module's view can never echo it to a participant/projector.
      config: scopeConfigForRole(phase.config, role) ?? phase.config,
      state,
      participants,
      visibleContent: visible,
      patterns,
      submissions,
      me,
      store: storeFacade(roomId),
    };
  }
  return { ctx, state, participants, visible, patterns, me, submissions };
}

// C4 — resolve a spotlight ref to room-safe display text. A submission ref reads
// the LIVE submission (a deleted one → null, so the overlay vanishes cleanly). The
// handle is ALWAYS null: the stored submission handle is not a public-ness signal
// (an anonymous-by-design phase still stores a real handle), so the room never
// sees a name. A future attributed spotlight must use an explicit `literal` ref.
function resolveSpotlight(
  ref: SpotlightRef | null | undefined,
  submissions: Submission[],
): { text: string; handle: string | null } | null {
  if (!ref) return null;
  // C4 — a LITERAL spotlight is the only attributable kind: it carries a name ONLY
  // when the host explicitly opted in at spotlight time (the host route attaches a
  // handle solely for a named, non-anonymous source). A submission spotlight is
  // NEVER attributed — its stored handle is not a public-ness signal (an anonymous-
  // by-design phase still stores a real handle), so the room must never see it.
  if (ref.kind === "literal") return { text: ref.text, handle: ref.handle ?? null };
  const sub = submissions.find((s) => s.id === ref.id);
  return sub ? { text: sub.text, handle: null } : null;
}

// D4 — fire the newly-active module's onEnter hook (cohort freeze, etc.) right
// after a phase becomes active. Best-effort: a throwing/absent hook must never
// block a phase advance, so it's wrapped and logged content-free. Runs at the
// facilitator role with no identity — onEnter only needs the roster + store.
async function runOnEnter(roomId: string, state: SessionState): Promise<void> {
  const phase = resolveActive(state);
  if (!phase) return;
  const mod = getServerModule(phase.moduleId);
  if (!mod?.onEnter) return;
  try {
    const { ctx } = await buildContext(roomId, "facilitator", null, state);
    if (ctx) await mod.onEnter(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error(`[onEnter] ${phase.moduleId} failed: ${msg}`);
  }
}

export async function getPublicState(
  token: string | null = null,
  roomId: string = DEFAULT_ROOM_ID,
  role: Role = "participant",
  stateOverride?: SessionState,
): Promise<PublicState> {
  const { ctx, state, participants, visible, patterns, me, submissions } =
    await buildContext(roomId, role, token, stateOverride);

  const mode = getMode(state.mode);
  const phase = resolveActive(state);
  // B3 — the returned config is also role-scoped (the other leak surface).
  const cfg = scopeConfigForRole(
    phase?.config ?? null,
    role,
  ) as PublicState["config"];
  const moduleId: ModuleKind | null = phase?.moduleId ?? null;
  const allPhases = resolvePhases(state);
  const sequence = allPhases.map((p) => ({
    id: p.id,
    moduleId: p.moduleId,
    label: (p.config.label as string) ?? p.moduleId,
  }));
  const usesPatterns = allPhases.some(
    (p) =>
      p.moduleId === "readaround" &&
      (p.config as { readaround?: { source?: string } }).readaround?.source ===
        "patterns",
  );

  // Registry-driven: the active module computes its own view payload.
  let view: ModuleView | null = null;
  let allocation: AllocationSummary | null = null;
  let coordinator: CoordinatorInfo | null = null;
  let readaround: PublicState["readaround"] = null;

  if (ctx && moduleId) {
    const mod = getServerModule(moduleId);
    if (mod) {
      // A throwing computeView must never 500 the whole /state poll — that would
      // freeze every screen (and trap the facilitator on the broken phase, unable
      // to advance past it). Degrade to a null view; the sequence + controls still
      // return, so the room can move on. Content-free log (never view data).
      try {
        const data = await mod.computeView(ctx);
        view = { moduleId, data };
        // Project legacy fields the facilitator console still reads.
        if (moduleId === "allocate") {
          const d = data as { kind: "lens" | "side"; counts: Record<string, number>; mine: string | null };
          allocation = { kind: d.kind, counts: d.counts, mine: d.mine };
        } else if (moduleId === "coordinator") {
          const d = data as { kind: "lens-triad" | "pair"; members?: string[] };
          coordinator = { kind: d.kind, members: d.members };
        } else if (moduleId === "readaround") {
          readaround = data as PublicState["readaround"];
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error";
        console.error(`[computeView] ${moduleId} failed: ${msg}`);
        view = { moduleId, data: null };
      }
    }
  }

  // C2 — role-scoped participation signal. Derived from the heartbeat hash +
  // responders, never stored. Costs one hgetall only on gather phases.
  let participation: ParticipationSignal | null = null;
  if (ctx && moduleId) {
    const gatherSource = getServerModule(moduleId)?.capabilities.gatherSource ?? "none";
    if (gatherSource !== "none") {
      const heartbeats = await readHeartbeats(roomId);
      const raw = await computeParticipationSignal(ctx, gatherSource, heartbeats);
      if (raw) {
        const anonAnon = (cfg as { anonymity?: string } | null)?.anonymity;
        const anonymous = anonAnon === "anonymous" || anonAnon === "anonymous-strict";
        if (role === "participant") {
          participation = null; // participants never see breakdowns
        } else if (role === "projector") {
          // bare present+responded, only when opted in AND above the privacy floor
          const show = Boolean((cfg as { showLiveCount?: boolean } | null)?.showLiveCount);
          participation =
            show && raw.present >= PROJECTOR_FLOOR
              ? { present: raw.present, responded: raw.responded, typing: 0, quiet: 0 }
              : null;
        } else {
          // facilitator / cohost / admin: full numbers, but no per-person quiet
          // breakdown on anonymous phases (can't pair "the quiet one" with a gap).
          participation = anonymous ? { ...raw, typing: 0, quiet: 0 } : raw;
        }
      }
    }
  }

  // D1 — honest per-phase attribution (cheap map lookup; outside the computeView
  // try so a throwing module never strands the indicator).
  const attribution = resolveAttribution(
    moduleId,
    moduleId ? getServerModule(moduleId)?.capabilities.gatherSource ?? "none" : "none",
    (cfg as { anonymity?: import("./modules/attribution").AnonymitySetting } | null)
      ?.anonymity,
  );

  // C2 nudge — read the active gather phase's nudge marker so the participant can
  // re-pulse. Only on gather phases (one cheap read), never elsewhere.
  let nudgedAt: number | null = null;
  if (ctx && moduleId && getServerModule(moduleId)?.capabilities.gatherSource !== "none") {
    const v = await readVotes(phase!.id, roomId);
    nudgedAt = typeof v["__nudge__"] === "number" ? (v["__nudge__"] as number) : null;
  }

  // F3 — when ended with a published take-away, attach the recap (handle-free)
  // for the keep screen. Null-degrades to a plain ended screen if the snapshot is
  // gone (TTL expiry / replication lag) — never a half card.
  let takeaway: PublicState["takeaway"] = null;
  if (state.ended && state.publishedTakeaway?.token) {
    const snap = await getTakeaway(roomId, state.publishedTakeaway.token);
    if (snap) {
      // F3 — strip the raw contributions (others' text + tokens) and hand the
      // caller back ONLY their own, matched by their participant token.
      const { contributions, ...shared } = snap;
      const yourContributions =
        token && contributions
          ? contributions
              .filter((c) => c.token === token)
              .map(({ phaseLabel, text }) => ({ phaseLabel, text }))
          : undefined;
      takeaway = {
        ...shared,
        token: state.publishedTakeaway.token,
        yourContributions,
      };
    }
  }

  return {
    ended: state.ended,
    mode: state.mode,
    modeName: mode?.name ?? state.sessionName ?? null,
    topic: state.topic,
    moduleId,
    view,
    sequence,
    usesPatterns,
    rev: state.rev ?? 0,
    phaseId: state.phaseId,
    primitive: moduleId,
    config: cfg,
    timerEndsAt: state.timerEndsAt,
    timerRemainingMs: state.timerRemainingMs ?? null,
    participantCount: participants.length,
    visibleContent: visible,
    contentVersion: contentVersion(visible),
    allocation,
    coordinator,
    you: me ? { lens: me.lens ?? null, side: me.side ?? null } : null,
    readaround,
    patterns,
    clusterAssistAvailable: clusterAssistAvailable(),
    participation,
    nudgedAt,
    attribution,
    // C4 — the spotlighted response, resolved to room-safe text (handle always
    // null). Shown on every surface (the projector renders it large); resolution
    // reuses the submissions buildContext already fetched, so zero extra reads.
    spotlight: resolveSpotlight(state.spotlight, submissions),
    // F2 — facilitator tier gets the register; the projector gets it only when
    // the facilitator promotes it (the live commitment board); participants get
    // it in their end-of-session recap, not mid-session.
    actionItems:
      role === "participant"
        ? null
        : role === "projector"
          ? state.actionItemsPromoted
            ? state.actionItems ?? []
            : null
          : state.actionItems ?? [],
    actionItemsPromoted: Boolean(state.actionItemsPromoted),
    // E1 — the authored lobby cue + count-visibility, surfaced for the projector
    // lobby and host preview. Count defaults to visible when never authored.
    lobbyCue: state.lobbyCue ?? null,
    lobbyCountVisible: state.lobbyCountVisible ?? true,
    // D2 — host-driven projector high-contrast mode (default off).
    projectorA11y: state.projectorA11y === true,
    // C6 — room-wide timer-sound opt-out (default off → sound on).
    timerSoundOff: state.timerSoundOff === true,
    takeaway,
  };
}

// A cheap change signature for a room — used by the SSE stream to decide when
// to push a "something changed" tick (clients then re-fetch full state).
export async function roomSignature(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<string> {
  const [state, parts, subs, content] = await Promise.all([
    getState(roomId),
    listParticipants(roomId),
    listSubmissions(roomId),
    listContent(roomId),
  ]);
  const votes = await backend.hgetall<unknown>(roomKeys(roomId).votes);
  const words = await backend.lrange<unknown>(roomKeys(roomId).words);
  const visible = content.filter((c) => c.visible);
  return [
    state.phaseId,
    state.timerEndsAt,
    // C1 — include paused-remaining so a pause / resume / +2-while-paused (which
    // may not change timerEndsAt) still ticks the SSE stream to every screen.
    state.timerRemainingMs ?? "",
    state.ended,
    state.readaroundIndex,
    state.sessionName,
    parts.length,
    subs.length,
    contentVersion(visible),
    Object.keys(votes).length,
    words.length,
    // F2 — tick the stream when the register changes or is promoted/hidden.
    (state.actionItems ?? []).map((a) => `${a.id}:${a.status}`).join(","),
    state.actionItemsPromoted ? "1" : "",
    // C4 — tick on a spotlight set/replace/clear so the projector blooms within ~1
    // SSE beat instead of waiting up to 2s for the next poll. Primitive token only.
    state.spotlight
      ? state.spotlight.kind === "submission"
        ? `s:${state.spotlight.id}`
        : `l:${state.spotlight.text.length}:${state.spotlight.handle ? "a" : ""}`
      : "",
    // C5 — tick the stream when the driving baton changes, so the chip updates
    // within ~1 SSE beat instead of waiting for the 2s poll.
    state.driver ? `d:${state.driver.driverId}` : "",
    // E3 — tick when a calm break/hold is summoned or resumed.
    state.ambient ? `amb:${state.ambient.kind}` : "",
    // E1 — tick when the lobby cue or count-visibility is re-authored, so the
    // front-of-room join screen updates within ~1 SSE beat.
    state.lobbyCue ?? "",
    state.lobbyCountVisible === false ? "0" : "1",
    // D2 — tick when the host toggles projector high-contrast.
    state.projectorA11y ? "a11y" : "",
    // C6 — tick when the host toggles the room-wide timer sound.
    state.timerSoundOff ? "snd0" : "",
  ].join("|");
}

// Dispatch a participant action to the active phase's module (used by /api/action).
export async function dispatchAction(
  roomId: string,
  action: ModuleAction,
  role: Role = "participant",
): Promise<{ ok: boolean; reason?: string; status: number }> {
  const { ctx } = await buildContext(roomId, role, action.token ?? null);
  if (!ctx) return { ok: false, reason: "no active phase", status: 409 };
  const mod = getServerModule(ctx.phase.moduleId);
  if (!mod || !mod.handleAction)
    return { ok: false, reason: "not actionable", status: 409 };
  const result = await mod.handleAction(ctx, action);
  return { ...result, status: result.ok ? 200 : result.reason === "full" ? 409 : 400 };
}

export async function getFacilitatorState(
  roomId: string = DEFAULT_ROOM_ID,
  stateOverride?: SessionState,
): Promise<FacilitatorState> {
  // Read state once and thread it through (avoids a second getState below).
  const state = stateOverride ?? (await getState(roomId));
  const [pub, submissions, participants, allContent, heartbeats, presence, projectorSeen] =
    await Promise.all([
      getPublicState(null, roomId, "facilitator", state),
      listSubmissions(roomId),
      listParticipants(roomId),
      listContent(roomId),
      readHeartbeats(roomId),
      readHostPresence(roomId),
      readProjectorSeen(roomId),
    ]);
  // F4 — plan-vs-actual phase timing, from the content-free advance log.
  const phaseLog = await readPhaseLog(roomId);
  // H1 — room-wide health (every phase), from C2's existing liveness hash.
  const roomHealth = computeRoomHealth(participants, heartbeats);
  // H2 — advisory pre-flight readiness for the built session (pure compute).
  const readiness = computeReadiness({
    phases: resolvePhases(state).map((p) => ({
      id: p.id,
      moduleId: p.moduleId,
      config: p.config,
    })),
    participantCount: participants.length,
    isProd: process.env.NODE_ENV === "production",
    kvConfigured: useKv,
    aiConfigured: aiAvailable(),
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    projectorSeen,
    now: Date.now(),
  });
  // B3 — derive the facilitator-only run-sheets (phaseId -> notes) and a one-line
  // peek at the next phase, from the same phase configs (never on PublicState).
  const seq = resolvePhases(state);
  const runsheets: Record<string, import("./types").RunSheet> = {};
  for (const p of seq) {
    const rs = extractRunsheet(p.config);
    if (hasRunsheet(rs)) runsheets[p.id] = rs!;
  }
  // F4 — one timing row per sequence phase (planned vs measured), or null when the
  // session hasn't advanced yet (nothing to learn from). Content-free.
  const phaseTimings = phaseLog.length
    ? planVsActual(
        phaseLog,
        seq.map((p) => ({
          id: p.id,
          label:
            (p.config.label as string) ||
            getServerModule(p.moduleId)?.meta.name ||
            p.moduleId,
          plannedSec:
            typeof p.config.timerSeconds === "number"
              ? (p.config.timerSeconds as number)
              : null,
        })),
        Date.now(),
      )
    : null;
  // D4 — held latecomers awaiting placement, but ONLY on a grouping phase the
  // builder set to "hold" (so normal phases pay no extra read). Maps tokens to the
  // handles the host already sees; content-free.
  let heldLate: { token: string; handle: string }[] = [];
  const activePhase = seq.find((p) => p.id === state.phaseId);
  if (activePhase && activePhase.config.latecomerHold === true) {
    const pVotes = await readVotes(activePhase.id, roomId);
    const handleByToken = new Map(participants.map((p) => [p.token, p.handle]));
    heldLate = heldLatecomers(
      pVotes,
      participants.map((p) => p.token),
    ).map((t) => ({ token: t, handle: handleByToken.get(t) ?? "—" }));
  }
  const curIdx = seq.findIndex((p) => p.id === state.phaseId);
  const nextPhase = curIdx >= 0 && curIdx < seq.length - 1 ? seq[curIdx + 1] : null;
  const nextPeek = nextPhase
    ? (nextPhase.config.label as string) ||
      getServerModule(nextPhase.moduleId)?.meta.name ||
      nextPhase.moduleId
    : null;
  return {
    ...pub,
    submissions,
    participants,
    allContent,
    roomHealth,
    readiness,
    runsheets,
    nextPeek,
    // F4 — plan-vs-actual phase timing (host-only; null until the room advances).
    phaseTimings,
    // D4 — latecomers waiting to be placed (host-only; only on a hold-policy
    // grouping phase). Empty otherwise.
    heldLatecomers: heldLate,
    // C4 — the raw ref (host-only) so the cockpit can ring the active card.
    spotlightRef: state.spotlight ?? null,
    // C5 — the live co-facilitators (host-only; derived, never stored).
    presence,
    // C5 — the driving baton (host-only; mirrors the state field).
    driver: state.driver ?? null,
    // C5 — the baton is stale when its console aged out (the next claim wins).
    // Derived on read; never written back here (the "no write in getState" rule).
    driverStale: state.driver ? !isDriverLive(state.driver, presence, Date.now()) : false,
    // C7 — a deterministic, content-free co-facilitator nudge (host-only). Pure
    // function of the counts/timer in `pub` plus the lead's controls + persisted
    // dismissals from session state; no AI, no write, no cost.
    cofac: computeCofac(
      {
        participation: pub.participation,
        timerEndsAt: pub.timerEndsAt,
        config: pub.config,
        phaseId: pub.phaseId,
        cofacEnabled: state.cofacEnabled,
        cofacSensitivity: state.cofacSensitivity,
        cofacDismissed: state.cofacDismissed,
      },
      Date.now(),
    ),
    // C7 full — echo the settings so the Session-tab control reflects live values.
    cofacEnabled: state.cofacEnabled ?? true,
    cofacSensitivity: state.cofacSensitivity ?? "standard",
  };
}
