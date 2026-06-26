import type { Participant } from "./types";
import { QUIET_MS } from "./modules/registry.server";

// H1 — a room-wide "who's still with you" glance for the facilitator, on EVERY
// phase (unlike the C2 participation signal, which is gather-phase + responder
// focused). Reuses C2's existing liveness heartbeat hash, so no new storage.
// Content-free: just two integer counts. A participant with no heartbeat yet
// (old session / just joined) counts as present, never as dropped — same
// graceful-degradation convention as the participation signal.
export interface RoomHealth {
  present: number; // participants in the room
  here: number; // those whose heartbeat is fresh (not gone quiet)
}

export function computeRoomHealth(
  participants: Participant[],
  heartbeats: Record<string, number>,
  now: number = Date.now(),
): RoomHealth {
  const present = participants.length;
  let quiet = 0;
  for (const p of participants) {
    const seen = heartbeats[p.token];
    if (typeof seen === "number" && now - seen > QUIET_MS) quiet++;
  }
  return { present, here: present - quiet };
}
