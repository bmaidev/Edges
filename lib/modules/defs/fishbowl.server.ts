// ---- module: fishbowl -----------------------------------------------------
//
// Open fishbowl with the empty chair — a self-facilitating discussion format.
// Invariant: N occupied inner seats + at least one empty chair. Anyone may take
// the empty seat; once they do, an existing speaker must leave, restoring one
// empty chair. We model the empty chair implicitly as `innerSeats - occupants`,
// so it can never go negative and the affordance is always "is there room?".
//
// State lives entirely in ctx.store:
//   - votes[token] = { seated: boolean, since: number }  (one entry per person)
//   - question cards = submissions tagged "question" for this phase (optional)

import { z } from "zod";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

// ---- shared helper (replicated from registry.server.ts) -------------------

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- view types -----------------------------------------------------------

export interface FishbowlSpeaker {
  label: string; // "Speaker 1..N" for participants/projector; handle for facilitator
}

export interface FishbowlQuestion {
  id: string;
  text: string;
}

export interface FishbowlView {
  innerSeats: number;
  occupantCount: number;
  emptySeats: number;
  amSeated: boolean;
  canSit: boolean; // an empty seat exists && the caller is not seated
  speakers: FishbowlSpeaker[]; // length === occupantCount
  questions: FishbowlQuestion[];
  allowQuestions: boolean;
}

// ---- config ---------------------------------------------------------------

interface FishbowlConfig {
  label: string;
  innerSeats: number;
  mode?: "open" | "closed";
  allowQuestions?: boolean;
}

type SeatState = { seated: boolean; since: number };

function readSeat(value: unknown): SeatState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return { seated: Boolean(v.seated), since: Number(v.since) || 0 };
}

// ---- module ---------------------------------------------------------------

export const fishbowlModule: ModuleServerDef<FishbowlConfig> = {
  id: "fishbowl",
  meta: {
    name: "Fishbowl",
    description:
      "Open fishbowl with the empty chair — a self-facilitating discussion. Take the empty seat to speak; a speaker then steps out.",
    icon: "circle",
  },
  schema: z
    .object({
      label: z.string(),
      innerSeats: z.number().int().min(2),
      mode: z.enum(["open", "closed"]).optional(),
      allowQuestions: z.boolean().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Fishbowl",
    innerSeats: 4,
    mode: "open",
    allowQuestions: true,
  },
  // Participants need the live circle; the projector mirrors it. Observers'
  // identities are never leaked to other participants (handled in computeView).
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<FishbowlView> {
    const c = ctx.config as unknown as FishbowlConfig;
    const innerSeats = Math.max(2, Number(c.innerSeats) || 4);
    const allowQuestions = Boolean(c.allowQuestions);

    const votes = await ctx.store.readVotes(ctx.phase.id);

    // Occupants = tokens with seated===true, oldest-first (by `since`) so the
    // "Speaker k" labels are stable. Capped at innerSeats defensively — the cap
    // is truly enforced in handleAction, this is belt-and-braces against drift.
    const occupants = Object.entries(votes)
      .map(([token, value]) => ({ token, seat: readSeat(value) }))
      .filter((e): e is { token: string; seat: SeatState } =>
        Boolean(e.seat?.seated),
      )
      .sort((a, b) => a.seat.since - b.seat.since)
      .slice(0, innerSeats);

    const occupantCount = occupants.length;
    const emptySeats = Math.max(0, innerSeats - occupantCount);

    const myToken = ctx.me?.token ?? null;
    const amSeated = myToken
      ? occupants.some((o) => o.token === myToken)
      : false;
    const canSit = emptySeats > 0 && !amSeated;

    // Anonymise speakers for participants + projector ("Speaker k"); only the
    // facilitator/admin/cohost may see who is actually in the seat.
    const isStaff =
      ctx.role === "facilitator" ||
      ctx.role === "admin" ||
      ctx.role === "cohost";
    const handleByToken = new Map(
      ctx.participants.map((p) => [p.token, p.handle] as const),
    );
    const speakers: FishbowlSpeaker[] = occupants.map((o, i) => ({
      label: isStaff
        ? (handleByToken.get(o.token) ?? `Speaker ${i + 1}`)
        : `Speaker ${i + 1}`,
    }));

    // Question cards: submissions tagged "question" for this phase. Shown to
    // occupants + facilitator + projector. (ctx.submissions is populated for
    // staff roles; participants seated in the circle won't have raw access here,
    // so the list is simply empty for them — the projector carries the feed.)
    const questions: FishbowlQuestion[] = allowQuestions
      ? ctx.submissions
          .filter((s) => s.phaseId === ctx.phase.id && s.tag === "question")
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((s) => ({ id: s.id, text: s.text }))
      : [];

    return {
      innerSeats,
      occupantCount,
      emptySeats,
      amSeated,
      canSit,
      speakers,
      questions,
      allowQuestions,
    };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const c = ctx.config as unknown as FishbowlConfig;
    const innerSeats = Math.max(2, Number(c.innerSeats) || 4);
    const allowQuestions = Boolean(c.allowQuestions);

    if (action.type === "sit") {
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const occupied = Object.values(votes).filter(
        (v) => readSeat(v)?.seated,
      ).length;
      const mine = readSeat(votes[action.token]);
      if (mine?.seated) return { ok: false, reason: "already seated" };
      // Enforce the invariant: occupants may never exceed innerSeats, so a sit
      // is only allowed while an empty chair exists.
      if (occupied >= innerSeats) return { ok: false, reason: "circle full" };
      // Date.now() lives only in handleAction (computeView stays pure).
      await ctx.store.castVote(ctx.phase.id, action.token, {
        seated: true,
        since: Date.now(),
      });
      return { ok: true };
    }

    if (action.type === "leave") {
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const mine = readSeat(votes[action.token]);
      await ctx.store.castVote(ctx.phase.id, action.token, {
        seated: false,
        since: mine?.since ?? 0,
      });
      return { ok: true };
    }

    if (action.type === "ask") {
      if (!allowQuestions) return { ok: false, reason: "questions disabled" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(
        handle,
        text.slice(0, 280),
        ctx.phase.id,
        "question",
        action.token,
      );
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
