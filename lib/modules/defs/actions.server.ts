// Module: actions — "yours-first" commitments capture.
//
// The closing move of a good session: everyone leaves with something concrete
// THEY will do. Each participant captures their own short action items and sees
// them listed back, theirs first — a personal to-do list, not a shared feed.
// Commitments are semi-private, so the privacy contract is deliberately tight:
//   - a participant sees ONLY their own items (full text + owner),
//   - the projector sees COUNTS ONLY (never anyone's words),
//   - the facilitator/cohost/admin see the list (for follow-up), since they
//     already receive raw submission data.
//
// Append-only, like every other submission module: an action is one submission,
// tagged with its owner. State lives ONLY in ctx.store via addSubmission /
// ctx.submissions. The view types below are shared with actions.client.tsx.

import { z } from "zod";
import type { Submission } from "@/lib/types";
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

// ---- view-data types (consumed by actions.client.tsx) ---------------------

export interface ActionItem {
  text: string;
  owner: string; // who'll do it — defaults to the author's handle, editable
}

// Participant view — yours-first. We send back ONLY this caller's own items,
// plus a soft, anonymous momentum signal for the room (counts, never words).
export interface ActionsParticipantView {
  for: "participant";
  prompt: string;
  maxLen: number;
  maxItems: number;
  askOwner: boolean;
  mine: ActionItem[];
  remaining: number; // maxItems - mine.length
  roomCount: number; // total actions captured across the room
  contributorCount: number; // how many people have captured at least one
}

// Facilitator / cohost / admin — the list, for follow-up. Owner + text.
export interface ActionsFacilitatorView {
  for: "facilitator";
  prompt: string;
  items: ActionItem[];
  contributorCount: number;
}

// Projector — counts ONLY. Commitments never go on the big screen verbatim.
export interface ActionsProjectorView {
  for: "projector";
  prompt: string;
  roomCount: number;
  contributorCount: number;
}

export type ActionsView =
  | ActionsParticipantView
  | ActionsFacilitatorView
  | ActionsProjectorView;

// ---- config ---------------------------------------------------------------

interface ActionsConfig {
  label: string;
  prompt: string;
  maxLen?: number;
  maxItems?: number;
  askOwner?: boolean;
}

const DEFAULT_MAX_LEN = 200;
const DEFAULT_MAX_ITEMS = 5;

function phaseSubs(ctx: ModuleContext): Submission[] {
  return ctx.submissions.filter((s) => s.phaseId === ctx.phase.id);
}

function ownerOf(s: Submission): string {
  // The owner rides in the submission tag; fall back to the stored handle, then
  // a neutral label so the list never shows a blank cell.
  const tag = (s.tag ?? "").trim();
  if (tag) return tag;
  const handle = (s.handle ?? "").trim();
  return handle || "Someone";
}

function contributorCount(subs: Submission[]): number {
  // Distinct authors. Token is the stable identity; fall back to handle for the
  // (rare) token-less submission so the count never silently under-reports.
  const ids = new Set(subs.map((s) => s.token ?? `h:${s.handle ?? ""}`));
  return ids.size;
}

// ---- module ---------------------------------------------------------------

export const actionsModule: ModuleServerDef<ActionsConfig> = {
  id: "actions",
  meta: {
    name: "Actions",
    description:
      "Yours-first commitments: everyone captures their own short action items and leaves with a personal to-do list.",
    icon: "check",
  },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string(),
      maxLen: z.number().int().positive().optional(),
      maxItems: z.number().int().positive().optional(),
      askOwner: z.boolean().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Actions",
    prompt: "What's one thing you'll do differently? Capture your commitments.",
    maxLen: 200,
    maxItems: 5,
    askOwner: true,
  },
  // Participants act; facilitator/cohost watch the list; projector shows a count.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  computeView(ctx): ActionsView {
    const prompt = (ctx.config.prompt as string) ?? "";
    const maxLen = (ctx.config.maxLen as number | undefined) ?? DEFAULT_MAX_LEN;
    const maxItems =
      (ctx.config.maxItems as number | undefined) ?? DEFAULT_MAX_ITEMS;
    const askOwner = (ctx.config.askOwner as boolean | undefined) ?? true;
    const subs = phaseSubs(ctx);

    if (ctx.role === "participant") {
      const me = ctx.me;
      const mine: ActionItem[] = me
        ? subs
            .filter((s) => s.token && s.token === me.token)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((s) => ({ text: s.text, owner: ownerOf(s) }))
        : [];
      return {
        for: "participant",
        prompt,
        maxLen,
        maxItems,
        askOwner,
        mine,
        remaining: Math.max(0, maxItems - mine.length),
        roomCount: subs.length,
        contributorCount: contributorCount(subs),
      };
    }

    if (ctx.role === "projector") {
      // Counts only — a commitment never appears verbatim on the big screen.
      return {
        for: "projector",
        prompt,
        roomCount: subs.length,
        contributorCount: contributorCount(subs),
      };
    }

    // facilitator / cohost / admin — the list, for follow-up.
    const items: ActionItem[] = subs
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({ text: s.text, owner: ownerOf(s) }));
    return {
      for: "facilitator",
      prompt,
      items,
      contributorCount: contributorCount(subs),
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "add") return { ok: false, reason: "unknown action" };
    if (!action.token) return { ok: false, reason: "missing" };

    const maxLen = (ctx.config.maxLen as number | undefined) ?? DEFAULT_MAX_LEN;
    const maxItems =
      (ctx.config.maxItems as number | undefined) ?? DEFAULT_MAX_ITEMS;

    const text = String(action.payload?.text ?? "").trim();
    if (!text) return { ok: false, reason: "empty" };

    // Enforce the per-person cap server-side (the client also hides the input,
    // but the gate must live here). Count THIS caller's own items.
    const mineCount = phaseSubs(ctx).filter(
      (s) => s.token && s.token === action.token,
    ).length;
    if (mineCount >= maxItems) return { ok: false, reason: "limit" };

    const clipped = text.slice(0, maxLen);
    // Owner defaults to the author's own handle; an explicit owner overrides it.
    const handle = ctx.me?.handle ?? "Anonymous";
    const owner =
      String(action.payload?.owner ?? "").trim().slice(0, 60) || handle;

    await ctx.store.addSubmission(
      handle,
      clipped,
      ctx.phase.id,
      owner,
      action.token,
    );
    return { ok: true };
  },
};
