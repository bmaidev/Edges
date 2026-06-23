// Module: needs — AI inarticulate-need / Jobs-To-Be-Done miner.
//
// Reads raw capture text from a source phase and asks Claude to extract the
// LATENT needs nobody said out loud — the underlying jobs-to-be-done beneath
// the literal words. This is FACILITATOR-ONLY analysis: it infers *beyond*
// what people stated, so it is off-the-record and must NEVER reach
// participants or the projector.
//
// AI rules: Claude is only ever called inside handleAction("generate"), only
// for non-participant roles, gated on aiAvailable(). The result is cached as a
// vote under the reserved "__ai__" token; computeView only reads that cache —
// it never calls Claude.
//
// All Claude access goes through the shared AI service (lib/ai.ts): model
// choice (reasoning tier), gating, JSON extraction, prompt-injection delimiting,
// topic threading, input capping, and the in-flight generation lock live there.

import { z } from "zod";
import {
  aiAvailable,
  generateJSON,
  topicLine,
  asData,
  capItems,
  withGenerateLock,
} from "@/lib/ai";
import type { ModuleContext, ModuleServerDef, Role, Visibility } from "../types";

// ---- view types (consumed by needs.client.tsx) ----------------------------

export interface NeedItem {
  need: string; // the latent / underlying need
  jtbd: string; // "When I…, I want to…, so I can…" framing
  evidence: string[]; // 2-3 de-identified, paraphrased supporting phrases
  confidence: "low" | "medium" | "high";
}

// Shape cached under the "__ai__" vote slot.
export interface NeedsResult {
  needs: NeedItem[];
  generatedAt: number;
  inputCount: number;
}

// Facilitator / cohost / admin view.
export interface NeedsFacilitatorView {
  hasResult: boolean;
  needs: NeedItem[];
  inputCount: number;
  available: boolean; // aiAvailable()
  stale: boolean; // a result exists but the input set has changed since
  generatedAt?: number;
}

// Participant / projector view — deliberately reveals nothing.
export interface NeedsParticipantView {
  hasResult: false;
  facilitatorOnly: true;
}

export type NeedsView = NeedsFacilitatorView | NeedsParticipantView;

// ---- config ---------------------------------------------------------------

export interface NeedsConfig {
  label: string;
  sourcePhaseId: string;
}

// ---- helpers --------------------------------------------------------------

// Replicated from registry.server.ts so this def stays self-contained.
// Admin sees whatever the facilitator sees.
function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

const RESERVED_AI_TOKEN = "__ai__";

const SYSTEM_PROMPT =
  "You are helping a facilitator find the latent, unspoken needs underneath " +
  "what a group wrote during a workshop. You infer the underlying " +
  "jobs-to-be-done that nobody articulated directly. This analysis is " +
  "off-the-record and seen only by the facilitator. De-identify everything — " +
  "never quote a person verbatim and never name anyone. Return JSON only — no " +
  "markdown, no commentary, no code fences.";

function buildUserPrompt(
  topic: string | null | undefined,
  submissions: { text: string }[],
): string {
  return `${topicLine(topic)}Below are raw, anonymous capture phrases from a workshop. They are what people literally said.

Your job is to surface the LATENT needs — the underlying things people actually want that nobody stated outright. Look beneath the words for the real job-to-be-done.

Return 3 to 6 latent needs. For each:
- "need": the underlying need, one short plain-English phrase.
- "jtbd": a jobs-to-be-done framing, exactly "When I…, I want to…, so I can…".
- "evidence": an array of 2-3 SHORT supporting phrases that are DE-IDENTIFIED and PARAPHRASED — never verbatim quotes, never names.
- "confidence": one of "low", "medium", "high" — how strongly the input supports this inference.

Do not invent needs with no basis in the input. Do not add commentary.

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this exact shape:
{
  "needs": [
    {
      "need": "…",
      "jtbd": "When I…, I want to…, so I can…",
      "evidence": ["…", "…"],
      "confidence": "medium"
    }
  ]
}`;
}

// Shape of the (already-parsed) JSON the model is asked to return. The shared
// service does the extraction/parse; this module only validates + maps fields.
interface RawNeeds {
  needs?: unknown;
}

// Validate + map the parsed model output into well-formed NeedItems. Anything
// malformed is dropped so the caller can decide what to cache.
function mapNeeds(data: RawNeeds): NeedItem[] {
  const rawNeeds = data?.needs;
  if (!Array.isArray(rawNeeds)) return [];
  const allowed = new Set(["low", "medium", "high"]);
  return rawNeeds
    .filter((n) => n && typeof n.need === "string" && typeof n.jtbd === "string")
    .map((n): NeedItem => {
      const confidence = allowed.has(n.confidence)
        ? (n.confidence as NeedItem["confidence"])
        : "low";
      const evidence = Array.isArray(n.evidence)
        ? n.evidence
            .filter((e: unknown) => typeof e === "string")
            .map((e: string) => e.slice(0, 200))
            .slice(0, 3)
        : [];
      return {
        need: String(n.need).slice(0, 200),
        jtbd: String(n.jtbd).slice(0, 300),
        evidence,
        confidence,
      };
    });
}

// ---- module ---------------------------------------------------------------

export const needsModule: ModuleServerDef<NeedsConfig> = {
  id: "needs",
  meta: {
    name: "Latent needs (AI)",
    description:
      "Mines the unspoken jobs-to-be-done beneath raw capture text. Facilitator-only, off-the-record.",
  },
  schema: z
    .object({
      label: z.string(),
      sourcePhaseId: z.string(),
    })
    .passthrough(),
  defaultConfig: { label: "Latent needs", sourcePhaseId: "" },
  // Facilitator + cohost (+ admin) visible; participant + projector hidden so
  // the off-the-record inference can never leak to the room.
  defaultVisibility: vis("hidden", "visible", "visible", "hidden"),
  capabilities: {
    acceptsActions: true,
    liveResults: false,
    needsTimer: false,
    projectable: false,
  },
  async computeView(ctx): Promise<NeedsView> {
    // Never call Claude here. Participants/projector get a sealed view.
    if (ctx.role === "participant" || ctx.role === "projector") {
      return { hasResult: false, facilitatorOnly: true };
    }
    const available = aiAvailable();
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes[RESERVED_AI_TOKEN] as NeedsResult | undefined;
    const sourcePhaseId = (ctx.config.sourcePhaseId as string) ?? "";
    const inputCount = ctx.submissions.filter(
      (s) => s.phaseId === sourcePhaseId,
    ).length;
    if (cached && Array.isArray(cached.needs)) {
      return {
        hasResult: true,
        needs: cached.needs,
        inputCount: cached.inputCount ?? inputCount,
        available,
        // A result exists but the live input count has moved: worth regenerating.
        stale: (cached.inputCount ?? inputCount) !== inputCount,
        generatedAt: cached.generatedAt,
      };
    }
    return { hasResult: false, needs: [], inputCount, available, stale: false };
  },
  async handleAction(ctx, action) {
    if (action.type !== "generate") return { ok: false, reason: "unknown action" };
    // AI inference is facilitator-scoped — never let a participant trigger it.
    if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
    if (!aiAvailable()) return { ok: false, reason: "AI unavailable" };

    const sourcePhaseId = (ctx.config.sourcePhaseId as string) ?? "";
    const subs = ctx.submissions
      .filter((s) => s.phaseId === sourcePhaseId)
      .map((s) => ({ text: s.text }));
    if (subs.length === 0) return { ok: false, reason: "no input" };

    return withGenerateLock(ctx.store, ctx.phase.id, "needs", async () => {
      // Cap input so a large room can't blow the context / truncate output.
      const { kept } = capItems(subs, 150);
      const res = await generateJSON<RawNeeds>({
        label: "needs",
        tier: "reasoning",
        shape: "object",
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(ctx.state.topic, kept),
      });
      if (!res.ok) return { ok: false, reason: res.reason };

      const needs = mapNeeds(res.data ?? {});
      const result: NeedsResult = {
        needs,
        generatedAt: Date.now(),
        inputCount: subs.length,
      };
      await ctx.store.castVote(ctx.phase.id, RESERVED_AI_TOKEN, result);
      return { ok: true };
    });
  },
};
