"use client";

import { useEffect, useState } from "react";

// Renders mm:ss remaining until `endsAt` (epoch ms) while RUNNING. When PAUSED
// (endsAt null but `remainingMs` set) it freezes the numeral — never blanks — and
// onElapsed is suppressed. Shows "—" only when truly idle (both null).
export function Countdown({
  endsAt,
  remainingMs = null,
  onElapsed,
  className = "",
}: {
  endsAt: number | null;
  remainingMs?: number | null;
  onElapsed?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // onElapsed fires only for a LIVE deadline — a paused timer sitting at 0:00
  // must not re-trigger "time's up" / the chime.
  const firedRef = useElapsedFire(endsAt, now, onElapsed);

  // Running → count toward endsAt; paused → frozen remaining; idle → dash.
  const ms =
    endsAt !== null
      ? Math.max(0, endsAt - now)
      : remainingMs !== null
        ? Math.max(0, remainingMs)
        : null;

  if (ms === null) {
    return <span className={className}>—</span>;
  }

  const totalSec = Math.ceil(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;

  return (
    <span className={className} aria-live="off">
      {mm}:{ss.toString().padStart(2, "0")}
      {firedRef}
    </span>
  );
}

// Fire onElapsed exactly once per endsAt value.
function useElapsedFire(
  endsAt: number | null,
  now: number,
  onElapsed?: () => void,
) {
  const [firedFor, setFiredFor] = useState<number | null>(null);
  useEffect(() => {
    if (
      endsAt !== null &&
      now >= endsAt &&
      firedFor !== endsAt &&
      onElapsed
    ) {
      setFiredFor(endsAt);
      onElapsed();
    }
  }, [endsAt, now, firedFor, onElapsed]);
  return null;
}
