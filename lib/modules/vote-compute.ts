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
import type {
  DotVoteView,
  MatrixView,
  PollView,
  QnaView,
  RankView,
  ScaleView,
  WordCloudView,
} from "./views";

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

// ---- wordcloud (frequency over a words list) ------------------------------

export function wordCloudView(
  config: Cfg,
  words: { token: string; word: string }[],
  meToken: string | null,
): WordCloudView {
  const freq: Record<string, number> = {};
  for (const w of words) {
    const norm = w.word.trim().toLowerCase();
    if (norm) freq[norm] = (freq[norm] ?? 0) + 1;
  }
  const cloud = Object.entries(freq)
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
  const mine = meToken ? words.filter((w) => w.token === meToken).map((w) => w.word) : [];
  return { prompt: typeof config.prompt === "string" ? config.prompt : "", words: cloud, mine };
}

export function sampleWords(): { token: string; word: string }[] {
  const w = (token: string, ...ws: string[]) => ws.map((word) => ({ token, word }));
  return [
    ...w("me", "focus"),
    ...w("s0", "clarity"),
    ...w("s1", "clarity"),
    ...w("s2", "clarity"),
    ...w("s3", "focus"),
    ...w("s4", "momentum"),
    ...w("s5", "momentum"),
    ...w("s6", "trust"),
  ];
}

// ---- qna (questions + upvotes) --------------------------------------------

export function qnaView(
  config: Cfg,
  questions: { id: string; text: string }[],
  votes: Record<string, unknown>,
  meToken: string | null,
): QnaView {
  const counts: Record<string, number> = {};
  for (const v of Object.values(votes)) {
    const ids = Array.isArray(v) ? (v as string[]) : [];
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  }
  const myUpvotes: string[] = meToken ? ((votes[meToken] as string[]) ?? []) : [];
  const list = questions
    .map((q) => ({
      id: q.id,
      text: q.text,
      votes: counts[q.id] ?? 0,
      mine: myUpvotes.includes(q.id),
    }))
    .sort((a, b) => b.votes - a.votes || 0);
  return { prompt: typeof config.prompt === "string" ? config.prompt : "", questions: list };
}

export function sampleQnaQuestions(): { id: string; text: string }[] {
  return [
    { id: "q1", text: "How does this scale to a bigger room?" },
    { id: "q2", text: "What's the timeline?" },
  ];
}
export function sampleQnaVotes(): Record<string, unknown> {
  return { s0: ["q1"], s1: ["q1"], s2: ["q1", "q2"], s3: ["q1"], me: ["q2"] };
}

// ---- matrix (2x2 placement) -----------------------------------------------

type MatrixItem = { text: string; x: number; y: number };
function pair(v: unknown, dflt: [string, string]): [string, string] {
  return Array.isArray(v) && v.length >= 2 ? [String(v[0]), String(v[1])] : dflt;
}

export function matrixView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
): MatrixView {
  const items = Object.values(votes)
    .map((v) => v as MatrixItem)
    .filter((v) => v && typeof v.text === "string");
  const mine = (meToken ? votes[meToken] : null) as MatrixItem | null;
  return {
    prompt: typeof config.prompt === "string" ? config.prompt : "",
    xLabel: pair(config.xLabel, ["low", "high"]),
    yLabel: pair(config.yLabel, ["low", "high"]),
    min: typeof config.min === "number" ? config.min : 0,
    max: typeof config.max === "number" ? config.max : 10,
    items,
    mine: mine ?? null,
  };
}

export function sampleMatrixVotes(): Record<string, unknown> {
  return {
    me: { text: "Quick win", x: 2, y: 8 },
    s0: { text: "Big bet", x: 8, y: 9 },
    s1: { text: "Maybe later", x: 3, y: 3 },
  };
}
