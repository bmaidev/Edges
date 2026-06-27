"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/presence";
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
  return <DriverChipInner {...{ driver, driverStale, presence, myId, myName, cmd }} />;
}

function DriverChipInner({
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
  const [handingOff, setHandingOff] = useState(false);
  if (presence.length <= 1) return null; // solo — no baton chrome

  const liveDriver = driver && !driverStale ? driver : null;
  const iAmDriving = liveDriver?.driverId === myId;
  const claim = () => cmd("claimDriver", { driverId: myId, driverName: myName });
  const release = () => cmd("releaseDriver", {});
  // C5 — directed hand-off: pass the baton to a specific present co-host by name
  // (reuses claimDriver, which sets the driver to whatever id/name we give it).
  const others = presence.filter((p) => p.presenceId !== myId);
  const handTo = (p: HostPresence) => {
    cmd("claimDriver", { driverId: p.presenceId, driverName: p.name || roleLabel(p.role) });
    setHandingOff(false);
  };

  const Btn = ({ onClick, children }: { onClick: () => void; children: string }) => (
    <button onClick={onClick} className="text-accent underline hover:text-white">
      {children}
    </button>
  );

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg/60 px-2.5 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      {iAmDriving ? (
        <>
          <span className="text-accent">🚗 You&apos;re driving</span>
          {others.length > 0 ? (
            handingOff ? (
              <>
                <span className="text-muted">hand to:</span>
                {others.map((p) => (
                  <Btn key={p.presenceId} onClick={() => handTo(p)}>
                    {p.name || roleLabel(p.role)}
                  </Btn>
                ))}
                <button onClick={() => setHandingOff(false)} className="text-muted underline">
                  cancel
                </button>
              </>
            ) : (
              <>
                <Btn onClick={() => setHandingOff(true)}>hand off</Btn>
                <Btn onClick={release}>park it</Btn>
              </>
            )
          ) : (
            <Btn onClick={release}>park it</Btn>
          )}
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
