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
  } = {},
  intervalMs = 2000,
) {
  const [state, setState] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const pollRef = useRef<() => void>(() => {});

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
    appliedRef.current = 0;
    seqRef.current = 0;
    lastRevRef.current = -1;

    async function poll() {
      const mySeq = ++seqRef.current;
      try {
        const { code, token, endpoint, role } = optsRef.current;
        if (!endpoint) return; // every caller passes a room-scoped endpoint
        const base = endpoint;
        const qs = new URLSearchParams();
        if (code) qs.set("code", code);
        else if (token) qs.set("token", token);
        if (role) qs.set("role", role);
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

  return { state, error, refresh };
}
