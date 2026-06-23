"use client";

// Client renderers for the "twentyfive10" module (25/10 Crowd Sourcing).
//
// Participant view is phase-gated by the round counter:
//   - WRITE (round 0): a prompt + VoiceTextarea + sticky "Submit your idea".
//   - SCORING (round >= 1): the anonymous card you're handed + a 1..maxScore
//     picker; a new card comes each pass. Authorship is never shown.
// Projector shows a descending leaderboard of the top ideas by score.
// Facilitator drives the passes ("Next pass →") alongside the leaderboard.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button } from "@/components/ui";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  Twentyfive10ParticipantView,
  Twentyfive10ResultsView,
} from "./twentyfive10.server";

const Twentyfive10Participant: Renderer = ({ view, act }) => {
  const v = view as Twentyfive10ParticipantView;
  // Hooks unconditional, before any early return.
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [submitted, setSubmitted] = useState(false);

  async function submitIdea() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "submit", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setSubmitted(true);
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  async function score(n: number, cardId: string) {
    setStatus("sending");
    const ok = await act({ type: "score", payload: { score: n, cardId } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1800);
  }

  // ---- WRITE phase ----
  if (v.phase === "write") {
    if (v.myIdeaSubmitted || submitted) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-accent/20" />
          <p className="max-w-xs text-lg leading-relaxed text-white/90">
            Your idea is in.
          </p>
          <p className="text-sm text-muted">
            In a moment it&apos;ll detach from your name and start circulating —
            you&apos;ll be handed others&apos; ideas to score, one each pass.
          </p>
        </div>
      );
    }
    return (
      <>
        <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
          <p className="text-sm uppercase tracking-wide text-muted">
            Write one bold idea
          </p>
          {v.prompt && (
            <p className="text-lg leading-relaxed text-white/90">{v.prompt}</p>
          )}
          <p className="text-sm leading-relaxed text-muted">
            Just one. Make it bold — no one will know it&apos;s yours.
          </p>
          <VoiceTextarea
            value={text}
            onChange={setText}
            placeholder="Your one bold idea…"
          />
          <StatusLine status={status} sentLabel="Sent." onRetry={submitIdea} />
        </div>
        <StickyAction
          label="Submit your idea"
          disabled={!text.trim()}
          onClick={submitIdea}
        />
      </>
    );
  }

  // ---- SCORING phase ----
  if (!v.assignedCard) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="max-w-xs text-lg leading-relaxed text-white/90">
          Waiting for a card to score…
        </p>
        <p className="text-sm text-muted">
          You&apos;ll be handed someone else&apos;s idea — anonymously — the moment
          there are enough to go around.
        </p>
      </div>
    );
  }

  const scores = Array.from({ length: v.maxScore }, (_, i) => i + 1);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          Pass {v.round} of {v.passes}
        </span>
        {v.myScoreForIt != null && (
          <span className="text-xs text-accent">Scored {v.myScoreForIt}</span>
        )}
      </div>

      <blockquote className="rounded-xl border border-accent/50 bg-accent/10 p-5 text-lg leading-relaxed text-white/95">
        {v.assignedCard.text}
      </blockquote>

      <p className="text-base font-medium leading-snug text-accent">
        How bold and useful is this idea? Score it {1}–{v.maxScore}.
      </p>

      <div className="flex justify-between gap-2">
        {scores.map((n) => {
          const selected = v.myScoreForIt === n;
          return (
            <Button
              key={n}
              variant={selected ? "primary" : "ghost"}
              className="h-14 flex-1 !px-0 text-lg"
              onClick={() => score(n, v.assignedCard!.id)}
            >
              {n}
            </Button>
          );
        })}
      </div>

      <StatusLine
        status={status}
        sentLabel="Score saved."
        onRetry={() =>
          v.myScoreForIt != null && score(v.myScoreForIt, v.assignedCard!.id)
        }
      />

      <p className="text-center text-xs text-muted">
        A fresh card comes each pass — keep scoring as they arrive.
      </p>
    </div>
  );
};

// Descending, countdown-style leaderboard shared by projector + facilitator.
function Leaderboard({
  v,
  big,
}: {
  v: Twentyfive10ResultsView;
  big?: boolean;
}) {
  if (v.top.length === 0) {
    return (
      <p className={big ? "text-2xl text-muted" : "text-base text-muted"}>
        {v.phase === "write"
          ? "Collecting ideas…"
          : "No scores in yet — they'll surface here."}
      </p>
    );
  }
  const max = Math.max(1, v.maxPossible, ...v.top.map((c) => c.total));
  return (
    <ol className="flex flex-col gap-3">
      {v.top.map((c, i) => (
        <li
          key={c.id}
          className={`flex items-center gap-4 rounded-xl border border-border bg-surface ${
            big ? "p-5" : "p-3"
          }`}
        >
          <span
            className={`shrink-0 tabular-nums text-muted ${
              big ? "w-10 text-3xl" : "w-7 text-xl"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`leading-snug ${big ? "text-2xl" : "text-base"} ${
                i === 0 ? "text-accent" : "text-white/90"
              }`}
            >
              {c.text}
            </p>
            <div className="mt-2 h-2 rounded bg-bg/50">
              <div
                className="h-2 rounded bg-accent transition-all"
                style={{ width: `${(c.total / max) * 100}%` }}
              />
            </div>
          </div>
          <span
            className={`shrink-0 text-right tabular-nums ${
              big ? "w-20 text-3xl" : "w-14 text-xl"
            } ${i === 0 ? "text-accent" : "text-white/90"}`}
          >
            {c.total}
          </span>
        </li>
      ))}
    </ol>
  );
}

const Twentyfive10Projector: Renderer = ({ view }) => {
  const v = view as Twentyfive10ResultsView;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-3xl font-semibold">25/10 Crowd Sourcing</h2>
        <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
          {v.phase === "write"
            ? "Writing ideas…"
            : `Pass ${v.round} of ${v.passes}`}
        </span>
      </div>
      {v.prompt && <p className="text-xl text-muted">{v.prompt}</p>}
      <p className="text-lg text-muted">
        {v.ideaCount} {v.ideaCount === 1 ? "idea" : "ideas"} · top by score (out
        of {v.maxPossible})
      </p>
      <Leaderboard v={v} big />
    </div>
  );
};

const Twentyfive10Facilitator: Renderer = ({ view, act }) => {
  const v = view as Twentyfive10ResultsView;
  const atEnd = v.round >= v.passes;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-white/90">
          25/10 Crowd Sourcing
        </h2>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          {v.phase === "write" ? "Writing" : `Pass ${v.round} of ${v.passes}`}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        {v.phase === "write"
          ? `Everyone writes one bold idea (${v.ideaCount} in so far). When they're in, start the first scoring pass.`
          : `Each pass hands everyone a fresh anonymous card to score 1–${v.maxScore}. Advance to send the next card around.`}
      </p>

      <Button
        onClick={() => act({ type: "nextRound" })}
        disabled={atEnd && v.phase === "score"}
      >
        {v.phase === "write" ? "Start scoring →" : atEnd ? "All passes done" : "Next pass →"}
      </Button>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm uppercase tracking-wide text-muted">
          Top ideas (of {v.maxPossible})
        </p>
        <Leaderboard v={v} />
      </div>
    </div>
  );
};

export const twentyfive10Renderers: Partial<Record<Role, Renderer>> = {
  participant: Twentyfive10Participant,
  projector: Twentyfive10Projector,
  facilitator: Twentyfive10Facilitator,
};
