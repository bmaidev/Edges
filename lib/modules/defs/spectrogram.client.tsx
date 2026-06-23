"use client";

// Module: spectrogram (human spectrogram) — client renderers.
//
// participant: a labeled track with a draggable handle (range input mapped to
//   0..1), an optional reason box, a "Place me" sticky action, and a live
//   read-out of where they are plus the distribution shape.
// projector: the full line with the live distribution, pole labels, a mean
//   marker, and (when enabled) the before→after shift.
//
// Renderers are pure functions of the server-computed view + an action
// dispatcher. State changes go only through `act` -> handleAction -> ctx.store.

import { useState } from "react";
import { Button } from "@/components/ui";
import type { Role } from "../types";
import {
  StatusLine,
  StickyAction,
  useSend,
  useSyncedState,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { SpectrogramStage, SpectrogramView } from "./spectrogram.server";

// ---- shared distribution shape --------------------------------------------

// A row of vertical bars across the 0..1 line, with an optional mean marker.
function Distribution({
  view,
  height,
}: {
  view: SpectrogramView;
  height: number;
}) {
  const dist = view.distribution;
  const max = Math.max(1, ...dist.map((b) => b.count));
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative flex items-end gap-[2px]"
        style={{ height }}
        aria-hidden="true"
      >
        {dist.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-accent/80 transition-all"
            style={{ height: `${(b.count / max) * 100}%` }}
            title={`${b.count}`}
          />
        ))}
        {view.count > 0 && (
          <div
            className="pointer-events-none absolute top-0 h-full w-[2px] bg-white"
            style={{ left: `${view.mean * 100}%` }}
            title={`mean ${view.mean.toFixed(2)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{view.poleLabels[0]}</span>
        <span className="text-accent">
          {view.count} placed · mean {view.mean.toFixed(2)}
        </span>
        <span>{view.poleLabels[1]}</span>
      </div>
    </div>
  );
}

function DeltaLine({ view }: { view: SpectrogramView }) {
  if (!view.beforeAfter || !view.delta) return null;
  const d = view.delta;
  const dir = d.shift > 0 ? "toward " + view.poleLabels[1] : d.shift < 0 ? "toward " + view.poleLabels[0] : "no net";
  return (
    <p className="text-sm text-muted">
      Before {d.beforeMean.toFixed(2)} ({d.beforeCount}) → after{" "}
      {d.afterMean.toFixed(2)} ({d.afterCount}) ·{" "}
      <span className="text-accent">
        shift {d.shift >= 0 ? "+" : ""}
        {d.shift.toFixed(2)} ({dir})
      </span>
    </p>
  );
}

// ---- participant ----------------------------------------------------------

const SpectrogramRenderer: Renderer = ({ view, act }) => {
  const v = view as SpectrogramView;
  // 0..1 internally; range input works in whole percent for a usable handle.
  const startPct = v.mine ? Math.round(v.mine.x * 100) : 50;
  const [pct, setPct] = useSyncedState<number>(
    startPct,
    JSON.stringify([v.statement, v.stage, v.mine?.x ?? null]),
  );
  const [reason, setReason] = useSyncedState<string>(
    v.mine?.reason ?? "",
    JSON.stringify([v.statement, v.stage, v.mine?.reason ?? null]),
  );
  const { status, send } = useSend(act);
  const placed = Boolean(v.mine);
  const x = pct / 100;

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-6 pb-28">
        <p id="spectro-statement" className="text-lg font-medium leading-snug">
          {v.statement}
        </p>
        {v.beforeAfter && (
          <p className="text-xs uppercase tracking-wide text-accent">
            {v.stage === "after" ? "After the discussion" : "Before the discussion"}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            aria-labelledby="spectro-statement"
            aria-valuetext={`${pct}% — ${v.poleLabels[0]} to ${v.poleLabels[1]}`}
            onChange={(e) => setPct(Number(e.target.value))}
            className="h-6 w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>{v.poleLabels[0]}</span>
            <span className="text-accent">you&apos;re here</span>
            <span>{v.poleLabels[1]}</span>
          </div>
        </div>

        {v.allowReasons && (
          <div className="flex flex-col gap-2">
            <label htmlFor="spectro-reason" className="text-sm text-muted">
              Why here? (optional)
            </label>
            <textarea
              id="spectro-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="A short reason…"
              rows={2}
              className="rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-muted">The room so far</p>
          <Distribution view={v} height={80} />
          <DeltaLine view={v} />
        </div>

        <StatusLine
          status={status}
          sentLabel="Placed — drag and place again to move."
        />
      </div>
      <StickyAction
        label={placed ? "Update my place" : "Place me"}
        onClick={() =>
          send({
            type: "place",
            payload: v.allowReasons
              ? { x, reason: reason.trim() }
              : { x },
          })
        }
      />
    </>
  );
};

// ---- projector ------------------------------------------------------------

const SpectrogramProjector: Renderer = ({ view }) => {
  const v = view as SpectrogramView;
  const dist = v.distribution;
  const max = Math.max(1, ...dist.map((b) => b.count));
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 p-12">
      <h2 className="text-3xl font-semibold leading-snug">{v.statement}</h2>
      {v.beforeAfter && (
        <p className="text-xl uppercase tracking-wide text-accent">
          {v.stage === "after" ? "After the discussion" : "Before the discussion"}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div
          className="relative flex items-end gap-1"
          style={{ height: "40vh" }}
          aria-hidden="true"
        >
          {dist.map((b, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-lg text-muted">{b.count || ""}</span>
              <div
                className="w-full rounded-t bg-accent/80 transition-all"
                style={{ height: `${(b.count / max) * 100}%` }}
              />
            </div>
          ))}
          {v.count > 0 && (
            <div
              className="pointer-events-none absolute top-0 h-full w-1 bg-white"
              style={{ left: `${v.mean * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-2xl">
          <span className="text-muted">{v.poleLabels[0]}</span>
          <span className="text-accent">
            {v.count} placed · mean {v.mean.toFixed(2)}
          </span>
          <span className="text-muted">{v.poleLabels[1]}</span>
        </div>
      </div>

      {v.beforeAfter && v.delta && (
        <p className="text-2xl text-muted">
          Before {v.delta.beforeMean.toFixed(2)} → after{" "}
          {v.delta.afterMean.toFixed(2)} ·{" "}
          <span className="text-accent">
            shift {v.delta.shift >= 0 ? "+" : ""}
            {v.delta.shift.toFixed(2)}
          </span>
        </p>
      )}
    </div>
  );
};

// ---- facilitator ----------------------------------------------------------

// Host console: live mean/count, the before→after delta, and (when before/after
// is enabled) controls to drive the active stage.
const SpectrogramFacilitator: Renderer = ({ view, act }) => {
  const v = view as SpectrogramView;
  const { status, send } = useSend(act);

  const setStage = (stage: SpectrogramStage) =>
    send({ type: "setStage", payload: { stage } });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <p className="text-lg font-medium leading-snug">{v.statement}</p>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-accent">
          {v.count} placed · mean {v.mean.toFixed(2)}
        </span>
        {v.beforeAfter && (
          <span className="text-sm uppercase tracking-wide text-muted">
            stage: <span className="text-accent">{v.stage}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-muted">The room so far</p>
        <Distribution view={v} height={80} />
        <DeltaLine view={v} />
      </div>

      {v.beforeAfter && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Drive the stage</p>
          <div className="flex gap-2">
            <Button
              variant={v.stage === "before" ? "primary" : "ghost"}
              onClick={() => setStage("before")}
            >
              Stage: Before
            </Button>
            <Button
              variant={v.stage === "after" ? "primary" : "ghost"}
              onClick={() => setStage("after")}
            >
              Stage: After
            </Button>
          </div>
        </div>
      )}

      <StatusLine status={status} sentLabel="Stage updated." />
    </div>
  );
};

export const spectrogramRenderers: Partial<Record<Role, Renderer>> = {
  participant: SpectrogramRenderer,
  projector: SpectrogramProjector,
  facilitator: SpectrogramFacilitator,
};
