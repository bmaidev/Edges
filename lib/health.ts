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
  // H1 full — who's gone quiet (handle + ms since last seen), so the facilitator
  // can decide whether to pause before advancing. Handle only (a self-chosen
  // display name the host already sees) — never a token, never content.
  dropped: { handle: string; since: number }[];
}

export function computeRoomHealth(
  participants: Participant[],
  heartbeats: Record<string, number>,
  now: number = Date.now(),
): RoomHealth {
  const present = participants.length;
  const dropped: { handle: string; since: number }[] = [];
  for (const p of participants) {
    const seen = heartbeats[p.token];
    if (typeof seen === "number" && now - seen > QUIET_MS) {
      dropped.push({ handle: p.handle, since: now - seen });
    }
  }
  // Most-recently-dropped first.
  dropped.sort((a, b) => a.since - b.since);
  return { present, here: present - dropped.length, dropped };
}
