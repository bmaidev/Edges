// F4 — the evidence layer. At archive time we capture a de-identified, CONTENT-
// FREE SessionMetrics (per-phase responder COUNTS, never who or what), durable in
// its own index so the live data can wipe. The aggregate below turns many of these
// into method-engagement + ended-early signals — with N<3 suppression so a tiny
// room can never be singled out. Pure (no store) → trivially unit-tested.

export interface PhaseMetric {
  moduleId: string;
  responded: number; // distinct participants who contributed to this phase
}

export interface SessionMetrics {
  slug: string;
  name: string;
  endedAt: number;
  design: string; // the design label (saved blueprint / built-in template / "Custom")
  participantCount: number;
  endedEarly: boolean; // archived before reaching the final phase
  phases: PhaseMetric[];
}

// A room with fewer than this many participants is excluded from engagement/early
// stats — too small to aggregate without effectively pointing at individuals.
export const MIN_N = 3;

export interface MethodMetric {
  moduleId: string;
  sessions: number; // counted sessions that included this module
  avgEngagement: number; // mean (responded / present) across them, 0..1
}

export interface MetricsSummary {
  totalSessions: number; // all captured metrics records
  countedSessions: number; // those with participantCount >= MIN_N
  suppressed: number; // excluded by the N<3 floor
  endedEarlyRate: number; // fraction of counted sessions archived before the end
  methods: MethodMetric[]; // per module, most-used first
}

export function computeMethodMetrics(metrics: SessionMetrics[]): MetricsSummary {
  const counted = metrics.filter((m) => m.participantCount >= MIN_N);
  const suppressed = metrics.length - counted.length;

  // Per module: accumulate each session's engagement (responded / present), then
  // average. A phase appearing twice in one session is averaged within it first.
  const acc: Record<string, { sessions: number; engagementSum: number }> = {};
  for (const m of counted) {
    const present = Math.max(1, m.participantCount);
    const perModule: Record<string, number[]> = {};
    for (const ph of m.phases) {
      (perModule[ph.moduleId] ??= []).push(Math.min(1, ph.responded / present));
    }
    for (const [moduleId, engagements] of Object.entries(perModule)) {
      const a = (acc[moduleId] ??= { sessions: 0, engagementSum: 0 });
      a.sessions += 1;
      a.engagementSum += engagements.reduce((s, e) => s + e, 0) / engagements.length;
    }
  }

  const methods: MethodMetric[] = Object.entries(acc)
    .map(([moduleId, a]) => ({
      moduleId,
      sessions: a.sessions,
      avgEngagement: Math.round((a.engagementSum / a.sessions) * 100) / 100,
    }))
    .sort((a, b) => b.sessions - a.sessions || (a.moduleId < b.moduleId ? -1 : 1));

  const endedEarly = counted.filter((m) => m.endedEarly).length;

  return {
    totalSessions: metrics.length,
    countedSessions: counted.length,
    suppressed,
    endedEarlyRate: counted.length ? Math.round((endedEarly / counted.length) * 100) / 100 : 0,
    methods,
  };
}

// CSV export of the raw (still de-identified) metrics — one row per session.
export function metricsToCsv(metrics: SessionMetrics[]): string {
  const head = ["endedAt", "name", "design", "participantCount", "endedEarly", "phases"];
  const rows = metrics.map((m) => [
    new Date(m.endedAt).toISOString(),
    csvCell(m.name),
    csvCell(m.design),
    String(m.participantCount),
    m.endedEarly ? "yes" : "no",
    csvCell(m.phases.map((p) => `${p.moduleId}:${p.responded}`).join(" ")),
  ]);
  return [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
