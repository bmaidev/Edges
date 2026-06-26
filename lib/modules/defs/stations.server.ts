// Module: stations — Shift & Share.
//
// Intact small groups tour a set of named stations, one round per station.
// Unlike World Café (where travellers scatter) the groups stay FIXED for the
// whole activity; what changes each round is which station each group is parked
// at. Over `stations.length` rounds every group visits every station exactly
// once (a Latin-square rotation via `stationFor`).
//
// State lives entirely in ctx.store votes (no store/KV import):
//   votes["__round__"] = number — the current round (default 0), advanced by
//                                 the facilitator's "nextRound" action.
//
// Groups are formed ONCE with `groupRound(tokens, groupSize, 0)` (round 0, so
// membership is stable across 2s polls) and computeView never writes. Optional
// per-group notes are harvested as submissions tagged `g${groupIndex}:r${round}`.

import { z } from "zod";
import {
  appendExtras,
  cohortTokens,
  freezeCohort,
  groupOf,
  groupRound,
  stationFor,
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

export interface StationsConfig {
  label: string;
  stations: string[]; // named stations/tables, in rotation order
  groupSize?: number; // people per intact group (default 3)
  captureNotes?: boolean; // let each group jot notes at its station
  prompt?: string; // optional standing instruction shown at every station
}

const schema = z
  .object({
    label: z.string(),
    stations: z.array(z.string()).min(1),
    groupSize: z.number().int().positive().optional(),
    captureNotes: z.boolean().optional(),
    prompt: z.string().optional(),
  })
  .passthrough();

// ---- view types -----------------------------------------------------------

export interface StationsParticipantView {
  round: number;
  stationName: string;
  groupMembers: string[]; // handles of everyone in my group (including me)
  totalStations: number;
  prompt?: string;
  captureNotes: boolean;
  myNoteSubmitted: boolean;
  ungrouped?: boolean; // no group could be formed for me
}

export interface StationsRotationRow {
  groupIndex: number;
  members: string[]; // handles
  stationName: string;
}

export interface StationsProjectorView {
  round: number;
  totalStations: number;
  stations: string[];
  rotation: StationsRotationRow[];
  prompt?: string;
}

// ---- vote-state reader (pure; default-safe) -------------------------------

function readRound(votes: Record<string, unknown>): number {
  const r = votes["__round__"];
  return typeof r === "number" && Number.isFinite(r) && r >= 0
    ? Math.floor(r)
    : 0;
}

// D4 — the intact touring groups, formed ONCE from the FROZEN cohort so a
// mid-tour join can't reshuffle a group's membership; latecomers fold into the
// smallest group. computeView and the note handler share this so a note's group
// tag always matches the group the participant is shown.
function buildGroups(
  ctx: ModuleContext,
  votes: Record<string, unknown>,
): string[][] {
  const groupSize = (ctx.config.groupSize as number | undefined) ?? 3;
  const { cohort, extras } = cohortTokens(
    votes,
    ctx.participants.map((p) => p.token),
  );
  return appendExtras(groupRound(cohort, groupSize, 0), extras);
}

// ---- module ---------------------------------------------------------------

export const stationsModule: ModuleServerDef<StationsConfig> = {
  id: "stations",
  meta: {
    name: "Stations",
    description:
      "Shift & Share — intact small groups tour a set of named stations, one round per station, so every group visits every station in turn.",
    icon: "map-pin",
  },
  schema,
  defaultConfig: {
    label: "Stations",
    stations: ["Station 1", "Station 2", "Station 3"],
    groupSize: 3,
    captureNotes: false,
    prompt: "Explore this station together, then capture what stands out.",
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { gatherSource: "submissions",
    acceptsActions: true,
    liveResults: true,
    needsTimer: true,
    projectable: true,
  },
  async onEnter(ctx) {
    // Snapshot the roster so the intact touring groups never reshuffle on a join.
    await freezeCohort(ctx.store, ctx.phase.id, ctx.participants.map((p) => p.token));
  },
  async computeView(ctx) {
    const stations = (ctx.config.stations as string[]) ?? [];
    const captureNotes = Boolean(ctx.config.captureNotes);
    const prompt = (ctx.config.prompt as string | undefined) || undefined;

    const votes = await ctx.store.readVotes(ctx.phase.id);
    const round = readRound(votes);

    // Intact groups, formed ONCE from the frozen cohort so membership never shifts.
    const groups = buildGroups(ctx, votes);

    // Map a token → handle for rendering.
    const handleOf = new Map(ctx.participants.map((p) => [p.token, p.handle]));
    const handles = (g: string[]) =>
      g.map((t) => handleOf.get(t) ?? "—");

    // ---- participant: just my group + my station this round ----
    if (ctx.role === "participant") {
      const me = ctx.me;
      const found = me ? groupOf(groups, me.token) : null;
      if (!me || !found) {
        const view: StationsParticipantView = {
          round,
          stationName: "",
          groupMembers: [],
          totalStations: stations.length,
          prompt,
          captureNotes,
          myNoteSubmitted: false,
          ungrouped: true,
        };
        return view;
      }
      const stationIdx = stationFor(found.index, round, stations.length);
      const tag = `g${found.index}:r${round}`;
      const myNoteSubmitted = ctx.submissions.some(
        (s) =>
          s.phaseId === ctx.phase.id && s.tag === tag && s.token === me.token,
      );
      const view: StationsParticipantView = {
        round,
        stationName: stations[stationIdx] ?? "—",
        groupMembers: handles(found.group),
        totalStations: stations.length,
        prompt,
        captureNotes,
        myNoteSubmitted,
      };
      return view;
    }

    // ---- facilitator / projector: the whole rotation map this round ----
    const rotation: StationsRotationRow[] = groups.map((g, groupIndex) => {
      const stationIdx = stationFor(groupIndex, round, stations.length);
      return {
        groupIndex,
        members: handles(g),
        stationName: stations[stationIdx] ?? "—",
      };
    });

    const view: StationsProjectorView = {
      round,
      totalStations: stations.length,
      stations,
      rotation,
      prompt,
    };
    return view;
  },
  async handleAction(ctx, action) {
    // Facilitator-only: advance every group to its next station.
    if (action.type === "nextRound") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const res = await ctx.store.withLock(`round:${ctx.phase.id}`, async () => {
        const votes = await ctx.store.readVotes(ctx.phase.id);
        await ctx.store.castVote(ctx.phase.id, "__round__", readRound(votes) + 1);
      });
      return res.ok ? { ok: true } : { ok: false, reason: "Advancing — one moment." };
    }

    // Per-group note capture (only when enabled).
    if (action.type === "note") {
      if (!Boolean(ctx.config.captureNotes))
        return { ok: false, reason: "notes off" };
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      if (text.length > 2000) return { ok: false, reason: "too long" };

      const me = ctx.me;
      if (!me) return { ok: false, reason: "no participant" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const round = readRound(votes);
      const groups = buildGroups(ctx, votes);
      const found = groupOf(groups, me.token);
      if (!found) return { ok: false, reason: "no group" };
      await ctx.store.addSubmission(
        me.handle,
        text,
        ctx.phase.id,
        `g${found.index}:r${round}`,
        action.token,
      );
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
