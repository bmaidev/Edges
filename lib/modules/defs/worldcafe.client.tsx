"use client";

// Client renderers for the "worldcafe" module (World Café).
//
// Participant: "Round N — go to Table K", the host's name + your tablemates, and
//   the shared question front-and-centre. Hosts instead see a "stay put and
//   welcome travellers" panel. With captureNotes on, travellers and hosts can
//   record the table's shared insight via a VoiceTextarea + StickyAction.
// Projector: the live table map + round, for the room to orient by.
// Facilitator: the round number, a "Next round →" control, and a table overview.

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
  WorldCafeOverview,
  WorldCafeParticipantView,
} from "./worldcafe.server";

const WorldCafeParticipant: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as WorldCafeParticipantView;
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

  // No table could be formed (solo, or a stale record).
  if (v.ungrouped) {
    return (
      <WaitingForGroup
        title="Waiting to be seated at a table…"
        hint="You'll be sent to a table as soon as the room fills out."
      />
    );
  }

  const tableLabel = `Table ${v.tableIndex + 1}`;
  const noteDone = v.captureNotes && (v.myNoteSubmitted || submitted);

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <RoundBanner label={`Round ${v.round + 1}`} active={v.isHost} />

        {v.isHost ? (
          <div className="flex flex-col gap-2 rounded-xl border border-accent/50 bg-accent/10 p-5">
            <p className="text-lg font-medium leading-relaxed text-accent">
              You&apos;re hosting {tableLabel} — stay put and welcome travellers.
            </p>
            <p className="text-sm leading-relaxed text-muted">
              Keep your table&apos;s thread alive: catch new arrivals up on what
              you&apos;ve heard so far, then weave their ideas in.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-semibold leading-snug text-white/90">
              Go to {tableLabel}
            </p>
            <p className="text-sm text-muted">
              Your host: <span className="text-accent">{v.hostName}</span>
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm uppercase tracking-wide text-muted">
            The question
          </p>
          {v.prompt && (
            <p className="mt-1 text-lg leading-relaxed text-white/90">
              {v.prompt}
            </p>
          )}
        </div>

        {v.tablemates.length > 0 && (
          <GroupChips
            members={v.tablemates}
            host={v.hostName}
            label={v.isHost ? "At your table" : "Your tablemates"}
          />
        )}

        {v.captureNotes &&
          (noteDone ? (
            <CaptureDone
              title="Your table's insight is in."
              hint="Carry the conversation to your next table."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm uppercase tracking-wide text-muted">
                Capture this table&apos;s shared insight
              </p>
              <VoiceTextarea
            draftKey={`edges_draft:${token}:${phaseId}`}
                value={text}
                onChange={setText}
                placeholder="What surfaced at this table…"
              />
              <StatusLine
                status={status}
                sentLabel="Insight saved."
                onRetry={submit}
              />
            </div>
          ))}
      </div>
      {v.captureNotes && !noteDone && (
        <StickyAction
          label="Save insight"
          disabled={!text.trim()}
          onClick={submit}
        />
      )}
    </>
  );
};

const WorldCafeProjector: Renderer = ({ view }) => {
  const v = view as WorldCafeOverview;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-3xl font-semibold">World Café — round {v.round + 1}</h2>
        <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
          {v.tableCount} {v.tableCount === 1 ? "table" : "tables"}
        </span>
      </div>
      {v.prompt && <p className="text-2xl leading-snug text-white/90">{v.prompt}</p>}
      {v.tables.length === 0 ? (
        <p className="text-2xl text-muted">Waiting for the room to fill…</p>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {v.tables.map((t) => (
            <div
              key={t.tableIndex}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm uppercase tracking-wide text-muted">
                  Table {t.tableIndex + 1}
                </p>
                <p className="text-sm text-muted">{t.members.length} here</p>
              </div>
              <p className="text-2xl leading-snug">
                <span className="text-accent">{t.hostName}</span>
                <span className="text-muted"> hosts</span>
              </p>
              {t.members.length > 0 && (
                <p className="text-lg text-muted">{t.members.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Host-console control for the facilitator: advance the round to scatter the
// travellers to fresh tables. Routes act() to the module's handleAction with the
// facilitator role.
const WorldCafeFacilitator: Renderer = ({ view, act }) => {
  const v = view as WorldCafeOverview;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-white/90">
          World Café — round {v.round + 1}
        </h2>
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          {v.tableCount} {v.tableCount === 1 ? "table" : "tables"}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Each table keeps its host; advancing the round scatters everyone else to
        a fresh table, carrying their conversation with them.
      </p>

      {v.prompt && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white/90">
          {v.prompt}
        </p>
      )}

      <Button onClick={() => act({ type: "nextRound" })}>Next round →</Button>

      <div className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-wide text-muted">Tables</p>
        {v.tables.length === 0 ? (
          <p className="text-sm text-muted">Waiting for the room to fill…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {v.tables.map((t) => (
              <div
                key={t.tableIndex}
                className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium text-white/90">
                    Table {t.tableIndex + 1}
                  </p>
                  <p className="text-xs text-muted">
                    host <span className="text-accent">{t.hostName}</span>
                  </p>
                </div>
                {t.members.length > 0 && (
                  <p className="text-xs text-muted">{t.members.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const worldcafeRenderers: Partial<Record<Role, Renderer>> = {
  participant: WorldCafeParticipant,
  projector: WorldCafeProjector,
  facilitator: WorldCafeFacilitator,
};
