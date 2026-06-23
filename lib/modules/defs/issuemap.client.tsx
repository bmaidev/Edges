"use client";

// Module: issuemap (EchoMind-style live issue-map) — client renderers.
//
// facilitator: a "Map the discussion" / "Re-cluster" button, plus the issue
//   list with a per-issue Focus toggle and Pin toggle. Pinned issues carry a
//   subtle marker and survive a re-cluster (the never-overwrite-human property).
// projector: the issue map; the focused issue is zoomed and highlighted with
//   its positions spelt out.
// participant: the map; the focused issue is emphasised.
//
// Renderers are pure functions of the server-computed view + an action
// dispatcher. State changes go only through `act` -> handleAction -> ctx.store.

import { Button } from "@/components/ui";
import { StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { IssueMapView, IssueView } from "./issuemap.server";

// ---- shared bits ----------------------------------------------------------

function PinMark() {
  return (
    <span
      title="Pinned — survives a re-cluster"
      className="inline-flex items-center gap-1 text-xs text-accent"
    >
      <span aria-hidden>📌</span> pinned
    </span>
  );
}

// ---- facilitator ----------------------------------------------------------

const IssueMapFacilitator: Renderer = ({ view, act }) => {
  const v = view as IssueMapView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Issue map</p>
        <span className="text-xs text-muted">{v.inputCount} inputs</span>
      </div>

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to map the discussion.
        </p>
      )}

      <Button
        onClick={() => send({ type: "refresh" })}
        disabled={!v.available || status === "sending" || v.inputCount === 0}
      >
        {status === "sending"
          ? "Mapping…"
          : v.hasResult
            ? "Re-cluster"
            : "Map the discussion"}
      </Button>
      <StatusLine status={status} sentLabel="Map updated." />

      {v.hasResult && (
        <p className="text-xs text-muted">
          Pinned issues survive a re-cluster — the AI won&apos;t discard them.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {v.issues.length === 0 ? (
          <p className="text-sm text-muted">
            No issues yet — map the discussion to organise what the room said.
          </p>
        ) : (
          v.issues.map((issue) => {
            const focused = v.focusedId === issue.id;
            return (
              <article
                key={issue.id}
                className={`rounded-xl border bg-surface p-4 ${
                  focused ? "border-accent" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-accent">
                    {issue.label}
                  </h3>
                  {issue.pinned && <PinMark />}
                </div>
                {issue.summary && (
                  <p className="mt-1 text-sm leading-relaxed text-white/85">
                    {issue.summary}
                  </p>
                )}
                {issue.positions.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {issue.positions.map((p, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm leading-snug text-white/80"
                      >
                        <span className="text-accent">•</span>
                        <span>{p.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() =>
                      act({ type: "focus", payload: { issueId: issue.id } })
                    }
                    aria-pressed={focused}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      focused
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border active:bg-[#222b54]"
                    }`}
                  >
                    {focused ? "Focused — tap to clear" : "Focus"}
                  </button>
                  <button
                    onClick={() =>
                      act({
                        type: issue.pinned ? "unpin" : "pin",
                        payload: { issueId: issue.id },
                      })
                    }
                    aria-pressed={issue.pinned}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      issue.pinned
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border active:bg-[#222b54]"
                    }`}
                  >
                    {issue.pinned ? "Unpin" : "Pin"}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

// ---- projector — the map; the focused issue zoomed/highlighted ------------

const IssueMapProjector: Renderer = ({ view }) => {
  const v = view as IssueMapView;

  if (!v.hasResult || v.issues.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
        <span className="text-2xl uppercase tracking-wide text-accent">
          Issue Map
        </span>
        <p className="text-2xl text-muted">Organising the discussion…</p>
      </div>
    );
  }

  const focused = v.focusedId
    ? v.issues.find((i) => i.id === v.focusedId)
    : null;

  if (focused) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-8 p-12">
        <span className="text-2xl uppercase tracking-wide text-accent">
          In focus
        </span>
        <h2 className="max-w-4xl text-5xl font-semibold leading-tight">
          {focused.label}
        </h2>
        {focused.summary && (
          <p className="max-w-3xl text-3xl leading-relaxed text-white/85">
            {focused.summary}
          </p>
        )}
        {focused.positions.length > 0 && (
          <ul className="flex flex-col gap-4">
            {focused.positions.map((p, i) => (
              <li key={i} className="flex gap-4 text-3xl leading-relaxed">
                <span className="text-accent">•</span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <h2 className="text-3xl font-semibold">The issue map</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {v.issues.map((issue) => (
          <article
            key={issue.id}
            className="rounded-2xl border border-border bg-surface p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-2xl font-semibold text-accent">
                {issue.label}
              </h3>
              {issue.pinned && <span aria-hidden className="text-2xl">📌</span>}
            </div>
            {issue.summary && (
              <p className="mt-2 text-lg leading-relaxed text-white/80">
                {issue.summary}
              </p>
            )}
            <p className="mt-3 text-sm uppercase tracking-wide text-muted">
              {issue.positions.length} position
              {issue.positions.length === 1 ? "" : "s"}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
};

// ---- participant — the map; focused issue emphasised ----------------------

const IssueMapParticipant: Renderer = ({ view }) => {
  const v = view as IssueMapView;

  if (v.issues.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-lg font-medium leading-snug">Issue map</p>
        <p className="text-sm text-muted">
          No issues yet — the facilitator will map the discussion shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">Issue map</p>
      <div className="flex flex-col gap-3">
        {v.issues.map((issue) => {
          const focused = v.focusedId === issue.id;
          return (
            <article
              key={issue.id}
              className={`rounded-xl border bg-surface p-4 ${
                focused ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-accent">
                  {issue.label}
                </h3>
                {issue.pinned && <PinMark />}
              </div>
              {focused && issue.summary && (
                <p className="mt-1 text-sm leading-relaxed text-white/85">
                  {issue.summary}
                </p>
              )}
              {/* Positions are spelt out only for the focused issue to keep the
                  participant view calm; others show a count. */}
              {focused ? (
                issue.positions.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {issue.positions.map((p, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm leading-snug text-white/80"
                      >
                        <span className="text-accent">•</span>
                        <span>{p.text}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {issue.positions.length} position
                  {issue.positions.length === 1 ? "" : "s"}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};

// ---- export ---------------------------------------------------------------

export const issuemapRenderers: Partial<Record<Role, Renderer>> = {
  participant: IssueMapParticipant,
  projector: IssueMapProjector,
  facilitator: IssueMapFacilitator,
};
