"use client";

// Client renderers for the "consult" module (Troika / Wise Crowds).
//
// The participant view is PHASE-GATED by role + the client-silent flag:
//   - Client, open: "you're presenting — share your challenge, then listen."
//   - Client, silent: a dimmed "Listen only" panel with input DISABLED — the
//     digital equivalent of turning your back so you can't steer the advice.
//   - Consultant: the client's name + the prompt + a VoiceTextarea to advise.
// The projector shows the round, the role map per group, and a soft timer hint.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button } from "@/components/ui";
import {
  CaptureDone,
  GroupChips,
  RoundBanner,
  StatusLine,
  StickyAction,
  WaitingForGroup,
  useSend,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  ConsultParticipantView,
  ConsultProjectorView,
} from "./consult.server";

const ConsultParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as ConsultParticipantView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "advise", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setSubmitted(true);
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  // No group could be formed (solo, or a stale record).
  if (v.ungrouped) {
    return (
      <WaitingForGroup
        title="Waiting to be placed in a group…"
        hint="You'll be slotted into a trio (or a pair) as soon as the room fills out."
      />
    );
  }

  const others = v.groupMembers.filter((h) => h !== v.clientName);

  // ---- I am the CLIENT this round ----
  if (v.role === "client") {
    // Silent sub-phase: input disabled, panel dimmed — turn your back.
    if (v.silent) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center opacity-60">
          <RoundBanner label={`Round ${v.round + 1} · You're the client`} />
          <div className="flex max-w-sm flex-col gap-3 rounded-xl border border-border bg-surface p-6">
            <p className="text-lg font-medium leading-relaxed text-white/90">
              Listen only — let your consultants think aloud.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Don&apos;t respond, defend, or explain. Turning your back is the
              point: it lets the advice come without you steering it. Just take
              it in.
            </p>
          </div>
          {/* Disabled input — the digital equivalent of turning your back. */}
          <textarea
            disabled
            rows={3}
            placeholder="Microphone and notes are off while you listen."
            className="w-full max-w-sm cursor-not-allowed resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base text-white placeholder:text-muted/80 disabled:opacity-50"
          />
        </div>
      );
    }
    // Open client sub-phase: present your challenge, then prepare to listen.
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <RoundBanner label={`Round ${v.round + 1} · You're the client`} active />
        <p className="max-w-sm text-lg font-medium leading-relaxed text-white/90">
          You&apos;re presenting — share your challenge, then listen.
        </p>
        {v.prompt && (
          <p className="max-w-sm text-base leading-relaxed text-muted">
            {v.prompt}
          </p>
        )}
        {others.length > 0 && (
          <GroupChips members={others} label="Your consultants" />
        )}
        <p className="max-w-xs text-xs text-muted">
          When the facilitator starts the silent round, your input will switch
          off — that&apos;s your cue to stop talking and just listen.
        </p>
      </div>
    );
  }

  // ---- I am a CONSULTANT this round ----
  if (v.myAdviceSubmitted || submitted) {
    return (
      <CaptureDone
        title="Your advice is in."
        hint={`Keep the conversation going with ${v.clientName} listening — add more aloud as it comes to you.`}
      />
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <RoundBanner label={`Round ${v.round + 1} · Consulting for ${v.clientName}`} />
        {v.silent && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            {v.clientName} is listening only now — think aloud together, no need
            to wait for them.
          </p>
        )}
        <div>
          <p className="text-sm uppercase tracking-wide text-muted">
            {v.clientName}&apos;s challenge
          </p>
          {v.prompt && (
            <p className="mt-1 text-base leading-relaxed text-white/90">
              {v.prompt}
            </p>
          )}
        </div>
        <p className="text-base font-medium leading-snug text-accent">
          {v.format === "wisecrowds"
            ? "Offer a clear-eyed view: what you notice, and what you'd recommend."
            : "Advise as if it were your own challenge — be useful, be honest."}
        </p>
        <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
          value={text}
          onChange={setText}
          placeholder="Your advice…"
        />
        <StatusLine status={status} sentLabel="Advice sent." onRetry={submit} />
      </div>
      <StickyAction
        label="Give advice"
        disabled={!text.trim()}
        onClick={submit}
      />
    </>
  );
};

const ConsultProjector: Renderer = ({ view }) => {
  const v = view as ConsultProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-3xl font-semibold capitalize">
          {v.format === "wisecrowds" ? "Wise Crowds" : "Troika"} — round{" "}
          {v.round + 1}
        </h2>
        {v.silent ? (
          <span className="rounded-full border border-accent/50 bg-accent/10 px-4 py-1 text-xl text-accent">
            Clients listening — consultants advise
          </span>
        ) : (
          <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
            Clients presenting
          </span>
        )}
      </div>
      {v.prompt && <p className="text-xl text-muted">{v.prompt}</p>}
      {v.phaseSeconds && (
        <p className="text-lg text-muted">
          Timing hint: ~{Math.round(v.phaseSeconds.present / 60)} min to present,
          then ~{Math.round(v.phaseSeconds.advise / 60)} min of silent advice.
        </p>
      )}
      {v.groups.length === 0 ? (
        <p className="text-2xl text-muted">Waiting for the room to fill…</p>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {v.groups.map((g) => (
            <div
              key={g.groupId}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm uppercase tracking-wide text-muted">
                  Group {g.groupId + 1}
                </p>
                <p className="text-sm text-muted">{g.advice.length} advised</p>
              </div>
              <p className="text-2xl leading-snug">
                <span className="text-accent">{g.clientName}</span>
                <span className="text-muted"> is the client</span>
              </p>
              {g.consultants.length > 0 && (
                <p className="text-lg text-muted">
                  Consultants: {g.consultants.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Host-console controls for the facilitator: drive the rounds and toggle the
// client-silent sub-phase. The host mounts this and routes act() to the
// module's handleAction with the host (facilitator) role.
const ConsultFacilitator: Renderer = ({ view, act }) => {
  const v = view as ConsultProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold capitalize text-white/90">
          {v.format === "wisecrowds" ? "Wise Crowds" : "Troika"} — round{" "}
          {v.round + 1}
        </h2>
        {v.silent ? (
          <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs uppercase tracking-wide text-accent">
            Client silent
          </span>
        ) : (
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
            Client presenting
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Each round, a new member of every group becomes the silent client while
        the others advise. Toggle the silent sub-phase when the client should
        stop talking and just listen, then advance to rotate the role.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm uppercase tracking-wide text-muted">
          Silent sub-phase
        </p>
        <Button
          variant="ghost"
          onClick={() => act({ type: "setSilent", payload: { silent: !v.silent } })}
        >
          Client silent: {v.silent ? "ON" : "OFF"}
        </Button>
      </div>

      <Button onClick={() => act({ type: "nextRound" })}>Next round →</Button>
    </div>
  );
};

export const consultRenderers: Partial<Record<Role, Renderer>> = {
  participant: ConsultParticipant,
  facilitator: ConsultFacilitator,
  projector: ConsultProjector,
};
