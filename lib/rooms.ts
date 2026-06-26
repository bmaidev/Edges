// Room registry: durable (no-TTL) storage of rooms, their three passcode tiers,
// and saved templates. Lives in KV (Upstash) in prod, in-memory for local dev.
//
// Deliberate deviation from the plan's Postgres: rooms/templates/passcodes are
// simple key lookups, so durable KV keys (no expiry) are enough and need no new
// infra. Postgres is reserved for Phase 6 (analytics/history/relational).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { ModeId, PhaseInstance, Role } from "./types";

const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const useKv = Boolean(KV_URL && KV_TOKEN);

// Durable backend — NO TTL (rooms must outlive the 24h session keys).
interface DurableBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
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
    async del(key: string) {
      mem.delete(key);
    },
  };
}

const ROOM_INDEX_KEY = "rooms:index"; // list of room slugs

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

export interface Room {
  slug: string; // also the roomId passed to the session store
  name: string;
  topic: string;
  templateId: string | null;
  status: RoomStatus;
  createdAt: number;
  theme?: RoomTheme;
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
): Promise<RoomCreated> {
  // Find a free slug.
  let slug = randomSlug();
  for (let i = 0; i < 5 && (await db.get<Room>(roomKey(slug))); i++) {
    slug = randomSlug();
  }

  const passcodes = {
    admin: randomPasscode("adm"),
    facilitator: randomPasscode("fac"),
    cohost: randomPasscode("co"),
    projector: randomPasscode("scr"),
  };

  const room: Room = {
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
  };

  await db.set(roomKey(slug), room);
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
    Pick<Room, "name" | "topic" | "templateId" | "status" | "theme" | "passcodeHashes">
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

import { getFacilitatorState, withLock } from "./store";
import { aiAvailable, asData, capItems, generateJSON, topicLine } from "./ai";

// An AI-generated whole-session synthesis, produced at archive time from every
// phase's submissions + the facilitator's curated patterns. Null when no AI key.
export interface SessionReport {
  summary: string; // 2-3 sentence overview
  themes: { title: string; detail: string }[];
  tensions: string[]; // the unresolved disagreements
  decisions: string[]; // what the room concluded/agreed
  nextSteps: string[]; // concrete actions surfaced
  generatedAt: number;
}

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
      await updateRoom(slug, { status: "archived" });
      return archive;
    },
    { ttlSeconds: 30 },
  );
  return res.ok ? res.value : getArchive(slug);
}

export async function getArchive(slug: string): Promise<RoomArchive | null> {
  return db.get<RoomArchive>(archiveKey(slug));
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
