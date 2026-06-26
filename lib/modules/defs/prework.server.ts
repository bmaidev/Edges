// Module: prework — async pre-work "jam" that runs BEFORE the live session.
//
// The strongest empirical finding in group ideation is that anonymous, parallel,
// WRITTEN divergence beats in-person verbal brainstorming (it sidesteps
// production blocking, evaluation apprehension, and anchoring). So prework moves
// divergent generation out of the room: people contribute in their own time,
// low-pressure and async, and the scarce live session is reserved for
// convergence. It's a close cousin of `capture` — same "mic + textarea, collect
// short text" mechanic — but distinguished by:
//   - an async, unhurried framing (a written facilitator brief; "add more any
//     time" rather than a ticking timer), and
//   - showing each person their OWN prior contributions, so they can build over
//     time across multiple sittings.
//
// State lives ONLY in ctx.store via addSubmission, read back through
// ctx.submissions. The projector never sees raw text — only counts. View types
// below are shared with prework.client.tsx.

import { z } from "zod";
import type { ModuleContext, ModuleServerDef, Role, Visibility } from "../types";

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

// ---- view-data types (consumed by prework.client.tsx) ---------------------

export interface PreworkContribution {
  text: string;
  at?: number; // createdAt, so the client can order / show "added so far"
}

// Participant view: the brief + prompt to write against, plus the caller's own
// prior contributions so they can see what they've already added and build on it.
export interface PreworkParticipantView {
  for: "participant";
  brief?: string;
  prompt: string;
  placeholder?: string;
  mine: PreworkContribution[]; // the caller's own submissions, oldest first
}

// Facilitator / projector view: aggregate progress only — never raw text. The
// projector shows a simple "N people have contributed M ideas" progress line.
export interface PreworkOverviewView {
  for: "overview";
  brief?: string;
  prompt: string;
  contributionCount: number;
  contributorCount: number;
}

export type PreworkView = PreworkParticipantView | PreworkOverviewView;

// ---- config ---------------------------------------------------------------

interface PreworkConfig {
  label: string;
  prompt: string;
  placeholder?: string;
  brief?: string; // a short written facilitator intro shown above the prompt
  multiSubmit?: boolean; // default true — async work is usually iterative
}

// ---- module ---------------------------------------------------------------

export const preworkModule: ModuleServerDef<PreworkConfig> = {
  id: "prework",
  meta: {
    name: "Pre-work jam",
    description:
      "Async, anonymous pre-session divergence: people add ideas in their own time and see their own running list — live time is saved for convergence.",
    icon: "pencil",
  },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string(),
      placeholder: z.string().optional(),
      brief: z.string().optional(),
      multiSubmit: z.boolean().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "Pre-work",
    prompt:
      "Before we meet, add your initial thoughts here — there are no wrong answers, and you can come back and add more any time.",
    placeholder: "Type or dictate an idea…",
    brief:
      "Take a few quiet minutes whenever it suits you. Working alone first, in writing, surfaces a wider range of ideas than waiting for the live session — so jot down whatever comes to mind. We'll build on these together when we meet.",
    multiSubmit: true,
  },
  // Participants contribute; facilitator/cohost watch the running tally; the
  // projector shows anonymous progress only (no raw text ever).
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: false, // explicitly async / unhurried — no countdown
    projectable: true,
  },
  computeView(ctx): PreworkView {
    const prompt = (ctx.config.prompt as string) ?? "";
    const brief = ctx.config.brief as string | undefined;

    if (ctx.role === "participant") {
      const mine = ctx.submissions
        .filter((s) => s.token === ctx.me?.token && s.phaseId === ctx.phase.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((s) => ({ text: s.text, at: s.createdAt }));
      return {
        for: "participant",
        brief,
        prompt,
        placeholder: ctx.config.placeholder as string | undefined,
        mine,
      };
    }

    // Overview (facilitator / cohost / projector / admin): counts only.
    const phaseSubs = ctx.submissions.filter(
      (s) => s.phaseId === ctx.phase.id,
    );
    const contributors = new Set<string>();
    for (const s of phaseSubs) if (s.token) contributors.add(s.token);
    return {
      for: "overview",
      brief,
      prompt,
      contributionCount: phaseSubs.length,
      contributorCount: contributors.size,
    };
  },
  async handleAction(ctx, action) {
    if (action.type !== "submit") return { ok: false, reason: "unknown action" };
    const text = String(action.payload?.text ?? "").trim();
    if (!text) return { ok: false, reason: "empty" };
    if (text.length > 2000) return { ok: false, reason: "too long" };
    const handle = ctx.me?.handle ?? "Anonymous";
    await ctx.store.addSubmission(handle, text, ctx.phase.id, null, action.token);
    return { ok: true };
  },
};
