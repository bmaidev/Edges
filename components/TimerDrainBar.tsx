"use client";

import { useEffect, useState } from "react";
import { drainState } from "@/components/useTimerMilestones";

// C6 full — a calm "the window is closing" bar for the projector. It stays
// invisible until the live clock enters the authored warning window
// (`warnSeconds`), then depletes linearly to zero — amber through the window, red
// in the final 30s. Derived entirely from the already-transported timerEndsAt; no
// server work, no state, no rev churn. Decorative (aria-hidden): the numerals and
// chime carry the real signal.
export function TimerDrainBar({
  endsAt,
  warnSeconds = 120,
}: {
  endsAt: number | null;
  warnSeconds?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  // Only a RUNNING deadline drains (a paused timer has no endsAt → no bar).
  const ms = endsAt != null ? Math.max(0, endsAt - now) : null;
  const drain = drainState(ms, warnSeconds);
  if (!drain) return null;

  return (
    <div className="h-1 w-full overflow-hidden bg-surface" aria-hidden>
      <div
        className={`h-full transition-[width] duration-300 ease-linear ${
          drain.urgent ? "bg-[#ff6b6b]" : "bg-[#ffb454]"
        }`}
        style={{ width: `${drain.pct}%` }}
      />
    </div>
  );
}
