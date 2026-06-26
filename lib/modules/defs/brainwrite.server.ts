// Module: brainwrite — silent round-robin "build-on" ideation (brainwriting).
//
// Each participant builds silently on a "card" (an idea chain) started by
// someone else, then rotates to a different card on the next poll. A card is
// the set of submissions sharing the same tag (the card's id). There is NO
// global round counter: rotation is derived deterministically from submission
// state, so it's stable across the 2s poll and across replicas.
//
// Server half: schema, computeView (role-scoped), handleAction ("build").
// State lives ONLY in ctx.store via addSubmission / ctx.submissions. The view
// types below are shared with the client renderer file.

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

// ---- view-data types (consumed by brainwrite.client.tsx) ------------------

export interface BrainwriteLine {
  text: string; // anonymous — no handles ever leave the server for participants
}

// Participant view: one card to build on, plus how much they've added to it.
export interface BrainwriteParticipantView {
  for: "participant";
  prompt: string;
  maxLen: number;
  // The card assigned to this participant right now. Null only if there are no
  // participants / nothing to build on yet (rare; caller seeds their own).
  card: { id: string; lines: BrainwriteLine[] } | null;
  myContributionCount: number; // how many lines the caller has added to `card`
}

// Projector / facilitator view: aggregate progress, anonymous chains.
export interface BrainwriteOverviewView {
  for: "overview";
  prompt: string;
  cardCount: number;
  totalContributions: number;
  longestChains: BrainwriteLine[][]; // top few chains, longest first, anonymous
}

export type BrainwriteView =
  | BrainwriteParticipantView
  | BrainwriteOverviewView;

// ---- deterministic rotation -----------------------------------------------

interface BrainwriteConfig {
  label: string;
  prompt: string;
  maxLen?: number;
}

// All submissions belonging to this phase (the idea pool).
function phaseSubs(ctx: ModuleContext): Submission[] {
  return ctx.submissions.filter((s) => s.phaseId === ctx.phase.id);
}

// Distinct card ids that already exist, in a stable order (earliest-seeded
// first, ties broken by id so the order never wobbles between polls).
function existingCardIds(subs: Submission[]): string[] {
  const firstSeen = new Map<string, { at: number; id: string }>();
  for (const s of subs) {
    const card = s.tag;
    if (!card) continue;
    const prev = firstSeen.get(card);
    if (!prev || s.createdAt < prev.at) {
      firstSeen.set(card, { at: s.createdAt, id: s.id });
    }
  }
  return Array.from(firstSeen.entries())
    .sort((a, b) => a[1].at - b[1].at || (a[1].id < b[1].id ? -1 : 1))
    .map(([card]) => card);
}

// The caller's position among participant tokens (stable sort by token), used
// to offset the rotation so different people land on different cards.
function callerOffset(ctx: ModuleContext): number {
  const me = ctx.me;
  if (!me) return 0;
  const tokens = ctx.participants.map((p) => p.token).sort();
  const idx = tokens.indexOf(me.token);
  return idx < 0 ? 0 : idx;
}

// Decide which card this participant should build on right now. Pure +
// deterministic so computeView and handleAction agree without coordination.
function assignCardId(ctx: ModuleContext): string | null {
  const me = ctx.me;
  const subs = phaseSubs(ctx);
  const cards = existingCardIds(subs);

  // Count the caller's contributions per card.
  const myCounts = new Map<string, number>();
  if (me) {
    for (const s of subs) {
      if (s.token && s.token === me.token && s.tag) {
        myCounts.set(s.tag, (myCounts.get(s.tag) ?? 0) + 1);
      }
    }
  }

  const myCardId = me ? me.token : null;

  // Cards the caller may build on: anything they did NOT originate.
  // A card's id IS its originator's token, so exclude the caller's own card.
  const buildable = cards.filter((c) => c !== myCardId);

  if (buildable.length === 0) {
    // Nothing to build on. Seed: the caller starts their own card.
    return myCardId;
  }

  // Among buildable cards, prefer the one the caller has contributed to LEAST.
  // Stable sort: by (myContributionCount asc, then by the card's fixed order in
  // `cards`). Then rotate the selection by the caller's offset so people fan
  // out across low-contribution cards instead of all piling onto the same one.
  const ranked = buildable
    .map((c) => ({
      card: c,
      mine: myCounts.get(c) ?? 0,
      order: cards.indexOf(c),
    }))
    .sort((a, b) => a.mine - b.mine || a.order - b.order);

  // Restrict to the tier of least-contributed cards, then pick by offset so the
  // choice spreads deterministically across the available tier.
  const minMine = ranked[0].mine;
  const tier = ranked.filter((r) => r.mine === minMine);
  const pick = tier[callerOffset(ctx) % tier.length];
  return pick.card;
}

function linesForCard(subs: Submission[], cardId: string): BrainwriteLine[] {
  return subs
    .filter((s) => s.tag === cardId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({ text: s.text }));
}

// ---- module ---------------------------------------------------------------

export const brainwriteModule: ModuleServerDef<BrainwriteConfig> = {
  id: "brainwrite",
  meta: {
    name: "Brainwrite",
    description:
      "Silent round-robin build-on: everyone adds a line to an idea card someone else started, then rotates — no talking.",
    icon: "pencil",
  },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string(),
      maxLen: z.number().int().positive().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Brainwrite",
    prompt: "Build on the idea below — add one line. No talking.",
    maxLen: 200,
  },
  // Participants act; facilitator/cohost/projector watch the build live.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  computeView(ctx): BrainwriteView {
    const prompt = (ctx.config.prompt as string) ?? "";
    const maxLen = (ctx.config.maxLen as number | undefined) ?? 200;
    const subs = phaseSubs(ctx);

    if (ctx.role === "participant") {
      const cardId = assignCardId(ctx);
      const lines = cardId ? linesForCard(subs, cardId) : [];
      const myContributionCount =
        ctx.me && cardId
          ? subs.filter(
              (s) => s.tag === cardId && s.token && s.token === ctx.me!.token,
            ).length
          : 0;
      return {
        for: "participant",
        prompt,
        maxLen,
        card: cardId ? { id: cardId, lines } : null,
        myContributionCount,
      };
    }

    // Overview (projector / facilitator / cohost / admin): anonymous aggregate.
    const cards = existingCardIds(subs);
    const chains = cards
      .map((c) => linesForCard(subs, c))
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
    return {
      for: "overview",
      prompt,
      cardCount: cards.length,
      totalContributions: subs.length,
      longestChains: chains,
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "build") return { ok: false, reason: "unknown action" };
    if (!action.token) return { ok: false, reason: "missing" };

    const maxLen = (ctx.config.maxLen as number | undefined) ?? 200;
    const text = String(action.payload?.text ?? "").trim();
    if (!text) return { ok: false, reason: "empty" };
    const clipped = text.slice(0, maxLen);

    // Recompute the SAME deterministic assignment the view showed this
    // participant, so the line lands on the card they were building on.
    const cardId = assignCardId(ctx);
    if (!cardId) return { ok: false, reason: "no card" };

    const handle = ctx.me?.handle ?? "Anonymous";
    await ctx.store.addSubmission(
      handle,
      clipped,
      ctx.phase.id,
      cardId,
      action.token,
    );
    return { ok: true };
  },
};
