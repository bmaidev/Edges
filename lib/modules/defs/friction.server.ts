// Module: friction (AI tension / friction map) — surfaces the live
// DISAGREEMENTS in the room's contributions, the "the real tension here is…",
// so the facilitator can run toward conflict productively instead of away from
// it.
//
// Server half: schema, computeView, handleAction. This is an AI module:
//   - Claude is NEVER called in computeView (it must stay cheap + idempotent).
//   - Claude is called only in handleAction "generate", and only when the
//     caller is not a participant (facilitators trigger the analysis).
//   - The result is cached as a pseudo-vote under the reserved token "__ai__";
//     computeView just reads votes["__ai__"]. State lives only in ctx.store.
//   - Gated by ANTHROPIC_API_KEY. Absent ⇒ computeView reports unavailable and
//     "generate" returns { ok:false, reason:"AI unavailable" }.
//
// All Claude access goes through the shared AI service (lib/ai.ts): model
// choice (reasoning tier), gating, JSON extraction, prompt-injection delimiting,
// topic threading, and the in-flight generation lock live there.

import { z } from "zod";
import {
  aiAvailable,
  generateJSON,
  topicLine,
  asData,
  capItems,
  withGenerateLock,
} from "@/lib/ai";
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

// Reserved store key holding the cached AI result. Not a real participant
// token, so it never collides with a vote.
const AI_KEY = "__ai__";

// ---- view types (consumed by friction.client.tsx) -------------------------

// One axis of disagreement. `examples` are de-identified example phrases per
// pole and are FACILITATOR-ONLY — they are stripped before reaching
// participants or the projector.
export interface FrictionTension {
  axis: string; // short label of the two opposing poles
  tension: string; // one-line "the real tension is…"
  poleA: string;
  poleB: string;
  intensity: number; // 1..5
  examples?: { poleA: string[]; poleB: string[] }; // facilitator-only
}

export interface FrictionView {
  hasResult: boolean;
  available: boolean; // aiAvailable()
  stale: boolean; // cached result was generated against a different input count
  inputCount: number;
  tensions: FrictionTension[];
}

// The cached AI payload (stored under AI_KEY). Always holds the full result
// including examples; computeView decides per-role what to expose.
interface FrictionResult {
  tensions: FrictionTension[];
  generatedAt: number;
  inputCount: number;
}

// ---- config ---------------------------------------------------------------

const schema = z
  .object({
    label: z.string(),
    sourcePhaseId: z.string(),
    topNTensions: z.number().int().positive().optional(),
  })
  .passthrough();

type FrictionConfig = z.infer<typeof schema>;

const DEFAULT_TOP_N = 4;

// ---- AI plumbing -----------------------------------------------------------

const SYSTEM_PROMPT =
  "You are helping a facilitator surface the live disagreements in a room of " +
  "short workshop contributions, so they can run toward the conflict " +
  "productively. Return JSON only — no markdown, no commentary, no code fences.";

function buildUserPrompt(
  ctx: ModuleContext,
  topN: number,
  submissions: { id: string; text: string; tag?: string | null }[],
): string {
  return `${topicLine(ctx.state.topic)}You will receive a list of contributions from people in a room.

Identify the top ${topN} TENSIONS — the real axes of DISAGREEMENT running through these contributions. Do not summarise consensus; find where people pull in opposite directions. For each tension return:
- "axis": a short label naming the two opposing poles (≤6 words)
- "tension": one line phrased as "the real tension is…" (no leading "The real tension is" required, just the substance)
- "poleA": a short label for one side
- "poleB": a short label for the other side
- "intensity": an integer 1 to 5 for how sharp/charged the disagreement is
- "examples": de-identified, lightly paraphrased example phrases for each pole, as { "poleA": ["…"], "poleB": ["…"] } — 1 to 2 short phrases per pole, never naming a person

Return at most ${topN} tensions, fewer if the room genuinely agrees. Do not invent disagreement that isn't there. Do not add commentary.

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this shape:
{
  "tensions": [
    {
      "axis": "Speed vs. care",
      "tension": "whether to ship fast or get it right first",
      "poleA": "Ship fast",
      "poleB": "Get it right",
      "intensity": 4,
      "examples": { "poleA": ["just get something out"], "poleB": ["we'll regret rushing"] }
    }
  ]
}`;
}

function clampIntensity(n: unknown): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

function cleanPhrases(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 2);
}

// Defensive mapping over the model's already-parsed JSON (generateJSON handled
// fence-stripping + JSON.parse). Returns [] if the shape is off so the caller
// can decide what to cache.
function extractTensions(parsed: unknown, topN: number): FrictionTension[] {
  const arr =
    parsed && typeof parsed === "object" && Array.isArray((parsed as any).tensions)
      ? (parsed as any).tensions
      : Array.isArray(parsed)
        ? parsed
        : [];
  return arr
    .filter(
      (t: any) =>
        t &&
        typeof t.axis === "string" &&
        typeof t.tension === "string" &&
        typeof t.poleA === "string" &&
        typeof t.poleB === "string",
    )
    .slice(0, topN)
    .map((t: any) => {
      const ex = t.examples ?? {};
      const examples = {
        poleA: cleanPhrases(ex.poleA),
        poleB: cleanPhrases(ex.poleB),
      };
      const tension: FrictionTension = {
        axis: String(t.axis).slice(0, 80),
        tension: String(t.tension).slice(0, 240),
        poleA: String(t.poleA).slice(0, 60),
        poleB: String(t.poleB).slice(0, 60),
        intensity: clampIntensity(t.intensity),
      };
      if (examples.poleA.length || examples.poleB.length) {
        tension.examples = examples;
      }
      return tension;
    });
}

// ---- module ---------------------------------------------------------------

const friction: ModuleServerDef<FrictionConfig> = {
  id: "friction",
  meta: {
    name: "Tension map",
    description:
      "AI surfaces the live disagreements in the room's contributions — the axes of tension — so the facilitator can run toward conflict productively.",
    icon: "⚡",
  },
  schema,
  defaultConfig: {
    label: "Tension map",
    sourcePhaseId: "",
    topNTensions: DEFAULT_TOP_N,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { usesAi: true, gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<FrictionView> {
    const c = ctx.config as Record<string, unknown>;
    const sourcePhaseId = (c.sourcePhaseId as string) ?? "";
    const available = aiAvailable();

    // How many contributions are currently available to analyse — useful for
    // the facilitator even before any generation has happened.
    const inputCount = ctx.submissions.filter(
      (s) => s.phaseId === sourcePhaseId,
    ).length;

    // NEVER call Claude here. Read the cached result, if any.
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes[AI_KEY] as FrictionResult | undefined;

    if (!available || !cached || !Array.isArray(cached.tensions)) {
      return {
        hasResult: false,
        available,
        stale: false,
        inputCount,
        tensions: [],
      };
    }

    // Stale when the cached analysis was run against a different number of
    // contributions than the source phase currently holds.
    const stale = cached.inputCount !== inputCount;

    // Privacy: raw example phrases only reach facilitator-style roles. For
    // participants and the projector, strip examples to the aggregate
    // axis + tension + poles + intensity.
    const exposeExamples =
      ctx.role !== "participant" && ctx.role !== "projector";

    const tensions: FrictionTension[] = cached.tensions.map((t) => {
      if (exposeExamples) return t;
      const { examples: _omit, ...rest } = t;
      return rest;
    });

    return {
      hasResult: true,
      available,
      stale,
      inputCount: cached.inputCount,
      tensions,
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "generate") {
      return { ok: false, reason: "unknown action" };
    }
    // Only facilitator-style roles may trigger the (paid) analysis.
    if (ctx.role === "participant") {
      return { ok: false, reason: "forbidden" };
    }
    if (!aiAvailable()) {
      return { ok: false, reason: "AI unavailable" };
    }

    const c = ctx.config as Record<string, unknown>;
    const sourcePhaseId = (c.sourcePhaseId as string) ?? "";
    const topN = Math.max(1, Number(c.topNTensions) || DEFAULT_TOP_N);

    const scoped = ctx.submissions.filter((s) => s.phaseId === sourcePhaseId);
    if (scoped.length === 0) {
      return { ok: false, reason: "no contributions yet" };
    }

    return withGenerateLock(ctx.store, ctx.phase.id, "friction", async () => {
      // Cap before serialising so a large room can't blow the context or
      // silently truncate the JSON output.
      const { kept } = capItems(scoped, 150);
      const submissions = kept.map((s) => ({
        id: s.id,
        text: s.text,
        tag: s.tag,
      }));

      const res = await generateJSON<unknown>({
        label: "friction",
        tier: "reasoning",
        shape: "object",
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(ctx, topN, submissions),
      });
      if (!res.ok) return { ok: false, reason: res.reason };

      const tensions = extractTensions(res.data, topN);
      const result: FrictionResult = {
        tensions,
        generatedAt: Date.now(),
        inputCount: submissions.length,
      };
      await ctx.store.castVote(ctx.phase.id, AI_KEY, result);
      return { ok: true };
    });
  },
};

export const frictionModule = friction;
