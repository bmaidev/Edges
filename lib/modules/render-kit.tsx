"use client";

// Shared client-side building blocks for module renderers. Extracted from
// registry.client.tsx so per-module renderer files (lib/modules/defs/*.client.tsx)
// can import a stable contract without creating an import cycle through the
// registry. Renderers are pure functions of server-computed view data + an
// action dispatcher.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { Role } from "./types";

// What every renderer receives. `act` resolves to whether the write landed, so
// renderers can give honest feedback (and a retry) instead of assuming success.
export interface RendererProps {
  view: unknown;
  token: string;
  handle: string;
  phaseId: string;
  act: (action: {
    type: string;
    payload?: Record<string, unknown>;
  }) => Promise<boolean>;
  // for the "new content" pulse + capture toast
  pulse?: boolean;
}

export type Renderer = (props: RendererProps) => JSX.Element;

export interface ClientModule {
  renderers: Partial<Record<Role, Renderer>>;
}

// ---- shared send-feedback (honest, calm; words not emoji) ------------------

export type SendStatus = "idle" | "sending" | "sent" | "error";

export function useSend(act: RendererProps["act"]) {
  const [status, setStatus] = useState<SendStatus>("idle");
  const send = useCallback(
    async (action: { type: string; payload?: Record<string, unknown> }) => {
      setStatus("sending");
      const ok = await act(action);
      setStatus(ok ? "sent" : "error");
      if (ok) setTimeout(() => setStatus("idle"), 1800);
      return ok;
    },
    [act],
  );
  return { status, send, setStatus };
}

export function StatusLine({
  status,
  sentLabel = "Saved.",
  onRetry,
}: {
  status: SendStatus;
  sentLabel?: string;
  onRetry?: () => void;
}) {
  if (status === "sending")
    return <p className="text-center text-xs text-muted">Sending…</p>;
  if (status === "sent")
    return (
      <p className="animate-fadeInUp text-center text-xs text-accent">{sentLabel}</p>
    );
  if (status === "error")
    return (
      <button
        onClick={onRetry}
        className="mx-auto block text-center text-xs text-[#ff8a8a] underline"
      >
        Couldn&apos;t send — tap to retry
      </button>
    );
  return null;
}

// Re-sync local editing state when the server's "mine" / item set changes
// identity (fixes stale local state after a server-side edit).
export function useSyncedState<T>(initial: T, dep: string): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(initial);
  useEffect(() => {
    setVal(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return [val, setVal];
}

// Bottom-fixed primary action bar (use when a renderer needs a submit button
// pinned above the phone's safe area; pad the scroll area with pb-28).
export function StickyAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="safe-bottom animate-fadeInUp fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-bg/95 px-6 pt-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.55)] backdrop-blur">
      <Button className="w-full" onClick={onClick} disabled={disabled}>
        {label}
      </Button>
    </div>
  );
}

// A big number + label, for projector/stat callouts (counts, means, totals).
export function BigStat({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="font-display text-5xl font-semibold leading-none text-accent">
        {value}
      </p>
      <p className="mt-1 text-lg text-muted">{label}</p>
    </div>
  );
}

// A single shimmering placeholder bar — the building block of AI skeletons.
// `w` is a Tailwind width class so callers can vary line lengths organically.
export function Shimmer({
  className = "",
  w = "w-full",
}: {
  className?: string;
  w?: string;
}) {
  return (
    <div
      className={`h-3.5 rounded ${w} bg-[linear-gradient(100deg,rgb(var(--c-surface))_40%,rgb(var(--c-border)/0.9)_50%,rgb(var(--c-surface))_60%)] bg-[length:200%_100%] animate-shimmer ${className}`}
    />
  );
}

// While AI is thinking, show result-shaped shimmer cards instead of dead air —
// the layout matches what's coming, so the reveal feels like it resolves rather
// than pops in. `lines` controls placeholder density; `verb` names the work.
export function AiGenerating({
  verb = "Thinking",
  inputCount,
  cards = 2,
  big = false,
}: {
  verb?: string;
  inputCount?: number;
  cards?: number;
  big?: boolean;
}) {
  const widths = ["w-2/3", "w-11/12", "w-5/6", "w-3/4", "w-4/5"];
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <p className={`flex items-center gap-2 text-muted ${big ? "text-xl" : "text-sm"}`}>
        <span className="inline-block h-2 w-2 animate-pulseSoft rounded-full bg-accent" />
        {verb}
        {typeof inputCount === "number" ? ` across ${inputCount} input${inputCount === 1 ? "" : "s"}` : ""}…
      </p>
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className={`flex flex-col gap-2 rounded-xl border border-border bg-surface ${big ? "p-6" : "p-4"}`}
        >
          <Shimmer w={i % 2 ? "w-1/2" : "w-2/5"} className={big ? "h-5" : ""} />
          <Shimmer w={widths[i % widths.length]} />
          <Shimmer w={widths[(i + 2) % widths.length]} />
        </div>
      ))}
    </div>
  );
}

// Wrap a freshly-arrived item so it rises in, staggered by index. Use on
// projector/participant AI results so a set resolves gracefully rather than
// flashing in all at once. Cap the delay so long lists don't drag.
export function Reveal({
  i = 0,
  className = "",
  children,
}: {
  i?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`animate-riseIn ${className}`}
      style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
    >
      {children}
    </div>
  );
}

// ---- rotation / group kit --------------------------------------------------
// Shared furniture for the round-based modules (World Café, Troika/Wise Crowds,
// 1-2-4-All, Stations). Keeps "what round, who's with me, am I done" consistent.

// A round/stage pill. `active` paints it in accent (e.g. "you're the client").
export function RoundBanner({
  label,
  active = false,
  className = "",
}: {
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`self-start rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
        active
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border bg-surface text-muted"
      } ${className}`}
    >
      {label}
    </span>
  );
}

// Group/table membership as chips, marking the caller ("you") and any host.
// Reads at a glance where a long comma-joined name list does not.
export function GroupChips({
  members,
  you,
  host,
  label,
}: {
  members: string[];
  you?: string | null;
  host?: string | null;
  label?: string;
}) {
  if (members.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {members.map((m, i) => {
          const isYou = you != null && m === you;
          const isHost = host != null && m === host;
          return (
            <span
              key={i}
              className={`rounded-full px-2.5 py-1 text-sm ${
                isYou
                  ? "border border-accent bg-accent/10 text-accent"
                  : "border border-border bg-surface text-white/85"
              }`}
            >
              {m}
              {isHost ? " · host" : ""}
              {isYou ? " · you" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Calm centred holding state while the room is still forming groups. The
// three drifting dots read as "organising" rather than "stuck/loading".
export function WaitingForGroup({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 animate-pulseSoft rounded-full bg-accent"
            style={{ animationDelay: `${i * 220}ms` }}
          />
        ))}
      </div>
      <p className="max-w-xs text-lg leading-relaxed text-white/90">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
    </div>
  );
}

// Confirmation card after a participant has contributed their group's shared
// output for a round. Replaces ad-hoc empty circles with a real checkmark.
export function CaptureDone({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex animate-riseIn flex-col items-center gap-3 rounded-xl border border-border bg-surface p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-base leading-relaxed text-white/90">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

// Read the room from a tally: who leads, and is it decisive or a dead heat?
function leadRead(counts: Record<string, number>, options: string[]) {
  const total = options.reduce((s, o) => s + (counts[o] ?? 0), 0);
  if (total === 0) return null;
  const sorted = [...options].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const top = counts[sorted[0]] ?? 0;
  const second = counts[sorted[1]] ?? 0;
  const gap = (top - second) / total;
  return {
    total,
    leader: sorted[0],
    decisive: top / total >= 0.5 || gap >= 0.15,
    close: total >= 2 && gap <= 0.08,
  };
}

// Horizontal result bars, keyed by a fixed option set. Shows live percentages,
// glides on update, and (optionally) badges a clear lead vs a dead heat — so a
// tally reads as *results*, not raw numbers. Back-compatible: extra props off.
export function Bars({
  counts,
  options,
  showLead = false,
  mine,
}: {
  counts: Record<string, number>;
  options: string[];
  showLead?: boolean; // badge "Clear lead" / "Too close to call"
  mine?: string | null; // mark the caller's own pick
}) {
  const max = Math.max(1, ...options.map((o) => counts[o] ?? 0));
  const read = showLead ? leadRead(counts, options) : null;
  const total = options.reduce((s, o) => s + (counts[o] ?? 0), 0);
  return (
    <div className="flex flex-col gap-2">
      {showLead && read && (
        <p className="text-sm text-muted">
          {read.close ? (
            <span className="text-[#ffd27a]">Too close to call</span>
          ) : read.decisive ? (
            <span className="text-accent">Clear lead: {read.leader}</span>
          ) : (
            <span>Leading: {read.leader}</span>
          )}
        </p>
      )}
      {options.map((o) => {
        const n = counts[o] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const isMine = mine != null && o === mine;
        const isLeader = read?.leader === o && read?.decisive;
        return (
          <div key={o} className="flex items-center gap-3">
            <span className={`w-28 truncate text-sm ${isMine ? "text-accent" : ""}`}>
              {o}
              {isMine ? " · you" : ""}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-surface ring-1 ring-inset ring-border/40">
              <div
                className={`h-6 rounded bg-gradient-to-r from-accent/80 to-accent transition-[width] duration-500 ease-out ${
                  isLeader ? "shadow-[0_0_18px_-2px_rgb(var(--c-accent)/0.7)]" : ""
                }`}
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-sm text-muted tabular-nums">
              {total ? `${n} · ${pct}%` : n}
            </span>
          </div>
        );
      })}
    </div>
  );
}
