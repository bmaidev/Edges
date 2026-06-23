"use client";

// Module: synthesis ("ghost co-author") — client renderers.
//
// facilitator: a "Synthesize" / "Regenerate" button, the input count, the
//   bullets + the one tension in an editable-looking review card, and a
//   "Promote to room" toggle. Nothing reaches participants until promoted.
// projector: the bullets large + the tension highlighted, with a promoted/
//   review badge so the room knows whether it's live.
// participant: once promoted, the bullets + tension under a calm heading;
//   otherwise a neutral "the facilitator is summarizing…" holding line.
//
// Renderers are pure functions of the server-computed view + an action
// dispatcher. State changes go only through `act` -> handleAction -> ctx.store.

import type { Role } from "../types";
import { AiGenerating, Reveal, StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type {
  SynthesisFacilitatorView,
  SynthesisParticipantView,
} from "./synthesis.server";

// ---- facilitator ----------------------------------------------------------

const SynthesisFacilitator: Renderer = ({ view, act }) => {
  const v = view as SynthesisFacilitatorView;
  const { status, send } = useSend(act);

  if (!v.available) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="max-w-xs text-base leading-relaxed text-muted">
          AI synthesis is unavailable — no API key is configured for this
          session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Room synthesis</h2>
          {v.hasResult && (
            <p className="text-xs text-muted">
              {v.inputCount} submission{v.inputCount === 1 ? "" : "s"}{" "}
              summarised — review before showing the room.
            </p>
          )}
        </div>
        <button
          onClick={() => send({ type: "generate" })}
          disabled={status === "sending"}
          className="shrink-0 rounded-xl border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors active:bg-accent/20 disabled:opacity-50"
        >
          {status === "sending"
            ? "Thinking…"
            : v.hasResult
              ? "Regenerate"
              : "Synthesize"}
        </button>
      </div>

      <StatusLine status={status === "sent" ? "idle" : status} />

      {status === "sending" ? (
        <AiGenerating verb="Reading the room" inputCount={v.inputCount} cards={3} />
      ) : !v.hasResult ? (
        <p className="mt-4 text-center text-sm text-muted">
          Tap Synthesize to draft a few neutral bullets and the key tension from
          what the room has said.
        </p>
      ) : v.bullets.length === 0 && !v.tension ? (
        <p className="mt-4 text-center text-sm text-muted">
          Nothing to summarise yet — no submissions were found for this source.
        </p>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
          <ul className="flex flex-col gap-2">
            {v.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug">
                <span className="text-accent">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {v.tension && (
            <div className="rounded-lg border border-accent/40 bg-accent/10 p-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-accent">
                Key tension
              </p>
              <p className="text-sm leading-snug">{v.tension}</p>
            </div>
          )}
        </div>
      )}

      {v.hasResult && (v.bullets.length > 0 || v.tension) && (
        <button
          onClick={() => act({ type: "promote" })}
          aria-pressed={v.promoted}
          className={`mt-1 min-h-[52px] rounded-xl border p-3 text-sm font-medium transition-colors ${
            v.promoted
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface active:bg-[#222b54]"
          }`}
        >
          {v.promoted
            ? "Showing the room — tap to hide"
            : "Promote to room"}
        </button>
      )}
    </div>
  );
};

// ---- projector ------------------------------------------------------------

const SynthesisProjector: Renderer = ({ view }) => {
  const v = view as SynthesisFacilitatorView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-8 p-12">
      <div className="flex items-center gap-4">
        <h2 className="text-3xl font-semibold">What the room is saying</h2>
        <span
          className={`rounded-full px-3 py-1 text-sm ${
            v.promoted
              ? "border border-accent bg-accent/10 text-accent"
              : "border border-border text-muted"
          }`}
        >
          {v.promoted ? "Live" : "In review"}
        </span>
      </div>

      {!v.hasResult ? (
        <p className="text-2xl text-muted">…</p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {v.bullets.map((b, i) => (
              <Reveal key={i} i={i}>
                <li className="flex gap-4 text-3xl leading-relaxed">
                  <span className="text-accent">•</span>
                  <span>{b}</span>
                </li>
              </Reveal>
            ))}
          </ul>
          {v.tension && (
            <div className="animate-riseIn rounded-xl border border-accent/50 bg-accent/10 p-6" style={{ animationDelay: "350ms" }}>
              <p className="mb-2 text-lg uppercase tracking-wide text-accent">
                The tension
              </p>
              <p className="text-3xl leading-relaxed">{v.tension}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---- participant ----------------------------------------------------------

const SynthesisParticipant: Renderer = ({ view }) => {
  const v = view as SynthesisParticipantView;

  if (!v.promoted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="h-12 w-12 rounded-full bg-accent animate-pulseSoft" />
        <p className="max-w-xs text-lg leading-relaxed text-white/90">
          One moment — the facilitator is summarizing…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <h2 className="text-sm uppercase tracking-wide text-muted">
        What we&apos;re hearing
      </h2>
      <ul className="flex flex-col gap-3">
        {(v.bullets ?? []).map((b, i) => (
          <Reveal key={i} i={i}>
            <li className="flex gap-2 text-base leading-relaxed text-white/90">
              <span className="text-accent">•</span>
              <span>{b}</span>
            </li>
          </Reveal>
        ))}
      </ul>
      {v.tension && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-accent">
            The tension
          </p>
          <p className="text-base leading-relaxed">{v.tension}</p>
        </div>
      )}
    </div>
  );
};

// ---- export ---------------------------------------------------------------

export const synthesisRenderers: Partial<Record<Role, Renderer>> = {
  participant: SynthesisParticipant,
  projector: SynthesisProjector,
  facilitator: SynthesisFacilitator,
};
