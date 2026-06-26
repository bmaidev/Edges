"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// E2 — "present mode" for the projector: true fullscreen + a screen wake-lock so
// the wall never dims, plus auto-hiding chrome (controls + cursor) after a few
// seconds of stillness. Every browser API here is best-effort: a denied
// fullscreen falls back to a CSS `.cinema` letterbox (the caller reads `cinema`),
// a missing Wake Lock API is simply skipped. Nothing here can throw into render.

const IDLE_MS = 3000;

interface PresentMode {
  active: boolean; // present mode on (real fullscreen OR cinema fallback)
  cinema: boolean; // fullscreen was denied/unsupported — use the CSS letterbox
  controlsHidden: boolean; // chrome + cursor auto-hidden after IDLE_MS of stillness
  toggle: () => void;
}

type WakeLockSentinelish = { release: () => Promise<void> } | null;

export function usePresentMode(): PresentMode {
  const [active, setActive] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const wakeRef = useRef<WakeLockSentinelish>(null);
  const idleTimer = useRef<number | null>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelish> };
      };
      if (nav.wakeLock && !wakeRef.current) {
        wakeRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      /* wake lock denied (not focused / unsupported) — no-op */
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeRef.current?.release();
    } catch {
      /* already gone */
    }
    wakeRef.current = null;
  }, []);

  const enter = useCallback(async () => {
    setActive(true);
    await acquireWakeLock();
    try {
      const el = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        setCinema(false);
      } else {
        setCinema(true); // no Fullscreen API — letterbox instead
      }
    } catch {
      setCinema(true); // user/permissions denied fullscreen — letterbox instead
    }
  }, [acquireWakeLock]);

  const exit = useCallback(async () => {
    setActive(false);
    setCinema(false);
    setControlsHidden(false);
    await releaseWakeLock();
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      /* already exited */
    }
  }, [releaseWakeLock]);

  const toggle = useCallback(() => {
    if (active) void exit();
    else void enter();
  }, [active, enter, exit]);

  // Keep `active` honest when the user presses Esc (browser exits fullscreen
  // directly, bypassing our exit()). Only meaningful when we went real-fullscreen.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !cinema) {
        setActive(false);
        setControlsHidden(false);
        void releaseWakeLock();
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [cinema, releaseWakeLock]);

  // Re-acquire the wake lock when the tab returns to the foreground (the OS drops
  // it on tab-switch / lock screen).
  useEffect(() => {
    if (!active) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active, acquireWakeLock]);

  // Auto-hide controls + cursor after stillness; any pointer/key activity reveals
  // them and restarts the idle clock.
  useEffect(() => {
    if (!active) return;
    const wake = () => {
      setControlsHidden(false);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setControlsHidden(true), IDLE_MS);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, [active]);

  // Safety net: release the wake lock if the component unmounts while active.
  useEffect(() => () => void releaseWakeLock(), [releaseWakeLock]);

  return { active, cinema, controlsHidden, toggle };
}
