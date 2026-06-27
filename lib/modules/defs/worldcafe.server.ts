// Module: worldcafe — World Café cross-pollination.
//
// Fixed tables, each with ONE persistent host chosen at round 0. Everyone else
// (the "travellers") scatters to a different table each round, carrying ideas
// between tables while the host stays put and weaves the conversation together
// around a single shared question.
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__round__"] = number — the current round (default 0)
// Tables are computed deterministically by `cafeRound(tokens, n, round)`, so the
// assignment is stable across 2s polls and computeView never writes. The round
// is advanced by a non-participant "nextRound" action. Optional per-table
// insights are harvested as submissions tagged `t${tableIndex}:r${round}`.

import { z } from "zod";
import {
  appendCafeExtras,
  cafeRound,
  cohortTokens,
  freezeCohort,
} from "../groups";
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

export interface WorldCafeConfig {
  label: string;
  prompt: string; // the single shared question that travels between tables
  tables?: number; // fixed table count; derived ~ceil(n/4) when omitted
  captureNotes?: boolean; // let travellers record the table's shared insight
}

const schema = z
  .object({
    label: z.string(),
    prompt: z.string(),
    tables: z.number().int().positive().optional(),
    captureNotes: z.boolean().optional(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

export interface WorldCafeParticipantView {
  round: number;
  prompt: string;
  tableIndex: number; // 0-based table this person is at this round
  isHost: boolean;
  hostName: string; // handle of this table's persistent host
  tablemates: string[]; // handles of everyone else at the table
  captureNotes: boolean;
  myNoteSubmitted: boolean;
  ungrouped?: boolean; // no table could be formed for me (e.g. solo / no record)
}

export interface WorldCafeTable {
  tableIndex: number;
  hostName: string;
  members: string[]; // handles of everyone at the table this round
}

export interface WorldCafeOverview {
  round: number;
  prompt: string;
  tableCount: number;
  captureNotes: boolean;
  tables: WorldCafeTable[];
}

// ---- vote-state reader (pure; default-safe) -------------------------------

function readRound(votes: Record<string, unknown>): number {
  const r = votes["__round__"];
  return typeof r === "number" && Number.isFinite(r) && r >= 0
    ? Math.floor(r)
    : 0;
}

// Resolve the configured (or derived) table count for the current room size.
function tableCount(ctx: ModuleContext): number {
  const configured = ctx.config.tables as number | undefined;
  if (typeof configured === "number" && configured > 0)
    return Math.floor(configured);
  const n = ctx.participants.length;
  return Math.max(1, Math.ceil(n / 4));
}

// D4 — the round's tables, computed from the FROZEN cohort (so hosts + seated
// travellers never shift on a mid-session join) with latecomers folded in as
// extra travellers. computeView and the note handler share this so a note's
// table tag always matches what the participant is shown.
function buildTables(
  ctx: ModuleContext,
  votes: Record<string, unknown>,
  round: number,
): { host: string | null; members: string[] }[] {
  const numTables = tableCount(ctx);
  const { cohort, extras } = cohortTokens(
    votes,
    ctx.participants.map((p) => p.token),
    { hold: ctx.config.latecomerHold === true },
  );
  return appendCafeExtras(cafeRound(cohort, numTables, round), extras);
}

// ---- module ---------------------------------------------------------------

export const worldcafeModule: ModuleServerDef<WorldCafeConfig> = {
  id: "worldcafe",
  meta: {
    name: "World Café",
    description:
      "Fixed tables with a persistent host each; everyone else scatters to a new table each round, cross-pollinating ideas around one shared question.",
    icon: "coffee",
  },
  schema,
  defaultConfig: {
    label: "World Café",
    prompt: "What would it take to make real progress on this?",
    captureNotes: true,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  async onEnter(ctx) {
    // Snapshot the roster so hosts + table membership can't reshuffle on a join.
    await freezeCohort(ctx.store, ctx.phase.id, ctx.participants.map((p) => p.token));
  },
  async computeView(ctx) {
    const prompt = (ctx.config.prompt as string) ?? "";
    const captureNotes = Boolean(ctx.config.captureNotes);

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const round = readRound(votes);

    const numTables = tableCount(ctx);
    const tables = buildTables(ctx, votes, round);

    // token → handle lookup for mapping the deterministic table membership.
    const handleOf = new Map(ctx.participants.map((p) => [p.token, p.handle]));
    const nameOf = (token: string | null): string =>
      (token && handleOf.get(token)) || "—";

    // ---- participant: just my table this round ----
    if (ctx.role === "participant") {
      const me = ctx.me;
      const myIdx = me
        ? tables.findIndex((t) => t.members.includes(me.token))
        : -1;
      if (!me || myIdx === -1) {
        const view: WorldCafeParticipantView = {
          round,
          prompt,
          tableIndex: 0,
          isHost: false,
          hostName: "—",
          tablemates: [],
          captureNotes,
          myNoteSubmitted: false,
          ungrouped: true,
        };
        return view;
      }
      const table = tables[myIdx];
      const isHost = table.host === me.token;
      const tag = `t${myIdx}:r${round}`;
      const myNoteSubmitted = ctx.submissions.some(
        (s) =>
          s.phaseId === ctx.phase.id &&
          s.tag === tag &&
          s.token === me.token,
      );
      const view: WorldCafeParticipantView = {
        round,
        prompt,
        tableIndex: myIdx,
        isHost,
        hostName: nameOf(table.host),
        tablemates: table.members
          .filter((tok) => tok !== me.token)
          .map((tok) => nameOf(tok)),
        captureNotes,
        myNoteSubmitted,
      };
      return view;
    }

    // ---- facilitator / projector: the full table map ----
    const map: WorldCafeTable[] = tables.map((t, i) => ({
      tableIndex: i,
      hostName: nameOf(t.host),
      members: t.members.map((tok) => nameOf(tok)),
    }));
    const view: WorldCafeOverview = {
      round,
      prompt,
      tableCount: numTables,
      captureNotes,
      tables: map,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Facilitator-only round control.
    if (action.type === "nextRound") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const res = await ctx.store.withLock(`round:${ctx.phase.id}`, async () => {
        const votes = await ctx.store.readVotes(ctx.phase.id);
        await ctx.store.castVote(ctx.phase.id, "__round__", readRound(votes) + 1);
      });
      return res.ok ? { ok: true } : { ok: false, reason: "Advancing — one moment." };
    }

    // Participant note: the table's shared insight for this round.
    if (action.type === "note") {
      if (!ctx.config.captureNotes) return { ok: false, reason: "disabled" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };

      const me = ctx.me;
      if (!me) return { ok: false, reason: "no participant" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const round = readRound(votes);
      const tables = buildTables(ctx, votes, round);
      const myIdx = tables.findIndex((t) => t.members.includes(me.token));
      if (myIdx === -1) return { ok: false, reason: "no table" };

      await ctx.store.addSubmission(
        me.handle,
        text,
        ctx.phase.id,
        `t${myIdx}:r${round}`,
        action.token,
      );
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
