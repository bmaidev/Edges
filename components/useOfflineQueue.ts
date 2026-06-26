"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Action = { type: string; payload?: Record<string, unknown> };
interface QueuedSend {
  dedupeId: string;
  phaseId: string;
  body: Record<string, unknown>; // the full POST body (incl. token/handle/dedupeId)
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  }
}

// H1 — an offline-tolerant submit layer. A Send tapped while offline is queued
// (persisted to localStorage so it survives a reload/crash) and auto-flushed once
// on reconnect — idempotently, because each send carries a stable dedupeId the
// server claims, so a replay of an already-applied send is skipped (no double
// submit). Stale sends — for a phase the room has since moved past — are dropped
// rather than fired into the wrong phase.
export function useResilientAct(
  apiBase: string,
  token: string,
  handle: string,
  phaseId: string,
) {
  const key = `edges_queue:${apiBase}`;
  const [pending, setPending] = useState(0);
  const queueRef = useRef<QueuedSend[]>([]);
  const flushingRef = useRef(false);
  const phaseRef = useRef(phaseId);
  phaseRef.current = phaseId;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(queueRef.current));
    } catch {
      /* ignore */
    }
    setPending(queueRef.current.filter((q) => q.phaseId === phaseRef.current).length);
  }, [key]);

  const flush = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      const keep: QueuedSend[] = [];
      for (const entry of queueRef.current) {
        // Drop sends for a phase the room has moved past — never fire late into
        // the wrong phase.
        if (entry.phaseId !== phaseRef.current) continue;
        try {
          const res = await fetch(`${apiBase}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry.body),
          });
          if (!res.ok && res.status >= 500) keep.push(entry); // server hiccup — retry later
          // 2xx (incl. deduped) and 4xx (rejected) → consumed, don't retry
        } catch {
          keep.push(entry); // still offline — keep for the next attempt
        }
      }
      queueRef.current = keep;
      persist();
    } finally {
      flushingRef.current = false;
    }
  }, [apiBase, persist]);

  // Restore any persisted queue on mount and try to flush.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) queueRef.current = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    persist();
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const iv = window.setInterval(() => {
      if (queueRef.current.length) void flush();
    }, 4000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Re-evaluate the pending count + flush when the phase changes.
  useEffect(() => {
    persist();
    void flush();
  }, [phaseId, persist, flush]);

  const act = useCallback(
    async (action: Action): Promise<boolean> => {
      const dedupeId = uuid();
      const body = { ...action, token, handle, dedupeId };
      // Try live first.
      try {
        const res = await fetch(`${apiBase}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
        if (res.status < 500) return false; // a real rejection — surface it
      } catch {
        /* offline — fall through to queue */
      }
      // Offline / server hiccup: queue it (same dedupeId, so the eventual flush
      // can't double-apply if the live attempt actually landed).
      queueRef.current.push({ dedupeId, phaseId: phaseRef.current, body });
      persist();
      return true; // saved — the ConnectionStrip explains it'll send
    },
    [apiBase, token, handle, persist],
  );

  return { act, pending };
}
