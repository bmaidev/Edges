"use client";

import type { ConnState } from "@/components/useConnection";

// H1 — the participant-facing connection state. Calm, never alarmist; the
// last-good screen stays visible underneath. When answers are waiting to send
// (tapped while offline), it says so honestly rather than faking "Sent".
export function ConnectionStrip({
  conn,
  pending = 0,
}: {
  conn: ConnState;
  pending?: number;
}) {
  if (conn === "online" && pending === 0) return null;
  const answers =
    pending > 0
      ? ` ${pending} ${pending === 1 ? "answer" : "answers"} saved — ${
          conn === "online" ? "sending…" : "we'll send when you're back"
        }.`
      : "";
  if (conn === "offline") {
    return (
      <Bar tone="muted">You&apos;re offline.{answers || " Your place is held."}</Bar>
    );
  }
  if (conn === "reconnecting") {
    return <Bar tone="warn">Reconnecting…{answers}</Bar>;
  }
  // online but with pending (flushing)
  return <Bar tone="accent">Back online.{answers}</Bar>;
}

function Bar({
  tone,
  children,
}: {
  tone: "muted" | "warn" | "accent";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "bg-[#4a3a1e]/90 text-[#ffe2ad]"
      : tone === "accent"
        ? "bg-accent/15 text-accent"
        : "bg-surface/95 text-muted";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-20 px-5 py-2 text-center text-xs backdrop-blur ${cls}`}
    >
      {children}
    </div>
  );
}

// H1 — a compact connection dot for the host console and projector. A glance,
// never a banner: green Live · amber Reconnecting · grey Offline.
export function ConnectionChip({ conn }: { conn: ConnState }) {
  const map = {
    online: { dot: "bg-emerald-400", label: "Live", text: "text-muted" },
    reconnecting: { dot: "bg-amber-400 animate-pulse", label: "Reconnecting", text: "text-[#ffe2ad]" },
    offline: { dot: "bg-white/30", label: "Offline", text: "text-muted" },
  }[conn];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${map.text}`}>
      <span className={`h-2 w-2 rounded-full ${map.dot}`} aria-hidden />
      {map.label}
    </span>
  );
}
