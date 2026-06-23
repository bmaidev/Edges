"use client";

// Client renderers for the "promptrelay" module (collaborative prompting).
//
// Participant: the task, a segment-kind picker + VoiceTextarea + sticky "Add to
// the prompt", and the live list of segments the room has added.
// Facilitator: the assembled-prompt preview, a "Run the prompt" / "Re-run"
// button (act({type:"run"})), and the AI result. The "run" action is gated
// server-side to non-participant roles.
// Projector: the assembled prompt building up, then the AI result, large.
//
// Hooks run unconditionally before any early return; renderers are pure
// functions of the server-computed view + the dispatcher.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button } from "@/components/ui";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { PromptRelayView } from "./promptrelay.server";

// ---- participant ----------------------------------------------------------

const PromptRelayParticipant: Renderer = ({ view, act }) => {
  const v = view as PromptRelayView;
  const kinds = v.segmentKinds.length > 0 ? v.segmentKinds : ["segment"];
  const [kind, setKind] = useState<string>(kinds[0]);
  const [text, setText] = useState<string>("");
  const { status, setStatus } = useSend(act);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setStatus("sending");
    const ok = await act({ type: "add", payload: { kind, text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1800);
    else setText(t); // restore draft so they can retry
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            The room is building one prompt together
          </p>
          <p className="text-lg font-medium leading-snug">{v.task}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">
            What kind of segment?
          </p>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  k === kind
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface text-white/80"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <VoiceTextarea
            value={text}
            onChange={(next) => setText(next.slice(0, 2000))}
            placeholder={`Add a "${kind}" to the prompt…`}
          />
        </div>

        <StatusLine status={status} sentLabel="Added to the prompt." onRetry={add} />

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">
            The prompt so far ({v.segments.length})
          </p>
          {v.segments.length === 0 ? (
            <p className="text-sm text-muted">
              No segments yet — add the first one above.
            </p>
          ) : (
            v.segments.map((s, i) => (
              <div
                key={i}
                className="animate-fadeInUp rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="mr-2 text-xs uppercase tracking-wide text-accent">
                  {s.kind}
                </span>
                <span className="text-sm text-white/90">{s.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <StickyAction
        label="Add to the prompt"
        disabled={!text.trim()}
        onClick={add}
      />
    </>
  );
};

// ---- facilitator ----------------------------------------------------------

const PromptRelayFacilitator: Renderer = ({ view, act }) => {
  const v = view as PromptRelayView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Prompt relay</p>
        <span className="text-xs text-muted">{v.segments.length} segments</span>
      </div>

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to run the prompt.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">
          Assembled prompt
        </p>
        <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-white/85">
          {v.assembledPrompt}
        </pre>
      </div>

      {v.segments.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">
            Contributors
          </p>
          {v.segments.map((s, i) => (
            <p key={i} className="text-xs text-muted">
              <span className="text-accent">{s.kind}</span>
              {s.handle ? ` — ${s.handle}` : ""}
            </p>
          ))}
        </div>
      )}

      <Button
        onClick={() => send({ type: "run" })}
        disabled={!v.available || status === "sending"}
      >
        {status === "sending"
          ? "Running…"
          : v.hasResult
            ? "Re-run the prompt"
            : "Run the prompt"}
      </Button>
      <StatusLine status={status} sentLabel="Result is in." />

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Result</p>
        {v.hasResult && v.result ? (
          <article className="rounded-xl border border-border bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
              {v.result}
            </p>
          </article>
        ) : (
          <p className="text-sm text-muted">
            No result yet — run the assembled prompt to see what the room built.
          </p>
        )}
      </div>
    </div>
  );
};

// ---- projector ------------------------------------------------------------

const PromptRelayProjector: Renderer = ({ view }) => {
  const v = view as PromptRelayView;

  // Once a result exists, it takes the screen — large.
  if (v.hasResult && v.result) {
    return (
      <div className="flex flex-1 flex-col gap-8 p-12">
        <span className="text-2xl uppercase tracking-wide text-accent">
          The room&apos;s prompt → the AI
        </span>
        <p className="max-w-5xl whitespace-pre-wrap text-3xl leading-relaxed text-white/90">
          {v.result}
        </p>
      </div>
    );
  }

  // Before a run: the prompt building up.
  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <span className="text-2xl uppercase tracking-wide text-accent">
        Building one prompt together
      </span>
      <h2 className="max-w-4xl text-4xl font-semibold leading-tight">
        {v.task}
      </h2>
      {v.segments.length === 0 ? (
        <p className="text-3xl text-muted">Waiting for the first segment…</p>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {v.segments.map((s, i) => (
            <p
              key={i}
              className="animate-fadeInUp rounded-lg border border-border bg-surface px-5 py-3 text-2xl text-white/90"
            >
              <span className="mr-3 text-xl uppercase tracking-wide text-accent">
                {s.kind}
              </span>
              {s.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export const promptrelayRenderers: Partial<Record<Role, Renderer>> = {
  participant: PromptRelayParticipant,
  projector: PromptRelayProjector,
  facilitator: PromptRelayFacilitator,
};
