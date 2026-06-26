// Module: gradient — Gradients of Agreement / sociocratic consent.
//
// Binary yes/no votes collapse a room into fake agreement: the person who is
// "fine, I guess" and the person who is enthusiastic both read as "yes", and a
// quiet block hides inside an abstention. A gradient surfaces PARTIAL dissent —
// each participant places themselves on an ordered scale of support, and the
// facilitator can see (and act on) the concerns clustered at the low end before
// declaring consent.
//
// Server half: schema, computeView (role-scoped), handleAction ("vote").
// State lives ONLY in ctx.store via castVote / readVotes. The view types below
// are shared with the client renderer file (gradient.client.tsx).

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

// ---- predefined gradient level sets ---------------------------------------
// All sets are ordered from STRONGEST SUPPORT (index 0) … to BLOCK / OBJECT
// (last index). This single orientation lets the dissent band, the
// requireReasonBelow threshold, and the projector colouring all key off the
// HIGH end of the index range meaning "concern / dissent".

export const GRADIENT_SCALES = {
  // 0..5 (six levels). Index 0 is the block (fist), 5 is enthusiastic — note
  // this set runs block→enthusiastic, the reverse of the others, but the
  // dissent end is still the low-support end, computed per-set below.
  fist5: [
    "Fist (block)",
    "1 — strong concerns",
    "2 — concerns",
    "3 — will support",
    "4 — agree",
    "5 — enthusiastic",
  ],
  // Sam Kaner's gradient of agreement, ordered strongest-support → block.
  kaner8: [
    "Endorse",
    "Endorse with minor point",
    "Agree",
    "Agree with reservations",
    "Abstain",
    "More discussion needed",
    "Don't like but will support",
    "Stand aside",
    "Block",
  ],
  // Sociocratic consent, ordered consent → object.
  consent: [
    "Consent (good enough, safe enough)",
    "Consent with a concern",
    "Object — needs change",
  ],
} as const;

export type GradientScale = keyof typeof GRADIENT_SCALES;

// For each scale, the level indices that count as DISSENT (at/below a
// "concern" threshold — i.e. anything short of clean support). Because fist5 is
// oriented block→enthusiastic, its dissent lives at the LOW indices; the other
// two are oriented support→object, so their dissent lives at the HIGH indices.
function dissentIndices(scale: GradientScale): Set<number> {
  switch (scale) {
    case "fist5":
      // Fist(0), strong concerns(1), concerns(2) — the unsupportive end.
      return new Set([0, 1, 2]);
    case "kaner8":
      // "Agree with reservations"(3) and everything more reluctant.
      return new Set([3, 4, 5, 6, 7, 8]);
    case "consent":
      // "Consent with a concern"(1) and "Object"(2).
      return new Set([1, 2]);
  }
}

// ---- view-data types (consumed by gradient.client.tsx) --------------------

export interface GradientObjection {
  level: number; // the level index the reason was attached to
  reason: string;
}

export interface GradientView {
  proposal: string;
  scale: GradientScale;
  levels: string[];
  // count of votes per level index, parallel to `levels`.
  distribution: number[];
  total: number;
  // votes that fall at/below the "concern" threshold for this scale.
  dissentCount: number;
  // level index below/at which a written reason is required (undefined = never).
  requireReasonBelow?: number;
  // which level indices count as dissent (so the client can tint the band).
  dissentLevels: number[];
  // full reasons — facilitator/cohost/admin only; omitted for participants.
  objections?: GradientObjection[];
  // the caller's own vote, if any.
  mine: { level: number; reason?: string } | null;
}

// ---- config ---------------------------------------------------------------

interface GradientConfig {
  label: string;
  proposal: string;
  scale?: GradientScale;
  requireReasonBelow?: number;
}

interface StoredVote {
  level: number;
  reason?: string;
}

// Normalise a raw stored vote (JSON) into a typed StoredVote, or null.
function asVote(raw: unknown, levelCount: number): StoredVote | null {
  if (!raw || typeof raw !== "object") return null;
  const level = Number((raw as Record<string, unknown>).level);
  if (!Number.isInteger(level) || level < 0 || level >= levelCount) return null;
  const reasonRaw = (raw as Record<string, unknown>).reason;
  const reason =
    typeof reasonRaw === "string" && reasonRaw.trim()
      ? reasonRaw.trim()
      : undefined;
  return { level, reason };
}

// ---- module ---------------------------------------------------------------

export const gradientModule: ModuleServerDef<GradientConfig> = {
  id: "gradient",
  meta: {
    name: "Gradient of agreement",
    description:
      "Consent / gradient of agreement: each person places themselves on a scale of support so partial dissent surfaces instead of collapsing into a fake yes/no.",
    icon: "scale",
  },
  schema: z
    .object({
      label: z.string(),
      proposal: z.string(),
      scale: z.enum(["kaner8", "fist5", "consent"]).optional(),
      requireReasonBelow: z.number().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Gradient",
    proposal: "We adopt this proposal as written.",
    scale: "fist5",
    requireReasonBelow: 2,
  },
  // Everyone can watch the gradient form; participants act on it.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<GradientView> {
    const c = ctx.config as Record<string, unknown>;
    const scale = ((c.scale as GradientScale) ?? "fist5") as GradientScale;
    const levels = [...GRADIENT_SCALES[scale]];
    const proposal = (c.proposal as string) ?? "";
    const requireReasonBelow =
      typeof c.requireReasonBelow === "number"
        ? c.requireReasonBelow
        : undefined;

    const dissent = dissentIndices(scale);
    const votes = await ctx.store.readVotes(ctx.phase.id);

    const distribution = levels.map(() => 0);
    let total = 0;
    let dissentCount = 0;
    const objections: GradientObjection[] = [];

    for (const raw of Object.values(votes)) {
      const v = asVote(raw, levels.length);
      if (!v) continue;
      distribution[v.level]++;
      total++;
      if (dissent.has(v.level)) {
        dissentCount++;
        if (v.reason) objections.push({ level: v.level, reason: v.reason });
      }
    }

    const mine = ctx.me ? asVote(votes[ctx.me.token], levels.length) : null;

    // Facilitator-tier roles see the raw reasons; participants/projector get
    // only the aggregate dissentCount (the projector renders counts, not text).
    const seesReasons =
      ctx.role === "facilitator" ||
      ctx.role === "cohost" ||
      ctx.role === "admin";

    return {
      proposal,
      scale,
      levels,
      distribution,
      total,
      dissentCount,
      requireReasonBelow,
      dissentLevels: Array.from(dissent),
      objections: seesReasons ? objections : undefined,
      mine,
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "vote") return { ok: false, reason: "unknown action" };
    if (!action.token) return { ok: false, reason: "missing" };

    const c = ctx.config as Record<string, unknown>;
    const scale = ((c.scale as GradientScale) ?? "fist5") as GradientScale;
    const levels = GRADIENT_SCALES[scale];

    const level = Number(action.payload?.level);
    if (!Number.isInteger(level) || level < 0 || level >= levels.length)
      return { ok: false, reason: "bad level" };

    const reasonRaw = action.payload?.reason;
    const reason =
      typeof reasonRaw === "string" && reasonRaw.trim()
        ? reasonRaw.trim().slice(0, 500)
        : undefined;

    const requireReasonBelow =
      typeof c.requireReasonBelow === "number"
        ? c.requireReasonBelow
        : undefined;
    if (
      requireReasonBelow !== undefined &&
      level <= requireReasonBelow &&
      !reason
    )
      return { ok: false, reason: "reason required" };

    await ctx.store.castVote(ctx.phase.id, action.token, { level, reason });
    return { ok: true };
  },
};
