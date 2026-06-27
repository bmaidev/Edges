"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analytics } from "@/lib/analytics";
import type { MetricsSummary } from "@/lib/session-metrics";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

type AnalyticsData = Analytics & { metrics?: MetricsSummary };

// F4 — the admin cross-session analytics view. Aggregate counts across every
// room: sessions run, participation, contributions, a sessions-over-time trend,
// and the most-used designs. No per-person data — account-less by design.
export function AnalyticsPanel({ code }: { code: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/analytics?code=${encodeURIComponent(code)}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="mt-4 text-sm text-muted">Loading…</p>;
  if (!data) return <p className="mt-4 text-sm text-[#ff8a8a]">Couldn&apos;t load analytics.</p>;

  if (data.sessionsRun === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        No sessions have run yet. Once you archive a session, its numbers roll up here.
      </p>
    );
  }

  const maxBucket = Math.max(1, ...data.trend.map((t) => t.sessions));

  return (
    <div className="mt-4 flex flex-col gap-6">
      {/* headline strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sessions run" value={data.sessionsRun} />
        <Stat label="People reached" value={data.totalParticipants} sub={`avg ${data.avgParticipants}/session`} />
        <Stat label="Contributions" value={data.totalContributions} sub={`avg ${data.avgContributions}/session`} />
        <Stat label="Rooms created" value={data.totalRooms} />
      </div>

      {/* trend */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Sessions over time</h3>
        <div className="mt-2 flex items-end gap-2">
          {data.trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1" title={`${t.sessions} session${t.sessions === 1 ? "" : "s"}, ${t.participants} joined`}>
              <div
                className="w-full rounded-t bg-accent/70"
                style={{ height: `${Math.round((t.sessions / maxBucket) * 80) + 4}px` }}
              />
              <span className="text-[10px] text-muted">{t.month.slice(5)}/{t.month.slice(2, 4)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* most-used designs */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Most-used designs</h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {data.topTemplates.map((t) => (
            <li key={t.name} className="flex items-center justify-between rounded-md bg-surface px-3 py-1.5">
              <span>{t.name}</span>
              <span className="text-muted">{t.count}×</span>
            </li>
          ))}
        </ul>
      </div>

      {/* F4 — method engagement + ended-early, from the de-identified metrics. */}
      {data.metrics && data.metrics.methods.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Method engagement
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <a
                href={`/api/admin/analytics?code=${encodeURIComponent(code)}&export=csv`}
                className="text-accent underline"
              >
                CSV
              </a>
              <a
                href={`/api/admin/analytics?code=${encodeURIComponent(code)}&export=json`}
                className="text-accent underline"
              >
                JSON
              </a>
              <button
                onClick={async () => {
                  if (!window.confirm("Clear all session metrics history? This can't be undone.")) return;
                  await fetch(`/api/admin/analytics?code=${encodeURIComponent(code)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "clear" }),
                  });
                  load();
                }}
                className="text-[#ff8a8a] underline"
              >
                Clear history
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">
            How much of the room each method drew in, averaged across sessions.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {data.metrics.methods.map((m) => (
              <li key={m.moduleId} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate">{methodLabel(m.moduleId)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent/70"
                    style={{ width: `${Math.round(m.avgEngagement * 100)}%` }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">
                  {Math.round(m.avgEngagement * 100)}% · {m.sessions}×
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {Math.round(data.metrics.endedEarlyRate * 100)}% of sessions ended before the
            final phase
            {data.metrics.suppressed > 0 && (
              <> · {data.metrics.suppressed} small session{data.metrics.suppressed === 1 ? "" : "s"} hidden (under {3} people)</>
            )}
            .
          </p>
        </div>
      )}

      <p className="text-xs text-muted">
        Aggregate counts only — never any participant&apos;s words or identity. Edges keeps no
        per-person record.
      </p>
    </div>
  );
}

function methodLabel(moduleId: string): string {
  return SERVER_MODULES[moduleId as ModuleKind]?.meta.name ?? moduleId;
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-2xl font-semibold text-white/90">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="text-[10px] text-muted">{sub}</p>}
    </div>
  );
}
