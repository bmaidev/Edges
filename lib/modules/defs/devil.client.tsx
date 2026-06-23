"use client";

// Client renderers for the "devil" module (AI devil's advocate).
//
// Objections are AI-authored and room-facing, so participants see them too —
// they are never attributed to a person. Only facilitator/cohost can trigger
// generation (the "generate" action is gated server-side as well).

import { Button } from "@/components/ui";
import { AiGenerating, Reveal, StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { DevilView } from "./devil.server";

// ---- facilitator ----------------------------------------------------------

const DevilFacilitator: Renderer = ({ view, act }) => {
  const v = view as DevilView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Devil&apos;s advocate</p>
        <span className="text-xs text-muted">{v.inputCount} inputs</span>
      </div>

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to generate objections.
        </p>
      )}

      <Button
        onClick={() => send({ type: "generate" })}
        disabled={!v.available || status === "sending" || v.inputCount === 0}
      >
        {status === "sending"
          ? "Thinking…"
          : v.hasResult
            ? "Regenerate objections"
            : "Generate objections"}
      </Button>
      <StatusLine status={status} sentLabel="Objections generated." />

      <div className="flex flex-col gap-3">
        {status === "sending" ? (
          <AiGenerating
            verb="Finding the strongest objections"
            inputCount={v.inputCount}
            cards={3}
          />
        ) : v.objections.length === 0 ? (
          <p className="text-sm text-muted">
            No objections yet — generate to challenge the room&apos;s view.
          </p>
        ) : (
          v.objections.map((o, i) => (
            <article
              key={i}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <h3 className="text-base font-semibold text-accent">{o.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-white/85">
                {o.body}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

// ---- projector — one objection at a time, large, never attributed to a person

const DevilProjector: Renderer = ({ view }) => {
  const v = view as DevilView;
  if (!v.hasResult || v.objections.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
        <span className="text-xl text-muted">Devil&apos;s Advocate</span>
        <p className="text-2xl text-muted">Preparing a challenge…</p>
      </div>
    );
  }
  const o = v.objections[0];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      <span className="text-2xl uppercase tracking-wide text-accent">
        Devil&apos;s Advocate
      </span>
      <Reveal i={0} className="flex flex-col items-center gap-8">
        <h2 className="max-w-4xl text-5xl font-semibold leading-tight">
          {o.title}
        </h2>
        <p className="max-w-3xl text-3xl leading-relaxed text-white/85">
          {o.body}
        </p>
      </Reveal>
    </div>
  );
};

// ---- participant — read-only list -----------------------------------------

const DevilParticipant: Renderer = ({ view }) => {
  const v = view as DevilView;
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">Devil&apos;s advocate</p>
      {v.objections.length === 0 ? (
        <p className="text-sm text-muted">
          No objections yet — the facilitator will surface some shortly.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {v.objections.map((o, i) => (
            <Reveal key={i} i={i}>
              <article className="rounded-xl border border-border bg-surface p-4">
                <h3 className="text-base font-semibold text-accent">
                  {o.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-white/85">
                  {o.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
};

export const devilRenderers: Partial<Record<Role, Renderer>> = {
  participant: DevilParticipant,
  projector: DevilProjector,
  facilitator: DevilFacilitator,
};
