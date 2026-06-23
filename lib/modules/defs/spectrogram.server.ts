// Module: spectrogram (human spectrogram) — a live 1-D opinion distribution
// along a labeled line. The physical version asks people to stand on a line
// between two poles; juniors drift toward where seniors stand. Anonymous
// digital placement removes that conformity pressure and, optionally, captures
// the before→after shift across a discussion.
//
// Server half: schema, computeView, handleAction. State lives only in
// ctx.store (castVote / readVotes) — one vote per (phase, token). The active
// before/after stage is a facilitator-set pseudo-vote under the reserved token
// "__stage__".

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

// Reserved store key holding the active stage ("before" | "after"). Not a real
// participant token, so it is filtered out of the distribution.
const STAGE_KEY = "__stage__";

export type SpectrogramStage = "before" | "after";

// ---- view types (consumed by spectrogram.client.tsx) ----------------------

export interface SpectrogramBin {
  binCenter: number; // 0..1
  count: number;
}

export interface SpectrogramView {
  statement: string;
  poleLabels: [string, string]; // [low end, high end]
  mode: "continuous" | "buckets";
  buckets: number; // number of histogram bins
  distribution: SpectrogramBin[]; // active-stage distribution
  mean: number; // active-stage mean, 0..1 (0 if no votes)
  count: number; // active-stage responses
  mine: { x: number; reason?: string; stage?: SpectrogramStage } | null;
  allowReasons: boolean;
  beforeAfter: boolean;
  stage: SpectrogramStage; // active stage
  // before→after mean shift (only when beforeAfter is on and both stages have votes)
  delta?: {
    beforeMean: number;
    afterMean: number;
    beforeCount: number;
    afterCount: number;
    shift: number; // afterMean - beforeMean
  };
  // Reasons paired with positions. Facilitator/cohost/admin/projector see the
  // full list; participants get an empty array (aggregate-only).
  reasons: { x: number; reason: string; stage?: SpectrogramStage }[];
}

// One stored placement.
interface Placement {
  x: number; // 0..1
  reason?: string;
  stage?: SpectrogramStage;
}

// ---- config ---------------------------------------------------------------

const schema = z
  .object({
    label: z.string(),
    statement: z.string(),
    poleLabels: z.tuple([z.string(), z.string()]),
    mode: z.enum(["continuous", "buckets"]).optional(),
    buckets: z.number().int().min(2).optional(),
    allowReasons: z.boolean().optional(),
    beforeAfter: z.boolean().optional(),
  })
  .passthrough();

type SpectrogramConfig = z.infer<typeof schema>;

// ---- math (scale-style distribution) --------------------------------------

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Bucketize a list of 0..1 positions into `bins` equal bins; returns one entry
// per bin with its center and count.
function histogram(positions: number[], bins: number): SpectrogramBin[] {
  const n = Math.max(2, Math.floor(bins));
  const counts = new Array<number>(n).fill(0);
  for (const x of positions) {
    const c = clamp01(x);
    // Map 1.0 into the last bin rather than overflowing.
    const idx = Math.min(n - 1, Math.floor(c * n));
    counts[idx]++;
  }
  return counts.map((count, i) => ({
    binCenter: round2((i + 0.5) / n),
    count,
  }));
}

function meanOf(positions: number[]): number {
  if (positions.length === 0) return 0;
  const sum = positions.reduce((s, x) => s + clamp01(x), 0);
  return round2(sum / positions.length);
}

// ---- module ---------------------------------------------------------------

const spectrogram: ModuleServerDef<SpectrogramConfig> = {
  id: "spectrogram",
  meta: {
    name: "Spectrogram",
    description:
      "Anonymous human spectrogram — everyone places themselves on a line between two poles; shows the live distribution and the before→after shift.",
    icon: "↔",
  },
  schema,
  defaultConfig: {
    label: "Spectrogram",
    statement: "How strongly do you agree?",
    poleLabels: ["Strongly disagree", "Strongly agree"],
    mode: "continuous",
    allowReasons: false,
    beforeAfter: false,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<SpectrogramView> {
    const c = ctx.config as Record<string, unknown>;
    const statement = (c.statement as string) ?? "";
    const poleLabels = (c.poleLabels as [string, string]) ?? ["Low", "High"];
    const mode = (c.mode as "continuous" | "buckets") ?? "continuous";
    const allowReasons = Boolean(c.allowReasons);
    const beforeAfter = Boolean(c.beforeAfter);
    // In buckets mode default to the configured bucket count (Four-Corners
    // style); in continuous mode use ~10 fine bins for the distribution shape.
    const bins =
      mode === "buckets"
        ? Math.max(2, Number(c.buckets) || 4)
        : 10;

    const votes = await ctx.store.readVotes(ctx.phase.id);

    // Resolve the active stage from the reserved facilitator-set key.
    const rawStage = votes[STAGE_KEY];
    const stage: SpectrogramStage = rawStage === "after" ? "after" : "before";

    // Collect anonymous placements (no tokens leaked), skipping the reserved
    // stage key and anything malformed.
    const all: Placement[] = [];
    for (const [token, v] of Object.entries(votes)) {
      if (token === STAGE_KEY) continue;
      if (!v || typeof v !== "object") continue;
      const p = v as Record<string, unknown>;
      if (typeof p.x !== "number") continue;
      all.push({
        x: clamp01(p.x),
        reason: typeof p.reason === "string" ? p.reason : undefined,
        stage: p.stage === "after" ? "after" : p.stage === "before" ? "before" : undefined,
      });
    }

    // Active set: when before/after is on, only the current stage's placements.
    const active = beforeAfter ? all.filter((p) => p.stage === stage) : all;
    const activeX = active.map((p) => p.x);

    const distribution = histogram(activeX, bins);
    const mean = meanOf(activeX);
    const count = activeX.length;

    // before→after delta (only meaningful when both stages have data).
    let delta: SpectrogramView["delta"];
    if (beforeAfter) {
      const before = all.filter((p) => p.stage === "before").map((p) => p.x);
      const after = all.filter((p) => p.stage === "after").map((p) => p.x);
      if (before.length > 0 && after.length > 0) {
        const beforeMean = meanOf(before);
        const afterMean = meanOf(after);
        delta = {
          beforeMean,
          afterMean,
          beforeCount: before.length,
          afterCount: after.length,
          shift: round2(afterMean - beforeMean),
        };
      }
    }

    // mine: the caller's current placement (their own token).
    const rawMine = ctx.me ? votes[ctx.me.token] : null;
    let mine: SpectrogramView["mine"] = null;
    if (rawMine && typeof rawMine === "object") {
      const p = rawMine as Record<string, unknown>;
      if (typeof p.x === "number") {
        mine = {
          x: clamp01(p.x),
          reason: typeof p.reason === "string" ? p.reason : undefined,
          stage:
            p.stage === "after"
              ? "after"
              : p.stage === "before"
                ? "before"
                : undefined,
        };
      }
    }

    // Reasons: full list to facilitators; aggregate-only ([]) to participants.
    const reasons =
      ctx.role === "participant"
        ? []
        : active
            .filter((p) => p.reason)
            .map((p) => ({ x: p.x, reason: p.reason as string, stage: p.stage }));

    return {
      statement,
      poleLabels,
      mode,
      buckets: bins,
      distribution,
      mean,
      count,
      mine,
      allowReasons,
      beforeAfter,
      stage,
      delta,
      reasons,
    };
  },
  async handleAction(ctx, action) {
    // Facilitator (non-participant) sets the active before/after stage.
    if (action.type === "setStage") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const next = action.payload?.stage;
      if (next !== "before" && next !== "after")
        return { ok: false, reason: "bad stage" };
      await ctx.store.castVote(ctx.phase.id, STAGE_KEY, next);
      return { ok: true };
    }

    if (action.type === "place") {
      if (!action.token) return { ok: false, reason: "missing" };
      const x = clamp01(Number(action.payload?.x));
      const allowReasons = Boolean((ctx.config as Record<string, unknown>).allowReasons);
      const beforeAfter = Boolean((ctx.config as Record<string, unknown>).beforeAfter);

      const value: Placement = { x };
      if (allowReasons) {
        const reason = String(action.payload?.reason ?? "").trim();
        if (reason) value.reason = reason.slice(0, 280);
      }
      if (beforeAfter) {
        // Stamp with the current active stage so the split distribution is correct.
        const votes = await ctx.store.readVotes(ctx.phase.id);
        value.stage = votes[STAGE_KEY] === "after" ? "after" : "before";
      }
      await ctx.store.castVote(ctx.phase.id, action.token, value);
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};

export const spectrogramModule = spectrogram;
