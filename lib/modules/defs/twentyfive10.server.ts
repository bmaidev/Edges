// Module: twentyfive10 — "25/10 Crowd Sourcing" (a Liberating Structure).
//
// Everyone writes ONE bold idea. Then the ideas detach from their authors and
// circulate: in each of several passes, every participant is handed a card they
// didn't write and blind-scores it 1–5. Across the passes the strongest ideas
// rise to the top — and because authorship is invisible, no single voice can
// dominate. (The name comes from doing it with ~25 people in 10 minutes.)
//
// Two phases share one PhaseInstance, gated by a round counter in vote-state:
//   votes["__round__"] = number   — 0 = WRITE phase; 1..passes = SCORING passes
// Ideas are submissions tagged "idea" (one per token is the intent). Scores are
// stored per voter as votes[token] = Record<cardId, score>; a card's total is
// the sum across all voters. The facilitator drives the rounds with "nextRound".
//
// Card assignment is a PURE, deterministic function of the sorted idea cards and
// the sorted voter tokens (offset by the round), so it's stable across 2s polls
// and computeView never writes. handleAction recomputes the SAME way.

import { z } from "zod";
import { COHORT_KEY, readCohort } from "../groups";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";
import type { Submission } from "@/lib/types";

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

export interface Twentyfive10Config {
  label: string;
  prompt: string;
  maxScore?: number;
  passes?: number;
}

const schema = z
  .object({
    label: z.string(),
    prompt: z.string(),
    maxScore: z.number().int().positive().optional(),
    passes: z.number().int().positive().optional(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

export interface Twentyfive10ParticipantView {
  phase: "write" | "score";
  round: number;
  passes: number;
  prompt: string;
  maxScore: number;
  // SCORING only: the card handed to me this pass (never my own), and my score
  // for it if I've already scored it this pass.
  assignedCard?: { id: string; text: string } | null;
  myScoreForIt?: number | null;
  myIdeaSubmitted?: boolean; // WRITE only
}

export interface Twentyfive10ResultCard {
  id: string;
  text: string;
  total: number;
  votes: number;
}

export interface Twentyfive10ResultsView {
  phase: "write" | "score";
  round: number;
  passes: number;
  prompt: string;
  maxScore: number;
  maxPossible: number; // passes * maxScore
  ideaCount: number;
  scoredCount: number; // how many scores have landed this pass / overall
  top: Twentyfive10ResultCard[]; // descending by total
}

// ---- vote-state reader (pure; default-safe) -------------------------------

function readRound(votes: Record<string, unknown>): number {
  const r = votes["__round__"];
  return typeof r === "number" && Number.isFinite(r) && r >= 0
    ? Math.floor(r)
    : 0;
}

function getMaxScore(ctx: ModuleContext): number {
  const m = ctx.config.maxScore;
  return typeof m === "number" && m > 0 ? Math.floor(m) : 5;
}

function getPasses(ctx: ModuleContext): number {
  const p = ctx.config.passes;
  return typeof p === "number" && p > 0 ? Math.floor(p) : 5;
}

// ---- pure helpers ---------------------------------------------------------

// Idea cards: every "idea" submission for this phase, sorted by id (stable).
function ideaCards(ctx: ModuleContext): Submission[] {
  return ctx.submissions
    .filter((s) => s.phaseId === ctx.phase.id && s.tag === "idea")
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Stable ordering of voter tokens (independent of join-order churn).
function sortedTokens(ctx: ModuleContext): string[] {
  return ctx.participants
    .map((p) => p.token)
    .filter((t): t is string => Boolean(t))
    .slice()
    .sort();
}

// D4 — the voter ordering that drives card assignment. Once scoring opens (round
// 0→1) the voter set is FROZEN into the cohort, so a latecomer joining mid-pass
// can't shift the sorted order and reshuffle who holds which card. A latecomer is
// absent from the frozen list, so `assignFor` gives them the index-0 fallback
// card — deterministic for them, invisible to everyone already scoring.
function voterTokens(
  ctx: ModuleContext,
  votes: Record<string, unknown>,
): string[] {
  const frozen = readCohort(votes);
  return frozen && frozen.length ? frozen : sortedTokens(ctx);
}

// Pure: returns the card assigned to `token` for round `round` (>=1), or null
// if there's no card that isn't authored by the caller. We start at
// (myIndex + round) % numCards and walk forward, skipping own-authored cards.
function assignFor(
  ctx: ModuleContext,
  votes: Record<string, unknown>,
  token: string | null | undefined,
  round: number,
): Submission | null {
  if (!token || round < 1) return null;
  const cards = ideaCards(ctx);
  if (cards.length === 0) return null;

  const tokens = voterTokens(ctx, votes);
  const myIndex = tokens.indexOf(token);
  // Fall back to 0 if the caller isn't in the participant list (stale token);
  // they still get a deterministic, stable card.
  const base = (myIndex === -1 ? 0 : myIndex) + round;

  for (let step = 0; step < cards.length; step++) {
    const candidate = cards[(base + step) % cards.length];
    const authoredByMe = Boolean(candidate.token && candidate.token === token);
    if (!authoredByMe) return candidate;
  }
  // Every card is the caller's own (e.g. only one author). Nothing to hand out.
  return null;
}

// ---- module ---------------------------------------------------------------

export const twentyfive10Module: ModuleServerDef<Twentyfive10Config> = {
  id: "twentyfive10",
  meta: {
    name: "25/10 Crowd Sourcing",
    description:
      "Everyone writes one bold idea, then ideas detach from their authors and get blind-scored 1–5 over several passes — the strongest rise to the top and no one dominates.",
    icon: "shuffle",
  },
  schema,
  defaultConfig: {
    label: "25/10 Crowd Sourcing",
    prompt:
      "If you were 10× bolder, what one idea would you bring to this challenge?",
    maxScore: 5,
    passes: 5,
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
    const maxScore = getMaxScore(ctx);
    const passes = getPasses(ctx);

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const round = readRound(votes);
    const phase: "write" | "score" = round === 0 ? "write" : "score";

    // ---- participant: write an idea, or score the card I'm handed ----
    if (ctx.role === "participant") {
      const me = ctx.me;
      if (phase === "write") {
        const myIdeaSubmitted = Boolean(
          me?.token &&
            ctx.submissions.some(
              (s) =>
                s.phaseId === ctx.phase.id &&
                s.tag === "idea" &&
                s.token === me.token,
            ),
        );
        const view: Twentyfive10ParticipantView = {
          phase,
          round,
          passes,
          prompt,
          maxScore,
          myIdeaSubmitted,
        };
        return view;
      }

      // SCORING pass.
      const assigned = assignFor(ctx, votes, me?.token ?? null, round);
      let myScoreForIt: number | null = null;
      if (me?.token && assigned) {
        const myScores = (votes[me.token] ?? {}) as Record<string, unknown>;
        const s = myScores[assigned.id];
        if (typeof s === "number") myScoreForIt = s;
      }
      const view: Twentyfive10ParticipantView = {
        phase,
        round,
        passes,
        prompt,
        maxScore,
        assignedCard: assigned ? { id: assigned.id, text: assigned.text } : null,
        myScoreForIt,
      };
      return view;
    }

    // ---- facilitator / projector: leaderboard by total score ----
    const cards = ideaCards(ctx);
    const totals: Record<string, { total: number; votes: number }> = {};
    for (const c of cards) totals[c.id] = { total: 0, votes: 0 };
    let scoredCount = 0;
    for (const v of Object.values(votes)) {
      // Skip the round counter / non-map entries.
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const [cardId, raw] of Object.entries(v as Record<string, unknown>)) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) continue;
        if (!(cardId in totals)) continue;
        totals[cardId].total += n;
        totals[cardId].votes += 1;
        scoredCount += 1;
      }
    }
    const top: Twentyfive10ResultCard[] = cards
      .map((c) => ({
        id: c.id,
        text: c.text,
        total: totals[c.id]?.total ?? 0,
        votes: totals[c.id]?.votes ?? 0,
      }))
      .sort((a, b) => b.total - a.total || b.votes - a.votes)
      .slice(0, 10);

    const view: Twentyfive10ResultsView = {
      phase,
      round,
      passes,
      prompt,
      maxScore,
      maxPossible: passes * maxScore,
      ideaCount: cards.length,
      scoredCount,
      top,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Facilitator-only: advance the round (0 -> write done, 1.. -> next pass).
    if (action.type === "nextRound") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const next = readRound(votes) + 1;
      // D4 — scoring opens: freeze the voter set so card assignment is stable for
      // the rest of the activity (writing is closed, so the roster won't grow with
      // people who'll get cards). Latecomers from here on get the fallback card.
      if (next === 1)
        await ctx.store.castVote(ctx.phase.id, COHORT_KEY, sortedTokens(ctx));
      await ctx.store.castVote(ctx.phase.id, "__round__", next);
      return { ok: true };
    }

    // WRITE phase: submit my one idea (replaces any previous one I wrote).
    if (action.type === "submit") {
      const votes = await ctx.store.readVotes(ctx.phase.id);
      if (readRound(votes) !== 0)
        return { ok: false, reason: "writing has closed" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };

      const me = ctx.me;
      const token = me?.token ?? action.token ?? null;
      // One idea per token is the intent: ignore extra submissions once one is in.
      if (
        token &&
        ctx.submissions.some(
          (s) =>
            s.phaseId === ctx.phase.id &&
            s.tag === "idea" &&
            s.token === token,
        )
      ) {
        return { ok: false, reason: "already submitted" };
      }
      await ctx.store.addSubmission(
        me?.handle ?? "Anonymous",
        text,
        ctx.phase.id,
        "idea",
        action.token,
      );
      return { ok: true };
    }

    // SCORING phase: score the card I was handed this pass (1..maxScore).
    if (action.type === "score") {
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const round = readRound(votes);
      if (round < 1) return { ok: false, reason: "scoring not open" };

      const me = ctx.me;
      const token = me?.token ?? action.token ?? null;
      if (!token) return { ok: false, reason: "missing token" };

      const maxScore = getMaxScore(ctx);
      const score = Math.floor(Number(action.payload?.score));
      if (!Number.isFinite(score) || score < 1 || score > maxScore)
        return { ok: false, reason: "score out of range" };

      // Recompute the SAME deterministic assignment so the score lands on the
      // card the caller is actually holding this pass.
      const assigned = assignFor(ctx, votes, token, round);
      if (!assigned) return { ok: false, reason: "no card assigned yet" };
      const cardId = String(action.payload?.cardId ?? "");
      // Guard against a stale client: only accept a score for the held card.
      if (cardId && cardId !== assigned.id)
        return { ok: false, reason: "card changed — try again" };

      const mine = ((votes[token] as Record<string, number>) ?? {}) || {};
      mine[assigned.id] = score;
      await ctx.store.castVote(ctx.phase.id, token, mine);
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
