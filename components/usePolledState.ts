"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FacilitatorState, PublicState } from "@/lib/types";

// R1 — realtime model:
//  - Pusher push is the ACCELERATOR. When a room changes, the server bumps a
//    monotonic version and fans out a tiny "changed" tick; we re-poll on it, so
//    updates land in well under a second without a 2s drum-beat from 90k phones.
//  - Polling is the BACKSTOP, not the heartbeat. With push active we poll slowly
//    (just to heal a missed tick and refresh presence counts); without push we
//    fall back to the classic fast cadence + the legacy SSE accelerator.
//  - Conditional requests: we send the last ETag as If-None-Match. The participant
//    /state route answers 304 (no body, no snapshot read) when nothing the client
//    can see has changed — collapsing the steady-state poll to a single tiny read.
//
// Two correctness guards make every screen stable, unchanged from before:
//  - Out-of-order: every fetch carries a monotonic seq; a response is applied
//    only if it's the newest one started, so a slow/stale read (KV is eventually
//    consistent) can never clobber fresher state and bounce the UI between phases.
//  - Credential change: changing code/token/role re-polls IMMEDIATELY and clears
//    stale state, so logging in doesn't flash a false "wrong passcode" while the
//    previous (un-authed) response is still in hand.

// Whether managed realtime (Pusher) is configured in this build. Read once at
// module load — these are inlined NEXT_PUBLIC_* at build time.
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY || "";
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "";
const PUSH_CONFIGURED = Boolean(PUSHER_KEY && PUSHER_CLUSTER);

// Backstop cadence when push is carrying the real-time load: slow enough to gut
// the read storm (90k phones no longer poll every 2s), fast enough that a missed
// tick or a presence-count change still heals within a few seconds.
const BACKSTOP_MS = 8000;
const CHANGE_EVENT = "changed";

// The room slug lives in the endpoint (/api/r/<room>/state) — pull it out so the
// hook can subscribe to that room's channel without a second prop.
function roomIdFromEndpoint(endpoint?: string): string | null {
  if (!endpoint) return null;
  const m = endpoint.match(/\/r\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : null;
}

export function usePolledState<
  T extends PublicState | FacilitatorState = PublicState,
>(
  opts: {
    code?: string;
    token?: string;
    endpoint?: string;
    role?: string;
    streamEndpoint?: string; // optional SSE accelerator (used only when push is off)
    // C5 — when a host console polls, it piggybacks its presence (a stable id +
    // an optional self-asserted name) so the server can heartbeat it. Role is
    // never sent — the server derives it from the code.
    presence?: { id: string; name?: string };
  } = {},
  intervalMs = 2000,
) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState(false);
  // H1 — wall-clock of the last successfully-applied state. A silent stall (a
  // captive portal returning 200s that never advance rev) shows no `error`, so
  // the connection hook also watches the age of this timestamp.
  const [lastAppliedAt, setLastAppliedAt] = useState<number | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const pollRef = useRef<() => Promise<void> | void>(() => {});

  // Monotonic request sequencing — drop responses older than the newest applied.
  const seqRef = useRef(0);
  const appliedRef = useRef(0);
  // Highest server state revision shown. We NEVER apply a state with a lower rev
  // than this, so a stale/eventually-consistent KV read can't make a screen jump
  // backwards (or flap between phases). This is the core anti-flash guard.
  const lastRevRef = useRef(-1);
  // R1 — the ETag of the last applied response, echoed back as If-None-Match so
  // an unchanged room answers 304 (no body, no snapshot read).
  const lastEtagRef = useRef<string | null>(null);

  // A key that identifies "who we're polling as". When it changes we must reset
  // state and re-poll, so the auth gate never reads a previous identity's data.
  const authKey = `${opts.endpoint ?? ""}|${opts.code ?? ""}|${opts.token ?? ""}|${opts.role ?? ""}`;

  // Push carries real-time updates for participant/projector screens (no code).
  // A host console (code) stays on the fast, always-full cadence so its presence
  // and health panels never lag.
  const pushActive = PUSH_CONFIGURED && Boolean(opts.endpoint) && !opts.code;
  const effectiveInterval = pushActive ? Math.max(intervalMs, BACKSTOP_MS) : intervalMs;

  useEffect(() => {
    let active = true;
    // New identity → forget the old response immediately.
    setState(null);
    setError(false);
    setLastAppliedAt(null);
    appliedRef.current = 0;
    seqRef.current = 0;
    lastRevRef.current = -1;
    lastEtagRef.current = null;

    async function poll() {
      const mySeq = ++seqRef.current;
      try {
        const { code, token, endpoint, role, presence } = optsRef.current;
        if (!endpoint) return; // every caller passes a room-scoped endpoint
        const base = endpoint;
        const qs = new URLSearchParams();
        if (code) qs.set("code", code);
        else if (token) qs.set("token", token);
        if (role) qs.set("role", role);
        // C5 — host presence rides the privileged poll (only when authed by code).
        if (code && presence?.id) {
          qs.set("pid", presence.id);
          if (presence.name) qs.set("pname", presence.name);
        }
        const url = qs.toString() ? `${base}?${qs}` : base;
        const headers: Record<string, string> = {};
        if (lastEtagRef.current) headers["If-None-Match"] = lastEtagRef.current;
        const res = await fetch(url, { cache: "no-store", headers });
        if (!active) return;
        // R1 — 304: the server confirmed nothing the client can see has changed.
        // Healthy liveness, not a stall — refresh the timestamp, keep our state.
        if (res.status === 304) {
          if (mySeq >= appliedRef.current) {
            setError(false);
            setLastAppliedAt(Date.now());
          }
          return;
        }
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as T;
        if (!active) return;
        // A4 — the room was renamed; the state route hands back the new address.
        // Follow it once (replace, so Back doesn't loop onto the dead slug).
        const redirect = (data as { redirect?: unknown }).redirect;
        if (typeof redirect === "string" && redirect) {
          if (typeof window !== "undefined") window.location.replace(redirect);
          return;
        }
        // Out-of-order in-flight: ignore a response superseded by a newer one.
        if (mySeq < appliedRef.current) return;
        // Stale data: ignore any state older than what we've already shown. This
        // is what stops the screens flashing between phases under KV lag.
        const rev = typeof (data as { rev?: unknown }).rev === "number"
          ? ((data as { rev: number }).rev)
          : null;
        if (rev !== null && rev < lastRevRef.current) return;
        appliedRef.current = mySeq;
        if (rev !== null) lastRevRef.current = Math.max(lastRevRef.current, rev);
        // Store the ETag only for a response we actually applied (newest, not
        // anti-flash-dropped), so the next If-None-Match reflects shown state.
        lastEtagRef.current = res.headers.get("ETag");
        setState(data);
        setError(false);
        setLastAppliedAt(Date.now());
      } catch {
        if (active) setError(true);
      }
    }

    pollRef.current = poll;
    poll();
    const id = setInterval(poll, effectiveInterval);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [authKey, effectiveInterval]);

  // R1 — Pusher accelerator: re-poll on a "changed" tick for this room. Polling
  // above remains the guaranteed backstop, so a dropped/blocked socket is
  // harmless. Active only for participant/projector screens when push is built in.
  useEffect(() => {
    if (!pushActive) return;
    const roomId = roomIdFromEndpoint(opts.endpoint);
    if (!roomId) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;
    // Coalesce a burst of ticks (e.g. 300 phones voting at once → a few server
    // pushes) into one re-poll. The conditional request makes a spurious poll a
    // cheap 304, but debouncing still spares needless work.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => pollRef.current(), 150);
    };

    // Dynamic import so pusher-js never bloats a polling-only deployment's bundle
    // and the build doesn't hard-depend on it.
    import("pusher-js")
      .then(({ default: Pusher }) => {
        if (cancelled) return;
        const client = new Pusher(PUSHER_KEY, {
          cluster: PUSHER_CLUSTER,
          // Reconnect aggressively; the backstop poll covers any gap meanwhile.
          activityTimeout: 30000,
          pongTimeout: 10000,
        });
        const channel = client.subscribe(`room-${roomId}`);
        channel.bind(CHANGE_EVENT, onChange);
        cleanup = () => {
          channel.unbind(CHANGE_EVENT, onChange);
          client.unsubscribe(`room-${roomId}`);
          client.disconnect();
        };
      })
      .catch(() => {
        // No socket → the backstop poll still converges. Silent by design.
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (cleanup) cleanup();
    };
  }, [pushActive, opts.endpoint]);

  // Legacy SSE accelerator — used ONLY when push is not configured (otherwise the
  // per-client SSE loop is exactly the connection-holding cost push removes).
  useEffect(() => {
    if (pushActive) return; // push supersedes SSE
    const url = opts.streamEndpoint;
    if (!url || typeof EventSource === "undefined") return;
    const es = new EventSource(url);
    es.addEventListener("tick", () => pollRef.current());
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.streamEndpoint, pushActive]);

  // Imperative refresh — call after a host command so navigation feels instant
  // instead of waiting up to 2s for the next tick.
  const refresh = useCallback(() => pollRef.current(), []);

  // After a write that returns a new rev, re-poll rapidly until that rev is
  // actually visible. KV read replicas can lag a beat behind a write, so a
  // single immediate refresh often reads the PRE-write state and the action
  // (e.g. Advance) looks dead. Bounded so a missed write can't spin forever; the
  // interval poll remains the backstop. The monotonic rev guard means a stale
  // read in between is simply ignored.
  const refreshUntil = useCallback(
    async (minRev: number, timeoutMs = 4000) => {
      if (!Number.isFinite(minRev)) return pollRef.current();
      const start = Date.now();
      while (lastRevRef.current < minRev && Date.now() - start < timeoutMs) {
        await pollRef.current();
        if (lastRevRef.current >= minRev) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    },
    [],
  );

  // Apply an authoritative state the server returned from a write (a command
  // response built from the just-written state). Goes through the same monotonic
  // rev guard, so it shows instantly AND a later stale read (rev < this) is then
  // ignored — making navigation correct even on an eventually-consistent store.
  const apply = useCallback((next: T) => {
    const rev =
      typeof (next as { rev?: unknown }).rev === "number"
        ? (next as { rev: number }).rev
        : null;
    if (rev !== null && rev < lastRevRef.current) return;
    if (rev !== null) lastRevRef.current = Math.max(lastRevRef.current, rev);
    appliedRef.current = seqRef.current;
    // A command response is a fresh full state; drop the stale ETag so the next
    // poll re-validates against the server rather than 304-ing on an old tag.
    lastEtagRef.current = null;
    setState(next);
    setError(false);
    setLastAppliedAt(Date.now());
  }, []);

  return { state, error, lastAppliedAt, refresh, refreshUntil, apply };
}
