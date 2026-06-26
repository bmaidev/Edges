// Module: persona (synthetic-customer / blind-customer simulator).
//
// A panel of AI personas reacts in-character to the room's idea or pitch, so
// the group can pressure-test it against a spread of viewpoints. The reactions
// are AI-authored simulations — never raw personal submissions — so they are
// safe to show the whole room (including participants).
//
// HONESTY: synthetic personas validate KNOWN patterns and will confidently
// fabricate answers to genuinely unknown questions. They are NOT real user
// data, and every renderer carries a banner saying so.
//
// AI rules:
//   - Claude is NEVER called in computeView (it runs every ~2s). The AI call
//     happens only inside handleAction for a "generate" action, and only when
//     ctx.role !== "participant".
//   - All AI goes through the shared service in lib/ai.ts (model choice,
//     streaming, refusal handling, prompt-injection delimiting, topic
//     threading, observability live there).
//   - The result is cached via ctx.store.castVote(phaseId, "__ai__", result).
//     computeView reads votes, pulls votes["__ai__"], and returns it.
//   - When the AI is unconfigured, computeView still works (hasResult false,
//     available false) and "generate" returns { ok:false }.

import { z } from "zod";
import {
  aiAvailable,
  asData,
  capItems,
  generateJSON,
  topicLine,
  withGenerateLock,
} from "@/lib/ai";
import type { ModuleServerDef, Role, Visibility } from "../types";

// ---- config ---------------------------------------------------------------

export interface PersonaSpec {
  name: string;
  description: string;
}

export interface PersonaConfig {
  label: string;
  sourcePhaseId: string;
  personas?: PersonaSpec[];
  societyMode?: boolean;
}

// ---- view shapes (exported; consumed by persona.client.tsx) ---------------

export interface PersonaReaction {
  persona: string;
  reaction: string; // 2–3 sentences, in character
  wouldAdopt: number; // 1..5
  objections: string[];
}

export interface PersonaView {
  hasResult: boolean;
  available: boolean; // is the AI configured?
  stale: boolean; // cached result no longer reflects the current input count
  inputCount: number;
  reactions: PersonaReaction[];
  personas: PersonaSpec[];
  generatedAt?: number;
}

// The shape we cache under the "__ai__" pseudo-vote.
interface PersonaCache {
  reactions: PersonaReaction[];
  generatedAt: number;
  inputCount: number;
}

// Default panel: a deliberately spread set of generic personas.
const DEFAULT_PERSONAS: PersonaSpec[] = [
  {
    name: "Skeptical budget-holder",
    description:
      "Controls the purse strings; wants hard ROI and is wary of new spend.",
  },
  {
    name: "Time-poor frontline practitioner",
    description:
      "Does the actual work; has no time for anything that adds friction.",
  },
  {
    name: "Enthusiastic early-adopter",
    description:
      "Loves trying new things; quick to see upside, slow to see risk.",
  },
  {
    name: "Cautious end-user",
    description:
      "Affected by the change but not consulted; defaults to risk-averse.",
  },
];

// ---- visibility helper (replicated from registry.server.ts `vis`) ---------

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- prompt construction ---------------------------------------------------

const SYSTEM_PROMPT =
  "You are simulating a panel of synthetic customer personas reacting to an " +
  "idea or pitch from a workshop. Each persona reacts strictly in character. " +
  "Be honest about uncertainty — base reactions on plausible, known behaviour " +
  "patterns and do not pretend to be real user research. Return JSON only — " +
  "no markdown, no commentary, no code fences.";

function buildFirstPrompt(
  topic: string,
  idea: string,
  personas: PersonaSpec[],
): string {
  return `${topicLine(topic)}The room is testing this idea / pitch:

${asData("idea", idea)}

You are this panel of personas:
${JSON.stringify(personas, null, 2)}

For EACH persona, react strictly in character to the idea above. Give an honest, plausible reaction grounded in that persona's motivations — do not flatter the idea, and do not invent facts about it.

Each reaction has:
- "persona": the persona's exact name.
- "reaction": 2–3 sentences, first person, in character.
- "wouldAdopt": an integer 1–5 (1 = would never use it, 5 = would adopt eagerly).
- "objections": an array of 1–3 short, specific objections or open questions this persona raises (each ≤16 words). Use an empty array only if the persona genuinely has none.

Return JSON only, an array in this shape:
[
  { "persona": "Name", "reaction": "...", "wouldAdopt": 3, "objections": ["..."] }
]`;
}

function buildSocietyPrompt(
  topic: string,
  idea: string,
  personas: PersonaSpec[],
  firstPass: PersonaReaction[],
): string {
  return `${topicLine(topic)}The room is testing this idea / pitch:

${asData("idea", idea)}

These personas already reacted independently:
${JSON.stringify(personas, null, 2)}

Here is the first round of reactions, which every persona has now seen:
${JSON.stringify(firstPass, null, 2)}

Now run a second pass: each persona reads the others' reactions and objections and may adjust. Stay strictly in character. A persona might be reassured by another's enthusiasm, alarmed by another's objection, or dig in. Do not converge artificially — keep genuine disagreement where it exists.

Return the SAME shape as before (same persona names, updated reaction / wouldAdopt / objections). Return JSON only:
[
  { "persona": "Name", "reaction": "...", "wouldAdopt": 3, "objections": ["..."] }
]`;
}

// ---- validation / mapping --------------------------------------------------

function clampAdopt(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

// Map the parsed JSON array into validated PersonaReaction[]. The shared
// service has already extracted/parsed the JSON; this just shapes + clamps it.
function mapReactions(
  parsed: unknown,
  personas: PersonaSpec[],
): PersonaReaction[] {
  if (!Array.isArray(parsed)) return [];
  const names = personas.map((p) => p.name);
  return parsed
    .filter(
      (r): r is Record<string, unknown> => Boolean(r) && typeof r === "object",
    )
    .map((r) => {
      const rawName = String((r as any).persona ?? "").slice(0, 80);
      // Prefer a configured persona name if it matches; otherwise keep the raw.
      const persona =
        names.find((n) => n.toLowerCase() === rawName.toLowerCase()) ||
        rawName ||
        "Persona";
      const objections = Array.isArray((r as any).objections)
        ? ((r as any).objections as unknown[])
            .filter((o): o is string => typeof o === "string")
            .map((o) => o.slice(0, 160))
            .slice(0, 5)
        : [];
      return {
        persona,
        reaction: String((r as any).reaction ?? "").slice(0, 600),
        wouldAdopt: clampAdopt((r as any).wouldAdopt),
        objections,
      };
    })
    .filter((r) => r.reaction || r.objections.length > 0);
}

// ---- module ---------------------------------------------------------------

export const personaModule: ModuleServerDef<PersonaConfig> = {
  id: "persona",
  meta: {
    name: "Persona panel",
    description:
      "A panel of synthetic AI personas reacts in-character to the room's idea — pressure-test before you build. Not real user data.",
  },
  schema: z
    .object({
      label: z.string(),
      sourcePhaseId: z.string(),
      personas: z
        .array(z.object({ name: z.string(), description: z.string() }))
        .optional(),
      societyMode: z.boolean().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Persona panel",
    sourcePhaseId: "",
    personas: DEFAULT_PERSONAS,
    societyMode: false,
  },
  // Synthetic reactions are room-facing (AI-authored, not personal data), so
  // the same payload is shown to everyone.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<PersonaView> {
    const c = ctx.config as unknown as PersonaConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const personas =
      Array.isArray(c.personas) && c.personas.length > 0
        ? c.personas
        : DEFAULT_PERSONAS;
    const available = aiAvailable();

    // Live input count from the source phase's submissions.
    const inputCount = ctx.submissions.filter(
      (s) => s.phaseId === sourcePhaseId,
    ).length;

    // The AI result is cached under the "__ai__" pseudo-token. NEVER call
    // Claude here — this runs on every poll.
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes["__ai__"] as PersonaCache | undefined;
    const reactions =
      cached && Array.isArray(cached.reactions) ? cached.reactions : [];
    const hasResult = reactions.length > 0;

    return {
      hasResult,
      available,
      // Stale once new submissions have arrived since the cached generation.
      stale: hasResult && cached?.inputCount !== inputCount,
      inputCount,
      reactions,
      personas,
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

    const c = ctx.config as unknown as PersonaConfig;
    const sourcePhaseId = c.sourcePhaseId ?? "";
    const personas =
      Array.isArray(c.personas) && c.personas.length > 0
        ? c.personas
        : DEFAULT_PERSONAS;
    const societyMode = Boolean(c.societyMode);
    const topic = ctx.state.topic ?? "";

    const submissions = ctx.submissions.filter(
      (s) => s.phaseId === sourcePhaseId,
    );
    // Cap before serialising so a large room can't blow the context window.
    const { kept } = capItems(submissions);
    const idea = kept.map((s) => s.text).join("\n");
    if (!idea.trim())
      return { ok: false, reason: "No idea to react to yet" };

    return withGenerateLock(ctx.store, ctx.phase.id, "persona", async () => {
      const first = await generateJSON<unknown>({
        label: "persona",
        tier: "reasoning",
        shape: "array",
        system: SYSTEM_PROMPT,
        user: buildFirstPrompt(topic, idea, personas),
      });
      if (!first.ok) return { ok: false, reason: first.reason };
      let reactions = mapReactions(first.data, personas);
      if (reactions.length === 0)
        return { ok: false, reason: "No reactions produced" };

      if (societyMode) {
        const second = await generateJSON<unknown>({
          label: "persona",
          tier: "reasoning",
          shape: "array",
          system: SYSTEM_PROMPT,
          user: buildSocietyPrompt(topic, idea, personas, reactions),
        });
        // Second pass is best-effort; on failure keep the first-pass reactions.
        if (second.ok) {
          const adjusted = mapReactions(second.data, personas);
          if (adjusted.length > 0) reactions = adjusted;
        }
      }

      const result: PersonaCache = {
        reactions,
        generatedAt: Date.now(),
        inputCount: submissions.length,
      };
      await ctx.store.castVote(ctx.phase.id, "__ai__", result);
      return { ok: true };
    });
  },
};
