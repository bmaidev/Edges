// ---- module: equity (participation-equity dashboard) ----------------------
//
// A facilitator-only analytics module. It surfaces *who is contributing* across
// the whole session so a facilitator can rebalance airtime before it calcifies.
//
// Why this is safe where most "equity"/"airtime" tools are not: our signal is
// CONTRIBUTION DATA (submissions the participant chose to make), not microphones
// or attention surveillance. It reads ctx.submissions (the full list, which the
// store only hands to non-participant roles) plus ctx.participants (the roster),
// counts contributions per person by matching submission.token -> participant.token,
// and computes silence / recency / spread. It is purely derived — no writes, no
// external calls, no store reads. The participant role never receives the data.

import { z } from "zod";
import type {
  ModuleContext,
  ModuleServerDef,
  Role,
  Visibility,
} from "../types";

// Replicated from registry.server.ts (modules are self-describing; we don't
// import private helpers across files). Admin sees whatever the facilitator sees.
function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

// ---- config ---------------------------------------------------------------

export interface EquityConfig {
  label: string;
  // Default true: show "Participant 1..N" by stable token order rather than
  // leaking handles. A facilitator who needs to act by name can turn it off.
  anonymize?: boolean;
}

// ---- view shapes (consumed by equity.client.tsx) --------------------------

export interface EquityPerson {
  label: string; // "Participant 3" when anonymized, else the handle
  count: number;
  lastActive?: number; // epoch ms of most recent contribution, if any
}

export interface EquityFacilitatorView {
  facilitatorOnly: false;
  perPerson: EquityPerson[]; // sorted by count desc, then label
  silentCount: number; // people with zero contributions
  total: number; // total contributions across everyone
  participantCount: number; // size of the roster
  median: number; // median contribution count (0 if no one)
  min: number;
  max: number;
  nudge?: string; // calm "ask-first" prompt when there are silent people
  anonymized: boolean;
}

export interface EquityParticipantView {
  facilitatorOnly: true;
}

export type EquityView = EquityFacilitatorView | EquityParticipantView;

// ---- helpers --------------------------------------------------------------

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
    : sorted[mid];
}

// ---- module ---------------------------------------------------------------

export const equityModule: ModuleServerDef<EquityConfig> = {
  id: "equity",
  meta: {
    name: "Participation equity",
    description:
      "Facilitator-only dashboard of contributions per person — surfaces silent voices so you can rebalance airtime. Reads contribution data, never microphones.",
    icon: "scale",
  },
  schema: z
    .object({
      label: z.string(),
      anonymize: z.boolean().optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Participation", anonymize: true },
  // Facilitator + cohost (+ admin) see it. It's *about* participants, so they
  // must never see it; the projector would expose it to the room, so hidden too.
  defaultVisibility: vis("hidden", "visible", "visible", "hidden"),
  capabilities: { gatherSource: "none",
    acceptsActions: false,
    liveResults: true,
    needsTimer: false,
    projectable: false,
  },
  computeView(ctx: ModuleContext): EquityView {
    // Hard guard: never compute or return the analytics for participants.
    if (ctx.role === "participant") {
      return { facilitatorOnly: true };
    }

    const anonymize = ctx.config.anonymize !== false; // default true

    // Stable token order = roster order. This anchors "Participant k" labels so
    // the same person keeps the same number across recomputes.
    const roster = ctx.participants;

    // Tally contributions per token across ALL phases.
    const counts = new Map<string, number>();
    const lastActive = new Map<string, number>();
    let total = 0;
    for (const s of ctx.submissions) {
      const tok = s.token;
      if (!tok) continue; // anonymous/untokened submissions can't be attributed
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
      const prev = lastActive.get(tok) ?? 0;
      if (s.createdAt > prev) lastActive.set(tok, s.createdAt);
      total++;
    }

    const perPerson: EquityPerson[] = roster.map((p, i) => {
      const count = counts.get(p.token) ?? 0;
      const la = lastActive.get(p.token);
      return {
        label: anonymize ? `Participant ${i + 1}` : p.handle,
        count,
        lastActive: la,
      };
    });

    // Sort by contributions desc; tie-break by label for a stable display.
    perPerson.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    const participantCount = roster.length;
    const allCounts = perPerson.map((p) => p.count);
    const silentCount = allCounts.filter((c) => c === 0).length;

    const nudge =
      silentCount > 0
        ? `${silentCount} ${
            silentCount === 1 ? "person hasn't" : "people haven't"
          } contributed — consider opening an anonymous prompt so it's easier to speak up.`
        : undefined;

    return {
      facilitatorOnly: false,
      perPerson,
      silentCount,
      total,
      participantCount,
      median: median(allCounts),
      min: allCounts.length ? Math.min(...allCounts) : 0,
      max: allCounts.length ? Math.max(...allCounts) : 0,
      nudge,
      anonymized: anonymize,
    };
  },
};
