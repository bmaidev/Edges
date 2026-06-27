// Room registry: durable (no-TTL) storage of rooms, their three passcode tiers,
// and saved templates. Lives in KV (Upstash) in prod, in-memory for local dev.
//
// Deliberate deviation from the plan's Postgres: rooms/templates/passcodes are
// simple key lookups, so durable KV keys (no expiry) are enough and need no new
// infra. Postgres is reserved for Phase 6 (analytics/history/relational).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ModeId, PhaseInstance, Role, SessionReport } from "./types";
import {
  normalizeSlug,
  slugReasonMessage,
  validateSlug,
  type SlugReason,
} from "./slug";

const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useKv = Boolean(KV_URL && KV_TOKEN);

// Durable backend — NO TTL (rooms must outlive the 24h session keys).
interface DurableBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  // A4 — atomic claim: write ONLY if the key is absent. Returns true if we won
  // the key. Used to reserve a room slug without a check-then-set TOCTOU race.
  setNX<T>(key: string, value: T): Promise<boolean>;
  del(key: string): Promise<void>;
}

let db: DurableBackend;
if (useKv) {
  const { createClient } = require("@vercel/kv");
  const client = createClient({ url: KV_URL, token: KV_TOKEN });
  db = {
    async get<T>(key: string) {
      return ((await client.get(key)) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      await client.set(key, value); // no `ex` — durable
    },
    async setNX<T>(key: string, value: T) {
      // @vercel/kv set with NX returns "OK" on a win, null if the key existed.
      return (await client.set(key, value, { nx: true })) === "OK";
    },
    async del(key: string) {
      await client.del(key);
    },
  };
} else {
  // Shared across route modules in dev (see store.ts note). Prod uses KV.
  const g = globalThis as unknown as { __edgesRoomsMem?: Map<string, unknown> };
  const mem = (g.__edgesRoomsMem ??= new Map<string, unknown>());
  db = {
    async get<T>(key: string) {
      return (mem.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      mem.set(key, value);
    },
    async setNX<T>(key: string, value: T) {
      // Synchronous check-and-set within one microtask → atomic in single-
      // threaded JS (concurrent callers run sequentially, so the first wins).
      if (mem.has(key)) return false;
      mem.set(key, value);
      return true;
    },
    async del(key: string) {
      mem.delete(key);
    },
  };
}

const ROOM_INDEX_KEY = "rooms:index"; // list of room slugs

// B4 — expose the durable (no-TTL) backend so the global user-template store
// shares ONE instance (and the dev in-memory singleton), never a second backend.
export function getDb(): DurableBackend {
  return db;
}

// ---- Types ----------------------------------------------------------------

export type RoomStatus = "draft" | "live" | "archived";

// The three passcode tiers a room issues. Projector is read-only (no passcode).
export type PasscodeTier = "admin" | "facilitator" | "cohost" | "projector";
// Tiers that get a shareable magic link (admin is not a link — it's vestigial).
export type ShareableTier = "facilitator" | "cohost" | "projector";

export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  // A template is a mode reference (built-in) or a custom phase sequence.
  modeId?: ModeId;
  phases?: PhaseInstance[];
}

// Per-room branding. Palette values are hex strings; the room layout converts
// them to the CSS-variable RGB triples that Tailwind reads.
export interface RoomTheme {
  palette?: Partial<
    Record<"bg" | "surface" | "accent" | "muted" | "border", string>
  >;
  // Join-screen branding shown on the projector lobby + /r/<room>/qr.
  logoUrl?: string; // image URL (shown above the join QR)
  headline?: string; // big custom line ("the surprise") — replaces "Scan to join"
  tagline?: string; // witty subtext under the QR
}

// A5 — a durable snapshot of a room's DESIGN (its launched phase sequence), so a
// custom session survives the 24h live-state wipe and can be duplicated. Contains
// zero participant-authored material — only {id, moduleId, config} per phase.
export interface RoomBlueprint {
  name: string;
  phases: PhaseInstance[];
  savedAt: number;
}
// A5 — a one-line memory of the room's last run, co-located on the Room record at
// archive time so the rooms list needs no per-room archive fan-out.
export interface RoomLastRun {
  endedAt: number;
  participantCount: number;
  submissionCount: number;
}

export interface Room {
  slug: string; // also the roomId passed to the session store
  name: string;
  topic: string;
  templateId: string | null;
  status: RoomStatus;
  createdAt: number;
  theme?: RoomTheme;
  // A5 — the design + last-run memory (both optional; older rooms lack them).
  blueprint?: RoomBlueprint;
  lastRun?: RoomLastRun;
  // sha256 hashes of the tier passcodes (plaintext never stored). `projector` is
  // optional: rooms created before the A2 projector tier lack it (minted on
  // demand by regenerateRoleCode), so every read must guard it.
  passcodeHashes: {
    admin: string;
    facilitator: string;
    cohost: string;
    projector?: string;
  };
  // Marks the reserved demo room (`sample-demo`). Drives the DEMO badge + pinning
  // in /admin and exclusion from the "zero real rooms" first-run check. Non-PII.
  isSample?: boolean;
}

export interface RoomCreated {
  room: Room;
  // plaintext passcodes — returned ONCE at creation, never persisted. New rooms
  // always include all four tiers.
  passcodes: Record<PasscodeTier, string>;
}

// ---- helpers --------------------------------------------------------------

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

const SLUG_WORDS = [
  "amber", "cedar", "delta", "ember", "flint", "grove", "harbor", "ivory",
  "jade", "koto", "larch", "maple", "north", "onyx", "pine", "quartz",
];

function randomSlug(): string {
  const w = SLUG_WORDS[randomBytes(1)[0] % SLUG_WORDS.length];
  const n = randomBytes(2).toString("hex"); // 4 hex chars
  return `${w}-${n}`;
}

// A4 — a chosen slug failed validation (empty/too short/reserved/bad charset).
export class SlugError extends Error {
  constructor(public reason: SlugReason) {
    super(slugReasonMessage(reason));
    this.name = "SlugError";
  }
}
// A4 — a valid but already-claimed slug; carries a free suggestion.
export class SlugTakenError extends Error {
  constructor(public suggestion: string) {
    super("That room address is taken.");
    this.name = "SlugTakenError";
  }
}

// Find the next free `${base}-N` (base-2, base-3, …) — for collision suggestions.
async function suggestNextFreeSlug(base: string): Promise<string> {
  for (let n = 2; n < 1000; n++) {
    const candidate = normalizeSlug(`${base}-${n}`);
    if (!(await db.get<Room>(roomKey(candidate)))) return candidate;
  }
  return randomSlug(); // pathological fallback
}

// Availability check for the live "is this address free?" affordance.
export async function slugAvailable(
  desired: string,
): Promise<{ available: boolean; slug: string; reason?: SlugReason; suggestion?: string }> {
  const slug = normalizeSlug(desired);
  const v = validateSlug(slug);
  if (!v.ok) return { available: false, slug, reason: v.reason };
  if (await db.get<Room>(roomKey(slug)))
    return { available: false, slug, suggestion: await suggestNextFreeSlug(slug) };
  return { available: true, slug };
}

function randomPasscode(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`; // e.g. fac-1a2b3c4d
}

function roomKey(slug: string): string {
  return `rooms:room:${slug}`;
}

// ---- Room CRUD ------------------------------------------------------------

export async function createRoom(
  name: string,
  topic: string,
  templateId: string | null = null,
  // A4 — an optional memorable slug the facilitator chose. Validated + claimed
  // atomically; throws SlugError (invalid) / SlugTakenError (taken). When omitted,
  // a random `word-xxxx` slug is claimed (the prior behaviour).
  desiredSlug?: string | null,
): Promise<RoomCreated> {
  const passcodes = {
    admin: randomPasscode("adm"),
    facilitator: randomPasscode("fac"),
    cohost: randomPasscode("co"),
    projector: randomPasscode("scr"),
  };
  const mkRoom = (slug: string): Room => ({
    slug,
    name: name.trim().slice(0, 120) || "Untitled room",
    topic: topic.trim().slice(0, 200),
    templateId,
    status: "draft",
    createdAt: Date.now(),
    passcodeHashes: {
      admin: sha256(passcodes.admin),
      facilitator: sha256(passcodes.facilitator),
      cohost: sha256(passcodes.cohost),
      projector: sha256(passcodes.projector),
    },
  });

  let slug: string;
  if (desiredSlug != null && desiredSlug.trim() !== "") {
    // Chosen slug: validate, then claim atomically (no check-then-set race).
    slug = normalizeSlug(desiredSlug);
    const v = validateSlug(slug);
    if (!v.ok) throw new SlugError(v.reason!);
    const won = await db.setNX(roomKey(slug), mkRoom(slug));
    if (!won) throw new SlugTakenError(await suggestNextFreeSlug(slug));
  } else {
    // Random slug: keep claiming fresh ones until one is free.
    slug = randomSlug();
    for (let i = 0; i < 8 && !(await db.setNX(roomKey(slug), mkRoom(slug))); i++) {
      slug = randomSlug();
    }
  }

  const room = (await db.get<Room>(roomKey(slug)))!;
  const index = (await db.get<string[]>(ROOM_INDEX_KEY)) ?? [];
  if (!index.includes(slug)) {
    index.push(slug);
    await db.set(ROOM_INDEX_KEY, index);
  }

  return { room, passcodes };
}

// Mint a fresh set of tier passcodes + their sha256 hashes in one place, so
// callers that create a room at a fixed slug (the sample seeder) get plaintext
// to return ONCE while only the hashes are ever persisted. Keeps all crypto in
// this module.
export function freshPasscodes(): {
  plain: Record<PasscodeTier, string>;
  hashes: Room["passcodeHashes"];
} {
  const plain = {
    admin: randomPasscode("adm"),
    facilitator: randomPasscode("fac"),
    cohost: randomPasscode("co"),
    projector: randomPasscode("scr"),
  };
  return {
    plain,
    hashes: {
      admin: sha256(plain.admin),
      facilitator: sha256(plain.facilitator),
      cohost: sha256(plain.cohost),
      projector: sha256(plain.projector),
    },
  };
}

// Create-or-update a room at a FIXED slug (vs createRoom's random slug). Used by
// the sample seeder: re-seeding reuses the same `sample-demo` record but rotates
// its passcode hashes. Idempotent on the index.
export async function createRoomWithSlug(
  slug: string,
  name: string,
  topic: string,
  opts: { isSample?: boolean; passcodeHashes: Room["passcodeHashes"] },
): Promise<Room> {
  return withRoomLock(slug, async () => {
    const existing = await getRoom(slug);
    const room: Room = {
      slug,
      name: name.trim().slice(0, 120) || "Untitled room",
      topic: topic.trim().slice(0, 200),
      templateId: existing?.templateId ?? null,
      // A sample room is "live" so it reads as active in the rooms list.
      status: existing?.status ?? "live",
      createdAt: existing?.createdAt ?? Date.now(),
      isSample: opts.isSample ?? existing?.isSample,
      passcodeHashes: opts.passcodeHashes,
    };
    await db.set(roomKey(slug), room);
    const index = (await db.get<string[]>(ROOM_INDEX_KEY)) ?? [];
    if (!index.includes(slug)) {
      index.push(slug);
      await db.set(ROOM_INDEX_KEY, index);
    }
    return room;
  });
}

export async function getRoom(slug: string): Promise<Room | null> {
  return db.get<Room>(roomKey(slug));
}

// ---- Onboarding: durable per-admin "seen the tour" flag -------------------
// The one durable, non-PII onboarding key. Keyed by a sha256 of the admin code
// so the plaintext is never stored. Documented in the privacy docs and fully
// removable via clearTourSeen, so deleting the sample removes the whole feature.

function tourKey(adminCode: string): string {
  return `rooms:tour:${sha256(adminCode)}`;
}

export async function getTourSeen(adminCode: string): Promise<boolean> {
  return Boolean(await db.get<boolean>(tourKey(adminCode)));
}

export async function setTourSeen(adminCode: string): Promise<void> {
  await db.set(tourKey(adminCode), true);
}

export async function clearTourSeen(adminCode: string): Promise<void> {
  await db.del(tourKey(adminCode));
}

export async function listRooms(): Promise<Room[]> {
  const index = (await db.get<string[]>(ROOM_INDEX_KEY)) ?? [];
  const rooms = await Promise.all(index.map((s) => db.get<Room>(roomKey(s))));
  return rooms
    .filter((r): r is Room => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Serialise every room-record read-modify-write through one room-scoped lock so
// a passcode regenerate can't be clobbered by a concurrent theme/status save
// (the durable backend has no atomic primitive of its own). The lock auto-expires
// (5s) and the body is a single get+set, so contention resolves in milliseconds;
// a short retry then a last-resort unlocked run keeps a rare wedge from failing
// an admin action.
async function withRoomLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 10; i++) {
    const res = await withLock(slug, "room-mutate", fn, { ttlSeconds: 5 });
    if (res.ok) return res.value;
    await new Promise((r) => setTimeout(r, 60));
  }
  return fn();
}

export async function updateRoom(
  slug: string,
  patch: Partial<
    Pick<
      Room,
      | "name"
      | "topic"
      | "templateId"
      | "status"
      | "theme"
      | "passcodeHashes"
      | "blueprint"
      | "lastRun"
    >
  >,
): Promise<Room | null> {
  return withRoomLock(slug, async () => {
    const room = await getRoom(slug);
    if (!room) return null;
    const next = { ...room, ...patch };
    await db.set(roomKey(slug), next);
    return next;
  });
}

// A5 — strip a trailing " (copy)" so duplicating a copy stays "X (copy)", never
// "X (copy) (copy)".
export function stripCopy(name: string): string {
  return name.replace(/\s*\(copy\)\s*$/i, "").trim();
}

// A5 — chip labels for a blueprint's phases (the phase's own label, else the
// module id). Pure; used by the rooms-list projection.
export function blueprintSummary(phases: PhaseInstance[]): string[] {
  return phases.map((p) => (p.config?.label as string) || p.moduleId);
}

// A5 — persist a durable snapshot of a room's launched design (called on the
// admin setPhases launch). Pure design data; never any participant material.
export async function saveBlueprint(
  slug: string,
  bp: { name: string; phases: PhaseInstance[] },
): Promise<void> {
  await updateRoom(slug, {
    blueprint: { name: bp.name, phases: bp.phases, savedAt: Date.now() },
  });
}

// A5 — clone a room's DESIGN (name+" (copy)", topic, templateId, theme, blueprint)
// into a brand-new room with FRESH passcodes. Never copies participants,
// submissions, votes, content, or any live session state — only the Room record
// is read. Returns the new room + its plaintext passcodes (shown once).
export async function duplicateRoom(slug: string): Promise<RoomCreated | null> {
  const src = await getRoom(slug);
  if (!src) return null;
  const name = `${stripCopy(src.name)} (copy)`.slice(0, 120);
  const { room, passcodes } = await createRoom(name, src.topic, src.templateId);
  const updated = await updateRoom(room.slug, {
    theme: src.theme,
    blueprint: src.blueprint,
  });
  return { room: updated ?? room, passcodes };
}

// Rotate a single role's passcode atomically: the old link 403s, the others are
// untouched. Returns the new plaintext code ONCE (only the hash is persisted).
// Mints the projector hash on demand for legacy rooms that predate that tier.
export async function regenerateRoleCode(
  slug: string,
  tier: ShareableTier,
): Promise<{ code: string } | null> {
  const prefix = tier === "facilitator" ? "fac" : tier === "cohost" ? "co" : "scr";
  return withRoomLock(slug, async () => {
    const room = await getRoom(slug);
    if (!room) return null;
    const code = randomPasscode(prefix);
    const next: Room = {
      ...room,
      passcodeHashes: { ...room.passcodeHashes, [tier]: sha256(code) },
    };
    await db.set(roomKey(slug), next);
    return { code };
  });
}

// ---- Archive / reporting --------------------------------------------------

import { anonymousPhaseIds, endSession, getFacilitatorState, publishAndEnd, readVotes, withLock } from "./store";
import type { SessionMetrics } from "./session-metrics";
import { aiAvailable, asData, capItems, generateJSON, topicLine } from "./ai";
import type { TakeawaySnapshot } from "./types";

export interface RoomArchive {
  slug: string;
  name: string;
  archivedAt: number;
  sessionName: string | null;
  sequence: { id: string; label: string; moduleId: string }[];
  patterns: { name: string }[];
  submissions: { phaseId: string; handle: string; text: string; tag: string | null }[];
  content: { type: string; title: string; body: string }[];
  participantCount: number;
  report?: SessionReport | null; // AI synthesis of the whole session
  // F1 — a random, unguessable token gating the public report page. Minted once
  // when the report is built; lets the facilitator share a read-only link.
  reportToken?: string;
  // F2 — the captured action-item register (verbatim), carried into the handover.
  actionItems?: {
    text: string;
    ownerName?: string;
    due?: string;
    status: "open" | "done";
  }[];
  // F1 — report sharing preferences (quotes toggle + attribution). Defaults are
  // off-the-record (no quotes, anonymous) until the facilitator opts in.
  reportMeta?: import("./report-edit").ReportMeta;
}

// Generate a whole-session report from all submissions + curated patterns.
// Regenerated fresh at archive time, so it never depends on a live synthesis
// surviving the wipe. Returns null when AI is unavailable or there's nothing
// to synthesise.
export async function generateSessionReport(
  topic: string,
  sessionName: string | null,
  submissions: { phaseId: string; text: string; tag: string | null }[],
  patternNames: string[],
): Promise<SessionReport | null> {
  if (!aiAvailable() || submissions.length === 0) return null;
  const { kept } = capItems(submissions, 200);
  const res = await generateJSON<{
    summary?: unknown;
    themes?: unknown;
    tensions?: unknown;
    decisions?: unknown;
    nextSteps?: unknown;
  }>({
    label: "session-report",
    tier: "reasoning",
    shape: "object",
    system:
      "You write a concise, neutral post-session report for a facilitator from " +
      "the raw contributions of a workshop. Be faithful to what was said; do not " +
      "invent. Return JSON only — no markdown, no code fences.",
    user: `${topicLine(topic)}The session was "${sessionName ?? "a workshop"}". Below are all participant contributions across every phase (with phase id + any tag), and the facilitator's curated pattern names.

${asData("submissions", JSON.stringify(kept, null, 2))}

Curated patterns: ${patternNames.length ? patternNames.join("; ") : "(none)"}

Synthesise the WHOLE session into JSON in this exact shape:
{
  "summary": "2-3 sentence overview of what the room explored and concluded",
  "themes": [{ "title": "≤6 words", "detail": "1-2 sentences" }],
  "tensions": ["the unresolved disagreements / open questions"],
  "decisions": ["what the room actually agreed or concluded, if anything"],
  "nextSteps": ["concrete actions or commitments that surfaced"]
}
Keep each list to the few most important items. Use [] for any list with nothing real to report.`,
  });
  if (!res.ok || !res.data) return null;
  const d = res.data;
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 300)) : [];
  return {
    summary: typeof d.summary === "string" ? d.summary.slice(0, 800) : "",
    themes: Array.isArray(d.themes)
      ? d.themes
          .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
          .map((t) => ({
            title: String(t.title ?? "").slice(0, 80),
            detail: String(t.detail ?? "").slice(0, 400),
          }))
          .filter((t) => t.title || t.detail)
          .slice(0, 8)
      : [],
    tensions: strList(d.tensions).slice(0, 8),
    decisions: strList(d.decisions).slice(0, 8),
    nextSteps: strList(d.nextSteps).slice(0, 12),
    generatedAt: Date.now(),
  };
}

function archiveKey(slug: string): string {
  return `rooms:archive:${slug}`;
}

// A structural, AI-free report so the handover is never empty when no API key is
// set — counts + the facilitator's curated pattern names, faithful to the data.
function buildFallbackReport(
  submissionCount: number,
  patternNames: string[],
): SessionReport {
  return {
    summary:
      `${submissionCount} ${submissionCount === 1 ? "contribution" : "contributions"} across the session.` +
      (patternNames.length
        ? ` The facilitator grouped them into: ${patternNames.join(", ")}.`
        : ""),
    themes: patternNames.map((name) => ({ title: name, detail: "" })),
    tensions: [],
    decisions: [],
    nextSteps: [],
    generatedAt: Date.now(),
  };
}

// Compose the durable archive snapshot from the LIVE room state. REUSES an
// existing report rather than re-spending Opus (and never clobbers it) — the
// report is generated once (by buildReport or the first archive) and carried
// forward. Falls back to a structural report when AI is unavailable.
async function composeArchive(slug: string): Promise<RoomArchive | null> {
  const room = await getRoom(slug);
  if (!room) return null;
  const existing = await getArchive(slug);
  const fs = await getFacilitatorState(slug);
  const submissions = fs.submissions.map((s) => ({
    phaseId: s.phaseId,
    handle: s.handle,
    text: s.text,
    tag: s.tag ?? null,
  }));
  const patternNames = fs.patterns.map((p) => p.name);
  let report = existing?.report ?? null;
  if (!report) {
    report =
      (await generateSessionReport(
        room.topic ?? fs.topic ?? "",
        fs.modeName,
        submissions.map((s) => ({ phaseId: s.phaseId, text: s.text, tag: s.tag })),
        patternNames,
      )) ?? buildFallbackReport(submissions.length, patternNames);
  }
  return {
    slug,
    name: room.name,
    archivedAt: existing?.archivedAt ?? Date.now(),
    sessionName: fs.modeName,
    sequence: fs.sequence,
    patterns: patternNames.map((name) => ({ name })),
    submissions,
    content: fs.allContent.map((c) => ({ type: c.type, title: c.title, body: c.body })),
    participantCount: fs.participantCount,
    report,
    reportToken: existing?.reportToken ?? randomBytes(16).toString("hex"),
    actionItems: (fs.actionItems ?? []).map((a) => ({
      text: a.text,
      ownerName: a.ownerName,
      due: a.due,
      status: a.status,
    })),
  };
}

// F1 — build the client-ready report from the LIVE session WITHOUT wiping it, so
// the facilitator can preview/export the handover mid-session. Serialised under
// the room lock + read-merge-write, so a concurrent build/archive never clobbers.
export async function buildReport(slug: string): Promise<RoomArchive | null> {
  const res = await withLock(
    slug,
    "report",
    async () => {
      const archive = await composeArchive(slug);
      if (archive) await db.set(archiveKey(slug), archive);
      return archive;
    },
    { ttlSeconds: 30 },
  );
  return res.ok ? res.value : getArchive(slug);
}

// Snapshot the room's live data into a durable archive, then mark it archived.
// The live session keys are wiped separately (endSession) by the caller. Reuses
// any report already built (no double Opus spend, no clobber).
export async function archiveRoom(slug: string): Promise<RoomArchive | null> {
  const res = await withLock(
    slug,
    "report",
    async () => {
      const archive = await composeArchive(slug);
      if (!archive) return null;
      await db.set(archiveKey(slug), archive);
      // A5 — co-locate a one-line last-run memory on the Room so the rooms list
      // never has to fan out to per-room archives.
      await updateRoom(slug, {
        status: "archived",
        lastRun: {
          endedAt: Date.now(),
          participantCount: archive.participantCount,
          submissionCount: archive.submissions.length,
        },
      });
      // F4 — capture the de-identified evidence record. Best-effort: a metrics
      // hiccup must never fail the archive.
      await captureSessionMetrics(slug).catch(() => {});
      return archive;
    },
    { ttlSeconds: 30 },
  );
  return res.ok ? res.value : getArchive(slug);
}

export async function getArchive(slug: string): Promise<RoomArchive | null> {
  return db.get<RoomArchive>(archiveKey(slug));
}

// ---- F4: de-identified SessionMetrics (the evidence layer) -----------------

const METRICS_INDEX = "rooms:metricsidx";
const metricsKey = (slug: string) => `rooms:metrics:${slug}`;

function designLabelFor(r: Room): string {
  return r.blueprint?.name ?? r.templateId ?? "Custom";
}

// Capture a CONTENT-FREE metrics record at archive time: per-phase responder
// counts (distinct participants who submitted OR voted, reserved markers
// excluded), participant count, and whether the room was archived before reaching
// its final phase. No handles, no text — only counts. One record per room (a
// re-archive overwrites). Best-effort: never blocks the archive.
export async function captureSessionMetrics(slug: string): Promise<void> {
  const room = await getRoom(slug);
  if (!room || room.isSample) return;
  const fs = await getFacilitatorState(slug);
  const seq = fs.sequence ?? [];
  const lastId = seq.length ? seq[seq.length - 1].id : null;

  const phases: SessionMetrics["phases"] = [];
  for (const ph of seq) {
    const tokens = new Set(
      fs.submissions.filter((s) => s.phaseId === ph.id).map((s) => s.token),
    );
    const votes = await readVotes(ph.id, slug);
    for (const t of Object.keys(votes)) if (!t.startsWith("__")) tokens.add(t);
    phases.push({ moduleId: ph.moduleId, responded: tokens.size });
  }

  const metrics: SessionMetrics = {
    slug,
    name: room.name,
    endedAt: Date.now(),
    design: designLabelFor(room),
    participantCount: fs.participantCount,
    endedEarly: Boolean(lastId && fs.phaseId !== lastId),
    phases,
  };
  const idx = (await db.get<string[]>(METRICS_INDEX)) ?? [];
  await db.set(metricsKey(slug), metrics);
  if (!idx.includes(slug)) await db.set(METRICS_INDEX, [...idx, slug]);
}

export async function listSessionMetrics(): Promise<SessionMetrics[]> {
  const idx = (await db.get<string[]>(METRICS_INDEX)) ?? [];
  const out: SessionMetrics[] = [];
  for (const slug of idx) {
    const m = await db.get<SessionMetrics>(metricsKey(slug));
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.endedAt - a.endedAt);
}

export async function clearSessionMetrics(): Promise<void> {
  const idx = (await db.get<string[]>(METRICS_INDEX)) ?? [];
  for (const slug of idx) await db.del(metricsKey(slug));
  await db.del(METRICS_INDEX);
}

// F1 — apply one structured curation edit to the archive's report (rename/drop/
// reorder/edit-summary). Under the same "report" lock as build/archive so a
// concurrent regenerate can't clobber the edit. No-op (returns the archive) when
// there's no report yet.
export async function editReport(
  slug: string,
  edit: import("./report-edit").ReportEdit,
): Promise<RoomArchive | null> {
  const { applyReportEdit } = await import("./report-edit");
  const res = await withLock(
    slug,
    "report",
    async () => {
      const archive = await getArchive(slug);
      if (!archive?.report) return archive ?? null;
      const next = { ...archive, report: applyReportEdit(archive.report, edit) };
      await db.set(archiveKey(slug), next);
      return next;
    },
    { ttlSeconds: 30 },
  );
  return res.ok ? res.value : getArchive(slug);
}

// F1 — set the report's sharing preferences (quotes toggle + attribution).
export async function setReportMeta(
  slug: string,
  raw: unknown,
): Promise<RoomArchive | null> {
  const { normalizeReportMeta } = await import("./report-edit");
  const res = await withLock(
    slug,
    "report",
    async () => {
      const archive = await getArchive(slug);
      if (!archive) return null;
      const next = { ...archive, reportMeta: normalizeReportMeta(raw) };
      await db.set(archiveKey(slug), next);
      return next;
    },
    { ttlSeconds: 30 },
  );
  return res.ok ? res.value : getArchive(slug);
}

// F1 — regenerate the AI report fresh from the archived submissions/patterns,
// discarding prior edits (an explicit "redo the synthesis"). Preserves the
// reportToken + reportMeta (sharing link + preferences survive a regenerate).
export async function regenerateReport(slug: string): Promise<RoomArchive | null> {
  const res = await withLock(
    slug,
    "report",
    async () => {
      const archive = await getArchive(slug);
      if (!archive) return null;
      const room = await getRoom(slug);
      const report = await generateSessionReport(
        room?.topic ?? "",
        archive.sessionName,
        archive.submissions.map((s) => ({ phaseId: s.phaseId, text: s.text, tag: s.tag })),
        archive.patterns.map((p) => p.name),
      );
      const next = { ...archive, report: report ?? archive.report };
      await db.set(archiveKey(slug), next);
      return next;
    },
    { ttlSeconds: 60 },
  );
  return res.ok ? res.value : getArchive(slug);
}

// A1 — permanently delete a room: its durable record + index entry + archive,
// and wipe any live session data immediately (rather than waiting out the TTL).
export async function deleteRoom(slug: string): Promise<boolean> {
  const ok = await withRoomLock(slug, async () => {
    const room = await getRoom(slug);
    if (!room) return false;
    await db.del(roomKey(slug));
    await db.del(archiveKey(slug));
    const index = (await db.get<string[]>(ROOM_INDEX_KEY)) ?? [];
    if (index.includes(slug))
      await db.set(
        ROOM_INDEX_KEY,
        index.filter((s) => s !== slug),
      );
    return true;
  });
  if (ok) await endSession(slug); // wipe live participants/submissions/etc. now
  return ok;
}

// F3 — publish the participant take-away and end the session. NO AI in this path
// (it precedes the wipe; the 60s ceiling must never strand un-wiped data): the
// recap reuses an already-built report if present, else the structural fallback.
// Handle-free synthesis only. Returns the share token.
// F3 — anonymity-aware preview metadata for the host curate modal.
export interface TakeawayMeta {
  anonymousPhaseCount: number; // phases whose contributions are withheld
  excludedContributionCount: number; // contributions NOT carried (anonymous phases)
}

interface TakeawayOptions {
  // F3 — action-item ids the host chose to leave OUT of the recap.
  excludeActionItems?: string[];
}

// Build the take-away snapshot (no publish, no end). Shared by previewTakeaway and
// publishTakeaway so the host's preview is byte-true to what gets published.
async function buildTakeaway(
  slug: string,
  opts: TakeawayOptions = {},
): Promise<{ snapshot: TakeawaySnapshot; meta: TakeawayMeta } | null> {
  const room = await getRoom(slug);
  if (!room) return null;
  const fs = await getFacilitatorState(slug);
  const anonPhases = await anonymousPhaseIds(slug); // F3 — exclude anonymous phases
  const existing = await getArchive(slug);
  const report =
    existing?.report ??
    buildFallbackReport(fs.submissions.length, fs.patterns.map((p) => p.name));
  const t = room.theme;
  const excluded = new Set(opts.excludeActionItems ?? []);

  const contributions = fs.submissions
    .filter((s) => s.token && !anonPhases.has(s.phaseId))
    .map((s) => ({
      token: s.token as string,
      phaseLabel: fs.sequence.find((p) => p.id === s.phaseId)?.label ?? s.phaseId,
      text: s.text,
    }));
  const withheld = fs.submissions.filter((s) => s.token && anonPhases.has(s.phaseId)).length;

  const snapshot: TakeawaySnapshot = {
    name: room.name,
    sessionName: fs.modeName,
    publishedAt: Date.now(),
    participantCount: fs.participantCount,
    submissionCount: fs.submissions.length,
    patterns: fs.patterns.map((p) => p.name),
    report,
    // F3 — the host can leave specific action items out of the recap.
    actionItems: (fs.actionItems ?? [])
      .filter((a) => !excluded.has(a.id))
      .map((a) => ({ text: a.text, ownerName: a.ownerName, due: a.due, status: a.status })),
    branding:
      t && (t.logoUrl || t.headline) ? { logoUrl: t.logoUrl, headline: t.headline } : undefined,
    // F3 — keep each contribution with its author token so a participant can be
    // handed back their OWN. Stays server-side; the per-caller filter happens in
    // getPublicState. CRITICAL: contributions from ANONYMOUS phases are EXCLUDED —
    // a token-keyed durable record of anonymous-phase text would re-link the
    // participant to the identity that phase promised to hide (the recap survives
    // the session wipe, so this is the one place anonymity must be enforced).
    contributions,
  };
  return {
    snapshot,
    meta: { anonymousPhaseCount: anonPhases.size, excludedContributionCount: withheld },
  };
}

// F3 — preview the take-away the room will keep WITHOUT publishing or ending the
// session. Returns the SHARED body (never the raw per-token contributions) + the
// anonymity meta, so the host can review/curate before the irreversible publish.
export async function previewTakeaway(
  slug: string,
  opts: TakeawayOptions = {},
): Promise<({ preview: Omit<TakeawaySnapshot, "contributions"> } & { meta: TakeawayMeta }) | null> {
  const built = await buildTakeaway(slug, opts);
  if (!built) return null;
  const { contributions, ...shared } = built.snapshot;
  void contributions; // intentionally dropped — never leaves the server
  return { preview: shared, meta: built.meta };
}

export async function publishTakeaway(
  slug: string,
  opts: TakeawayOptions = {},
): Promise<{ token: string } | null> {
  const built = await buildTakeaway(slug, opts);
  if (!built) return null;
  const token = randomBytes(16).toString("hex");
  await publishAndEnd(slug, token, built.snapshot);
  return { token };
}

// ---- Auth: resolve a passcode to a role within a room ---------------------

// A single bootstrap super-admin passcode (env) can create rooms before any
// room exists, and acts as admin on every room.
function isSuperAdmin(code: string): boolean {
  const sa = process.env.ADMIN_PASSCODE;
  return Boolean(sa && code && code === sa);
}

export function superAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSCODE);
}

export function checkSuperAdmin(code: string | null | undefined): boolean {
  return typeof code === "string" && isSuperAdmin(code);
}

// Resolve a code to its role within a room. Higher tiers inherit lower
// capabilities via the CAPABILITIES table in auth.ts (not here).
export async function resolveRole(
  slug: string,
  code: string | null | undefined,
): Promise<Role | null> {
  if (!code) return null;
  if (isSuperAdmin(code)) return "admin";
  const room = await getRoom(slug);
  if (!room) return null;
  const h = sha256(code);
  if (safeEqualHex(h, room.passcodeHashes.admin)) return "admin";
  if (safeEqualHex(h, room.passcodeHashes.facilitator)) return "facilitator";
  if (safeEqualHex(h, room.passcodeHashes.cohost)) return "cohost";
  // Guarded: legacy rooms predate the projector tier and lack this hash.
  if (
    room.passcodeHashes.projector &&
    safeEqualHex(h, room.passcodeHashes.projector)
  )
    return "projector";
  return null;
}
