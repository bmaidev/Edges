// Module: emptychair (the empty chair / absent-stakeholder AI persona).
//
// A stakeholder who isn't in the room — a customer, a regulator, a future user,
// "the patient" — is given a voice. Participants ask the empty chair questions;
// Claude answers IN CHARACTER as that persona, so the group is forced to
// consider a missing perspective. The answers are an AI-imagined stand-in, not
// the real stakeholder — the renderers carry that synthetic-honesty caveat, the
// same way the other AI persona modules do.
//
// AI rules (see the cluster-assist pattern in lib/cluster.ts and devil.server.ts):
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
import type {
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

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

// ---- config ---------------------------------------------------------------

export interface EmptychairPersona {
  name: string;
  description: string;
}

export interface EmptychairConfig {
  label: string;
  persona: EmptychairPersona;
}

const schema = z
  .object({
    label: z.string(),
    persona: z.object({
      name: z.string(),
      description: z.string(),
    }),
  })
  .passthrough();

// ---- view shapes (exported; consumed by emptychair.client.tsx) ------------

export interface EmptychairQuestion {
  id: string;
  text: string;
}

export interface EmptychairAnswer {
  question: string;
  answer: string;
}

export interface EmptychairView {
  hasResult: boolean;
  available: boolean; // aiAvailable: is the AI configured?
  personaName: string;
  personaDescription: string;
  questions: EmptychairQuestion[]; // visible to all
  answers: EmptychairAnswer[]; // visible once generated
  stale: boolean; // cached answers were generated against a different question count
  generatedAt?: number;
}

// The shape we cache under the "__ai__" pseudo-vote.
interface EmptychairCache {
  answers: EmptychairAnswer[];
  personaName: string;
  generatedAt: number;
  inputCount: number; // how many questions were answered when generated
}

// ---- AI helpers (mirror lib/cluster.ts construction exactly) --------------

const SYSTEM_PROMPT =
  "You are giving voice to an absent stakeholder in a workshop — the 'empty " +
  "chair' — so the group can consider a perspective that isn't in the room. " +
  "Stay strictly in character. Return JSON only — no markdown, no commentary, " +
  "no code fences.";

function buildUserPrompt(
  topic: string,
  persona: EmptychairPersona,
  questions: { id: string; text: string }[],
  dropped: number,
): string {
  const droppedNote =
    dropped > 0
      ? `\n(Note: ${dropped} older question(s) were omitted to fit; answer the ones provided.)`
      : "";
  return `${topicLine(topic)}You are role-playing as the following absent stakeholder. Answer every question IN CHARACTER, in the first person, as this person would actually respond.

Persona name: ${persona.name}
Persona context: ${persona.description}

Answer EACH question below. Each answer should be 1–3 sentences, grounded in the persona's situation and concerns — honest, specific, and in their voice. Do not break character. Do not invent facts about the workshop. Do not add commentary outside the JSON.${droppedNote}

${asData("questions", JSON.stringify(questions, null, 2))}

Return JSON only, in this shape:
{
  "answers": [
    { "question": "the question text", "answer": "the persona's in-character reply" }
  ]
}`;
}

// Map/validate the model's parsed JSON into our cached answer shape. The shared
// AI service already strips fences and parses JSON; this is the field-level
// validation/mapping the client renderer depends on.
function mapAnswers(parsed: unknown): EmptychairAnswer[] {
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (a): a is { question: unknown; answer: unknown } =>
        Boolean(a) && typeof a === "object",
    )
    .map((a) => ({
      question: String((a as any).question ?? "").slice(0, 400),
      answer: String((a as any).answer ?? "").slice(0, 800),
    }))
    .filter((a) => a.question || a.answer);
}

// ---- module ---------------------------------------------------------------

export const emptychairModule: ModuleServerDef<EmptychairConfig> = {
  id: "emptychair",
  meta: {
    name: "Empty chair",
    description:
      "Give voice to an absent stakeholder — the group asks an AI persona (a customer, a regulator, a future user) questions and it answers in character, surfacing a missing perspective.",
    icon: "armchair",
  },
  schema,
  defaultConfig: {
    label: "Empty chair",
    persona: {
      name: "The customer",
      description:
        "A long-time customer who relies on what this team builds, but who is never in these planning conversations. Pragmatic, time-poor, and quick to notice when decisions are made for the team's convenience rather than theirs.",
    },
  },
  // Questions are room-facing and the AI answers are an AI-imagined stand-in
  // (not personal submissions), so the same payload is shown to everyone.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<EmptychairView> {
    const c = ctx.config as unknown as EmptychairConfig;
    const persona = c.persona ?? { name: "", description: "" };
    const available = aiAvailable();

    // Questions are submissions tagged "q" for this phase — visible to all.
    const questions: EmptychairQuestion[] = ctx.submissions
      .filter((s) => s.phaseId === ctx.phase.id && s.tag === "q")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({ id: s.id, text: s.text }));

    // The AI result is cached under the "__ai__" pseudo-token. NEVER call
    // Claude here — this runs on every poll.
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes["__ai__"] as EmptychairCache | undefined;
    const answers =
      cached && Array.isArray(cached.answers) ? cached.answers : [];

    const hasResult = answers.length > 0;

    return {
      hasResult,
      available,
      personaName: persona.name ?? "",
      personaDescription: persona.description ?? "",
      questions,
      answers,
      // The cached answers were generated against cached.inputCount questions;
      // if the live count has moved, the result is stale and worth regenerating.
      stale: hasResult && cached?.inputCount !== questions.length,
      generatedAt: cached?.generatedAt,
    };
  },
  async handleAction(ctx, action) {
    // Participants ask questions; only facilitator/cohost can generate answers.
    if (action.type === "ask") {
      if (!action.token) return { ok: false, reason: "missing token" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(
        handle,
        text.slice(0, 400),
        ctx.phase.id,
        "q",
        action.token,
      );
      return { ok: true };
    }

    // Generation is a facilitation act — never participant-triggered.
    if (action.type !== "generate")
      return { ok: false, reason: "unknown action" };
    if (ctx.role === "participant")
      return { ok: false, reason: "not allowed" };
    if (!aiAvailable())
      return { ok: false, reason: "AI unavailable" };

    const c = ctx.config as unknown as EmptychairConfig;
    const persona = c.persona ?? { name: "", description: "" };

    const questions = ctx.submissions
      .filter((s) => s.phaseId === ctx.phase.id && s.tag === "q")
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({ id: s.id, text: s.text }));
    if (questions.length === 0)
      return { ok: false, reason: "No questions to answer yet" };

    // The full question count is what the view compares against for staleness;
    // capItems keeps the most recent 60 to bound prompt size.
    const inputCount = questions.length;
    const { kept, dropped } = capItems(questions, 60);

    return withGenerateLock(ctx.store, ctx.phase.id, "emptychair", async () => {
      const res = await generateJSON<{ answers?: unknown }>({
        label: "emptychair",
        tier: "reasoning",
        shape: "object",
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(ctx.state.topic, persona, kept, dropped),
      });
      if (!res.ok) return { ok: false, reason: res.reason };

      const answers = mapAnswers(res.data);
      if (answers.length === 0)
        return { ok: false, reason: "No answers produced" };

      const result: EmptychairCache = {
        answers,
        personaName: persona.name ?? "",
        generatedAt: Date.now(),
        inputCount,
      };
      await ctx.store.castVote(ctx.phase.id, "__ai__", result);
      return { ok: true };
    });
  },
};
