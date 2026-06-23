// Module: consult — Troika / Wise Crowds consulting loop.
//
// Fixed small groups (trios, with a leftover pair forming a duo) run a peer
// consulting protocol. Each round, ONE member is the "client" who brings a
// challenge; the others are "consultants" who advise. The magic move is that
// the client goes SILENT while the consultants think aloud — so the client
// can't steer, defend, or explain away the advice. This is the digital
// equivalent of the client turning their back to the group.
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__round__"]  = number   — the current round (default 0)
//   votes["__silent__"] = boolean  — client-silent sub-phase flag (default false)
// Advice is harvested as submissions tagged `${groupId}:${round}`.
//
// Groups are formed deterministically by participant index (group k =
// participants[3k .. 3k+2]), so the assignment is stable across 2s polls and
// computeView never writes.

import { z } from "zod";
import type { Participant } from "@/lib/types";
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

export type ConsultFormat = "troika" | "wisecrowds";

export interface ConsultConfig {
  label: string;
  format?: ConsultFormat;
  prompt: string; // what the client brings to the group
  phaseSeconds?: { present: number; advise: number };
}

const schema = z
  .object({
    label: z.string(),
    format: z.enum(["troika", "wisecrowds"]).default("troika"),
    prompt: z.string(),
    phaseSeconds: z
      .object({ present: z.number(), advise: z.number() })
      .optional(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

export interface ConsultParticipantView {
  format: ConsultFormat;
  prompt: string;
  round: number;
  role: "client" | "consultant";
  groupMembers: string[]; // handles of everyone in my group (including me)
  clientName: string; // handle of this round's client
  silent: boolean; // is the client-silent sub-phase active
  myAdviceSubmitted: boolean;
  ungrouped?: boolean; // no group could be formed for me (e.g. solo / no record)
}

export interface ConsultGroupAdvice {
  text: string;
  handle: string;
}

export interface ConsultGroupSummary {
  groupId: number;
  members: string[];
  clientName: string;
  consultants: string[];
  advice: ConsultGroupAdvice[]; // advice harvested for this group, this round
}

export interface ConsultProjectorView {
  format: ConsultFormat;
  prompt: string;
  round: number;
  silent: boolean;
  phaseSeconds?: { present: number; advise: number };
  groups: ConsultGroupSummary[];
}

// ---- group formation (pure, deterministic by participant index) -----------

interface Group {
  groupId: number;
  members: Participant[];
}

// Trios from participants by index: group k = participants[3k .. 3k+2]. A
// leftover pair forms a duo. A lone leftover person is folded into the
// previous group (so nobody is stranded solo) when possible.
function formGroups(participants: Participant[]): Group[] {
  const groups: Group[] = [];
  for (let i = 0; i < participants.length; i += 3) {
    groups.push({
      groupId: groups.length,
      members: participants.slice(i, i + 3),
    });
  }
  // If the final group is a single leftover and there's a prior group, merge
  // it back so we never run a "group" of one.
  if (groups.length >= 2) {
    const last = groups[groups.length - 1];
    if (last.members.length === 1) {
      groups[groups.length - 2].members.push(...last.members);
      groups.pop();
    }
  }
  return groups;
}

function findMyGroup(
  groups: Group[],
  token: string | null | undefined,
): Group | null {
  if (!token) return null;
  return groups.find((g) => g.members.some((m) => m.token === token)) ?? null;
}

// ---- vote-state readers (pure; default-safe) ------------------------------

function readRound(votes: Record<string, unknown>): number {
  const r = votes["__round__"];
  return typeof r === "number" && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}

function readSilent(votes: Record<string, unknown>): boolean {
  return votes["__silent__"] === true;
}

// ---- module ---------------------------------------------------------------

export const consultModule: ModuleServerDef<ConsultConfig> = {
  id: "consult",
  meta: {
    name: "Consult",
    description:
      "Troika / Wise Crowds peer-consulting loop — fixed small groups take turns as the 'client' who goes silent while consultants advise, so the advice can't be steered.",
    icon: "users",
  },
  schema,
  defaultConfig: {
    label: "Consult",
    format: "troika",
    prompt: "Bring a real challenge you're stuck on.",
    phaseSeconds: { present: 120, advise: 240 },
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  async computeView(ctx) {
    const format = (ctx.config.format as ConsultFormat) ?? "troika";
    const prompt = (ctx.config.prompt as string) ?? "";
    const phaseSeconds = ctx.config.phaseSeconds as
      | { present: number; advise: number }
      | undefined;

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const round = readRound(votes);
    const silent = readSilent(votes);

    const groups = formGroups(ctx.participants);

    // ---- participant: just my group, my role, this round ----
    if (ctx.role === "participant") {
      const me = ctx.me;
      const group = findMyGroup(groups, me?.token ?? null);
      if (!me || !group || group.members.length === 0) {
        const view: ConsultParticipantView = {
          format,
          prompt,
          round,
          role: "consultant",
          groupMembers: [],
          clientName: "",
          silent,
          myAdviceSubmitted: false,
          ungrouped: true,
        };
        return view;
      }
      const G = group.members.length;
      const clientIdx = G > 0 ? round % G : 0;
      const client = group.members[clientIdx];
      const amClient = client.token === me.token;
      const tag = `${group.groupId}:${round}`;
      const myAdviceSubmitted = ctx.submissions.some(
        (s) =>
          s.phaseId === ctx.phase.id &&
          s.tag === tag &&
          s.token === me.token,
      );
      const view: ConsultParticipantView = {
        format,
        prompt,
        round,
        role: amClient ? "client" : "consultant",
        groupMembers: group.members.map((m) => m.handle),
        clientName: client.handle,
        silent,
        myAdviceSubmitted,
      };
      return view;
    }

    // ---- facilitator / projector: role map + harvested advice ----
    const summaries: ConsultGroupSummary[] = groups.map((g) => {
      const G = g.members.length;
      const clientIdx = G > 0 ? round % G : 0;
      const client = g.members[clientIdx];
      const tag = `${g.groupId}:${round}`;
      const advice = ctx.submissions
        .filter((s) => s.phaseId === ctx.phase.id && s.tag === tag)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((s) => ({ text: s.text, handle: s.handle }));
      return {
        groupId: g.groupId,
        members: g.members.map((m) => m.handle),
        clientName: client ? client.handle : "—",
        consultants: g.members
          .filter((m) => !client || m.token !== client.token)
          .map((m) => m.handle),
        advice,
      };
    });

    const view: ConsultProjectorView = {
      format,
      prompt,
      round,
      silent,
      phaseSeconds,
      groups: summaries,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Facilitator-only round/phase controls.
    if (action.type === "nextRound") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const res = await ctx.store.withLock(`round:${ctx.phase.id}`, async () => {
        const votes = await ctx.store.readVotes(ctx.phase.id);
        // Advancing the round resets the silent flag — each round starts open.
        await ctx.store.castVote(ctx.phase.id, "__round__", readRound(votes) + 1);
        await ctx.store.castVote(ctx.phase.id, "__silent__", false);
      });
      return res.ok ? { ok: true } : { ok: false, reason: "Advancing — one moment." };
    }

    if (action.type === "setSilent") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const silent = action.payload?.silent === true;
      await ctx.store.castVote(ctx.phase.id, "__silent__", silent);
      return { ok: true };
    }

    if (action.type === "advise") {
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };

      const me = ctx.me;
      if (!me) return { ok: false, reason: "no participant" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const round = readRound(votes);
      const groups = formGroups(ctx.participants);
      const group = findMyGroup(groups, me.token);
      if (!group) return { ok: false, reason: "no group" };

      const G = group.members.length;
      const clientIdx = G > 0 ? round % G : 0;
      const client = group.members[clientIdx];
      // The client doesn't advise themselves.
      if (client && client.token === me.token)
        return { ok: false, reason: "client cannot advise" };

      await ctx.store.addSubmission(
        me.handle,
        text,
        ctx.phase.id,
        `${group.groupId}:${round}`,
        action.token,
      );
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
