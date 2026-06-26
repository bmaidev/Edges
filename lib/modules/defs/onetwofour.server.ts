// Module: onetwofour — 1-2-4-All (the canonical Liberating Structure).
//
// The same question is worked on at four widening scales: alone, then in pairs,
// then in foursomes, then by the whole group. Generative silence at each step
// surfaces everyone's thinking before it converges, so the loud and the quiet
// contribute equally.
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__round__"] = number — the current stage (default 0), 0..3
// Stage by round: 0 = Alone, 1 = Pairs (size 2), 2 = Foursomes (size 4),
// 3 = Whole group. Groups are formed deterministically from the sorted roster
// with `groupRound(tokens, size, 0)` (round arg 0 so pairs nest into the same
// contiguous foursomes), so membership is stable across 2s polls and
// computeView never writes.
//
// Shared output (each stage's combined answer) is harvested as submissions
// tagged `r${round}` when captureShared is on.

import { z } from "zod";
import { chunk, groupOf, oneTwoFourSize, sortedTokens } from "../groups";
import type {
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

// ---- config ---------------------------------------------------------------

export interface OneTwoFourConfig {
  label: string;
  prompt: string; // the single question worked at every scale
  captureShared?: boolean; // record each stage's shared output (default true)
}

const schema = z
  .object({
    label: z.string(),
    prompt: z.string(),
    captureShared: z.boolean().optional(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

const STAGE_LABELS = [
  "Think alone",
  "Compare in pairs",
  "Combine into fours",
  "Whole-group share",
] as const;

export type OneTwoFourStageLabel = (typeof STAGE_LABELS)[number];

export interface OneTwoFourParticipantView {
  round: number;
  stageLabel: OneTwoFourStageLabel;
  prompt: string;
  groupMembers: string[]; // handles in your current group (round 0 = just you)
  wholeRoom: boolean; // round 3 — the group is the whole room
  captureShared: boolean;
  mySharedSubmitted: boolean;
}

export interface OneTwoFourSharedItem {
  text: string;
  handle: string;
}

export interface OneTwoFourFacilitatorView {
  round: number;
  stageLabel: OneTwoFourStageLabel;
  groupCount: number;
  totalParticipants: number;
  shared: OneTwoFourSharedItem[]; // peek at this stage's shared submissions
}

export interface OneTwoFourProjectorView {
  round: number;
  stageLabel: OneTwoFourStageLabel;
  groupCount: number;
  totalParticipants: number;
}

// ---- vote-state reader (pure; default-safe) -------------------------------

function readRound(votes: Record<string, unknown>): number {
  const r = votes["__round__"];
  if (typeof r !== "number" || !Number.isFinite(r) || r < 0) return 0;
  return Math.min(3, Math.floor(r));
}

function stageLabel(round: number): OneTwoFourStageLabel {
  return STAGE_LABELS[Math.min(round, STAGE_LABELS.length - 1)];
}

// ---- module ---------------------------------------------------------------

export const onetwofourModule: ModuleServerDef<OneTwoFourConfig> = {
  id: "onetwofour",
  meta: {
    name: "1-2-4-All",
    description:
      "The canonical Liberating Structure — the same question worked alone, then in pairs, then in foursomes, then by the whole group, so everyone's thinking surfaces before it converges.",
    icon: "users",
  },
  schema,
  defaultConfig: {
    label: "1-2-4-All",
    prompt: "What's the one thing that, if we got it right, would matter most?",
    captureShared: true,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  async computeView(ctx) {
    const prompt = (ctx.config.prompt as string) ?? "";
    const captureShared = ctx.config.captureShared !== false; // default true

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const round = readRound(votes);
    const size = oneTwoFourSize(round); // 1, 2, 4, Infinity
    const tokens = ctx.participants.map((p) => p.token);

    // Whole-group stage: one group is the whole room.
    const wholeRoom = round >= 3 || !Number.isFinite(size);
    // Contiguous chunking of the stable token order so a person's pair nests
    // inside their foursome (the whole point of 1-2-4-All) — NOT the circle
    // method, which would scatter pairs across different fours.
    const groups = wholeRoom
      ? tokens.length > 0
        ? [[...tokens]]
        : []
      : chunk(sortedTokens(tokens), size);

    const handleByToken = new Map(
      ctx.participants.map((p) => [p.token, p.handle] as const),
    );

    // ---- participant: just my group, this stage ----
    if (ctx.role === "participant") {
      const me = ctx.me;
      const tag = `r${round}`;
      const mySharedSubmitted = me
        ? ctx.submissions.some(
            (s) =>
              s.phaseId === ctx.phase.id &&
              s.tag === tag &&
              s.token === me.token,
          )
        : false;

      let members: string[];
      if (!me) {
        members = [];
      } else if (round === 0) {
        members = [me.handle];
      } else if (wholeRoom) {
        members = ctx.participants.map((p) => p.handle);
      } else {
        const found = groupOf(groups, me.token);
        members = found
          ? found.group.map((t) => handleByToken.get(t) ?? "—")
          : [me.handle];
      }

      const view: OneTwoFourParticipantView = {
        round,
        stageLabel: stageLabel(round),
        prompt,
        groupMembers: members,
        wholeRoom,
        captureShared,
        mySharedSubmitted,
      };
      return view;
    }

    // ---- facilitator / projector ----
    const groupCount = wholeRoom
      ? tokens.length > 0
        ? 1
        : 0
      : groups.length;

    if (ctx.role === "projector") {
      const view: OneTwoFourProjectorView = {
        round,
        stageLabel: stageLabel(round),
        groupCount,
        totalParticipants: ctx.participants.length,
      };
      return view;
    }

    // facilitator (and admin/cohost) — peek at this stage's shared submissions.
    const tag = `r${round}`;
    const shared = ctx.submissions
      .filter((s) => s.phaseId === ctx.phase.id && s.tag === tag)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({ text: s.text, handle: s.handle }));

    const view: OneTwoFourFacilitatorView = {
      round,
      stageLabel: stageLabel(round),
      groupCount,
      totalParticipants: ctx.participants.length,
      shared,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Facilitator-only stage control.
    if (action.type === "nextRound") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const res = await ctx.store.withLock(`round:${ctx.phase.id}`, async () => {
        const votes = await ctx.store.readVotes(ctx.phase.id);
        const next = Math.min(3, readRound(votes) + 1); // cap at 3 (Whole group)
        await ctx.store.castVote(ctx.phase.id, "__round__", next);
      });
      return res.ok ? { ok: true } : { ok: false, reason: "Advancing — one moment." };
    }

    if (action.type === "share") {
      if ((ctx.config.captureShared as boolean | undefined) === false)
        return { ok: false, reason: "capture off" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };
      const me = ctx.me;
      if (!me) return { ok: false, reason: "no participant" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const round = readRound(votes);
      await ctx.store.addSubmission(
        me.handle,
        text,
        ctx.phase.id,
        `r${round}`,
        action.token,
      );
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
