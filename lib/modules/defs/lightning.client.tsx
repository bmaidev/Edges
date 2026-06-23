"use client";

// Renderers for the "lightning" module (Lightning talks / demos).
//   - participant: a "Join the queue" toggle (+ optional topic), your position,
//     who's speaking & next, and a prominent "You're up" panel when it's you.
//   - projector: a big "Now: [handle] — [topic]" with "Next:", the remaining
//     queue, the per-speaker timebox, and a live countdown.
// Countdown derives from view.startedAt + secondsPerSpeaker (server-stamped on
// each facilitator "next"). Pure functions of server-computed view + dispatcher.

import { useState } from "react";
import { Button } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import { StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { LightningView } from "./lightning.server";

function endsAt(v: LightningView): number | null {
  return typeof v.startedAt === "number"
    ? v.startedAt + v.secondsPerSpeaker * 1000
    : null;
}

function fmtBudget(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  if (ss === 0) return `${mm} min`;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

// ---- participant ----------------------------------------------------------

const LightningParticipant: Renderer = ({ view, act }) => {
  const v = view as LightningView;
  const inQueue = v.myPosition !== null;
  const [topic, setTopic] = useState("");
  const { status, send } = useSend(act);

  function join() {
    const t = topic.trim();
    send({ type: "join", payload: t ? { topic: t } : {} });
  }
  function leave() {
    send({ type: "leave" });
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {v.iAmCurrent ? (
        <div className="animate-fadeInUp flex flex-col items-center gap-3 rounded-2xl border border-accent bg-accent/10 p-6 text-center">
          <p className="text-sm uppercase tracking-wide text-accent">You&apos;re up</p>
          <p className="text-2xl font-semibold">Go — you have the floor.</p>
          <Countdown
            endsAt={endsAt(v)}
            className="text-5xl font-bold tabular-nums text-accent"
          />
          <p className="text-xs text-muted">
            {fmtBudget(v.secondsPerSpeaker)} per speaker
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Lightning talks</h2>
          <p className="text-sm text-muted">
            {fmtBudget(v.secondsPerSpeaker)} each. Keep it tight.
          </p>
        </div>
      )}

      {/* Now / Next strip */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted">Now</span>
          <span className="flex-1 truncate text-right text-base font-medium">
            {v.current ? v.current.handle : "—"}
            {v.current?.topic ? (
              <span className="text-muted"> · {v.current.topic}</span>
            ) : null}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted">Next</span>
          <span className="flex-1 truncate text-right text-sm text-white/85">
            {v.next ? v.next.handle : "—"}
          </span>
        </div>
      </div>

      {/* Your status */}
      {inQueue && !v.iAmCurrent && (
        <p className="text-center text-sm text-accent">
          You&apos;re in the queue — position {v.myPosition}.
        </p>
      )}

      {/* Join / leave control */}
      {!v.iAmCurrent &&
        (inQueue ? (
          <Button className="w-full" variant="ghost" onClick={leave}>
            Leave the queue
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            {v.topicPrompt && (
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder={v.topicPrompt}
                aria-label={v.topicPrompt}
                className="rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
              />
            )}
            <Button className="w-full" onClick={join}>
              Join the queue
            </Button>
          </div>
        ))}

      <StatusLine status={status} sentLabel="Updated." onRetry={inQueue ? leave : join} />

      {/* Full queue */}
      {v.queue.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            Queue ({v.queue.length})
          </p>
          <ol className="flex flex-col gap-1">
            {v.queue.map((q, i) => (
              <li
                key={`${q.handle}-${i}`}
                className={`flex items-baseline gap-2 rounded-lg px-3 py-2 text-sm ${
                  i === 0 ? "bg-accent/10 text-accent" : "bg-surface text-white/85"
                }`}
              >
                <span className="w-5 text-right tabular-nums text-muted">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">
                  {q.handle}
                  {q.topic ? <span className="text-muted"> · {q.topic}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

// ---- projector ------------------------------------------------------------

const LightningProjector: Renderer = ({ view }) => {
  const v = view as LightningView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-10 p-12">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-2xl uppercase tracking-wide text-muted">Now</p>
          {v.current ? (
            <>
              <p className="mt-2 truncate text-6xl font-bold">{v.current.handle}</p>
              {v.current.topic && (
                <p className="mt-3 truncate text-3xl text-white/80">
                  {v.current.topic}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-4xl text-muted">Queue is empty</p>
          )}
        </div>
        <div className="flex flex-col items-end">
          <Countdown
            endsAt={endsAt(v)}
            className="text-7xl font-bold tabular-nums text-accent"
          />
          <p className="mt-1 text-xl text-muted">
            {fmtBudget(v.secondsPerSpeaker)} each
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-4 border-t border-border pt-6">
        <span className="text-2xl uppercase tracking-wide text-muted">Next</span>
        <span className="truncate text-4xl font-semibold">
          {v.next ? v.next.handle : "—"}
        </span>
      </div>

      {v.queue.length > 2 && (
        <div className="flex flex-col gap-2">
          <p className="text-xl uppercase tracking-wide text-muted">
            Then ({v.queue.length - 1} waiting)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-2xl text-white/80">
            {v.queue.slice(1).map((q, i) => (
              <span key={`${q.handle}-${i}`}>
                {i + 2}. {q.handle}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---- facilitator ----------------------------------------------------------

const LightningFacilitator: Renderer = ({ view, act }) => {
  const v = view as LightningView;
  const { status, send } = useSend(act);

  function next() {
    send({ type: "next" });
  }

  const remaining = Math.max(v.queue.length - 1, 0);

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Run the queue</h2>
        <p className="text-sm text-muted">
          {fmtBudget(v.secondsPerSpeaker)} per speaker. Advance when they&apos;re done.
        </p>
      </div>

      {/* Now / Next strip */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted">Now</span>
          <span className="flex-1 truncate text-right text-base font-medium">
            {v.current ? v.current.handle : "—"}
            {v.current?.topic ? (
              <span className="text-muted"> · {v.current.topic}</span>
            ) : null}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-muted">Next</span>
          <span className="flex-1 truncate text-right text-sm text-white/85">
            {v.next ? v.next.handle : "—"}
          </span>
        </div>
      </div>

      <Button className="w-full" onClick={next} disabled={!v.current}>
        Next speaker →
      </Button>

      <StatusLine status={status} sentLabel="Advanced." onRetry={next} />

      <p className="text-center text-sm text-muted">
        {remaining === 0
          ? v.current
            ? "Last speaker up — queue empties after this."
            : "Queue is empty."
          : `${remaining} ${remaining === 1 ? "speaker" : "speakers"} waiting after this.`}
      </p>
    </div>
  );
};

export const lightningRenderers: Partial<Record<Role, Renderer>> = {
  participant: LightningParticipant,
  facilitator: LightningFacilitator,
  projector: LightningProjector,
};
