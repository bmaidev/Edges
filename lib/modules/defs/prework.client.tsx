"use client";

// Renderers for the prework module. Participant: an unhurried, async pre-work
// screen — an optional calm facilitator brief (Loom-style written intro), the
// prompt, a VoiceTextarea + sticky "Add", honest "Saved — add more any time."
// feedback, and a running list of what the caller has already added (like the
// close module's recap) so they can build over multiple sittings. Projector: a
// plain anonymous progress display ("N people have contributed M ideas").
// Pure functions of the server-computed view + the action dispatcher.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  PreworkOverviewView,
  PreworkParticipantView,
  PreworkView,
} from "./prework.server";

// ---- participant ----------------------------------------------------------

const PreworkParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as PreworkView;
  const pv = v.for === "participant" ? (v as PreworkParticipantView) : null;

  // Hooks must run unconditionally, before any early return.
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [lastText, setLastText] = useState("");

  // Defensive: the server only sends the participant shape to this role.
  if (!pv) return <></>;

  async function add() {
    const t = text.trim();
    if (!t) return;
    setLastText(t);
    setText("");
    setStatus("sending");
    const ok = await act({ type: "submit", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1800);
    else setText(t); // restore draft so they can retry
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        {pv.brief && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">
              Before we meet
            </p>
            <p className="text-sm leading-relaxed text-white/85">{pv.brief}</p>
          </div>
        )}

        <p className="text-lg font-medium leading-snug">{pv.prompt}</p>

        <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
          value={text}
          onChange={setText}
          placeholder={pv.placeholder}
        />

        <StatusLine
          status={status}
          sentLabel="Saved — add more any time."
          onRetry={() => act({ type: "submit", payload: { text: lastText } })}
        />

        {pv.mine.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <h2 className="text-sm uppercase tracking-wide text-muted">
              What you&apos;ve added so far
            </h2>
            {pv.mine.map((c, i) => (
              <div
                key={i}
                className="animate-fadeInUp rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="mr-2 text-xs text-muted">{i + 1}</span>
                <span className="text-sm text-white/90">{c.text}</span>
              </div>
            ))}
            <p className="text-xs text-muted">
              Nothing&apos;s due right now — come back whenever an idea strikes.
            </p>
          </div>
        )}
      </div>
      <StickyAction label="Add" disabled={!text.trim()} onClick={add} />
    </>
  );
};

// ---- projector ------------------------------------------------------------

const PreworkProjector: Renderer = ({ view }) => {
  const v = view as PreworkView;
  if (v.for !== "overview") return <></>;
  const ov = v as PreworkOverviewView;

  const people = ov.contributorCount;
  const ideas = ov.contributionCount;

  return (
    <div className="flex flex-1 flex-col justify-center gap-10 p-12">
      <h2 className="text-3xl font-semibold leading-snug">{ov.prompt}</h2>

      {ideas === 0 ? (
        <p className="text-2xl text-muted">
          No pre-work yet — contributions will appear here as they come in.
        </p>
      ) : (
        <p className="text-4xl leading-relaxed text-white/90">
          <span className="font-semibold text-accent">{people}</span>{" "}
          {people === 1 ? "person has" : "people have"} contributed{" "}
          <span className="font-semibold text-accent">{ideas}</span>{" "}
          {ideas === 1 ? "idea" : "ideas"} so far.
        </p>
      )}
    </div>
  );
};

export const preworkRenderers: Partial<Record<Role, Renderer>> = {
  participant: PreworkParticipant,
  projector: PreworkProjector,
};
