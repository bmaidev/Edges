// Module: marketplace (Idea Marketplace / prediction market).
//
// dotvote's richer cousin: instead of spending a flat pool of dots over a fixed
// option list to express *preference*, participants invest a budget of credits
// across ideas drawn from a PRIOR capture phase to express *predicted success*.
// Adds a per-idea cap, a configurable currency, an optional self-invest block,
// and a leaderboard that can be hidden from participants until reveal.
//
// State lives entirely in the vote store: one JSON value per (phase, token),
// shaped as Record<ideaId, credits>. Ideas are submissions from sourcePhaseId;
// author handles/tokens are NEVER surfaced to participants by computeView.

import { z } from "zod";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

// ---- view types (consumed by marketplace.client.tsx) ----------------------

export interface MarketplaceIdea {
  id: string;
  text: string;
  total?: number; // total credits across all investors — present only when shown
  mine: number; // credits the caller has invested in this idea
}

export interface MarketplaceView {
  prompt: string;
  currencyLabel: string;
  budget: number;
  remaining: number;
  maxPerIdea?: number;
  ideas: MarketplaceIdea[];
  showLeaderboard: boolean; // whether `total` is populated / leaderboard is live
}

// ---- config ---------------------------------------------------------------

export interface MarketplaceConfig {
  label: string;
  prompt?: string;
  sourcePhaseId: string;
  budget: number;
  maxPerIdea?: number;
  currencyLabel?: string;
  showLeaderboardLive?: boolean;
  allowSelfInvest?: boolean;
}

// Local copy of the registry's vis() helper (admin mirrors the facilitator).
function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

const schema = z
  .object({
    label: z.string(),
    prompt: z.string().optional(),
    sourcePhaseId: z.string(),
    budget: z.number().int().positive(),
    maxPerIdea: z.number().int().positive().optional(),
    currencyLabel: z.string().optional(),
    showLeaderboardLive: z.boolean().optional(),
    allowSelfInvest: z.boolean().optional(),
  })
  .passthrough();

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((s, n) => s + (Number(n) || 0), 0);
}

export const marketplaceModule: ModuleServerDef<MarketplaceConfig> = {
  id: "marketplace",
  meta: {
    name: "Idea marketplace",
    description:
      "Invest a budget across ideas from an earlier phase to predict which will succeed — a lightweight prediction market.",
  },
  schema,
  defaultConfig: {
    label: "Marketplace",
    prompt: "Invest your credits in the ideas you predict will succeed.",
    sourcePhaseId: "",
    budget: 100,
    currencyLabel: "credits",
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<MarketplaceView> {
    const c = ctx.config as unknown as MarketplaceConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const budget = c.budget ?? 100;
    const currencyLabel = c.currencyLabel ?? "credits";
    const maxPerIdea = c.maxPerIdea;

    // Ideas come from a prior capture phase's submissions. We deliberately drop
    // the author handle/token so participants never see who authored an idea.
    const ideaSubs = ctx.submissions.filter((s) => s.phaseId === sourcePhaseId);

    const votes = await ctx.store.readVotes(ctx.phase.id);

    // Totals per idea = sum of credits across every investor's map.
    const totals: Record<string, number> = {};
    for (const idea of ideaSubs) totals[idea.id] = 0;
    for (const v of Object.values(votes)) {
      const map = (v ?? {}) as Record<string, number>;
      for (const [ideaId, n] of Object.entries(map))
        if (ideaId in totals) totals[ideaId] += Number(n) || 0;
    }

    const mine = ((ctx.me ? votes[ctx.me.token] : null) ?? {}) as Record<
      string,
      number
    >;
    const remaining = Math.max(0, budget - sumValues(mine));

    // Leaderboard totals: always to facilitator/cohost/admin/projector; to
    // participants only when explicitly enabled.
    const showLeaderboard =
      ctx.role !== "participant" || Boolean(c.showLeaderboardLive);

    let ideas: MarketplaceIdea[] = ideaSubs.map((s) => ({
      id: s.id,
      text: s.text,
      mine: Number(mine[s.id]) || 0,
      ...(showLeaderboard ? { total: totals[s.id] ?? 0 } : {}),
    }));

    // When the leaderboard is shown, surface it highest-funded first.
    if (showLeaderboard)
      ideas = ideas.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

    return {
      prompt: c.prompt ?? "",
      currencyLabel,
      budget,
      remaining,
      maxPerIdea,
      ideas,
      showLeaderboard,
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "invest") return { ok: false, reason: "unknown action" };
    if (!action.token) return { ok: false, reason: "missing" };

    const c = ctx.config as unknown as MarketplaceConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const budget = c.budget ?? 100;
    const maxPerIdea = c.maxPerIdea;

    const ideaId = String(action.payload?.ideaId ?? "");
    if (!ideaId) return { ok: false, reason: "missing idea" };

    // The idea must exist in the source phase's submissions.
    const idea = ctx.submissions.find(
      (s) => s.phaseId === sourcePhaseId && s.id === ideaId,
    );
    if (!idea) return { ok: false, reason: "bad idea" };

    // Block self-investment unless explicitly allowed (idea author == actor).
    if (!c.allowSelfInvest && idea.token && idea.token === action.token)
      return { ok: false, reason: "can't invest in your own idea" };

    // delta is +1/-1 (stepper) or any integer amount.
    const delta = Math.trunc(Number(action.payload?.delta));
    if (!Number.isFinite(delta) || delta === 0)
      return { ok: false, reason: "bad amount" };

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const mine = ((votes[action.token] as Record<string, number>) ?? {}) || {};

    const cur = Number(mine[ideaId]) || 0;
    const next = cur + delta;
    if (next < 0) return { ok: false, reason: "nothing to withdraw" };
    if (maxPerIdea != null && next > maxPerIdea)
      return { ok: false, reason: "per-idea cap reached" };

    const used = sumValues(mine);
    if (used - cur + next > budget) return { ok: false, reason: "over budget" };

    if (next === 0) delete mine[ideaId];
    else mine[ideaId] = next;

    await ctx.store.castVote(ctx.phase.id, action.token, mine);
    return { ok: true };
  },
};
