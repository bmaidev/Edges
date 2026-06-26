// Module: minspecs — Min Specs (a Liberating Structure).
//
// The move: don't write the "best" rules — write the MAXIMUM list of every
// rule, must, and constraint anyone can think of (the Max Specs). Then SUBTRACT.
// For each rule ask the test question: "if we ignored this, could we still
// succeed at the goal?" If YES, the rule is non-essential — cut it. Only rules
// whose removal would cause failure survive. What's left is the Minimum Specs:
// the few must-keeps (target 3–5) that actually matter.
//
// Two phases, driven entirely by ctx.store votes (no store/KV import):
//   votes["__phase__"]    = "expand" | "trim"   — default "expand"
//   votes[token]          = Record<ruleId, "keep" | "cut">  (trim phase ballots)
// Candidate rules are harvested as submissions tagged "rule" in the EXPAND
// phase. computeView is pure and never writes; it reads submissions + votes and
// tallies. The minimal set = rules where keep >= cut (essential by majority).

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

// ---- config ---------------------------------------------------------------

export type MinSpecsPhase = "expand" | "trim";

export interface MinSpecsConfig {
  label: string;
  prompt: string; // the goal/challenge the specs serve
}

const schema = z
  .object({
    label: z.string(),
    prompt: z.string(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

export interface MinSpecsRule {
  id: string;
  text: string;
  keep: number; // "essential — we'd fail without it"
  cut: number; // "we could still succeed without it"
  mine?: "keep" | "cut"; // this participant's mark, if any
  survivor: boolean; // in the minimal set (keep >= cut by majority)
}

export interface MinSpecsView {
  phase: MinSpecsPhase;
  prompt: string;
  rules: MinSpecsRule[];
}

// ---- vote-state readers (pure; default-safe) ------------------------------

function readPhase(votes: Record<string, unknown>): MinSpecsPhase {
  return votes["__phase__"] === "trim" ? "trim" : "expand";
}

function readMyMarks(
  votes: Record<string, unknown>,
  token: string | null | undefined,
): Record<string, "keep" | "cut"> {
  if (!token) return {};
  const raw = votes[token];
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, "keep" | "cut"> = {};
  for (const [id, mark] of Object.entries(raw as Record<string, unknown>)) {
    if (mark === "keep" || mark === "cut") out[id] = mark;
  }
  return out;
}

// ---- module ---------------------------------------------------------------

export const minspecsModule: ModuleServerDef<MinSpecsConfig> = {
  id: "minspecs",
  meta: {
    name: "Min Specs",
    description:
      "Generate the maximum list of rules/musts, then subtract — for each rule ask 'could we still succeed without it?' Cut every rule that survives the question; only the must-keeps remain (target 3–5).",
    icon: "filter",
  },
  schema,
  defaultConfig: {
    label: "Min Specs",
    prompt: "What must be true for us to succeed?",
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<MinSpecsView> {
    const prompt = (ctx.config.prompt as string) ?? "";
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const phase = readPhase(votes);
    const myMarks = readMyMarks(votes, ctx.me?.token ?? null);

    // Candidate rules are submissions tagged "rule" for this phase.
    const ruleSubs = ctx.submissions
      .filter((s) => s.phaseId === ctx.phase.id && s.tag === "rule")
      .sort((a, b) => a.createdAt - b.createdAt);

    // Tally keep/cut across every participant's ballot.
    const keep: Record<string, number> = {};
    const cut: Record<string, number> = {};
    for (const [key, raw] of Object.entries(votes)) {
      if (key.startsWith("__")) continue; // skip control keys (__phase__)
      if (!raw || typeof raw !== "object") continue;
      for (const [id, mark] of Object.entries(raw as Record<string, unknown>)) {
        if (mark === "keep") keep[id] = (keep[id] ?? 0) + 1;
        else if (mark === "cut") cut[id] = (cut[id] ?? 0) + 1;
      }
    }

    const rules: MinSpecsRule[] = ruleSubs.map((s) => {
      const k = keep[s.id] ?? 0;
      const c = cut[s.id] ?? 0;
      // Survivor = essential by majority. Removal would cause failure, so the
      // group declined the "could we still succeed without it?" escape hatch.
      // Until anyone has voted, treat every rule as a provisional survivor.
      const survivor = k >= c;
      return {
        id: s.id,
        text: s.text,
        keep: k,
        cut: c,
        mine: myMarks[s.id],
        survivor,
      };
    });

    return { phase, prompt, rules };
  },
  async handleAction(ctx, action) {
    // ---- facilitator phase control ----
    if (action.type === "setPhase2") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const phase: MinSpecsPhase =
        action.payload?.phase === "trim" ? "trim" : "expand";
      await ctx.store.castVote(ctx.phase.id, "__phase__", phase);
      return { ok: true };
    }

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const phase = readPhase(votes);

    // ---- EXPAND: add a candidate rule/must ----
    if (action.type === "addRule") {
      if (phase !== "expand") return { ok: false, reason: "not expanding" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(
        handle,
        text.slice(0, 280),
        ctx.phase.id,
        "rule",
        action.token,
      );
      return { ok: true };
    }

    // ---- TRIM: mark a rule keep (essential) or cut (could live without) ----
    if (action.type === "mark") {
      if (phase !== "trim") return { ok: false, reason: "not trimming" };
      if (!action.token) return { ok: false, reason: "missing" };
      const ruleId = String(action.payload?.ruleId ?? "");
      const mark = action.payload?.mark;
      if (!ruleId) return { ok: false, reason: "missing rule" };
      if (mark !== "keep" && mark !== "cut")
        return { ok: false, reason: "bad mark" };
      // The rule must be a real candidate from this phase.
      const exists = ctx.submissions.some(
        (s) =>
          s.phaseId === ctx.phase.id && s.tag === "rule" && s.id === ruleId,
      );
      if (!exists) return { ok: false, reason: "unknown rule" };
      const mine = { ...readMyMarks(votes, action.token) };
      mine[ruleId] = mark;
      await ctx.store.castVote(ctx.phase.id, action.token, mine);
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
