// Module: redistribute — anonymous-critique redistribution ("defend the card").
//
// Legitimizes dissent and counters groupthink by handing each participant
// SOMEONE ELSE'S anonymous idea (drawn from an earlier capture phase) to
// critique, defend, or improve. Authorship is never revealed to participants.
//
// The hard part is STABLE assignment under 2s polling without writing in
// computeView. We make the assignment a pure, deterministic function of
// existing state: the sorted source ideas and the sorted participant tokens.
// Because both lists are stable across polls, every poll computes the same
// assigned card — no reshuffle, no write. handleAction recomputes the SAME
// way so the response attaches to the right card.

import { z } from "zod";
import type { Participant } from "@/lib/types";
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

// ---- config ----------------------------------------------------------------

export interface RedistributeConfig {
  label: string;
  sourcePhaseId: string;
  mode: "critique" | "defend" | "improve";
  prompt: string;
  requireResponse?: boolean;
}

const schema = z
  .object({
    label: z.string(),
    sourcePhaseId: z.string(),
    mode: z.enum(["critique", "defend", "improve"]).default("critique"),
    prompt: z.string(),
    requireResponse: z.boolean().optional(),
  })
  .passthrough();

// ---- view types ------------------------------------------------------------

export interface RedistributeParticipantView {
  prompt: string;
  mode: "critique" | "defend" | "improve";
  assignedCard: { id: string; text: string } | null; // null until enough ideas
  myResponseSubmitted: boolean;
}

export interface RedistributePair {
  idea: { id: string; text: string };
  responses: { text: string }[];
}

export interface RedistributeProjectorView {
  mode: "critique" | "defend" | "improve";
  prompt: string;
  pairs: RedistributePair[];
}

// ---- deterministic assignment ---------------------------------------------

// Pure: returns the idea assigned to `token`, or null if not enough ideas /
// no valid assignment. Sorted-by-id ideas + sorted participant tokens make
// this stable across polls. We never write here.
function assignFor(
  ctx: ModuleContext,
  token: string | null | undefined,
): { id: string; text: string } | null {
  const sourcePhaseId = (ctx.config.sourcePhaseId as string) ?? "";
  if (!token || !sourcePhaseId) return null;

  const ideas = ctx.submissions
    .filter((s) => s.phaseId === sourcePhaseId)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (ideas.length === 0) return null;

  // Stable ordering of participant tokens (independent of join order churn).
  const tokens = ctx.participants
    .map((p) => p.token)
    .filter((t): t is string => Boolean(t))
    .slice()
    .sort();
  const myIndex = tokens.indexOf(token);
  // Fall back to 0 if the caller isn't in the participant list (e.g. a stale
  // token); they still get a deterministic, stable card.
  const base = myIndex === -1 ? 0 : myIndex;

  // Walk forward until we land on an idea the caller did not author.
  for (let step = 1; step <= ideas.length; step++) {
    const candidate = ideas[(base + step) % ideas.length];
    const authoredByMe = Boolean(candidate.token && candidate.token === token);
    if (!authoredByMe) return { id: candidate.id, text: candidate.text };
  }
  // Every idea is the caller's own (e.g. only one author). Nothing to hand out.
  return null;
}

// ---- module ----------------------------------------------------------------

export const redistributeModule: ModuleServerDef<RedistributeConfig> = {
  id: "redistribute",
  meta: {
    name: "Redistribute",
    description:
      "Hands each person someone else's anonymous idea to critique, defend, or improve — legitimizes dissent and counters groupthink.",
    icon: "shuffle",
  },
  schema,
  defaultConfig: {
    label: "Redistribute",
    sourcePhaseId: "",
    mode: "critique",
    prompt: "",
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  computeView(ctx) {
    const mode =
      (ctx.config.mode as "critique" | "defend" | "improve") ?? "critique";
    const prompt = (ctx.config.prompt as string) ?? "";

    // Participant: only ever see the card assigned to them, never authorship.
    if (ctx.role === "participant") {
      const me: Participant | null = ctx.me;
      const assignedCard = assignFor(ctx, me?.token ?? null);
      const myResponseSubmitted = Boolean(
        me?.token &&
          assignedCard &&
          ctx.submissions.some(
            (s) =>
              s.phaseId === ctx.phase.id &&
              s.tag === assignedCard.id &&
              s.token === me.token,
          ),
      );
      const view: RedistributeParticipantView = {
        prompt,
        mode,
        assignedCard,
        myResponseSubmitted,
      };
      return view;
    }

    // Facilitator / projector / others: idea -> its responses, side by side.
    const sourcePhaseId = (ctx.config.sourcePhaseId as string) ?? "";
    const ideas = ctx.submissions
      .filter((s) => s.phaseId === sourcePhaseId)
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const pairs: RedistributePair[] = ideas.map((idea) => ({
      idea: { id: idea.id, text: idea.text },
      responses: ctx.submissions
        .filter((s) => s.phaseId === ctx.phase.id && s.tag === idea.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((s) => ({ text: s.text })),
    }));
    const view: RedistributeProjectorView = { mode, prompt, pairs };
    return view;
  },
  async handleAction(ctx, action) {
    if (action.type !== "respond") return { ok: false, reason: "unknown action" };
    const text = String(action.payload?.text ?? "").trim();
    if (!text) return { ok: false, reason: "empty" };
    if (text.length > 2000) return { ok: false, reason: "too long" };

    // Recompute the SAME deterministic assignment so the response attaches to
    // the right card. Prefer the participant record's token; fall back to the
    // action token.
    const token = ctx.me?.token ?? action.token ?? null;
    const assigned = assignFor(ctx, token);
    if (!assigned) return { ok: false, reason: "no card assigned yet" };

    await ctx.store.addSubmission(
      ctx.me?.handle ?? "Anonymous",
      text,
      ctx.phase.id,
      assigned.id, // tag = the assigned idea's id
      action.token,
    );
    return { ok: true };
  },
};
