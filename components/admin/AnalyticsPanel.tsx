"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analytics } from "@/lib/analytics";

// F4 — the admin cross-session analytics view. Aggregate counts across every
// room: sessions run, participation, contributions, a sessions-over-time trend,
// and the most-used designs. No per-person data — account-less by design.
export function AnalyticsPanel({ code }: { code: string }) {
  const [data, setData] = useState<Analytics | null>(null);
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

      <p className="text-xs text-muted">
        Aggregate counts only — never any participant&apos;s words or identity. Edges keeps no
        per-person record.
      </p>
    </div>
  );
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
