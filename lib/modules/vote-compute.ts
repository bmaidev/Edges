// B2 (Wave 3) — faithfulness. The vote modules' view-shaping lived inline in each
// computeView AND was re-hand-authored in the in-builder sample factory, so the
// preview could silently drift from the real view. These PURE shapers are the
// single source of truth: `computeView` calls them with REAL votes, the sample
// factory calls them with SYNTHETIC votes. Same code → the preview can't lie.
//
// Input is the raw votes hash (token -> stored value) exactly as the store returns
// it, plus the phase config + the caller's identity/role — nothing from the store,
// so they're trivially testable and run client-side for the preview.

import type { Role } from "../types";
import type { DotVoteView, PollView, RankView, ScaleView } from "./views";

type Cfg = Record<string, unknown>;

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ---- poll (single / multi choice) -----------------------------------------

export function pollView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
  role: Role,
): PollView {
  const options = strArray(config.options);
  const multi = Boolean(config.multi);
  const reveal = config.reveal === "onAdvance" ? "onAdvance" : "live";

  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  let total = 0;
  for (const v of Object.values(votes)) {
    const arr = Array.isArray(v) ? v : [v];
    let counted = false;
    for (const opt of arr)
      if (typeof opt === "string" && opt in counts) {
        counts[opt]++;
        counted = true;
      }
    if (counted) total++;
  }

  const show = reveal === "live" || role !== "participant";
  const raw = meToken ? votes[meToken] : null;
  const mine =
    raw == null
      ? null
      : Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === "string")
        : [String(raw)];

  return {
    question: typeof config.question === "string" ? config.question : "",
    options,
    multi,
    total,
    counts: show ? counts : null,
    mine,
  };
}

// A plausible synthetic votes hash for the preview: a gentle descending
// distribution across the options, plus the caller's own pick under "me" so the
// preview shows the "you voted" affordance. Deterministic (no RNG).
export function samplePollVotes(
  options: string[],
  multi: boolean,
): Record<string, unknown> {
  const dist = [3, 2, 1, 1];
  const votes: Record<string, unknown> = {};
  let t = 0;
  options.forEach((opt, i) => {
    for (let k = 0; k < (dist[i % dist.length] ?? 1); k++) {
      votes[`s${t++}`] = multi ? [opt] : opt;
    }
  });
  if (options.length) votes["me"] = multi ? [options[0]] : options[0];
  return votes;
}

// ---- dotvote (budget voting) ----------------------------------------------

export function dotVoteView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
): DotVoteView {
  const options = strArray(config.options);
  const dots = typeof config.dots === "number" ? config.dots : 3;
  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  for (const v of Object.values(votes)) {
    const map = (v ?? {}) as Record<string, number>;
    for (const [opt, n] of Object.entries(map)) if (opt in counts) counts[opt] += Number(n) || 0;
  }
  const mine = ((meToken ? votes[meToken] : null) ?? {}) as Record<string, number>;
  const used = Object.values(mine).reduce((s, n) => s + (Number(n) || 0), 0);
  return {
    prompt: typeof config.prompt === "string" ? config.prompt : "",
    options,
    dots,
    counts,
    mine,
    remaining: Math.max(0, dots - used),
  };
}

export function sampleDotVotes(options: string[], dots: number): Record<string, unknown> {
  const votes: Record<string, unknown> = {};
  if (options.length) votes["me"] = { [options[0]]: Math.min(2, dots) };
  options.forEach((opt, i) => {
    votes[`s${i}`] = { [opt]: Math.max(1, 3 - i) };
  });
  return votes;
}

// ---- rank (Borda) ----------------------------------------------------------

export function rankView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
): RankView {
  const items = strArray(config.items);
  const score: Record<string, number> = {};
  items.forEach((i) => (score[i] = 0));
  for (const v of Object.values(votes)) {
    const order = Array.isArray(v) ? (v as string[]) : [];
    order.forEach((item, idx) => {
      if (item in score) score[item] += items.length - idx;
    });
  }
  const results = items
    .map((item) => ({ item, score: score[item] }))
    .sort((a, b) => b.score - a.score);
  const mine = (meToken ? (votes[meToken] as string[]) : null) ?? null;
  return { prompt: typeof config.prompt === "string" ? config.prompt : "", items, results, mine };
}

export function sampleRankVotes(items: string[]): Record<string, unknown> {
  return { me: [...items], s0: [...items], s1: [...items].reverse() };
}

// ---- scale (rating sliders) -----------------------------------------------

export function scaleView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
): ScaleView {
  const statements = strArray(config.statements);
  const sums = statements.map(() => 0);
  const counts = statements.map(() => 0);
  for (const v of Object.values(votes)) {
    const vals = Array.isArray(v) ? (v as number[]) : [];
    vals.forEach((n, i) => {
      if (i < statements.length && typeof n === "number") {
        sums[i] += n;
        counts[i]++;
      }
    });
  }
  const stats = statements.map((_, i) => ({
    mean: counts[i] ? Math.round((sums[i] / counts[i]) * 10) / 10 : 0,
    count: counts[i],
  }));
  const mine = (meToken ? (votes[meToken] as number[]) : null) ?? null;
  return {
    statements,
    min: typeof config.min === "number" ? config.min : 1,
    max: typeof config.max === "number" ? config.max : 5,
    labels: Array.isArray(config.labels) && config.labels.length >= 2
      ? [String(config.labels[0]), String(config.labels[1])]
      : undefined,
    stats,
    mine,
  };
}

export function sampleScaleVotes(statements: string[], max: number): Record<string, unknown> {
  const mid = Math.max(1, Math.round(max * 0.7));
  return {
    me: statements.map(() => mid),
    s0: statements.map(() => Math.max(1, mid - 1)),
    s1: statements.map(() => Math.min(max, mid + 1)),
  };
}
