"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FacilitatorState, PublicState } from "@/lib/types";

// Polls /api/state every 2s. Pass a facilitator code for the raw queue, or a
// participant token to personalise allocation/coordinator info.
//
// Two correctness guards make the host console stable:
//  - Out-of-order: every fetch carries a monotonic seq; a response is applied
//    only if it's the newest one started, so a slow/stale read (KV is eventually
//    consistent) can never clobber fresher state and bounce the UI between
//    phases.
//  - Credential change: changing code/token/role re-polls IMMEDIATELY and clears
//    stale state, so logging in doesn't flash a false "wrong passcode" while the
//    previous (un-authed) response is still in hand.
export function usePolledState<
  T extends PublicState | FacilitatorState = PublicState,
>(
  opts: {
    code?: string;
    token?: string;
    endpoint?: string;
    role?: string;
    streamEndpoint?: string; // optional SSE accelerator (see /api/r/[room]/stream)
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

  // A key that identifies "who we're polling as". When it changes we must reset
  // state and re-poll, so the auth gate never reads a previous identity's data.
  const authKey = `${opts.endpoint ?? ""}|${opts.code ?? ""}|${opts.token ?? ""}|${opts.role ?? ""}`;

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
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as T;
        if (!active) return;
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
        setError(false);
        setLastAppliedAt(Date.now());
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

  // SSE accelerator: re-poll immediately on a server "tick". Polling above is
  // the guaranteed fallback, so a dropped/blocked stream is harmless.
  useEffect(() => {
    const url = opts.streamEndpoint;
    if (!url || typeof EventSource === "undefined") return;
    const es = new EventSource(url);
    es.addEventListener("tick", () => pollRef.current());
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.streamEndpoint]);

  // Imperative refresh — call after a host command so navigation feels instant
  // instead of waiting up to 2s for the next tick.
  const refresh = useCallback(() => pollRef.current(), []);

  // After a write that returns a new rev, re-poll rapidly until that rev is
  // actually visible. KV read replicas can lag a beat behind a write, so a
  // single immediate refresh often reads the PRE-write state and the action
  // (e.g. Advance) looks dead. Bounded so a missed write can't spin forever; the
  // 2s interval poll remains the backstop. The monotonic rev guard means a stale
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
