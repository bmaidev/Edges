"use client";

import { useState } from "react";

type Health = { present: number; here: number; dropped: { handle: string; since: number }[] };

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

// H1 full — the "who's still with you" chip, now tap-to-expand into a calm sheet
// grouping the room into "With you" and "Dropped off" (handle + last-seen), so a
// facilitator can decide whether to pause before advancing. Handle only — no
// token, no content.
export function RoomHealthChip({ health }: { health: Health }) {
  const [open, setOpen] = useState(false);
  if (health.present <= 0) return null;
  const dropped = health.dropped;

  return (
    <span className="relative text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`tabular-nums ${dropped.length > 0 ? "text-[#ffd27a] hover:text-[#ffe6ad]" : "text-muted hover:text-white"}`}
        title="Who's still with you — tap for detail"
      >
        {health.here} of {health.present} with you
        {dropped.length > 0 ? " ▾" : ""}
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-30 w-60 rounded-lg border border-border bg-bg p-3 text-left shadow-lg">
          <p className="text-emerald-300">With you: {health.here}</p>
          {dropped.length > 0 ? (
            <>
              <p className="mt-2 text-[#ffd27a]">Dropped off: {dropped.length}</p>
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {dropped.map((d, i) => (
                  <li key={i} className="flex justify-between text-muted">
                    <span className="truncate">{d.handle}</span>
                    <span className="shrink-0 tabular-nums">{ago(d.since)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-muted">Everyone&apos;s connected.</p>
          )}
        </div>
      )}
    </span>
  );
}

// H1 — a soft, non-blocking caption when a meaningful share has dropped, shown
// near Advance so the facilitator can choose to pause first.
export function advanceHealthCaption(health?: Health | null): string | null {
  if (!health || health.present < 4) return null;
  const n = health.dropped.length;
  if (n >= 2 && n / health.present >= 0.25) {
    return `${n} people look disconnected — you might pause before advancing.`;
  }
  return null;
}
