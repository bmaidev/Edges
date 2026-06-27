// F4 — cross-session analytics. A PURE rollup over the Room records already in
// listRooms() — O(rooms), zero archive fan-out, no new storage. Reuses the A5
// `lastRun` counts (set at archive time) + the room's template/blueprint label.
//
// Aggregate-ONLY by construction: counts, never content. Per-participant tracking
// is structurally impossible (account-less, no persistent participant identity),
// which is the honest framing — this is "method usage across all rooms", never
// "your people".

import type { Room } from "./rooms";

export interface AnalyticsTrendBucket {
  month: string; // "YYYY-MM" (UTC)
  sessions: number;
  participants: number;
}

export interface AnalyticsTemplate {
  name: string;
  count: number;
}

export interface Analytics {
  totalRooms: number;
  sessionsRun: number; // rooms that actually ran (have a lastRun)
  totalParticipants: number;
  avgParticipants: number;
  totalContributions: number;
  avgContributions: number;
  trend: AnalyticsTrendBucket[]; // sessions over time, by UTC month, ascending
  topTemplates: AnalyticsTemplate[]; // most-used design (built-in or saved), top 5
}

// The human label for what a room ran: a saved blueprint's name, else its
// built-in templateId, else "Custom".
function designLabel(r: Room): string {
  if (r.blueprint?.name) return r.blueprint.name;
  if (r.templateId) return r.templateId;
  return "Custom";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeAnalytics(rooms: Room[]): Analytics {
  // Only rooms that actually ran (and are non-sample) count toward run stats.
  const run = rooms.filter((r) => r.lastRun && !r.isSample);

  let totalParticipants = 0;
  let totalContributions = 0;
  const buckets: Record<string, { sessions: number; participants: number }> = {};
  const templates: Record<string, number> = {};

  for (const r of run) {
    const lr = r.lastRun!;
    totalParticipants += lr.participantCount;
    totalContributions += lr.submissionCount;

    const month = new Date(lr.endedAt).toISOString().slice(0, 7); // YYYY-MM (UTC)
    const b = (buckets[month] ??= { sessions: 0, participants: 0 });
    b.sessions += 1;
    b.participants += lr.participantCount;

    const label = designLabel(r);
    templates[label] = (templates[label] ?? 0) + 1;
  }

  const sessionsRun = run.length;
  const trend: AnalyticsTrendBucket[] = Object.keys(buckets)
    .sort()
    .map((month) => ({ month, sessions: buckets[month].sessions, participants: buckets[month].participants }));

  const topTemplates: AnalyticsTemplate[] = Object.keys(templates)
    .map((name) => ({ name, count: templates[name] }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))
    .slice(0, 5);

  return {
    totalRooms: rooms.filter((r) => !r.isSample).length,
    sessionsRun,
    totalParticipants,
    avgParticipants: sessionsRun ? round1(totalParticipants / sessionsRun) : 0,
    totalContributions,
    avgContributions: sessionsRun ? round1(totalContributions / sessionsRun) : 0,
    trend,
    topTemplates,
  };
}
