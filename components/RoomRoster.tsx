"use client";

import { useEffect, useState } from "react";
import type { FacilitatorState, Participant } from "@/lib/types";

// D4 — the host's "who's in the room" roster: a presence dot per person (live /
// quiet), their handle, and how long ago they joined — sorted by join order so
// latecomers sit visibly at the bottom. Content-free: handles + timings only,
// which the facilitator already sees. Pure derivation over FacilitatorState
// (participants + roomHealth.dropped) — no new transport.

export interface RosterRow {
  handle: string;
  joinedAt: number;
  quiet: boolean; // heartbeat gone stale (in roomHealth.dropped)
  since: number | null; // ms since last seen, when quiet
}

export function rosterRows(
  participants: Participant[] | undefined,
  dropped: { handle: string; since: number }[] | undefined,
): RosterRow[] {
  const quietBy = new Map<string, number>();
  for (const d of dropped ?? []) quietBy.set(d.handle, d.since);
  return (participants ?? [])
    .map((p) => ({
      handle: p.handle,
      joinedAt: p.joinedAt,
      quiet: quietBy.has(p.handle),
      since: quietBy.get(p.handle) ?? null,
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

export function RoomRoster({ state }: { state: FacilitatorState }) {
  // A slow tick so the "joined Nm ago" labels stay roughly current without churn.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const rows = rosterRows(state.participants, state.roomHealth?.dropped);
  if (rows.length === 0) return null;
  const live = rows.filter((r) => !r.quiet).length;
  const quiet = rows.length - live;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">In the room</h3>
        <span className="text-xs text-muted tabular-nums">
          <span className="text-emerald-300">live {live}</span>
          {quiet > 0 && <span className="text-[#ffd27a]"> · quiet {quiet}</span>}
        </span>
      </div>
      <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
        {rows.map((r, i) => (
          <li
            key={`${r.handle}:${r.joinedAt}:${i}`}
            className="flex items-center gap-2 py-1 text-sm"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                r.quiet ? "bg-[#ffd27a]" : "bg-emerald-400"
              }`}
              title={r.quiet ? "quiet — heartbeat stale" : "live"}
            />
            <span className="min-w-0 flex-1 truncate">{r.handle}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {r.quiet && r.since != null
                ? `quiet ${ago(r.since)}`
                : `joined ${ago(now - r.joinedAt)} ago`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
