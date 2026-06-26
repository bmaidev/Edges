// Module: devil (AI devil's-advocate / red-team).
//
// Generates grounded counterarguments to the room's emerging view so the group
// can stress-test its consensus and break confirmation bias. Devil's-advocate
// objections are AI-authored (never raw personal submissions), so they are
// safe to show the whole room — including participants.
//
// AI rules (see the cluster-assist pattern in lib/cluster.ts):
//   - Claude is NEVER called in computeView (it runs every ~2s). The Anthropic
//     call happens only inside handleAction for a "generate" action, and only
//     when ctx.role !== "participant".
//   - The result is cached via ctx.store.castVote(phaseId, "__ai__", result).
//     computeView reads votes, pulls votes["__ai__"], and returns it.
//   - When ANTHROPIC_API_KEY is absent, computeView still works (hasResult
//     false, available false) and "generate" returns { ok:false }.

import { z } from "zod";
import {
  aiAvailable,
  generateJSON,
  topicLine,
  asData,
  capItems,
  withGenerateLock,
} from "@/lib/ai";
import type { ModuleServerDef } from "../types";

// ---- view shapes (exported; consumed by devil.client.tsx) -----------------

export interface DevilObjection {
  title: string;
  body: string;
}

export interface DevilView {
  hasResult: boolean;
  objections: DevilObjection[];
  inputCount: number;
  available: boolean; // is the AI configured? (aiAvailable)
  stale: boolean; // cached result was generated against a different input count
  generatedAt?: number;
}

// The shape we cache under the "__ai__" pseudo-vote.
interface DevilCache {
  objections: DevilObjection[];
  generatedAt: number;
  inputCount: number;
}

export interface DevilConfig {
  label: string;
  sourcePhaseId: string;
  target?: "group" | "ai-recommendation";
  maxObjections?: number;
}

// ---- visibility helper (replicated from registry.server.ts `vis`) ---------

import type { Role, Visibility } from "../types";

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- AI helpers (mirror lib/cluster.ts construction exactly) --------------

const SYSTEM_PROMPT =
  "You are a rigorous devil's advocate helping a workshop stress-test its " +
  "emerging consensus. " +
  "Return JSON only — no markdown, no commentary, no code fences.";

function buildUserPrompt(
  topic: string,
  target: "group" | "ai-recommendation",
  maxObjections: number,
  submissions: { id: string; text: string; tag?: string | null }[],
  dropped: number,
): string {
  const subject =
    target === "ai-recommendation"
      ? "the AI recommendation the room is converging on"
      : "the room's emerging consensus";
  const droppedNote =
    dropped > 0
      ? `\n(Note: ${dropped} older submission(s) were omitted to fit; reason over the ones provided.)`
      : "";
  return `${topicLine(topic)}You will receive the submissions that represent ${subject}.

Act as a rigorous devil's advocate. Produce up to ${maxObjections} SPECIFIC, grounded counterarguments that challenge ${subject}. Each objection must be a real, defensible challenge — not a strawman, not generic skepticism. Where useful, name what evidence would change your mind inside the body.

Each objection has a short title (≤8 words, sentence case) and a body of 1–2 sentences. Do not invent facts about the submissions. Do not add commentary outside the JSON.${droppedNote}

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this shape:
[
  { "title": "Short objection title", "body": "One or two sentences." }
]`;
}

// Map/validate the model's parsed JSON into our cached objection shape. The
// shared AI service already strips fences and parses JSON; this is the
// field-level validation/mapping the client renderer depends on.
function mapObjections(parsed: unknown, max: number): DevilObjection[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (o): o is { title: unknown; body: unknown } =>
        Boolean(o) && typeof o === "object",
    )
    .map((o) => ({
      title: String((o as any).title ?? "").slice(0, 80),
      body: String((o as any).body ?? "").slice(0, 400),
    }))
    .filter((o) => o.title || o.body)
    .slice(0, max);
}

// ---- module ---------------------------------------------------------------

export const devilModule: ModuleServerDef<DevilConfig> = {
  id: "devil",
  meta: {
    name: "Devil's advocate",
    description:
      "AI red-teams the room's emerging view — grounded counterarguments to break confirmation bias.",
  },
  schema: z
    .object({
      label: z.string(),
      sourcePhaseId: z.string(),
      target: z.enum(["group", "ai-recommendation"]).optional(),
      maxObjections: z.number().int().positive().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Devil's advocate",
    sourcePhaseId: "",
    target: "group",
    maxObjections: 3,
  },
  // Objections are room-facing (AI-authored, not personal submissions), so the
  // same payload is shown to everyone.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<DevilView> {
    const c = ctx.config as unknown as DevilConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const available = aiAvailable();

    // Live input count from the source phase's submissions.
    const inputCount = ctx.submissions.filter(
      (s) => s.phaseId === sourcePhaseId,
    ).length;

    // The AI result is cached under the "__ai__" pseudo-token. NEVER call
    // Claude here — this runs on every poll.
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes["__ai__"] as DevilCache | undefined;
    const objections =
      cached && Array.isArray(cached.objections) ? cached.objections : [];

    const hasResult = objections.length > 0;

    return {
      hasResult,
      objections,
      inputCount,
      available,
      // The cached objections were generated against cached.inputCount; if the
      // live count has moved, the result is stale and worth regenerating.
      stale: hasResult && cached?.inputCount !== inputCount,
      generatedAt: cached?.generatedAt,
    };
  },
  async handleAction(ctx, action) {
    // Generation is a facilitation act — never participant-triggered.
    if (action.type !== "generate")
      return { ok: false, reason: "unknown action" };
    if (ctx.role === "participant")
      return { ok: false, reason: "not allowed" };
    if (!aiAvailable()) return { ok: false, reason: "AI unavailable" };

    const c = ctx.config as unknown as DevilConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const target = c.target ?? "group";
    const maxObjections = c.maxObjections ?? 3;

    const subs = ctx.submissions
      .filter((s) => s.phaseId === sourcePhaseId)
      .map((s) => ({ id: s.id, text: s.text, tag: s.tag }));
    if (subs.length === 0)
      return { ok: false, reason: "No submissions to challenge yet" };

    // Lock prevents a second (paid) generation while one is in flight.
    return withGenerateLock(ctx.store, ctx.phase.id, "devil", async () => {
      // Cap before serialising so a large room can't blow the context.
      const { kept, dropped } = capItems(subs, 150);

      const res = await generateJSON<unknown>({
        label: "devil",
        tier: "reasoning",
        shape: "array",
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(
          ctx.state.topic,
          target,
          maxObjections,
          kept,
          dropped,
        ),
      });
      if (!res.ok) return { ok: false, reason: res.reason };

      const objections = mapObjections(res.data, maxObjections);
      if (objections.length === 0)
        return { ok: false, reason: "No objections produced" };

      const result: DevilCache = {
        objections,
        generatedAt: Date.now(),
        inputCount: subs.length,
      };
      await ctx.store.castVote(ctx.phase.id, "__ai__", result);
      return { ok: true };
    });
  },
};
