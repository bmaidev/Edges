// R1 — Managed realtime (Pusher Channels).
//
// The push tier is an ACCELERATOR, never the source of truth. Every
// participant-visible write bumps a monotonic per-room version counter
// (`room:<id>:ver`, a Redis INCR — see store.ts). That version is three things
// at once:
//   1. the body of the push message we send here ("room changed → you're at N"),
//   2. the ETag the /state poll answers conditional requests against (304s),
//   3. an input to the client's existing monotonic anti-flash guard.
//
// Because correctness lives in (2) and (3) — the version is always written
// before the response returns, and a stale/duplicate/out-of-order push is
// harmless — the system stays exactly as correct as the pure-polling design.
// A dropped push just means a screen waits for its (slow) backstop poll instead
// of updating instantly. Nothing is ever missed.
//
// Gated on PUSHER_* the same way AI is gated on ANTHROPIC_API_KEY: with no
// credentials, publish is a no-op and the whole platform falls back to polling.

const APP_ID = process.env.PUSHER_APP_ID || "";
const KEY = process.env.PUSHER_KEY || "";
const SECRET = process.env.PUSHER_SECRET || "";
const CLUSTER = process.env.PUSHER_CLUSTER || "";

// Public channel by design. The payload is ONLY a version integer — never any
// room content or PII — and fetching the actual state still requires the
// participant token or passcode. A public channel avoids 90k subscription-auth
// round-trips on connect (a load spike in itself) and leaks nothing beyond "this
// room changed", while room slugs already appear in URLs. To harden later, switch
// the prefix to `private-room-` and wire authorizeChannel() into a
// /api/r/[room]/realtime-auth route — a small, self-contained change.
const CHANNEL_PREFIX = "room-";
export const CHANGE_EVENT = "changed";

export function realtimeEnabled(): boolean {
  return Boolean(APP_ID && KEY && SECRET && CLUSTER);
}

// The per-room channel name. Room slugs already appear in URLs, so the name
// leaks nothing; the auth route is what gates the subscription.
export function roomChannel(roomId: string): string {
  return `${CHANNEL_PREFIX}${roomId}`;
}

// Lazily constructed so importing this module costs nothing when Pusher is off
// (and so a missing dep never breaks the build of a polling-only deployment).
let serverClient: import("pusher") | null = null;
function getServer(): import("pusher") | null {
  if (!realtimeEnabled()) return null;
  if (serverClient) return serverClient;
  try {
    const Pusher = require("pusher");
    serverClient = new Pusher({
      appId: APP_ID,
      key: KEY,
      secret: SECRET,
      cluster: CLUSTER,
      useTLS: true,
    });
    return serverClient;
  } catch (e) {
    // A misconfigured/absent SDK must never take down a write path.
    const msg = e instanceof Error ? e.message : "error";
    console.error(`[realtime] server init failed: ${msg}`);
    return null;
  }
}

// Best-effort fan-out of a "this room changed" tick to every live subscriber.
// Fire-and-forget by contract: the caller has already durably bumped the version
// (the real anchor), so a failed/slow publish only delays an instant update — the
// backstop poll still converges. Never throws into the write path.
export async function publishRoomChange(
  roomId: string,
  ver: number,
): Promise<void> {
  const server = getServer();
  if (!server) return;
  try {
    await server.trigger(roomChannel(roomId), CHANGE_EVENT, { ver });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    // Content-free: never log room data, only that a publish failed.
    console.error(`[realtime] publish failed for ${roomId}: ${msg}`);
  }
}

// The client needs the publishable key + cluster to open a connection. Mirrored
// into NEXT_PUBLIC_* so the browser bundle can read them; this server-side helper
// is for any SSR surface that wants to know whether to render the subscriber.
export function publicRealtimeConfig(): { key: string; cluster: string } | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY || "";
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "";
  return key && cluster ? { key, cluster } : null;
}
