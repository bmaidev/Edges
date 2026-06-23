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
import { getServerModule } from "./modules/registry.server";
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
  ModeId,
  ModuleKind,
  ModuleView,
  Participant,
  Pattern,
  PublicState,
  Role,
  SessionState,
  Submission,
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
  readaroundIndex: 0,
  topic: SESSION_TOPIC,
  ended: false,
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

function resolveActive(
  state: SessionState,
): import("./types").PhaseInstance | null {
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
      readaroundIndex: 0,
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
  return writeState(
    {
      ...state,
      mode: null,
      sessionName,
      phases,
      phaseId: phases[0]?.id ?? null,
      timerEndsAt: null,
      readaroundIndex: 0,
      ended: false,
    },
    roomId,
  );
}

export async function setPhase(
  phaseId: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  // Release any queued content to the room on advance.
  await releaseQueuedContent(roomId);
  return writeState(
    {
      ...state,
      phaseId,
      timerEndsAt: null,
      readaroundIndex: 0,
    },
    roomId,
  );
}

export async function setTimer(
  endsAt: number | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, timerEndsAt: endsAt }, roomId);
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
async function releaseQueuedContent(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  const list = await listContent(roomId);
  if (!list.some((c) => c.queued)) return;
  await backend.set(
    roomKeys(roomId).content,
    list.map((c) => (c.queued ? { ...c, visible: true, queued: false } : c)),
  );
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

// ---- End / wipe -----------------------------------------------------------

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
  );
  await writeState({ ...DEFAULT_STATE, ended: true }, roomId);
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

async function buildContext(
  roomId: string,
  role: Role,
  token: string | null,
): Promise<{
  ctx: ModuleContext | null;
  state: SessionState;
  participants: Participant[];
  visible: ContentItem[];
  patterns: Pattern[];
  me: Participant | null;
}> {
  const [state, content, participants, patterns, submissions] =
    await Promise.all([
      getState(roomId),
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
      config: phase.config,
      state,
      participants,
      visibleContent: visible,
      patterns,
      submissions,
      me,
      store: storeFacade(roomId),
    };
  }
  return { ctx, state, participants, visible, patterns, me };
}

export async function getPublicState(
  token: string | null = null,
  roomId: string = DEFAULT_ROOM_ID,
  role: Role = "participant",
): Promise<PublicState> {
  const { ctx, state, participants, visible, patterns, me } =
    await buildContext(roomId, role, token);

  const mode = getMode(state.mode);
  const phase = resolveActive(state);
  const cfg = (phase?.config ?? null) as PublicState["config"];
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
    participantCount: participants.length,
    visibleContent: visible,
    contentVersion: contentVersion(visible),
    allocation,
    coordinator,
    you: me ? { lens: me.lens ?? null, side: me.side ?? null } : null,
    readaround,
    patterns,
    clusterAssistAvailable: clusterAssistAvailable(),
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
    state.ended,
    state.readaroundIndex,
    state.sessionName,
    parts.length,
    subs.length,
    contentVersion(visible),
    Object.keys(votes).length,
    words.length,
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
): Promise<FacilitatorState> {
  const [pub, submissions, participants, allContent] = await Promise.all([
    getPublicState(null, roomId, "facilitator"),
    listSubmissions(roomId),
    listParticipants(roomId),
    listContent(roomId),
  ]);
  return { ...pub, submissions, participants, allContent };
}
