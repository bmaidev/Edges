"use client";

import { useEffect, useRef } from "react";

// C1 — keep the screen awake while `active` (the facilitate cockpit is up), so a
// laptop doesn't sleep mid-session and strand the facilitator. Best-effort: it
// silently no-ops where the Wake Lock API is missing/denied, and re-acquires when
// the tab returns to the foreground (the OS drops the lock on tab-switch).
export function useWakeLock(active: boolean): void {
  const ref = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock && !ref.current && !cancelled) {
          ref.current = await nav.wakeLock.request("screen");
        }
      } catch {
        /* denied / unsupported — no-op */
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      ref.current?.release().catch(() => {});
      ref.current = null;
    };
  }, [active]);
}
