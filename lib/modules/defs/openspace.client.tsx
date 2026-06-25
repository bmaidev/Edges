"use client";

// Client renderers for the openspace module.
//
// Participant: a "Propose a topic" input pinned with a StickyAction; a live list
// of proposed topics, each showing its signup count and a Join/Leave toggle
// (the Law of Two Feet — join or leave freely). Once a topic has been placed by
// the facilitator, the card tells the participant where to go.
//
// Projector: the time × space GRID (rows = time slots, columns = spaces) with
// placed topics filling cells and live signup counts, plus any not-yet-placed
// topics listed alongside. Kept large and high-contrast for a projector.

import { useState } from "react";
import { Button } from "@/components/ui";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { OpenSpaceTopic, OpenSpaceView } from "./openspace.server";

// ---- participant ----------------------------------------------------------

const OpenspaceParticipant: Renderer = ({ view, act }) => {
  const v = view as OpenSpaceView;
  const [title, setTitle] = useState("");
  const { status, setStatus } = useSend(act);

  async function propose() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    setStatus("sending");
    const ok = await act({ type: "propose", payload: { title: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
  }

  function toggle(topic: OpenSpaceTopic) {
    const joined = v.mySignups.includes(topic.id);
    act({ type: joined ? "leave" : "join", payload: { topicId: topic.id } });
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-6 pb-6">
        <p className="text-lg font-medium leading-snug">Propose a topic</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && propose()}
          placeholder="What do you want to talk about?"
          aria-label="Propose a topic"
          className="rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
        />
        {status === "error" ? (
          <StatusLine status={status} onRetry={propose} />
        ) : (
          <StatusLine status={status} sentLabel="Proposed." />
        )}

        <div className="mt-2 flex flex-col gap-3">
          {v.topics.length === 0 ? (
            <p className="text-sm text-muted">
              No topics yet — propose the first.
            </p>
          ) : (
            v.topics.map((topic) => {
              const joined = v.mySignups.includes(topic.id);
              return (
                <div
                  key={topic.id}
                  className={`flex flex-col gap-2 rounded-xl border bg-surface p-4 transition-colors ${
                    joined ? "border-accent" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex-1 text-base leading-snug">
                      {topic.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {topic.signupCount}{" "}
                      {topic.signupCount === 1 ? "person" : "people"}
                    </span>
                  </div>

                  {topic.cell ? (
                    <p className="text-sm text-accent">
                      Go to {topic.cell.space}, slot {topic.cell.slot + 1}.
                    </p>
                  ) : null}

                  <button
                    aria-pressed={joined}
                    onClick={() => toggle(topic)}
                    className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      joined
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border active:bg-[#222b54]"
                    }`}
                  >
                    {joined ? "Leave" : "Join"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {v.mySignups.length > 0 && (
          <p className="text-xs text-muted">
            You can leave any session and join another at any time — the Law of
            Two Feet.
          </p>
        )}
      </div>
      <StickyAction
        label="Propose topic"
        disabled={!title.trim()}
        onClick={propose}
      />
    </>
  );
};

// ---- projector ------------------------------------------------------------

const OpenspaceProjector: Renderer = ({ view }) => {
  const v = view as OpenSpaceView;
  const slotIdxs = Array.from({ length: v.slots }, (_, i) => i);

  // Index placed topics by "slot|space" for quick cell lookup.
  const byCell: Record<string, OpenSpaceTopic[]> = {};
  const unplaced: OpenSpaceTopic[] = [];
  for (const t of v.topics) {
    if (t.cell) {
      const key = `${t.cell.slot}|${t.cell.space}`;
      (byCell[key] ??= []).push(t);
    } else {
      unplaced.push(t);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-10">
      <h2 className="text-3xl font-semibold">Open Space agenda</h2>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-28 border border-border bg-surface p-3 text-left text-lg text-muted">
                Slot
              </th>
              {v.spaces.map((space) => (
                <th
                  key={space}
                  className="border border-border bg-surface p-3 text-left text-xl"
                >
                  {space}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slotIdxs.map((slot) => (
              <tr key={slot}>
                <th className="border border-border bg-surface p-3 text-left text-xl text-muted">
                  {slot + 1}
                </th>
                {v.spaces.map((space) => {
                  const cellTopics = byCell[`${slot}|${space}`] ?? [];
                  return (
                    <td
                      key={space}
                      className="border border-border p-3 align-top"
                    >
                      <div className="flex flex-col gap-2">
                        {cellTopics.map((t) => (
                          <div
                            key={t.id}
                            className="rounded-lg bg-accent/10 px-3 py-2"
                          >
                            <p className="text-xl leading-snug">{t.title}</p>
                            <p className="text-sm text-accent">
                              {t.signupCount}{" "}
                              {t.signupCount === 1 ? "signup" : "signups"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unplaced.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xl text-muted">Proposed — not yet placed</h3>
          <div className="flex flex-wrap gap-3">
            {unplaced.map((t) => (
              <span
                key={t.id}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-xl"
              >
                {t.title}
                <span className="ml-2 text-sm text-accent">
                  {t.signupCount}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {v.topics.length === 0 && (
        <p className="text-2xl text-muted">
          Waiting for the room to propose topics…
        </p>
      )}
    </div>
  );
};

// ---- facilitator ----------------------------------------------------------
//
// Host-console controls: a compact list of proposed topics (sorted by signups)
// with two dropdowns to choose a slot and a space, a Place button, and an
// Unplace link once a topic has been placed.

const selectClass =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none";

const OpenspaceRow = ({
  topic,
  slots,
  spaces,
  act,
}: {
  topic: OpenSpaceTopic;
  slots: number;
  spaces: string[];
  act: Parameters<Renderer>[0]["act"];
}) => {
  // Default the selectors to the current placement if any, else slot 1 / first
  // space.
  const [slot, setSlot] = useState<number>(topic.cell?.slot ?? 0);
  const [space, setSpace] = useState<string>(topic.cell?.space ?? spaces[0] ?? "");

  const slotIdxs = Array.from({ length: slots }, (_, i) => i);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex-1 text-sm leading-snug">{topic.title}</span>
        <span className="shrink-0 text-xs text-muted">
          {topic.signupCount} {topic.signupCount === 1 ? "signup" : "signups"}
        </span>
      </div>

      {topic.cell ? (
        <p className="text-xs text-accent">
          Placed: {topic.cell.space}, slot {topic.cell.slot + 1}
        </p>
      ) : (
        <p className="text-xs text-muted">Not yet placed</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`slot-${topic.id}`}>
          Slot for {topic.title}
        </label>
        <select
          id={`slot-${topic.id}`}
          value={slot}
          onChange={(e) => setSlot(Number(e.target.value))}
          className={selectClass}
        >
          {slotIdxs.map((i) => (
            <option key={i} value={i}>
              Slot {i + 1}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`space-${topic.id}`}>
          Space for {topic.title}
        </label>
        <select
          id={`space-${topic.id}`}
          value={space}
          onChange={(e) => setSpace(e.target.value)}
          className={selectClass}
        >
          {spaces.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Button
          onClick={() =>
            act({ type: "place", payload: { topicId: topic.id, slot, space } })
          }
        >
          Place
        </Button>

        {topic.cell ? (
          <button
            onClick={() =>
              act({ type: "unplace", payload: { topicId: topic.id } })
            }
            className="text-xs text-muted underline underline-offset-2 hover:text-accent"
          >
            Unplace
          </button>
        ) : null}
      </div>
    </div>
  );
};

const OpenspaceFacilitator: Renderer = ({ view, act }) => {
  const v = view as OpenSpaceView;
  const topics = [...v.topics].sort((a, b) => b.signupCount - a.signupCount);

  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <h2 className="text-lg font-medium">Place topics</h2>
      {topics.length === 0 ? (
        <p className="text-sm text-muted">No topics proposed yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {topics.map((topic) => (
            <OpenspaceRow
              key={topic.id}
              topic={topic}
              slots={v.slots}
              spaces={v.spaces}
              act={act}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const openspaceRenderers: Partial<Record<Role, Renderer>> = {
  participant: OpenspaceParticipant,
  facilitator: OpenspaceFacilitator,
  projector: OpenspaceProjector,
};
