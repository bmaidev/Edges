// Module: builder (text-to-UI prototype generator).
//
// The room describes an interface or prototype in words; the facilitator presses
// "Build it"; Claude returns a COMPLETE, self-contained single-file HTML document
// (inline CSS + JS, no external resources, no network calls) implementing the
// described UI. A verbal idea becomes a clickable artifact in seconds, which the
// group can see and react to.
//
// SECURITY: the generated HTML is NEVER injected with dangerouslySetInnerHTML.
// The client renders it only inside a SANDBOXED iframe — `sandbox="allow-scripts"`
// (so the prototype can run its own JS) but WITHOUT allow-same-origin, so the
// artifact has an opaque origin and cannot reach the parent app, its storage, or
// its cookies. The model is also told not to make network calls.
//
// AI rules (mirror the cluster-assist pattern in lib/cluster.ts):
//   - Claude is NEVER called in computeView (it runs every ~2s). The Anthropic
//     call happens only inside handleAction for a "build" action, and only when
//     ctx.role !== "participant".
//   - The result is cached via ctx.store.castVote(phaseId, "__ai__", result).
//     computeView reads votes, pulls votes["__ai__"], and returns it.
//   - Larger max_tokens (~4000) than cluster-assist because the model returns a
//     whole HTML document, not a short JSON list.
//   - When ANTHROPIC_API_KEY is absent, computeView still works (hasResult false,
//     available false) and "build" returns { ok:false }.

import { z } from "zod";
import { aiAvailable, generateText, asData, withGenerateLock } from "@/lib/ai";
import type { ModuleServerDef, Role, Visibility } from "../types";

// ---- view shapes (exported; consumed by builder.client.tsx) ----------------

export interface BuilderSpecItem {
  id: string;
  text: string;
  handle: string;
}

export interface BuilderView {
  hasResult: boolean;
  available: boolean; // aiAvailable(): is the AI configured?
  brief: string;
  specCount: number;
  specItems: BuilderSpecItem[]; // the room's contributions (facilitator + participant)
  html: string; // the generated, self-contained HTML (empty until built)
  builtAt?: number;
  specUsed?: string; // the exact spec text the current build was made from
}

// The shape we cache under the "__ai__" pseudo-vote.
interface BuilderCache {
  html: string;
  builtAt: number;
  specUsed: string;
}

export interface BuilderConfig {
  label: string;
  // A capture phase whose submissions hold the spec/ideas. If unset, the build
  // falls back to `brief` alone.
  sourcePhaseId?: string;
  // A starting description the facilitator seeds the prototype with.
  brief?: string;
}

// ---- visibility helper (replicated from registry.server.ts `vis`) ----------

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- spec assembly ----------------------------------------------------------

// Gather the spec contributions for this phase: participants tag them "spec"
// via the "addSpec" action; both the source capture phase (if configured) and
// this phase's own contributions count.
function collectSpecItems(
  ctx: { config: Record<string, unknown>; submissions: BuilderSpecItem[] | any[]; phase: { id: string } },
): BuilderSpecItem[] {
  const c = ctx.config as unknown as BuilderConfig;
  const sourcePhaseId = c.sourcePhaseId ?? "";
  return (ctx.submissions as any[])
    .filter(
      (s) =>
        (sourcePhaseId && s.phaseId === sourcePhaseId) ||
        (s.phaseId === ctx.phase.id && s.tag === "spec"),
    )
    .map((s) => ({
      id: String(s.id),
      text: String(s.text ?? ""),
      handle: String(s.handle ?? "Anonymous"),
    }))
    .filter((s) => s.text.trim());
}

function assembleSpec(brief: string, items: BuilderSpecItem[]): string {
  const parts: string[] = [];
  if (brief.trim()) parts.push(`Brief:\n${brief.trim()}`);
  if (items.length) {
    parts.push(
      "Room contributions:\n" +
        items.map((s, i) => `${i + 1}. ${s.text.trim()}`).join("\n"),
    );
  }
  return parts.join("\n\n").trim();
}

// ---- AI helpers (prompts + HTML extraction; the Claude call goes through
// lib/ai.ts) ----------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a senior frontend engineer turning a group's verbal description of " +
  "an interface into a working prototype during a live workshop. You output a " +
  "SINGLE, COMPLETE, SELF-CONTAINED HTML document only — no commentary, no " +
  "explanation, no markdown prose. Inline all CSS in a <style> tag and all JS " +
  "in a <script> tag. Use NO external resources (no CDNs, no <link>, no remote " +
  "fonts or images) and make NO network calls (no fetch, no XHR, no WebSocket). " +
  "The prototype must be clickable and visually polished, runnable as a single " +
  "file. Return only the HTML, starting with <!DOCTYPE html>.";

function buildUserPrompt(spec: string): string {
  return `Build a self-contained, single-file HTML prototype of the interface described below. Make it interactive where the description implies interaction, visually clean, and complete enough that the group can click around and react to it. Use placeholder content where the spec is silent; do not invent external dependencies.

Description / spec:
${spec}

Return ONLY the full HTML document, starting with <!DOCTYPE html>. No code fences, no commentary.`;
}

// Pull the HTML out of the model response: strip markdown code fences if the
// model wrapped the document, and trim to the actual document bounds.
function extractHtml(text: string): string {
  let s = text.trim();
  // Strip a leading ```html / ``` fence and a trailing ``` fence, if present.
  s = s.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Prefer the bounds of the actual document if the model added stray prose.
  const lower = s.toLowerCase();
  const docStart = lower.indexOf("<!doctype html");
  const htmlStart = lower.indexOf("<html");
  const start =
    docStart !== -1 ? docStart : htmlStart !== -1 ? htmlStart : -1;
  if (start > 0) s = s.slice(start);
  const close = s.toLowerCase().lastIndexOf("</html>");
  if (close !== -1) s = s.slice(0, close + "</html>".length);
  return s.trim();
}

// ---- module ----------------------------------------------------------------

export const builderModule: ModuleServerDef<BuilderConfig> = {
  id: "builder",
  meta: {
    name: "Prototype builder",
    description:
      "Text-to-UI: the room describes an interface, the facilitator builds it, and Claude returns a clickable single-file prototype.",
  },
  schema: z
    .object({
      label: z.string(),
      sourcePhaseId: z.string().optional(),
      brief: z.string().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Prototype builder",
    brief: "",
  },
  // The generated artifact is room-facing (AI-authored, not a personal
  // submission), so the same payload is shown to everyone.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<BuilderView> {
    const c = ctx.config as unknown as BuilderConfig;
    const brief = c.brief ?? "";
    const available = aiAvailable();

    const specItems = collectSpecItems(ctx);

    // The AI result is cached under the "__ai__" pseudo-token. NEVER call Claude
    // here — this runs on every poll.
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = votes["__ai__"] as BuilderCache | undefined;
    const html =
      cached && typeof cached.html === "string" ? cached.html : "";

    return {
      hasResult: html.length > 0,
      available,
      brief,
      specCount: specItems.length,
      specItems,
      html,
      builtAt: cached?.builtAt,
      specUsed: cached?.specUsed,
    };
  },
  async handleAction(ctx, action) {
    // Participants can refine the spec; only facilitator/cohost can build.
    if (action.type === "addSpec") {
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(
        handle,
        text.slice(0, 2000),
        ctx.phase.id,
        "spec",
        action.token,
      );
      return { ok: true };
    }

    if (action.type !== "build")
      return { ok: false, reason: "unknown action" };

    // Building is a facilitation act — never participant-triggered.
    if (ctx.role === "participant")
      return { ok: false, reason: "not allowed" };
    if (!aiAvailable())
      return { ok: false, reason: "AI unavailable" };

    const c = ctx.config as unknown as BuilderConfig;
    const brief = c.brief ?? "";
    const specItems = collectSpecItems(ctx);
    const spec = assembleSpec(brief, specItems);
    if (!spec)
      return { ok: false, reason: "Nothing to build yet — add a brief or spec" };

    return withGenerateLock(ctx.store, ctx.phase.id, "builder", async () => {
      // Stream the large (~4000-token) HTML document — the service uses
      // .stream().finalMessage() under the hood, which avoids the SDK request
      // timeout that a non-streamed doc of this size would hit. The participant
      // spec text is wrapped as DATA (prompt-injection guard).
      const res = await generateText({
        label: "builder",
        tier: "reasoning",
        maxTokens: 8000,
        stream: true,
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(asData("spec", spec)),
      });
      if (!res.ok) return { ok: false, reason: res.reason };

      // EXISTING extraction: strip ```html fences, trim to <!doctype/<html>
      // bounds, validate.
      const html = extractHtml(res.data ?? "");
      if (!html || !/<html|<!doctype html/i.test(html))
        return { ok: false, reason: "No prototype produced" };

      const result: BuilderCache = {
        html,
        builtAt: Date.now(),
        specUsed: spec,
      };
      await ctx.store.castVote(ctx.phase.id, "__ai__", result);
      return { ok: true };
    });
  },
};
