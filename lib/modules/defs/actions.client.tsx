"use client";

// Renderers for the actions module. Participant: a yours-first commitments
// screen — your own items stacked at the top, then a VoiceTextarea (+ optional
// owner field) and a sticky "Add commitment" until you hit the cap. Projector:
// counts only — a calm "N actions · M people", never anyone's words.
// Facilitator: the list with owners, for follow-up. Pure functions of the
// server-computed view + the dispatcher.

import { VoiceTextarea } from "@/components/VoiceTextarea";
import {
  BigStat,
  StatusLine,
  StickyAction,
  useSend,
  useSyncedState,
} from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  ActionsFacilitatorView,
  ActionsParticipantView,
  ActionsProjectorView,
  ActionsView,
} from "./actions.server";

// ---- participant ----------------------------------------------------------

const ActionsParticipant: Renderer = ({ view, act, token, phaseId, handle }) => {
  const v = view as ActionsView;
  const pv = v.for === "participant" ? (v as ActionsParticipantView) : null;

  // Re-sync the drafts whenever the count of my items changes (after a
  // successful add), so the fields clear cleanly for the next commitment.
  const dep = `${pv?.mine.length ?? 0}`;
  const [text, setText] = useSyncedState<string>("", dep);
  const [owner, setOwner] = useSyncedState<string>("", dep);
  const { status, setStatus } = useSend(act);

  // Defensive: the server only sends the participant shape to this role.
  if (!pv) return <></>;

  const atLimit = pv.remaining <= 0;
  const remainingChars = Math.max(0, pv.maxLen - text.trim().length);

  async function add() {
    const t = text.trim();
    if (!t || atLimit) return;
    const o = owner.trim();
    setText("");
    setOwner("");
    setStatus("sending");
    const ok = await act({
      type: "add",
      payload: pv!.askOwner && o ? { text: t, owner: o } : { text: t },
    });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1800);
    else {
      setText(t); // restore the draft so they can retry
      if (o) setOwner(o);
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <p className="text-lg font-medium leading-snug">{pv.prompt}</p>
        <p className="text-xs uppercase tracking-wide text-muted">
          Yours to keep — what will you do?
        </p>

        {/* Yours-first: the caller's own commitments, stacked. */}
        {pv.mine.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {pv.mine.map((item, i) => (
              <li
                key={i}
                className="animate-fadeInUp rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="mr-2 text-xs text-muted">{i + 1}</span>
                <span className="text-sm text-white/90">{item.text}</span>
                {pv.askOwner && (
                  <span className="mt-1 block text-xs text-accent">
                    → {item.owner}
                  </span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
            Nothing yet — capture the first thing you&apos;ll do.
          </div>
        )}

        {!atLimit ? (
          <div className="mt-1 flex flex-col gap-2">
            <VoiceTextarea
              draftKey={`edges_draft:${token}:${phaseId}`}
              value={text}
              onChange={(next) => setText(next.slice(0, pv.maxLen))}
              placeholder="One concrete action…"
            />
            {pv.askOwner && (
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value.slice(0, 60))}
                placeholder={`Owner — defaults to ${handle || "you"}`}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            )}
            <p className="text-right text-xs text-muted">
              {remainingChars} left · {pv.remaining} more action
              {pv.remaining === 1 ? "" : "s"}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-center text-sm text-accent">
            That&apos;s your full list — {pv.mine.length} captured. Nicely done.
          </p>
        )}

        <StatusLine status={status} sentLabel="Captured." onRetry={add} />

        {pv.contributorCount > 0 && (
          <p className="text-center text-xs text-muted">
            {pv.roomCount} action{pv.roomCount === 1 ? "" : "s"} from{" "}
            {pv.contributorCount} {pv.contributorCount === 1 ? "person" : "people"}{" "}
            so far.
          </p>
        )}
      </div>
      {!atLimit && (
        <StickyAction
          label="Add commitment"
          disabled={!text.trim()}
          onClick={add}
        />
      )}
    </>
  );
};

// ---- projector (counts only — never the words) ----------------------------

const ActionsProjector: Renderer = ({ view }) => {
  const v = view as ActionsView;
  if (v.for !== "projector") return <></>;
  const ov = v as ActionsProjectorView;

  return (
    <div className="flex flex-1 flex-col gap-10 p-12">
      <h2 className="font-display text-3xl font-semibold">{ov.prompt}</h2>
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        {ov.roomCount === 0 ? (
          <p className="text-2xl text-muted">
            Capturing commitments — privately, on each phone.
          </p>
        ) : (
          <div className="flex items-end gap-16">
            <BigStat value={ov.roomCount} label="commitments made" />
            <BigStat value={ov.contributorCount} label="people committed" />
          </div>
        )}
        <p className="text-sm uppercase tracking-wide text-muted">
          Each is private to the person who wrote it.
        </p>
      </div>
    </div>
  );
};

// ---- facilitator / cohost / admin (the list, for follow-up) ---------------

const ActionsFacilitator: Renderer = ({ view }) => {
  const v = view as ActionsView;
  if (v.for !== "facilitator") return <></>;
  const fv = v as ActionsFacilitatorView;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <p className="text-sm font-medium">{fv.prompt}</p>
        <p className="text-xs text-muted">
          {fv.items.length} action{fv.items.length === 1 ? "" : "s"} ·{" "}
          {fv.contributorCount}{" "}
          {fv.contributorCount === 1 ? "person" : "people"}
        </p>
      </div>
      {fv.items.length === 0 ? (
        <p className="text-sm text-muted">
          No commitments captured yet — they&apos;ll appear here as they come in.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fv.items.map((item, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="text-white/90">{item.text}</span>
              <span className="ml-2 text-xs text-accent">→ {item.owner}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const actionsRenderers: Partial<Record<Role, Renderer>> = {
  participant: ActionsParticipant,
  projector: ActionsProjector,
  facilitator: ActionsFacilitator,
  cohost: ActionsFacilitator,
  admin: ActionsFacilitator,
};
