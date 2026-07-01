"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FacilitatorState, PublicState } from "@/lib/types";
// Type-only (erased at build) — the runtime SDK is still pulled via dynamic import
// so a polling-only deployment never bundles it.
import type PusherClient from "pusher-js";

// R1 — realtime model (push is a PURE ACCELERATOR):
//  - Polling is the reliable source of truth: every client fetches the COMPLETE
//    role-scoped /state body on a fixed cadence (~2s), and a full read every beat
//    self-heals any eventually-consistent KV lag. This is never slowed down.
//  - Pusher push only makes it faster. When a room changes the server fans out a
//    tiny "changed" tick; we respond with one extra immediate (debounced) refetch.
//    A dropped/duplicate/late tick is harmless — the steady poll still converges,
//    so the worst case is exactly the plain-polling behaviour.
//  - Without Pusher configured we fall back to the legacy SSE accelerator.
//  - There is deliberately NO conditional 304: a cheap version-keyed ETag is
//    strongly consistent while the body is read from eventually-consistent
//    replicas, so it could certify and lock in a stale body. A full read wins.
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
const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_APP_KEY || "";
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_APP_CLUSTER || "";
const PUSH_CONFIGURED = Boolean(PUSHER_KEY && PUSHER_CLUSTER);

const CHANGE_EVENT = "changed";

// One shared Pusher connection per page (module-level, decoupled from any
// component's lifecycle). Creating a client per hook mount — and disconnecting it
// on every cleanup — tears down the whole WebSocket on any remount or second
// screen, which shows up as connect/disconnect churn every few seconds. A
// singleton keeps a single socket up for the page's life, so subscribe/unsubscribe
// become cheap channel ops on a stable connection. The browser closes the socket
// on navigation/unload, so it's never leaked.
let pusherClient: PusherClient | null = null;
let pusherClientPromise: Promise<PusherClient> | null = null;
function getPusherClient(): Promise<PusherClient> {
  if (pusherClient) return Promise.resolve(pusherClient);
  if (!pusherClientPromise) {
    // Dynamic import so pusher-js never bloats a polling-only deployment's bundle.
    pusherClientPromise = import("pusher-js").then(({ default: Pusher }) => {
      pusherClient =
        pusherClient ?? new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
      return pusherClient;
    });
  }
  return pusherClientPromise;
}

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
  // H1 — wall-clock of the last SUCCESSFUL poll round-trip (whether or not its rev
  // was applied). Feeds the connection indicator's staleness check: a genuine
  // network stall stops updating this and trips "reconnecting", but a run of
  // stale-but-successful reads (KV replica lag after a write) keeps it fresh so the
  // banner stays green. Only a fetch error/timeout flips `error`.
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

  // A key that identifies "who we're polling as". When it changes we must reset
  // state and re-poll, so the auth gate never reads a previous identity's data.
  const authKey = `${opts.endpoint ?? ""}|${opts.code ?? ""}|${opts.token ?? ""}|${opts.role ?? ""}`;

  // Push is a PURE ACCELERATOR: it only triggers an extra immediate refetch on
  // top of the steady poll cadence below — it never slows polling down. So the
  // worst case is exactly the reliable full-body polling; push just makes updates
  // land sub-second when the socket is healthy. Active for participant/projector
  // screens (no code); a host console keeps the same cadence via plain polling.
  const pushActive = PUSH_CONFIGURED && Boolean(opts.endpoint) && !opts.code;

  useEffect(() => {
    let active = true;
    // New identity → forget the old response immediately.
    setState(null);
    setError(false);
    setLastAppliedAt(null);
    appliedRef.current = 0;
    seqRef.current = 0;
    lastRevRef.current = -1;

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
        const res = await fetch(url, { cache: "no-store" });
        if (!active) return;
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as T;
        if (!active) return;
        // Liveness = a successful round-trip, NOT an applied rev. KV read replicas
        // are eventually consistent, so after a write the next several polls can
        // return a LOWER rev and get dropped below — but the link is perfectly
        // healthy. Mark alive here (before any drop) so a run of stale-but-200
        // reads can't trip a FALSE "reconnecting" banner. Only a real fetch
        // error/timeout (the catch) flips error true.
        setError(false);
        setLastAppliedAt(Date.now());
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
        setState(data);
      } catch {
        if (active) setError(true);
      }
    }

    pollRef.current = poll;
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [authKey, intervalMs]);

  // R1 — Pusher accelerator: re-poll on a "changed" tick for this room. Polling
  // above remains the guaranteed backstop, so a dropped/blocked socket is
  // harmless. Active only for participant/projector screens when push is built in.
  useEffect(() => {
    if (!pushActive) return;
    const roomId = roomIdFromEndpoint(opts.endpoint);
    if (!roomId) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;
    // Coalesce a burst of ticks (e.g. 300 phones voting at once → a few server
    // pushes) into one re-poll, so a vote storm doesn't trigger a refetch per tick.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => pollRef.current(), 150);
    };

    // Subscribe this room's channel on the SHARED connection. On cleanup we only
    // unbind + unsubscribe the channel — never disconnect the socket — so a
    // remount re-subscribes on the same live WebSocket instead of churning it.
    getPusherClient()
      .then((client) => {
        if (cancelled) return;
        const channel = client.subscribe(`room-${roomId}`);
        channel.bind(CHANGE_EVENT, onChange);
        teardown = () => {
          channel.unbind(CHANGE_EVENT, onChange);
          client.unsubscribe(`room-${roomId}`);
        };
      })
      .catch(() => {
        // No socket → the backstop poll still converges. Silent by design.
      });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      if (teardown) teardown();
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
    setState(next);
    setError(false);
    setLastAppliedAt(Date.now());
  }, []);

  return { state, error, lastAppliedAt, refresh, refreshUntil, apply };
}
