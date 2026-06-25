"use client";

// Client renderers for the "builder" module (text-to-UI prototype generator).
//
// The generated artifact is AI-authored and room-facing, so participants see it
// too. Only facilitator/cohost can trigger a build (the "build" action is gated
// server-side as well); participants may refine the spec via "addSpec".
//
// SECURITY: the HTML is rendered ONLY inside a sandboxed iframe with srcDoc —
// `sandbox="allow-scripts"` lets the prototype run its own JS, but the absence
// of allow-same-origin gives it an opaque origin, so it cannot touch the parent
// app, its storage, or its cookies. We never use dangerouslySetInnerHTML for it.

import { useState } from "react";
import { Button } from "@/components/ui";
import { AiGenerating, Reveal, StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { BuilderView } from "./builder.server";

// Shared sandboxed preview. allow-scripts WITHOUT allow-same-origin → the
// artifact runs but is fully isolated from the parent app.
function PreviewFrame({
  html,
  title,
  className,
}: {
  html: string;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      title={title}
      srcDoc={html}
      sandbox="allow-scripts"
      className={className}
    />
  );
}

// ---- facilitator -----------------------------------------------------------

const BuilderFacilitator: Renderer = ({ view, act }) => {
  const v = view as BuilderView;
  const { status, send } = useSend(act);

  const spec = [
    v.brief.trim() ? `Brief:\n${v.brief.trim()}` : "",
    v.specItems.length
      ? "Room contributions:\n" +
        v.specItems.map((s, i) => `${i + 1}. ${s.text.trim()}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const nothingToBuild = !spec.trim();

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Prototype builder</p>
        <span className="text-xs text-muted">{v.specCount} contributions</span>
      </div>

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to build a prototype.
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">
          Assembled spec
        </p>
        {spec.trim() ? (
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
            {spec}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Nothing yet — add a brief in config, or let the room contribute.
          </p>
        )}
      </div>

      <Button
        onClick={() => send({ type: "build" })}
        disabled={!v.available || status === "sending" || nothingToBuild}
      >
        {status === "sending"
          ? "Building…"
          : v.hasResult
            ? "Rebuild"
            : "Build it"}
      </Button>
      <StatusLine status={status} sentLabel="Prototype built." />

      {status === "sending" ? (
        <AiGenerating
          verb="Building the prototype"
          inputCount={v.specCount}
          cards={1}
        />
      ) : v.hasResult ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">Preview</p>
          <PreviewFrame
            html={v.html}
            title="Prototype preview"
            className="h-80 w-full rounded-xl border border-border bg-white"
          />
        </div>
      ) : null}
    </div>
  );
};

// ---- projector — the prototype large, with an AI-draft caption -------------

const BuilderProjector: Renderer = ({ view }) => {
  const v = view as BuilderView;
  if (!v.hasResult || !v.html) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
        <span className="text-2xl uppercase tracking-wide text-accent">
          Prototype builder
        </span>
        <p className="text-2xl text-muted">
          Describe the interface — the facilitator will build it.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-baseline justify-between gap-6">
        <span className="text-2xl uppercase tracking-wide text-accent">
          Prototype builder
        </span>
        <span className="text-lg text-muted">AI draft — react to it</span>
      </div>
      <Reveal i={0} className="flex min-h-0 flex-1 flex-col">
        <PreviewFrame
          html={v.html}
          title="Generated prototype"
          className="min-h-0 w-full flex-1 rounded-2xl border border-border bg-white"
        />
      </Reveal>
    </div>
  );
};

// ---- participant — brief + refine the spec + contributions -----------------

const BuilderParticipant: Renderer = ({ view, act }) => {
  const v = view as BuilderView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "addSpec", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <p className="text-lg font-medium leading-snug">Prototype builder</p>

        {v.brief.trim() && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted">Brief</p>
            <p className="mt-1 text-base leading-relaxed text-white/90">
              {v.brief}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-base leading-relaxed text-white/90">
            Describe what the interface should do or look like.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. a card with a big timer and a start button…"
            className="min-h-24 w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base text-white/90 outline-none focus:border-accent"
          />
          <StatusLine
            status={status}
            sentLabel="Added to the spec."
            onRetry={submit}
          />
        </div>

        {v.specItems.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-muted">
              The spec so far
            </p>
            {v.specItems.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border bg-surface px-4 py-3"
              >
                <p className="text-sm leading-relaxed text-white/85">{s.text}</p>
                <p className="mt-1 text-xs text-muted">{s.handle}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-muted">
          The facilitator will build it into a clickable prototype.
        </p>
      </div>

      <StickyAction
        label="Add to the spec"
        disabled={!text.trim() || status === "sending"}
        onClick={submit}
      />
    </>
  );
};

export const builderRenderers: Partial<Record<Role, Renderer>> = {
  participant: BuilderParticipant,
  projector: BuilderProjector,
  facilitator: BuilderFacilitator,
};
