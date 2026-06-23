// Module: openspace (Open Space Technology marketplace).
//
// A PARTICIPANT-BUILT agenda. Anyone can propose a topic; others sign up to
// join it (soft intent, governed by the Law of Two Feet — leave any time); the
// facilitator places topics into a time×space grid (which time slot, which
// room/table). The proposer becomes the topic's "convener".
//
// State model (everything lives in submissions + the vote store):
//   - A topic is a submission for THIS phase, tagged "topic". Its submission id
//     is the topicId; its token is the convener's token; its handle is the
//     convener. Topic title is stored in submission.text.
//   - Signups: votes[token] = string[] of topicIds that token has joined.
//   - Grid placement: votes["__grid__"] = Record<topicId, { slot, space }>,
//     written only by a facilitator (role !== "participant").
//
// Convener handles/tokens are surfaced to participants only as a count; the
// convener name is included for facilitator/cohost/admin/projector roles.

import { z } from "zod";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

// ---- view types (consumed by openspace.client.tsx) ------------------------

export interface OpenSpaceCell {
  slot: number; // 0-based time slot index
  space: string; // one of config.spaces
}

export interface OpenSpaceTopic {
  id: string;
  title: string;
  convener?: string; // only present for non-participant roles
  signupCount: number;
  cell?: OpenSpaceCell; // present once the facilitator has placed it
}

export interface OpenSpaceView {
  slots: number; // number of time slots
  spaces: string[]; // named rooms/tables
  topics: OpenSpaceTopic[];
  mySignups: string[]; // topicIds the caller has joined
  grid: Record<string, OpenSpaceCell>; // topicId -> placement
}

// ---- config ---------------------------------------------------------------

export interface OpenSpaceConfig {
  label: string;
  slots: number;
  spaces: string[];
}

// Sentinel vote key for the facilitator-owned grid placement map. It can never
// collide with a real participant token.
const GRID_KEY = "__grid__";
const TOPIC_TAG = "topic";

// Local copy of the registry's vis() helper (admin mirrors the facilitator).
function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

const schema = z
  .object({
    label: z.string(),
    slots: z.number().int().positive(),
    spaces: z.array(z.string()).min(1),
  })
  .passthrough();

export const openspaceModule: ModuleServerDef<OpenSpaceConfig> = {
  id: "openspace",
  meta: {
    name: "Open Space",
    description:
      "A participant-built agenda: people propose topics, others sign up, and the facilitator places them into a time × space grid (Open Space Technology).",
  },
  schema,
  defaultConfig: {
    label: "Open Space",
    slots: 3,
    spaces: ["Table A", "Table B"],
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: {
    acceptsActions: true,
    liveResults: true,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx: ModuleContext): Promise<OpenSpaceView> {
    const c = ctx.config as unknown as OpenSpaceConfig;
    const slots = c.slots ?? 3;
    const spaces = Array.isArray(c.spaces) && c.spaces.length ? c.spaces : ["Room 1"];

    // Topics are submissions for this phase tagged "topic".
    const topicSubs = ctx.submissions.filter(
      (s) => s.phaseId === ctx.phase.id && s.tag === TOPIC_TAG,
    );

    const votes = await ctx.store.readVotes(ctx.phase.id);

    // Signup counts: count tokens whose signup array includes each topic id.
    // The grid key is not a participant signup list, so skip it.
    const signupCounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(votes)) {
      if (key === GRID_KEY) continue;
      const ids = Array.isArray(value) ? (value as string[]) : [];
      for (const id of ids)
        if (typeof id === "string")
          signupCounts[id] = (signupCounts[id] ?? 0) + 1;
    }

    const grid = ((votes[GRID_KEY] as Record<string, OpenSpaceCell>) ?? {}) || {};

    const mySignups: string[] =
      ctx.me && Array.isArray(votes[ctx.me.token])
        ? (votes[ctx.me.token] as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];

    const showConvener = ctx.role !== "participant";

    const topics: OpenSpaceTopic[] = topicSubs.map((s) => ({
      id: s.id,
      title: s.text,
      signupCount: signupCounts[s.id] ?? 0,
      ...(showConvener ? { convener: s.handle } : {}),
      ...(grid[s.id] ? { cell: grid[s.id] } : {}),
    }));

    return { slots, spaces, topics, mySignups, grid };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const c = ctx.config as unknown as OpenSpaceConfig;

    // --- propose: add a topic as a submission tagged "topic" ----------------
    if (action.type === "propose") {
      const title = String(action.payload?.title ?? "").trim();
      if (!title) return { ok: false, reason: "empty" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(
        handle,
        title.slice(0, 200),
        ctx.phase.id,
        TOPIC_TAG,
        action.token,
      );
      return { ok: true };
    }

    // --- join / leave: toggle a topicId in the caller's signup array --------
    if (action.type === "join" || action.type === "leave") {
      const topicId = String(action.payload?.topicId ?? "");
      if (!topicId) return { ok: false, reason: "missing topic" };
      // The topic must exist in this phase.
      const exists = ctx.submissions.some(
        (s) => s.phaseId === ctx.phase.id && s.tag === TOPIC_TAG && s.id === topicId,
      );
      if (!exists) return { ok: false, reason: "bad topic" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const mine = (
        Array.isArray(votes[action.token]) ? (votes[action.token] as string[]) : []
      )
        .filter((x): x is string => typeof x === "string")
        .slice();
      const idx = mine.indexOf(topicId);
      if (action.type === "join") {
        if (idx === -1) mine.push(topicId);
      } else if (idx !== -1) {
        mine.splice(idx, 1);
      }
      await ctx.store.castVote(ctx.phase.id, action.token, mine);
      return { ok: true };
    }

    // --- place / unplace: facilitator-only grid placement -------------------
    if (action.type === "place" || action.type === "unplace") {
      if (ctx.role === "participant")
        return { ok: false, reason: "facilitator only" };
      const topicId = String(action.payload?.topicId ?? "");
      if (!topicId) return { ok: false, reason: "missing topic" };
      const exists = ctx.submissions.some(
        (s) => s.phaseId === ctx.phase.id && s.tag === TOPIC_TAG && s.id === topicId,
      );
      if (!exists) return { ok: false, reason: "bad topic" };

      const votes = await ctx.store.readVotes(ctx.phase.id);
      const grid = (
        (votes[GRID_KEY] as Record<string, OpenSpaceCell>) ?? {}
      ) || {};

      if (action.type === "unplace") {
        delete grid[topicId];
      } else {
        const slot = Math.trunc(Number(action.payload?.slot));
        const space = String(action.payload?.space ?? "");
        const slots = c.slots ?? 3;
        const spaces = Array.isArray(c.spaces) ? c.spaces : [];
        if (!Number.isFinite(slot) || slot < 0 || slot >= slots)
          return { ok: false, reason: "bad slot" };
        if (!spaces.includes(space)) return { ok: false, reason: "bad space" };
        grid[topicId] = { slot, space };
      }
      // The grid is stored under the sentinel key so it never collides with a
      // participant's signup list.
      await ctx.store.castVote(ctx.phase.id, GRID_KEY, grid);
      return { ok: true };
    }

    return { ok: false, reason: "unknown action" };
  },
};
