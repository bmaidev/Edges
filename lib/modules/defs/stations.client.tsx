"use client";

// Client renderers for the "stations" module (Shift & Share).
//
//   - Participant: a calm "Round N — your group → [Station]" card with the names
//     of your groupmates and, when notes are enabled, a VoiceTextarea to jot
//     what stood out at this station.
//   - Projector: the full rotation map (Group k → Station) for this round, plus
//     a hint that the tour runs for `totalStations` rounds.
//   - Facilitator: the round, a "Next round →" control, and the same map.

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
  StationsParticipantView,
  StationsProjectorView,
} from "./stations.server";

const StationsParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as StationsParticipantView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "note", payload: { text: t } });
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
        hint="You'll join a small group to tour the stations as soon as the room fills out."
      />
    );
  }

  const others = v.groupMembers;

  const noteDone = v.captureNotes && (v.myNoteSubmitted || submitted);

  return (
    <>
      <div className="flex flex-1 flex-col items-center gap-6 p-8 text-center">
        <RoundBanner label={`Round ${v.round + 1} of ${v.totalStations}`} />
        <div className="flex max-w-sm flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-muted">
            Your group is at
          </p>
          <p className="text-2xl font-semibold leading-snug text-accent">
            {v.stationName}
          </p>
        </div>
        {others.length > 0 && (
          <GroupChips members={others} label="With you" />
        )}
        {v.prompt && (
          <p className="max-w-sm text-base leading-relaxed text-white/90">
            {v.prompt}
          </p>
        )}

        {v.captureNotes &&
          (noteDone ? (
            <div className="pt-2">
              <CaptureDone
                title={`Note saved for ${v.stationName}. Add more aloud as it comes up.`}
              />
            </div>
          ) : (
            <div className="w-full max-w-sm pt-2 text-left">
              <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
                value={text}
                onChange={setText}
                placeholder={`What stood out at ${v.stationName}?`}
              />
              <div className="mt-3">
                <StatusLine
                  status={status}
                  sentLabel="Note saved."
                  onRetry={submit}
                />
              </div>
            </div>
          ))}
      </div>
      {v.captureNotes && !noteDone && (
        <StickyAction
          label="Save note"
          disabled={!text.trim()}
          onClick={submit}
        />
      )}
    </>
  );
};

const StationsProjector: Renderer = ({ view }) => {
  const v = view as StationsProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-3xl font-semibold">
          Shift &amp; Share — round {v.round + 1}
        </h2>
        <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
          {v.totalStations} {v.totalStations === 1 ? "round" : "rounds"} in all
        </span>
      </div>
      {v.prompt && <p className="text-xl text-muted">{v.prompt}</p>}
      {v.rotation.length === 0 ? (
        <p className="text-2xl text-muted">Waiting for the room to fill…</p>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {v.rotation.map((row) => (
            <div
              key={row.groupIndex}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <p className="text-2xl leading-snug">
                <span className="text-muted">Group {row.groupIndex + 1} → </span>
                <span className="text-accent">{row.stationName}</span>
              </p>
              {row.members.length > 0 && (
                <p className="text-lg text-muted">{row.members.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Host-console controls for the facilitator: advance the tour one station at a
// time. The host routes act() to handleAction with the facilitator role.
const StationsFacilitator: Renderer = ({ view, act }) => {
  const v = view as StationsProjectorView;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-white/90">
          Shift &amp; Share — round {v.round + 1}
        </h2>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          of {v.totalStations}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Groups stay together and shift to the next station each round. Run one
        round per station — {v.totalStations} in all — so every group sees every
        station. Advance when the room is ready to move.
      </p>

      {v.rotation.length === 0 ? (
        <p className="text-sm text-muted">Waiting for the room to fill…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {v.rotation.map((row) => (
            <div
              key={row.groupIndex}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <p className="text-sm">
                <span className="text-muted">Group {row.groupIndex + 1} → </span>
                <span className="text-accent">{row.stationName}</span>
              </p>
              {row.members.length > 0 && (
                <p className="truncate text-xs text-muted">
                  {row.members.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => act({ type: "nextRound" })}>Next round →</Button>
    </div>
  );
};

export const stationsRenderers: Partial<Record<Role, Renderer>> = {
  participant: StationsParticipant,
  facilitator: StationsFacilitator,
  projector: StationsProjector,
};
