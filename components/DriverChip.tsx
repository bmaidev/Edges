"use client";

import type { DriverInfo, HostPresence } from "@/lib/types";

type Cmd = (command: string, args?: Record<string, unknown>) => Promise<Response>;

// C5 — the soft driving baton chip. Shows who's steering and lets any host take
// the wheel or hand it off. Advisory only — controls never block on it. Self-hides
// when you're solo (no co-host to collide with).
export function DriverChip({
  driver,
  driverStale,
  presence,
  myId,
  myName,
  cmd,
}: {
  driver: DriverInfo | null | undefined;
  driverStale: boolean;
  presence: HostPresence[];
  myId: string;
  myName: string;
  cmd: Cmd;
}) {
  if (presence.length <= 1) return null; // solo — no baton chrome

  const liveDriver = driver && !driverStale ? driver : null;
  const iAmDriving = liveDriver?.driverId === myId;
  const claim = () => cmd("claimDriver", { driverId: myId, driverName: myName });
  const release = () => cmd("releaseDriver", {});

  const Btn = ({ onClick, children }: { onClick: () => void; children: string }) => (
    <button onClick={onClick} className="text-accent underline hover:text-white">
      {children}
    </button>
  );

  return (
    <div
      className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      {iAmDriving ? (
        <>
          <span className="text-accent">🚗 You&apos;re driving</span>
          <Btn onClick={release}>hand off</Btn>
        </>
      ) : liveDriver ? (
        <>
          <span className="text-muted">
            🚗 {liveDriver.driverName || "A co-host"} is driving
          </span>
          <Btn onClick={claim}>take the wheel</Btn>
        </>
      ) : (
        <>
          <span className="text-muted">🚗 No one&apos;s driving</span>
          <Btn onClick={claim}>I&apos;ll drive</Btn>
        </>
      )}
    </div>
  );
}
