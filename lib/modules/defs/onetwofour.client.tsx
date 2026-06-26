"use client";

// Client renderers for the "onetwofour" module (1-2-4-All).
//
// The participant view scales with the stage: a big stage label + the question,
// who you're working with (yourself / your pair / your four / the whole room),
// and — when captureShared is on — a VoiceTextarea + sticky action to record
// the group's combined answer for this stage. The projector shows the current
// stage with a 1 → 2 → 4 → All progress dotline; the facilitator drives the
// stages and peeks at what's been shared.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button } from "@/components/ui";
import {
  CaptureDone,
  GroupChips,
  RoundBanner,
  StatusLine,
  StickyAction,
  useSend,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  OneTwoFourFacilitatorView,
  OneTwoFourParticipantView,
  OneTwoFourProjectorView,
} from "./onetwofour.server";

// The doubling progression, for the projector dotline + facilitator readout.
const STAGE_DOTS = ["1", "2", "4", "All"] as const;

function whoLabel(v: OneTwoFourParticipantView): string {
  if (v.round === 0) return "On your own";
  if (v.wholeRoom) return "Whole room";
  return v.groupMembers.join(", ");
}

const OneTwoFourParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as OneTwoFourParticipantView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "share", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setSubmitted(true);
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  const wantCapture = v.captureShared && v.round > 0;
  const done = v.mySharedSubmitted || submitted;

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <div className="flex flex-col gap-2">
          <RoundBanner label={`Step ${v.round + 1} of 4`} active />
          <h2 className="text-2xl font-semibold leading-tight text-white/90">
            {v.stageLabel}
          </h2>
        </div>

        {v.prompt && (
          <p className="text-lg leading-relaxed text-white/90">{v.prompt}</p>
        )}

        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          {v.round > 0 && !v.wholeRoom ? (
            <GroupChips members={v.groupMembers} label="Working with" />
          ) : (
            <>
              <p className="text-xs uppercase tracking-wide text-muted">
                {v.round === 0 ? "This step" : "Together"}
              </p>
              <p className="mt-1 text-base leading-snug text-white/90">
                {whoLabel(v)}
              </p>
            </>
          )}
        </div>

        {wantCapture &&
          (done ? (
            <CaptureDone
              title="Your shared answer is in."
              hint="Keep talking — the next step widens the circle."
            />
          ) : (
            <>
              <p className="text-base font-medium leading-snug text-accent">
                Agree on your group&apos;s combined answer, then capture it.
              </p>
              <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
                value={text}
                onChange={setText}
                placeholder="Your group&apos;s shared answer…"
              />
              <StatusLine
                status={status}
                sentLabel="Shared answer saved."
                onRetry={submit}
              />
            </>
          ))}

        {!wantCapture && (
          <p className="text-base leading-relaxed text-muted">
            {v.round === 0
              ? "Jot your own thoughts in silence — you'll compare them next."
              : "Talk it through together; the facilitator will move you on."}
          </p>
        )}
      </div>

      {wantCapture && !done && (
        <StickyAction
          label="Capture your shared answer"
          disabled={!text.trim()}
          onClick={submit}
        />
      )}
    </>
  );
};

const OneTwoFourProjector: Renderer = ({ view }) => {
  const v = view as OneTwoFourProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-4xl font-semibold">{v.stageLabel}</h2>
        <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
          {v.groupCount} {v.groupCount === 1 ? "group" : "groups"} ·{" "}
          {v.totalParticipants} in the room
        </span>
      </div>

      {/* 1 → 2 → 4 → All progress dotline */}
      <div className="flex items-center gap-4">
        {STAGE_DOTS.map((d, i) => {
          const active = i === v.round;
          const done = i < v.round;
          return (
            <div key={d} className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full border text-2xl font-semibold transition-all ${
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : done
                      ? "border-accent/40 bg-surface text-accent/70"
                      : "border-border bg-surface text-muted"
                }`}
              >
                {d}
              </div>
              {i < STAGE_DOTS.length - 1 && (
                <div
                  className={`h-0.5 w-12 ${
                    i < v.round ? "bg-accent/50" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const OneTwoFourFacilitator: Renderer = ({ view, act }) => {
  const v = view as OneTwoFourFacilitatorView;
  const atEnd = v.round >= 3;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-white/90">{v.stageLabel}</h2>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          Step {v.round + 1} of 4 · {STAGE_DOTS[Math.min(v.round, 3)]}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Same question, widening circles: alone → pairs → fours → whole group.{" "}
        {v.groupCount} {v.groupCount === 1 ? "group" : "groups"} this step, with{" "}
        {v.totalParticipants} in the room.
      </p>

      {v.shared.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <p className="text-sm uppercase tracking-wide text-muted">
            Shared so far ({v.shared.length})
          </p>
          <ul className="flex flex-col gap-2">
            {v.shared.map((s, i) => (
              <li key={i} className="text-sm leading-relaxed text-white/90">
                <span className="text-muted">{s.handle}: </span>
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={() => act({ type: "nextRound" })} disabled={atEnd}>
        {atEnd ? "Whole group — final step" : "Next step →"}
      </Button>
    </div>
  );
};

export const onetwofourRenderers: Partial<Record<Role, Renderer>> = {
  participant: OneTwoFourParticipant,
  facilitator: OneTwoFourFacilitator,
  projector: OneTwoFourProjector,
};
