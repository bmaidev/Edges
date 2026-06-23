"use client";

// Client renderers for the "redistribute" module. Participants see ONE
// anonymous card (someone else's idea) framed by the mode, plus a place to
// respond. Authorship is never shown. Projector/facilitator see each idea
// alongside the responses it drew.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import {
  StatusLine,
  StickyAction,
  useSend,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  RedistributeParticipantView,
  RedistributeProjectorView,
} from "./redistribute.server";

type Mode = "critique" | "defend" | "improve";

// Mode-specific framing copy for the participant.
function framing(mode: Mode): { intro: string; job: string; placeholder: string } {
  switch (mode) {
    case "defend":
      return {
        intro: "You've been handed this idea:",
        job: "Your job: make the strongest possible case FOR it — even if it isn't yours.",
        placeholder: "Why this idea deserves a fair hearing…",
      };
    case "improve":
      return {
        intro: "You've been handed this idea:",
        job: "Your job: make it better — sharpen it, fix its weak spot, push it further.",
        placeholder: "How you'd strengthen this idea…",
      };
    case "critique":
    default:
      return {
        intro: "You've been handed this idea:",
        job: "Your job: argue why it will fail. Be the dissent the room needs.",
        placeholder: "Why this idea won't hold up…",
      };
  }
}

const RedistributeParticipant: Renderer = ({ view, act }) => {
  const v = view as RedistributeParticipantView;
  const f = framing(v.mode);
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [submitted, setSubmitted] = useState(false);
  const done = v.myResponseSubmitted || submitted;

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "respond", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setSubmitted(true);
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  // Not enough ideas yet (or every idea is the caller's own).
  if (!v.assignedCard) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="max-w-xs text-lg leading-relaxed text-white/90">
          Waiting for ideas to redistribute…
        </p>
        <p className="text-sm text-muted">
          You&apos;ll be handed someone else&apos;s idea — anonymously — the moment
          there are enough to go around.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-14 w-14 rounded-full bg-accent/20" />
        <p className="max-w-xs text-lg leading-relaxed text-white/90">
          Thanks — your response is in.
        </p>
        <p className="text-sm text-muted">
          The room is stronger for the dissent. Sit tight for what&apos;s next.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
        <p className="text-sm uppercase tracking-wide text-muted">{f.intro}</p>
        <blockquote className="rounded-xl border border-accent/50 bg-accent/10 p-4 text-lg leading-relaxed text-white/95">
          {v.assignedCard.text}
        </blockquote>
        <p className="text-base font-medium leading-snug text-accent">{f.job}</p>
        {v.prompt && (
          <p className="text-base leading-snug text-white/90">{v.prompt}</p>
        )}
        <VoiceTextarea value={text} onChange={setText} placeholder={f.placeholder} />
        <StatusLine status={status} sentLabel="Sent." onRetry={submit} />
      </div>
      <StickyAction label="Submit" disabled={!text.trim()} onClick={submit} />
    </>
  );
};

const RedistributeProjector: Renderer = ({ view }) => {
  const v = view as RedistributeProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <h2 className="text-3xl font-semibold capitalize">
        {v.mode} — redistributed
      </h2>
      {v.prompt && <p className="text-xl text-muted">{v.prompt}</p>}
      {v.pairs.length === 0 ? (
        <p className="text-2xl text-muted">No ideas to redistribute yet…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {v.pairs.map((p) => (
            <div
              key={p.idea.id}
              className="grid grid-cols-2 gap-6 rounded-xl border border-border bg-surface p-5"
            >
              <div className="border-r border-border pr-6">
                <p className="mb-2 text-sm uppercase tracking-wide text-muted">
                  Idea
                </p>
                <p className="text-2xl leading-relaxed">{p.idea.text}</p>
              </div>
              <div>
                <p className="mb-2 text-sm uppercase tracking-wide text-muted">
                  Responses ({p.responses.length})
                </p>
                {p.responses.length === 0 ? (
                  <p className="text-xl text-muted">Awaiting a response…</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {p.responses.map((r, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-border bg-bg/40 px-4 py-2 text-xl leading-relaxed"
                      >
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const redistributeRenderers: Partial<Record<Role, Renderer>> = {
  participant: RedistributeParticipant,
  projector: RedistributeProjector,
};
