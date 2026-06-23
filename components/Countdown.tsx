"use client";

import { useEffect, useState } from "react";

// Renders mm:ss remaining until `endsAt` (epoch ms). Shows "0:00" when elapsed.
// Calls onElapsed once when it crosses zero, if provided.
export function Countdown({
  endsAt,
  onElapsed,
  className = "",
}: {
  endsAt: number | null;
  onElapsed?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const firedRef = useElapsedFire(endsAt, now, onElapsed);

  if (endsAt === null) {
    return <span className={className}>—</span>;
  }

  const remainingMs = Math.max(0, endsAt - now);
  const totalSec = Math.ceil(remainingMs / 1000);
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
