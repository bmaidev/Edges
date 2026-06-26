// Module: issuemap (EchoMind-style live issue-map).
//
// Instead of a flat transcript, the AI organises the room's contributions into
// ISSUES → POSITIONS on a shared, live map. The facilitator can FOCUS one issue
// (broadcast to the room) and PIN issues so a re-cluster never discards them.
//
// The key novelty: human-pinned structure is NEVER overwritten by the AI. When
// the facilitator re-clusters, any issue whose id is in the pinned set survives
// verbatim from the previous cached result; the freshly-generated issues are
// merged in alongside (deduped by id/label).
//
// AI rules (see the cluster-assist pattern in lib/cluster.ts):
//   - Claude is NEVER called in computeView (it runs every ~2s). The Anthropic
//     call happens only inside handleAction for a "refresh" action, and only
//     when ctx.role !== "participant".
//   - The result is cached via ctx.store.castVote(phaseId, "__ai__", result).
//     computeView reads votes, pulls votes["__ai__"], and returns it.
//   - When ANTHROPIC_API_KEY is absent, computeView still works (hasResult
//     false, available false) and "refresh" returns { ok:false }.
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__ai__"]      = { issues, generatedAt, inputCount } | undefined
//   votes["__focus__"]   = issueId | null — the issue broadcast to the room
//   votes["__pinned__"]  = string[]       — issue ids the AI must never discard

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

// ---- shared visibility helper (replicated from registry.server.ts `vis`) ----

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

export interface IssueMapConfig {
  label: string;
  // If omitted, cluster ALL submissions in the session.
  sourcePhaseId?: string;
}

const schema = z
  .object({
    label: z.string(),
    sourcePhaseId: z.string().optional(),
  })
  .passthrough();

// ---- domain shapes --------------------------------------------------------

export interface IssuePosition {
  text: string;
}

export interface Issue {
  id: string;
  label: string;
  summary: string;
  positions: IssuePosition[];
}

// The shape cached under the "__ai__" pseudo-vote.
interface IssueMapCache {
  issues: Issue[];
  generatedAt: number;
  inputCount: number;
}

// ---- view types (consumed by issuemap.client.tsx) -------------------------

export interface IssueView extends Issue {
  pinned: boolean;
}

export interface IssueMapView {
  hasResult: boolean;
  available: boolean; // is the AI configured (ANTHROPIC_API_KEY present)?
  stale: boolean; // result exists but the input count has since changed
  inputCount: number;
  issues: IssueView[];
  focusedId: string | null;
  generatedAt?: number;
}

// ---- pure vote readers (default-safe) -------------------------------------

function readCache(votes: Record<string, unknown>): IssueMapCache | null {
  const r = votes["__ai__"];
  if (r && typeof r === "object" && Array.isArray((r as IssueMapCache).issues)) {
    return r as IssueMapCache;
  }
  return null;
}

function readFocus(votes: Record<string, unknown>): string | null {
  const f = votes["__focus__"];
  return typeof f === "string" && f ? f : null;
}

function readPinned(votes: Record<string, unknown>): string[] {
  const p = votes["__pinned__"];
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
}

// ---- prompt construction (Claude call goes through @/lib/ai) --------------

const SYSTEM_PROMPT =
  "You organise short submissions from a workshop into a live issue-map: a " +
  "small set of ISSUES, each with the distinct POSITIONS people hold on it. " +
  "Return JSON only — no markdown, no commentary, no code fences.";

function buildUserPrompt(
  submissions: { id: string; text: string; tag?: string | null }[],
  topic: string,
): string {
  return `${topicLine(topic)}You will receive a list of submissions from a workshop.

Organise them into 3 to 6 ISSUES — the underlying topics the room is grappling with. For each issue, give a short label (≤6 words, sentence case), a one-line neutral summary, and the distinct POSITIONS people hold on that issue (each position is one short line, faithful to the submissions). Do not invent content, do not editorialise. Every issue must have at least one position.

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this shape:
{
  "issues": [
    {
      "id": "short-slug",
      "label": "Issue label",
      "summary": "One neutral line about the issue.",
      "positions": [{ "text": "A position someone holds." }]
    }
  ]
}`;
}

// Validate / map the parsed JSON into our domain shape (field validation
// preserved verbatim from the previous hand-rolled extractor).
function mapIssues(parsed: unknown): Issue[] {
  if (!parsed || typeof parsed !== "object") return [];
  const rawIssues = (parsed as { issues?: unknown }).issues;
  if (!Array.isArray(rawIssues)) return [];
  return rawIssues
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    .map((i, idx) => {
      const label = String(i.label ?? "").slice(0, 80).trim();
      const id =
        typeof i.id === "string" && i.id.trim()
          ? i.id.trim().slice(0, 60)
          : slugify(label) || `issue-${idx + 1}`;
      const summary = String(i.summary ?? "").slice(0, 280).trim();
      const positions = Array.isArray(i.positions)
        ? (i.positions as unknown[])
            .map((p) => {
              if (p && typeof p === "object" && "text" in p)
                return String((p as { text: unknown }).text ?? "").slice(0, 280).trim();
              if (typeof p === "string") return p.slice(0, 280).trim();
              return "";
            })
            .filter(Boolean)
            .map((t) => ({ text: t }))
        : [];
      return { id, label, summary, positions };
    })
    .filter((i) => i.label || i.positions.length > 0);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Merge: keep any PREVIOUS issue whose id is pinned, then add the freshly
// generated issues — deduped by id and (case-insensitively) by label, so a
// regenerated copy of a pinned issue never clobbers the human-kept one.
function mergePinned(
  previous: Issue[],
  generated: Issue[],
  pinned: string[],
): Issue[] {
  const pinnedSet = new Set(pinned);
  const kept = previous.filter((i) => pinnedSet.has(i.id));
  const seenIds = new Set(kept.map((i) => i.id));
  const seenLabels = new Set(kept.map((i) => i.label.toLowerCase()));
  const merged = [...kept];
  for (const g of generated) {
    if (seenIds.has(g.id) || seenLabels.has(g.label.toLowerCase())) continue;
    seenIds.add(g.id);
    seenLabels.add(g.label.toLowerCase());
    merged.push(g);
  }
  return merged;
}

function sourceSubmissions(ctx: ModuleContext, sourcePhaseId?: string) {
  const source = sourcePhaseId
    ? ctx.submissions.filter((s) => s.phaseId === sourcePhaseId)
    : ctx.submissions;
  return source;
}

// ---- module ---------------------------------------------------------------

export const issuemapModule: ModuleServerDef<IssueMapConfig> = {
  id: "issuemap",
  meta: {
    name: "Issue map",
    description:
      "AI organises the room's contributions into a live map of issues and the positions people hold — the facilitator can focus one issue for the room and pin issues so a re-cluster never discards human-kept structure.",
    icon: "sparkles",
  },
  schema,
  defaultConfig: {
    label: "Issue map",
  },
  // The map is room-facing (AI-organised, not raw personal submissions), so the
  // same payload is shown to everyone.
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { usesAi: true, gatherSource: "votes",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx): Promise<IssueMapView> {
    // Pure read — NEVER call Claude here (runs on every poll).
    const c = ctx.config as unknown as IssueMapConfig;
    const available = aiAvailable();

    // Live input count from the configured source (or all submissions).
    const inputCount = sourceSubmissions(ctx, c.sourcePhaseId).length;

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const cached = readCache(votes);
    const pinned = new Set(readPinned(votes));
    const focusedId = readFocus(votes);

    const issues: IssueView[] = (cached?.issues ?? []).map((i) => ({
      ...i,
      pinned: pinned.has(i.id),
    }));

    const hasResult = issues.length > 0;

    return {
      hasResult,
      available,
      // The cached map no longer reflects the room once the input set changes.
      stale: hasResult && cached != null && cached.inputCount !== inputCount,
      inputCount,
      issues,
      focusedId,
      generatedAt: cached?.generatedAt,
    };
  },
  async handleAction(ctx, action) {
    // Map (re)generation — never participant-triggered.
    if (action.type === "refresh") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      if (!aiAvailable()) return { ok: false, reason: "AI unavailable" };

      const c = ctx.config as unknown as IssueMapConfig;
      const allSubs = sourceSubmissions(ctx, c.sourcePhaseId);
      if (allSubs.length === 0)
        return { ok: false, reason: "No submissions to map yet" };

      // Cap before serialising — when sourcePhaseId is unset this synthesises
      // ALL submissions in the session, so a large room could blow the context
      // / truncate the JSON. Keep the most recent 150.
      const { kept } = capItems(allSubs, 150);
      const submissions = kept.map((s) => ({
        id: s.id,
        text: s.text,
        tag: s.tag,
      }));

      return withGenerateLock(ctx.store, ctx.phase.id, "issuemap", async () => {
        // Read prior state up front so we can merge in pinned issues.
        const votes = await ctx.store.readVotes(ctx.phase.id);
        const prior = readCache(votes);
        const pinned = readPinned(votes);

        const res = await generateJSON<{ issues?: unknown }>({
          label: "issuemap",
          tier: "reasoning",
          shape: "object",
          system: SYSTEM_PROMPT,
          user: buildUserPrompt(submissions, ctx.state.topic),
          // This map can cover the whole session, and Opus spends output tokens
          // on thinking first — give it real headroom so the JSON isn't cut off.
          maxTokens: 5000,
        });
        if (!res.ok) return { ok: false, reason: res.reason };

        const generated = mapIssues(res.data);
        // MERGE: pinned issues from the previous result survive verbatim; the
        // human-kept structure is never overwritten by the AI.
        const issues = mergePinned(prior?.issues ?? [], generated, pinned);
        if (issues.length === 0)
          return { ok: false, reason: "No issues produced" };

        const result: IssueMapCache = {
          issues,
          generatedAt: Date.now(),
          inputCount: submissions.length,
        };
        await ctx.store.castVote(ctx.phase.id, "__ai__", result);
        return { ok: true };
      });
    }

    // Focus an issue (broadcast to the room) — toggle off if already focused.
    if (action.type === "focus") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const issueId = String(action.payload?.issueId ?? "");
      if (!issueId) return { ok: false, reason: "missing issueId" };
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const current = readFocus(votes);
      const next = current === issueId ? null : issueId;
      await ctx.store.castVote(ctx.phase.id, "__focus__", next);
      return { ok: true };
    }

    // Pin / unpin an issue so a re-cluster keeps it.
    if (action.type === "pin" || action.type === "unpin") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const issueId = String(action.payload?.issueId ?? "");
      if (!issueId) return { ok: false, reason: "missing issueId" };
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const pinned = new Set(readPinned(votes));
      if (action.type === "pin") pinned.add(issueId);
      else pinned.delete(issueId);
      await ctx.store.castVote(ctx.phase.id, "__pinned__", Array.from(pinned));
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
