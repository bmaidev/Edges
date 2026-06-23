// Module: synthesis — AI between-phase live synthesis ("ghost co-author").
//
// The highest-frequency-value AI move in facilitation: while the room is
// between phases, auto-summarise what was just said into a few plain, neutral
// bullets plus the single biggest unresolved tension. The facilitator REVIEWS
// the draft privately, then PROMOTES it to the room/projector with one tap.
// Nothing reaches participants until the facilitator promotes it.
//
// AI rules (mirrored from lib/cluster.ts):
//   - Claude is NEVER called in computeView — only in handleAction "generate",
//     and only when the caller is not a participant.
//   - The result is cached as a vote so computeView is a pure read.
//   - Gated by ANTHROPIC_API_KEY; absent => no result, generation refused.
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__ai__"]       = { bullets, tension, generatedAt, inputCount } | null
//   votes["__promoted__"] = boolean — has the facilitator shown it to the room?

import { z } from "zod";
import {
  aiAvailable,
  generateJSON,
  topicLine,
  asData,
  capItems,
  withGenerateLock,
} from "@/lib/ai";
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

// ---- config ---------------------------------------------------------------

export interface SynthesisConfig {
  label: string;
  // If omitted, synthesize ALL submissions in the session.
  sourcePhaseId?: string;
  // Max bullets to ask for (default 5).
  bulletCount?: number;
}

const schema = z
  .object({
    label: z.string(),
    sourcePhaseId: z.string().optional(),
    bulletCount: z.number().int().positive().optional(),
  })
  .passthrough();

const DEFAULT_BULLET_COUNT = 5;

// ---- cached AI result -----------------------------------------------------

export interface SynthesisResult {
  bullets: string[];
  tension: string;
  generatedAt: number;
  inputCount: number;
}

// ---- view types -----------------------------------------------------------

// Facilitator / projector / admin always see the full review payload.
export interface SynthesisFacilitatorView {
  hasResult: boolean;
  bullets: string[];
  tension: string;
  inputCount: number;
  available: boolean; // is the AI configured (ANTHROPIC_API_KEY present)
  promoted: boolean; // has it been shown to the room
  stale: boolean; // a result exists but the input set has changed since
}

// Participant only ever receives content once promoted.
export interface SynthesisParticipantView {
  hasResult: boolean;
  promoted: boolean;
  waiting?: boolean; // true while the facilitator is still summarizing
  bullets?: string[];
  tension?: string;
}

// ---- availability + vote-state readers (pure; default-safe) ---------------

function readResult(votes: Record<string, unknown>): SynthesisResult | null {
  const r = votes["__ai__"];
  if (
    r &&
    typeof r === "object" &&
    Array.isArray((r as SynthesisResult).bullets) &&
    typeof (r as SynthesisResult).tension === "string"
  ) {
    return r as SynthesisResult;
  }
  return null;
}

function readPromoted(votes: Record<string, unknown>): boolean {
  return votes["__promoted__"] === true;
}

function bulletCountOf(ctx: ModuleContext): number {
  const n = ctx.config.bulletCount;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DEFAULT_BULLET_COUNT;
}

// ---- Claude prompt (via the shared AI service) ----------------------------

const SYSTEM_PROMPT =
  "You are a neutral facilitation co-author. You summarise what a room of " +
  "people just said into a few plain, neutral bullets and name the single " +
  "biggest unresolved tension. Return JSON only — no markdown, no commentary, " +
  "no code fences.";

// Raw, unvalidated JSON shape the model is asked to return.
interface RawSynthesis {
  bullets?: unknown;
  tension?: unknown;
}

function buildUserPrompt(
  topic: string | null | undefined,
  bulletCount: number,
  submissions: { id: string; text: string; tag?: string | null }[],
): string {
  return `${topicLine(topic)}You will receive a list of submissions from a workshop.

Summarise them into at most ${bulletCount} bullets that capture what the room said. Bullets must be plain, neutral, sentence case, and faithful to the submissions — do not invent content, do not editorialise. Then name the single biggest unresolved tension in the room as one short line.

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this shape:
{
  "bullets": ["A plain neutral point", "Another point"],
  "tension": "The one biggest unresolved tension, in a single line."
}`;
}

// Validate/map an already-parsed model object into our field shape.
function mapSynthesis(
  raw: RawSynthesis,
  bulletCount: number,
): { bullets: string[]; tension: string } {
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets
        .filter((b: unknown) => typeof b === "string")
        .map((b: string) => b.trim())
        .filter(Boolean)
        .slice(0, bulletCount)
    : [];
  const tension = typeof raw.tension === "string" ? raw.tension.trim() : "";
  return { bullets, tension };
}

// ---- module ---------------------------------------------------------------

export const synthesisModule: ModuleServerDef<SynthesisConfig> = {
  id: "synthesis",
  meta: {
    name: "Synthesis",
    description:
      "AI between-phase live synthesis — summarise what the room just said into a few neutral bullets plus the one key tension, which the facilitator reviews privately and promotes to the room with one tap.",
    icon: "sparkles",
  },
  schema,
  defaultConfig: {
    label: "Synthesis",
    bulletCount: DEFAULT_BULLET_COUNT,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx) {
    // Pure read — NEVER call Claude here.
    const available = aiAvailable();
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const result = available ? readResult(votes) : null;
    const promoted = readPromoted(votes);

    // ---- participant: content only once promoted ----
    if (ctx.role === "participant") {
      if (promoted && result) {
        const view: SynthesisParticipantView = {
          hasResult: true,
          promoted: true,
          bullets: result.bullets,
          tension: result.tension,
        };
        return view;
      }
      const view: SynthesisParticipantView = {
        hasResult: false,
        promoted: false,
        waiting: true,
      };
      return view;
    }

    // ---- facilitator / projector / admin: always the full review payload ----
    const sourcePhaseId = ctx.config.sourcePhaseId as string | undefined;
    const currentInputCount = sourcePhaseId
      ? ctx.submissions.filter((s) => s.phaseId === sourcePhaseId).length
      : ctx.submissions.length;
    const hasResult = Boolean(result);
    const view: SynthesisFacilitatorView = {
      hasResult,
      bullets: result?.bullets ?? [],
      tension: result?.tension ?? "",
      inputCount: result?.inputCount ?? 0,
      available,
      promoted,
      stale: hasResult && (result as SynthesisResult).inputCount !== currentInputCount,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Generate the synthesis (facilitator / cohost / projector / admin only).
    if (action.type === "generate") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      if (!aiAvailable()) return { ok: false, reason: "AI unavailable" };

      const sourcePhaseId = ctx.config.sourcePhaseId as string | undefined;
      const source: Submission[] = sourcePhaseId
        ? ctx.submissions.filter((s) => s.phaseId === sourcePhaseId)
        : ctx.submissions;
      const submissions = source.map((s) => ({
        id: s.id,
        text: s.text,
        tag: s.tag,
      }));

      const bulletCount = bulletCountOf(ctx);

      if (submissions.length === 0) {
        // Cache an empty-but-valid result so the facilitator gets honest
        // feedback — no Claude call, no lock needed.
        const empty: SynthesisResult = {
          bullets: [],
          tension: "",
          generatedAt: Date.now(),
          inputCount: 0,
        };
        await ctx.store.castVote(ctx.phase.id, "__ai__", empty);
        return { ok: true };
      }

      return withGenerateLock(
        ctx.store,
        ctx.phase.id,
        "synthesis",
        async () => {
          // Cap input so a large room can't blow the context / truncate output.
          const { kept } = capItems(submissions, 150);
          const res = await generateJSON<RawSynthesis>({
            label: "synthesis",
            tier: "reasoning",
            shape: "object",
            system: SYSTEM_PROMPT,
            user: buildUserPrompt(ctx.state.topic, bulletCount, kept),
          });
          if (!res.ok) return { ok: false, reason: res.reason };

          const { bullets, tension } = mapSynthesis(
            res.data ?? {},
            bulletCount,
          );
          const result: SynthesisResult = {
            bullets,
            tension,
            generatedAt: Date.now(),
            inputCount: submissions.length,
          };
          await ctx.store.castVote(ctx.phase.id, "__ai__", result);
          return { ok: true };
        },
      );
    }

    // Toggle whether the synthesis is shown to the room.
    if (action.type === "promote") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const next = !readPromoted(votes);
      await ctx.store.castVote(ctx.phase.id, "__promoted__", next);
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
