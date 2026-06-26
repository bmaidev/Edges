"use client";

import { useEffect, useState } from "react";

export type ConnState = "online" | "reconnecting" | "offline";

// H1 — a calm, honest tri-state for the device's own link to the room, derived
// from three signals already in hand: the browser's offline event (instant), the
// poll's `error` flag, and the AGE of the last applied state (catches a silent
// stall — a captive portal returning 200s that never advance rev). Flap-
// suppressed: a brief blip stays "online" until ~3 missed polls, so the room
// never sees a red banner over a 1-second hiccup. Only true device-offline is
// instant.
export const STALE_MS = 6000; // ~3 missed 2s polls

// Pure resolver (unit-tested). offline is instant; reconnecting needs an error
// OR a stale last-applied (≥3 missed polls), so a brief blip stays "online".
export function resolveConn({
  online,
  error,
  lastAppliedAt,
  now,
}: {
  online: boolean;
  error: boolean;
  lastAppliedAt: number | null;
  now: number;
}): ConnState {
  if (!online) return "offline";
  const stale = lastAppliedAt != null && now - lastAppliedAt > STALE_MS;
  if (error || stale) return "reconnecting";
  return "online";
}

export function useConnection({
  error,
  lastAppliedAt,
}: {
  error: boolean;
  lastAppliedAt: number | null;
}): ConnState {
  // Start optimistic to avoid an SSR/hydration flash; correct on mount.
  const [online, setOnline] = useState(true);
  // Re-evaluate staleness on a 1s tick (lastAppliedAt age is time-relative).
  const [, setTick] = useState(0);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(id);
    };
  }, []);

  return resolveConn({ online, error, lastAppliedAt, now: Date.now() });
}
