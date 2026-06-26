"use client";

// Client renderers for the "emptychair" module (absent-stakeholder AI persona).
//
// Participants ask the empty chair questions; only facilitator/cohost can ask
// the persona to answer (the "generate" action is gated server-side too). The
// answers are an AI-imagined stand-in for the absent stakeholder, never the
// real person — every role carries that synthetic-honesty note.

import { useState } from "react";
import { Button } from "@/components/ui";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { AiGenerating, Reveal, StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { EmptychairView } from "./emptychair.server";

// ---- shared bits ----------------------------------------------------------

const SYNTHETIC_NOTE =
  "These replies are an AI imagining this stakeholder — a prompt for the room, not the real person speaking.";

function PersonaCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">
        In the empty chair
      </p>
      <h3 className="mt-1 text-lg font-semibold text-accent">
        {name || "An absent stakeholder"}
      </h3>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-white/85">
          {description}
        </p>
      )}
    </div>
  );
}

// ---- participant — ask the empty chair + read the answers so far ----------

const EmptychairParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as EmptychairView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);

  async function ask() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setStatus("sending");
    const ok = await act({ type: "ask", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PersonaCard name={v.personaName} description={v.personaDescription} />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Ask {v.personaName || "them"} a question.
        </p>
        <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
          value={text}
          onChange={setText}
          placeholder={`Ask ${v.personaName || "the empty chair"}…`}
        />
        <Button onClick={ask} disabled={status === "sending" || !text.trim()}>
          Ask the empty chair
        </Button>
        <StatusLine status={status} sentLabel="Question sent." onRetry={ask} />
      </div>

      <div className="flex flex-col gap-3">
        {v.answers.length === 0 ? (
          <p className="text-sm text-muted">
            No replies yet — the facilitator will have{" "}
            {v.personaName || "them"} answer shortly.
          </p>
        ) : (
          <>
            {v.answers.map((a, i) => (
              <Reveal
                key={i}
                i={i}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="text-sm font-medium text-white/70">{a.question}</p>
                <p className="mt-2 text-sm leading-relaxed text-accent">
                  {a.answer}
                </p>
              </Reveal>
            ))}
            <p className="text-xs text-muted">{SYNTHETIC_NOTE}</p>
          </>
        )}
      </div>
    </div>
  );
};

// ---- facilitator — persona card, question queue, generate button ----------

const EmptychairFacilitator: Renderer = ({ view, act }) => {
  const v = view as EmptychairView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Empty chair</p>
        <span className="text-xs text-muted">{v.questions.length} questions</span>
      </div>

      <PersonaCard name={v.personaName} description={v.personaDescription} />

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to have {v.personaName || "them"}{" "}
          answer.
        </p>
      )}

      <Button
        onClick={() => send({ type: "generate" })}
        disabled={
          !v.available || status === "sending" || v.questions.length === 0
        }
      >
        {status === "sending"
          ? "Listening…"
          : v.hasResult
            ? `Regenerate — have ${v.personaName || "them"} answer again`
            : `Have ${v.personaName || "them"} answer`}
      </Button>
      <StatusLine status={status} sentLabel="Answers generated." />

      {status === "sending" && (
        <AiGenerating
          verb="Voicing the empty chair"
          inputCount={v.questions.length}
          cards={2}
        />
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">
          Question queue
        </p>
        {v.questions.length === 0 ? (
          <p className="text-sm text-muted">
            No questions yet — participants ask the empty chair from their phones.
          </p>
        ) : (
          v.questions.map((q) => (
            <div
              key={q.id}
              className="rounded-xl border border-border bg-surface p-3 text-sm"
            >
              {q.text}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted">{SYNTHETIC_NOTE}</p>
    </div>
  );
};

// ---- projector — the persona "speaking": question + answer as dialogue -----

const EmptychairProjector: Renderer = ({ view }) => {
  const v = view as EmptychairView;

  if (!v.hasResult || v.answers.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
        <span className="text-2xl uppercase tracking-wide text-accent">
          The Empty Chair
        </span>
        <h2 className="max-w-3xl text-4xl font-semibold leading-tight">
          {v.personaName || "An absent stakeholder"}
        </h2>
        {v.personaDescription && (
          <p className="max-w-2xl text-2xl leading-relaxed text-muted">
            {v.personaDescription}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <div className="flex flex-col gap-1">
        <span className="text-xl uppercase tracking-wide text-accent">
          The Empty Chair
        </span>
        <h2 className="text-4xl font-semibold leading-tight">
          {v.personaName || "An absent stakeholder"}
        </h2>
      </div>
      <div className="flex flex-1 flex-col gap-6">
        {v.answers.map((a, i) => (
          <Reveal key={i} i={i} className="flex flex-col gap-2">
            <p className="text-2xl text-white/60">“{a.question}”</p>
            <p className="max-w-5xl text-3xl leading-relaxed text-accent">
              {a.answer}
            </p>
          </Reveal>
        ))}
      </div>
      <p className="text-base text-muted">{SYNTHETIC_NOTE}</p>
    </div>
  );
};

export const emptychairRenderers: Partial<Record<Role, Renderer>> = {
  participant: EmptychairParticipant,
  projector: EmptychairProjector,
  facilitator: EmptychairFacilitator,
};
