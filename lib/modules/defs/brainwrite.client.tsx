"use client";

// Renderers for the brainwrite module. Participant: a silent build-on screen —
// the card so far (stacked, anonymous), then a VoiceTextarea + sticky "Add a
// line". After a successful add, the next 2s poll rotates them to a new card.
// Projector/facilitator: how many cards are alive, total lines, a couple of
// growing chains. Pure functions of the server-computed view + the dispatcher.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import {
  StatusLine,
  StickyAction,
  useSend,
  useSyncedState,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  BrainwriteOverviewView,
  BrainwriteParticipantView,
  BrainwriteView,
} from "./brainwrite.server";

// ---- participant ----------------------------------------------------------

const BrainwriteParticipant: Renderer = ({ view, act }) => {
  const v = view as BrainwriteView;
  const pv = v.for === "participant" ? (v as BrainwriteParticipantView) : null;

  // Hooks must run unconditionally, before any early return. Re-sync the draft
  // to empty whenever the assigned card changes identity, so a rotation after
  // submit clears any leftover text.
  const cardKey = `${pv?.card?.id ?? "none"}:${pv?.card?.lines.length ?? 0}`;
  const [text, setText] = useSyncedState<string>("", cardKey);
  const { status, setStatus } = useSend(act);

  // Defensive: the server only sends the participant shape to this role.
  if (!pv) return <></>;

  const lines = pv.card?.lines ?? [];
  const remaining = Math.max(0, pv.maxLen - text.trim().length);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setText("");
    setStatus("sending");
    const ok = await act({ type: "build", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1800);
    else setText(t); // restore draft so they can retry
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
        <p className="text-lg font-medium leading-snug">{pv.prompt}</p>
        <p className="text-xs uppercase tracking-wide text-muted">
          Build on this — no talking.
        </p>

        {pv.card ? (
          <div className="flex flex-col gap-2">
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
                This card is blank — write the first line and start it off.
              </div>
            ) : (
              lines.map((l, i) => (
                <div
                  key={i}
                  className="animate-fadeInUp rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span className="mr-2 text-xs text-muted">{i + 1}</span>
                  <span className="text-sm text-white/90">{l.text}</span>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Waiting for a card to build on…</p>
        )}

        <div className="mt-2 flex flex-col gap-2">
          <VoiceTextarea
            value={text}
            onChange={(next) => setText(next.slice(0, pv.maxLen))}
            placeholder="Add the next line…"
          />
          <p className="text-right text-xs text-muted">{remaining} left</p>
        </div>

        <StatusLine
          status={status}
          sentLabel="Added. Passing you a new card…"
          onRetry={add}
        />
        {pv.myContributionCount > 0 && status === "idle" && (
          <p className="text-center text-xs text-muted">
            You&apos;ve added {pv.myContributionCount} line
            {pv.myContributionCount === 1 ? "" : "s"} to this card.
          </p>
        )}
      </div>
      <StickyAction
        label="Add a line"
        disabled={!text.trim() || !pv.card}
        onClick={add}
      />
    </>
  );
};

// ---- projector ------------------------------------------------------------

const BrainwriteProjector: Renderer = ({ view }) => {
  const v = view as BrainwriteView;
  if (v.for !== "overview") return <></>;
  const ov = v as BrainwriteOverviewView;

  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <h2 className="text-3xl font-semibold">{ov.prompt}</h2>

      <div className="flex gap-12">
        <div>
          <p className="text-6xl font-semibold text-accent">{ov.cardCount}</p>
          <p className="text-lg text-muted">cards in play</p>
        </div>
        <div>
          <p className="text-6xl font-semibold text-accent">
            {ov.totalContributions}
          </p>
          <p className="text-lg text-muted">lines written</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6">
        {ov.longestChains.length === 0 ? (
          <p className="text-2xl text-muted">Waiting for the first lines…</p>
        ) : (
          ov.longestChains.map((chain, ci) => (
            <div key={ci} className="flex flex-col gap-2">
              <p className="text-sm uppercase tracking-wide text-muted">
                Chain of {chain.length}
              </p>
              {chain.slice(-4).map((l, i) => (
                <p
                  key={i}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-xl text-white/90"
                >
                  {l.text}
                </p>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const brainwriteRenderers: Partial<Record<Role, Renderer>> = {
  participant: BrainwriteParticipant,
  projector: BrainwriteProjector,
};
