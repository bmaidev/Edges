"use client";

// Fishbowl renderers. The visual focal point is the inner circle of seats: the
// one empty chair is highlighted and carries the "Take the empty seat" call to
// action. Seated speakers get a "Leave the circle" button; observers (when the
// phase allows it) get a question input. Identities are never shown to other
// participants — the server hands back "Speaker 1..N".

import { useState } from "react";
import { Button } from "@/components/ui";
import { StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { FishbowlView } from "./fishbowl.server";

// ---- shared: the inner circle ---------------------------------------------

interface SeatSlot {
  kind: "speaker" | "empty";
  label: string;
}

// Build the ring: occupied seats first (as the server ordered them), then the
// empty chairs. We surface only ONE empty chair as the live affordance to keep
// the invariant legible ("there is room — take it"), but render the rest dimmed.
function seatSlots(v: FishbowlView): SeatSlot[] {
  const slots: SeatSlot[] = v.speakers.map((s) => ({
    kind: "speaker" as const,
    label: s.label,
  }));
  for (let i = 0; i < v.emptySeats; i++) {
    slots.push({ kind: "empty", label: "Empty" });
  }
  return slots;
}

// Lay seats out evenly around a circle. `size` is the diameter in px.
function Circle({
  slots,
  size,
  highlightFirstEmpty,
}: {
  slots: SeatSlot[];
  size: number;
  highlightFirstEmpty: boolean;
}) {
  const radius = size / 2;
  const seatSize = Math.max(48, Math.min(96, size / 4));
  const n = Math.max(slots.length, 1);
  let firstEmptyMarked = false;

  return (
    <div
      className="relative mx-auto rounded-full border border-border bg-surface/40"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-muted">
        the circle
      </span>
      {slots.map((slot, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const cx = radius + (radius - seatSize / 2) * Math.cos(angle);
        const cy = radius + (radius - seatSize / 2) * Math.sin(angle);
        const isEmpty = slot.kind === "empty";
        const isLiveEmpty = isEmpty && !firstEmptyMarked && highlightFirstEmpty;
        if (isEmpty && !firstEmptyMarked) firstEmptyMarked = true;
        return (
          <div
            key={i}
            className={`absolute flex flex-col items-center justify-center rounded-full border text-center text-[11px] leading-tight transition-colors ${
              isEmpty
                ? isLiveEmpty
                  ? "border-accent bg-accent/15 text-accent animate-pulseSoft"
                  : "border-dashed border-border bg-transparent text-muted"
                : "border-accent/60 bg-accent/10 text-white/90"
            }`}
            style={{
              width: seatSize,
              height: seatSize,
              left: cx - seatSize / 2,
              top: cy - seatSize / 2,
            }}
          >
            {isEmpty ? (isLiveEmpty ? "Empty seat" : "—") : slot.label}
          </div>
        );
      })}
    </div>
  );
}

// ---- participant ----------------------------------------------------------

const FishbowlParticipant: Renderer = ({ view, act }) => {
  const v = view as FishbowlView;
  const slots = seatSlots(v);
  const { status, send, setStatus } = useSend(act);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function take() {
    setErr(null);
    const ok = await send({ type: "sit" });
    if (!ok) setErr("Someone just took the last seat — try again in a moment.");
  }

  async function ask() {
    const text = q.trim();
    if (!text) return;
    setQ("");
    setStatus("sending");
    const ok = await act({ type: "ask", payload: { text } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">The fishbowl</h2>
        <span className="text-xs text-muted">
          {v.occupantCount} / {v.innerSeats} speaking
        </span>
      </div>

      <Circle slots={slots} size={260} highlightFirstEmpty={v.canSit} />

      {/* The empty-chair affordance is the focal point. */}
      {v.amSeated ? (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-accent">
            You&apos;re in the circle — you have the floor.
          </p>
          <Button className="w-full" onClick={() => send({ type: "leave" })}>
            Leave the circle
          </Button>
        </div>
      ) : v.canSit ? (
        <div className="flex flex-col gap-2">
          <Button className="w-full" onClick={take}>
            Take the empty seat
          </Button>
          <p className="text-center text-xs text-muted">
            Take a seat to join the conversation — a current speaker then steps
            out.
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted">
          The circle is full. Wait for an empty chair to open up.
        </p>
      )}

      {err && <p className="text-center text-sm text-[#ff8a8a]">{err}</p>}
      <StatusLine status={status} sentLabel="Done." onRetry={take} />

      {/* Observers may drop in a question card. */}
      {v.allowQuestions && !v.amSeated && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm text-muted">
            Not in the circle? Send a question to the speakers.
          </p>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask a question…"
              aria-label="Ask a question"
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
            />
            <Button onClick={ask}>Ask</Button>
          </div>
        </div>
      )}

      {/* Speakers see the incoming question feed. */}
      {v.amSeated && v.allowQuestions && v.questions.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-sm uppercase tracking-wide text-muted">
            Questions from the room
          </h3>
          {v.questions.map((qq) => (
            <div
              key={qq.id}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            >
              {qq.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- projector ------------------------------------------------------------

const FishbowlProjector: Renderer = ({ view }) => {
  const v = view as FishbowlView;
  const slots = seatSlots(v);
  return (
    <div className="flex flex-1 items-center justify-center gap-12 p-12">
      <div className="flex flex-col items-center gap-6">
        {/* On the projector the empty chair is always highlighted: it is the
            standing invitation to the room. */}
        <Circle slots={slots} size={480} highlightFirstEmpty={v.emptySeats > 0} />
        <p className="text-xl text-muted">
          {v.emptySeats > 0
            ? "An empty chair is open — step in to speak."
            : "The circle is full."}
        </p>
      </div>

      {v.allowQuestions && (
        <div className="flex max-w-md flex-1 flex-col gap-3">
          <h2 className="text-2xl font-semibold">Questions from the room</h2>
          {v.questions.length === 0 ? (
            <p className="text-xl text-muted">No questions yet.</p>
          ) : (
            v.questions
              .slice(-12)
              .reverse()
              .map((qq) => (
                <div
                  key={qq.id}
                  className="animate-fadeInUp rounded-xl border border-border bg-surface px-5 py-3 text-xl leading-snug"
                >
                  {qq.text}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
};

// ---- export ---------------------------------------------------------------

export const fishbowlRenderers: Partial<Record<Role, Renderer>> = {
  participant: FishbowlParticipant,
  projector: FishbowlProjector,
};
