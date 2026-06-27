// C5 — pure host-presence maths (no store, no React, no DOM). A host console
// heartbeats every poll; this derives the LIVE roster (recent enough to count as
// "here") from the raw hash. Trivially testable; the store layer just persists.

import type { DriverInfo, HostPresence, Role } from "./types";

// A host counts as present if heartbeated within this window. Generous enough to
// survive a background-tab setInterval throttle (~60s) without flapping the dot.
export const PRESENCE_TTL_MS = 75_000;

// C5 — the driving baton goes stale on the same window: if the driver's console
// has aged out of the live roster, the baton is up for grabs (the next claim wins).
export const DRIVER_STALE_MS = PRESENCE_TTL_MS;

// Pure: is the current driver still live? True only when a driver is set AND its
// presenceId is in the live roster AND the claim isn't ancient. Derived on read —
// the store never mutates the baton just because it went stale.
export function isDriverLive(
  driver: DriverInfo | null | undefined,
  roster: HostPresence[],
  now: number,
): boolean {
  if (!driver) return false;
  if (now - driver.claimedAt > DRIVER_STALE_MS) return false;
  return roster.some((p) => p.presenceId === driver.driverId);
}

// Throttle the heartbeat write so 2s polls don't hammer KV (mirrors C2's touch).
export const HEARTBEAT_THROTTLE_MS = 8_000;

export function isLive(p: { lastSeen: number }, now: number): boolean {
  return now - p.lastSeen <= PRESENCE_TTL_MS;
}

// Parse + filter the raw presence hash into the live roster, newest-joined last
// for a stable display order (sorted by presenceId so it never reshuffles on a
// heartbeat). Malformed entries are skipped, never thrown.
export function liveRoster(
  raw: Record<string, unknown>,
  now: number,
): HostPresence[] {
  const out: HostPresence[] = [];
  for (const v of Object.values(raw)) {
    const p = v as Partial<HostPresence> | null;
    if (
      !p ||
      typeof p.presenceId !== "string" ||
      typeof p.role !== "string" ||
      typeof p.lastSeen !== "number"
    )
      continue;
    if (!isLive({ lastSeen: p.lastSeen }, now)) continue;
    out.push({
      presenceId: p.presenceId,
      name: typeof p.name === "string" ? p.name : "",
      role: p.role as Role,
      lastSeen: p.lastSeen,
    });
  }
  out.sort((a, b) => (a.presenceId < b.presenceId ? -1 : a.presenceId > b.presenceId ? 1 : 0));
  return out;
}

// A friendly label for a host whose operator hasn't named themselves.
export function roleLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "cohost":
      return "Co-host";
    default:
      return "Facilitator";
  }
}
