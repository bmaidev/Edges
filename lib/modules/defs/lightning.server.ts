// ---- module: lightning (Lightning Talks / Demos) --------------------------
//
// A strict timeboxed speaker queue with an accountable advance. Participants
// sign up; the facilitator drives a "next" action that records who has spoken
// and stamps when the current speaker started, so the room shares one honest
// countdown. This forces concision and prevents loudest-wins drift.
//
// State lives entirely in the per-phase votes hash (ctx.store):
//   - votes[token]                = { inQueue, joinedAt, topic? }  (each speaker's own entry)
//   - votes["__done__"]           = string[] of tokens who have already spoken
//   - votes["__current_started__"]= number (epoch ms) when the current speaker began
// Synthetic "__"-prefixed keys hold facilitator control state alongside the
// per-participant entries (same trick poll/qna use for module state).

import { z } from "zod";
import type { Participant } from "@/lib/types";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

// ---- shared helper (replicated, not imported) -----------------------------

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- config ---------------------------------------------------------------

export const lightningSchema = z
  .object({
    label: z.string(),
    secondsPerSpeaker: z.number().int().positive().default(180),
    queueMode: z.enum(["signup", "random"]).default("signup"),
    topicPrompt: z.string().optional(),
  })
  .passthrough();

export type LightningConfig = z.infer<typeof lightningSchema>;

// ---- view types -----------------------------------------------------------

export interface LightningQueueEntry {
  handle: string;
  topic?: string;
}

export interface LightningView {
  topicPrompt?: string;
  secondsPerSpeaker: number;
  queue: LightningQueueEntry[];
  current: { handle: string; topic?: string } | null;
  next: { handle: string } | null;
  myPosition: number | null; // 1-based position in the live queue, null if not queued
  iAmCurrent: boolean;
  startedAt?: number; // epoch ms the current speaker began (drives the countdown)
}

// ---- the per-token entry stored in votes ----------------------------------

interface QueueRecord {
  inQueue: boolean;
  joinedAt: number;
  topic?: string;
}

const SYNTH_DONE = "__done__";
const SYNTH_STARTED = "__current_started__";

// Stable, deterministic shuffle key from a token (FNV-1a-ish). Pure — safe in
// computeView. Used only in "random" queueMode so order is stable across reads.
function shuffleKey(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function readRecord(value: unknown): QueueRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.inQueue !== "boolean") return null;
  return {
    inQueue: v.inQueue,
    joinedAt: typeof v.joinedAt === "number" ? v.joinedAt : 0,
    topic: typeof v.topic === "string" ? v.topic : undefined,
  };
}

// ---- module ---------------------------------------------------------------

export const lightningModule: ModuleServerDef<LightningConfig> = {
  id: "lightning",
  meta: {
    name: "Lightning talks",
    description:
      "Strict timeboxed speaker queue with an accountable advance — sign up, see who's up next, share one countdown.",
    icon: "⚡",
  },
  schema: lightningSchema,
  defaultConfig: {
    label: "Lightning talks",
    secondsPerSpeaker: 180,
    queueMode: "signup",
    topicPrompt: "What will you show? (optional)",
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<LightningView> {
    const c = ctx.config as Record<string, unknown>;
    const secondsPerSpeaker =
      typeof c.secondsPerSpeaker === "number" && c.secondsPerSpeaker > 0
        ? c.secondsPerSpeaker
        : 180;
    const queueMode = c.queueMode === "random" ? "random" : "signup";
    const topicPrompt =
      typeof c.topicPrompt === "string" ? c.topicPrompt : undefined;

    const votes = await ctx.store.readVotes(ctx.phase.id);

    // Facilitator control state.
    const doneRaw = votes[SYNTH_DONE];
    const done = new Set(
      Array.isArray(doneRaw)
        ? (doneRaw as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    );
    const startedRaw = votes[SYNTH_STARTED];
    const startedAt = typeof startedRaw === "number" ? startedRaw : undefined;

    // token -> handle (speaking is public, so handles are fine to surface here).
    const handleOf = new Map<string, string>();
    for (const p of ctx.participants) handleOf.set(p.token, p.handle);

    // Build the live queue: in-queue, not yet done, ordered.
    const entries: { token: string; rec: QueueRecord }[] = [];
    for (const [token, value] of Object.entries(votes)) {
      if (token === SYNTH_DONE || token === SYNTH_STARTED) continue;
      const rec = readRecord(value);
      if (!rec || !rec.inQueue || done.has(token)) continue;
      entries.push({ token, rec });
    }

    entries.sort((a, b) => {
      if (queueMode === "random") {
        const ka = shuffleKey(a.token);
        const kb = shuffleKey(b.token);
        if (ka !== kb) return ka - kb;
        return a.token < b.token ? -1 : 1;
      }
      if (a.rec.joinedAt !== b.rec.joinedAt) return a.rec.joinedAt - b.rec.joinedAt;
      return a.token < b.token ? -1 : 1;
    });

    const queue: LightningQueueEntry[] = entries.map((e) => ({
      handle: handleOf.get(e.token) ?? "Someone",
      topic: e.rec.topic,
    }));

    const currentEntry = entries[0] ?? null;
    const nextEntry = entries[1] ?? null;
    const current = currentEntry
      ? {
          handle: handleOf.get(currentEntry.token) ?? "Someone",
          topic: currentEntry.rec.topic,
        }
      : null;
    const next = nextEntry
      ? { handle: handleOf.get(nextEntry.token) ?? "Someone" }
      : null;

    const myToken = ctx.me?.token ?? null;
    const myIndex =
      myToken == null ? -1 : entries.findIndex((e) => e.token === myToken);
    const myPosition = myIndex === -1 ? null : myIndex + 1;
    const iAmCurrent = myIndex === 0;

    return {
      topicPrompt,
      secondsPerSpeaker,
      queue,
      current,
      next,
      myPosition,
      iAmCurrent,
      startedAt,
    };
  },
  async handleAction(ctx, action) {
    const votes = await ctx.store.readVotes(ctx.phase.id);

    if (action.type === "join") {
      if (!action.token) return { ok: false, reason: "missing" };
      const topicRaw = action.payload?.topic;
      const topic =
        typeof topicRaw === "string" && topicRaw.trim()
          ? topicRaw.trim().slice(0, 120)
          : undefined;
      // Preserve original joinedAt if they're re-joining after a leave.
      const prev = readRecord(votes[action.token]);
      const joinedAt =
        prev && prev.joinedAt > 0 ? prev.joinedAt : Date.now();
      const record: QueueRecord = { inQueue: true, joinedAt, topic };
      await ctx.store.castVote(ctx.phase.id, action.token, record);
      return { ok: true };
    }

    if (action.type === "leave") {
      if (!action.token) return { ok: false, reason: "missing" };
      const prev = readRecord(votes[action.token]);
      const record: QueueRecord = {
        inQueue: false,
        joinedAt: prev?.joinedAt ?? Date.now(),
        topic: prev?.topic,
      };
      await ctx.store.castVote(ctx.phase.id, action.token, record);
      return { ok: true };
    }

    if (action.type === "next") {
      // Accountable advance: facilitators/cohosts/admins only.
      if (ctx.role === "participant")
        return { ok: false, reason: "not allowed" };

      // Recompute the current speaker the same way computeView orders the queue.
      const doneRaw = votes[SYNTH_DONE];
      const done = Array.isArray(doneRaw)
        ? (doneRaw as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];
      const doneSet = new Set(done);
      const queueMode =
        (ctx.config as Record<string, unknown>).queueMode === "random"
          ? "random"
          : "signup";

      const entries: { token: string; rec: QueueRecord }[] = [];
      for (const [token, value] of Object.entries(votes)) {
        if (token === SYNTH_DONE || token === SYNTH_STARTED) continue;
        const rec = readRecord(value);
        if (!rec || !rec.inQueue || doneSet.has(token)) continue;
        entries.push({ token, rec });
      }
      entries.sort((a, b) => {
        if (queueMode === "random") {
          const ka = shuffleKey(a.token);
          const kb = shuffleKey(b.token);
          if (ka !== kb) return ka - kb;
          return a.token < b.token ? -1 : 1;
        }
        if (a.rec.joinedAt !== b.rec.joinedAt)
          return a.rec.joinedAt - b.rec.joinedAt;
        return a.token < b.token ? -1 : 1;
      });

      const current = entries[0];
      if (current) done.push(current.token);
      await ctx.store.castVote(ctx.phase.id, SYNTH_DONE, done);
      await ctx.store.castVote(ctx.phase.id, SYNTH_STARTED, Date.now());
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
