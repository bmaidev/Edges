"use client";

// Renderers for the gradient module. Participant: the proposal, a vertical list
// of gradient levels as selectable buttons (the current one highlighted), and a
// reason textarea that appears when the chosen level sits in the dissent band or
// when requireReasonBelow applies. Projector: a horizontal gradient bar chart
// with the dissent band tinted red, plus the dissent count — reasons stay with
// the facilitator and never reach the projector. Pure functions of the
// server-computed view + the dispatcher.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { GradientView } from "./gradient.server";

// Does choosing this level require / invite a written reason?
function needsReason(v: GradientView, level: number): boolean {
  const inBand = v.dissentLevels.includes(level);
  const required =
    v.requireReasonBelow !== undefined && level <= v.requireReasonBelow;
  return inBand || required;
}

function isRequired(v: GradientView, level: number): boolean {
  return v.requireReasonBelow !== undefined && level <= v.requireReasonBelow;
}

// ---- participant ----------------------------------------------------------

const GradientParticipant: Renderer = ({ view, act }) => {
  const v = view as GradientView;
  const dissent = new Set(v.dissentLevels);

  const [selected, setSelected] = useState<number | null>(v.mine?.level ?? null);
  const [reason, setReason] = useState<string>(v.mine?.reason ?? "");
  const [err, setErr] = useState<string | null>(null);
  const { status, send } = useSend(act);

  const showReason = selected !== null && needsReason(v, selected);
  const reasonRequired =
    selected !== null && isRequired(v, selected) && !reason.trim();

  async function submit() {
    if (selected === null) return;
    setErr(null);
    if (reasonRequired) {
      setErr("A short reason is required for this level.");
      return;
    }
    const ok = await send({
      type: "vote",
      payload: {
        level: selected,
        reason: reason.trim() || undefined,
      },
    });
    if (!ok) setErr("Couldn't record that — try again.");
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-muted">Proposal</p>
          <p className="text-lg font-medium leading-snug">{v.proposal}</p>
        </div>

        <p className="text-sm text-muted">
          Where do you stand? Pick the level that&apos;s honestly true for you.
        </p>

        <div className="flex flex-col gap-2">
          {v.levels.map((label, i) => {
            const isMine = selected === i;
            const inBand = dissent.has(i);
            return (
              <button
                key={i}
                aria-pressed={isMine}
                onClick={() => {
                  setSelected(i);
                  setErr(null);
                }}
                className={`min-h-[56px] rounded-xl border p-4 text-left transition-colors ${
                  isMine
                    ? inBand
                      ? "border-[#ff8a8a] bg-[#ff8a8a]/10"
                      : "border-accent bg-accent/10"
                    : "border-border bg-surface active:bg-[#222b54]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base">{label}</span>
                  {inBand && (
                    <span className="shrink-0 text-xs text-[#ff8a8a]">
                      concern
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {showReason && (
          <div className="flex animate-fadeInUp flex-col gap-2">
            <p className="text-sm font-medium">
              What&apos;s the concern?
              {selected !== null && isRequired(v, selected) ? (
                <span className="ml-1 text-[#ff8a8a]">(required)</span>
              ) : (
                <span className="ml-1 text-muted">(optional)</span>
              )}
            </p>
            <VoiceTextarea
              value={reason}
              onChange={setReason}
              placeholder="Name the concern so the group can work with it…"
            />
          </div>
        )}

        {err ? (
          <p className="text-center text-xs text-[#ff8a8a]">{err}</p>
        ) : (
          <StatusLine status={status} sentLabel="Your position is in." />
        )}
        {v.mine && status === "idle" && !err && (
          <p className="text-center text-xs text-accent">
            You placed yourself at &ldquo;{v.levels[v.mine.level]}&rdquo; — pick
            another to change it.
          </p>
        )}
      </div>
      <StickyAction
        label={v.mine ? "Update my position" : "Submit my position"}
        disabled={selected === null || reasonRequired}
        onClick={submit}
      />
    </>
  );
};

// ---- projector ------------------------------------------------------------

const GradientProjector: Renderer = ({ view }) => {
  const v = view as GradientView;
  const dissent = new Set(v.dissentLevels);
  const max = Math.max(1, ...v.distribution);

  return (
    <div className="flex flex-1 flex-col justify-center gap-8 p-12">
      <div className="flex flex-col gap-2">
        <p className="text-lg uppercase tracking-wide text-muted">Proposal</p>
        <h2 className="text-3xl font-semibold leading-snug">{v.proposal}</h2>
      </div>

      <div className="flex flex-col gap-3">
        {v.levels.map((label, i) => {
          const n = v.distribution[i] ?? 0;
          const inBand = dissent.has(i);
          return (
            <div key={i} className="flex items-center gap-4">
              <span
                className={`w-72 truncate text-2xl ${
                  inBand ? "text-[#ff8a8a]" : "text-white/90"
                }`}
              >
                {label}
              </span>
              <div className="h-8 flex-1 rounded bg-surface">
                <div
                  className={`h-8 rounded transition-all ${
                    inBand ? "bg-[#ff8a8a]" : "bg-accent"
                  }`}
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-2xl text-muted">{n}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline gap-6 text-xl text-muted">
        <span>{v.total} responded</span>
        {v.dissentCount > 0 && (
          <span className="text-[#ff8a8a]">
            {v.dissentCount} with concerns or blocks — not yet consent
          </span>
        )}
        {v.total > 0 && v.dissentCount === 0 && (
          <span className="text-accent">No standing concerns.</span>
        )}
      </div>
    </div>
  );
};

export const gradientRenderers: Partial<Record<Role, Renderer>> = {
  participant: GradientParticipant,
  projector: GradientProjector,
};
