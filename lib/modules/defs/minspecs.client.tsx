"use client";

// Client renderers for the "minspecs" module (Min Specs).
//
// The participant view is PHASE-GATED:
//   - EXPAND: the goal + a VoiceTextarea + a sticky "Add a rule" button, with
//     the growing list of candidate rules underneath. Add the maximum.
//   - TRIM: each rule with two choices — "Essential (keep)" (we'd fail without
//     it) vs "Could live without (cut)" — answering the subtract question.
// The projector highlights the surviving minimal specs and dims the cut ones.
// The facilitator drives the expand→trim toggle and watches the minimal set.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button } from "@/components/ui";
import { StatusLine, StickyAction, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { MinSpecsRule, MinSpecsView } from "./minspecs.server";

// ---- participant ----------------------------------------------------------

const MinSpecsParticipant: Renderer = ({ view, act }) => {
  const v = view as MinSpecsView;
  const [text, setText] = useState("");
  const { status, setStatus } = useSend(act);

  async function add() {
    const t = text.trim();
    if (!t) return;
    setStatus("sending");
    const ok = await act({ type: "addRule", payload: { text: t } });
    setStatus(ok ? "sent" : "error");
    if (ok) {
      setText("");
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  // ---- TRIM: mark each rule keep / cut ----
  if (v.phase === "trim") {
    return (
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted">
            Subtract — keep only the must-haves
          </p>
          {v.prompt && (
            <p className="mt-1 text-base leading-relaxed text-white/90">
              {v.prompt}
            </p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-accent">
            For each rule: if we ignored it, could we still succeed? If yes, cut
            it. Keep only the ones we&apos;d fail without.
          </p>
        </div>
        {v.rules.length === 0 ? (
          <p className="text-sm text-muted">No rules to sort yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {v.rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <p className="text-base leading-snug">{r.text}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    aria-pressed={r.mine === "keep"}
                    onClick={() =>
                      act({ type: "mark", payload: { ruleId: r.id, mark: "keep" } })
                    }
                    className={`min-h-[56px] rounded-lg border px-3 py-2 text-sm transition-colors ${
                      r.mine === "keep"
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted active:bg-[#222b54]"
                    }`}
                  >
                    Essential (keep)
                  </button>
                  <button
                    aria-pressed={r.mine === "cut"}
                    onClick={() =>
                      act({ type: "mark", payload: { ruleId: r.id, mark: "cut" } })
                    }
                    className={`min-h-[56px] rounded-lg border px-3 py-2 text-sm transition-colors ${
                      r.mine === "cut"
                        ? "border-[#ff8a8a] bg-[#ff8a8a]/10 text-[#ff8a8a]"
                        : "border-border text-muted active:bg-[#222b54]"
                    }`}
                  >
                    Could live without (cut)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- EXPAND: add the maximum list of rules ----
  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-28">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted">
            List every rule, must, and constraint
          </p>
          {v.prompt && (
            <p className="mt-1 text-lg font-medium leading-snug">{v.prompt}</p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Go for the maximum — we&apos;ll cut it down later. Add anything that
            feels like a rule or a must.
          </p>
        </div>
        <VoiceTextarea
          value={text}
          onChange={setText}
          placeholder="A rule or must…"
        />
        <StatusLine status={status} sentLabel="Added. Keep going." onRetry={add} />
        {v.rules.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-wide text-muted">
              So far ({v.rules.length})
            </p>
            {v.rules.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                {r.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <StickyAction label="Add a rule" disabled={!text.trim()} onClick={add} />
    </>
  );
};

// ---- shared minimal-set display (facilitator + projector) -----------------

function MinimalSet({
  rules,
  large,
}: {
  rules: MinSpecsRule[];
  large?: boolean;
}) {
  const survivors = rules.filter((r) => r.survivor);
  const cuts = rules.filter((r) => !r.survivor);
  return (
    <div className={`flex flex-col ${large ? "gap-5" : "gap-4"}`}>
      <div className="flex flex-col gap-2">
        <p
          className={`uppercase tracking-wide text-accent ${
            large ? "text-lg" : "text-sm"
          }`}
        >
          Minimum specs ({survivors.length})
        </p>
        {survivors.length === 0 ? (
          <p className="text-muted">Nothing essential yet.</p>
        ) : (
          survivors.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-accent bg-accent/10 ${
                large ? "p-5 text-2xl" : "p-4 text-base"
              }`}
            >
              <span className="leading-snug">{r.text}</span>
              <span
                className={`ml-3 text-muted ${large ? "text-lg" : "text-xs"}`}
              >
                keep {r.keep} · cut {r.cut}
              </span>
            </div>
          ))
        )}
      </div>
      {cuts.length > 0 && (
        <div className="flex flex-col gap-2 opacity-50">
          <p
            className={`uppercase tracking-wide text-muted ${
              large ? "text-lg" : "text-sm"
            }`}
          >
            Cut ({cuts.length})
          </p>
          {cuts.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-border bg-surface ${
                large ? "p-4 text-xl" : "p-3 text-sm"
              }`}
            >
              <span className="leading-snug line-through">{r.text}</span>
              <span
                className={`ml-3 text-muted ${large ? "text-base" : "text-xs"} no-underline`}
              >
                keep {r.keep} · cut {r.cut}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- projector ------------------------------------------------------------

const MinSpecsProjector: Renderer = ({ view }) => {
  const v = view as MinSpecsView;
  return (
    <div className="flex flex-1 flex-col gap-6 p-12">
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-3xl font-semibold">Min Specs</h2>
        <span className="rounded-full border border-border bg-surface px-4 py-1 text-xl text-muted">
          {v.phase === "trim" ? "Subtracting" : "Listing rules"}
        </span>
      </div>
      {v.prompt && <p className="text-xl text-muted">{v.prompt}</p>}
      {v.rules.length === 0 ? (
        <p className="text-2xl text-muted">Waiting for the first rules…</p>
      ) : v.phase === "expand" ? (
        <div className="grid grid-cols-2 gap-4 text-2xl">
          {v.rules.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border bg-surface p-5 leading-snug"
            >
              {r.text}
            </div>
          ))}
        </div>
      ) : (
        <MinimalSet rules={v.rules} large />
      )}
    </div>
  );
};

// ---- facilitator ----------------------------------------------------------

const MinSpecsFacilitator: Renderer = ({ view, act }) => {
  const v = view as MinSpecsView;
  const survivors = v.rules.filter((r) => r.survivor).length;
  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-white/90">Min Specs</h2>
        {v.phase === "trim" ? (
          <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs uppercase tracking-wide text-accent">
            Subtracting
          </span>
        ) : (
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
            Listing rules
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted">
        {v.phase === "expand"
          ? "Let the room pile up the maximum list of rules and musts. When it's exhausted, move to the trim phase to subtract."
          : "Each person marks every rule keep or cut by asking 'could we still succeed without it?'. Aim to land on 3–5 survivors."}
      </p>

      {v.phase === "expand" ? (
        <Button onClick={() => act({ type: "setPhase2", payload: { phase: "trim" } })}>
          Move to trim phase →
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={() => act({ type: "setPhase2", payload: { phase: "expand" } })}
        >
          ← Back to expand
        </Button>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm uppercase tracking-wide text-muted">
          {v.rules.length} rules · {survivors} surviving
        </p>
        {v.rules.length === 0 ? (
          <p className="text-sm text-muted">No rules yet.</p>
        ) : (
          <MinimalSet rules={v.rules} />
        )}
      </div>
    </div>
  );
};

export const minspecsRenderers: Partial<Record<Role, Renderer>> = {
  participant: MinSpecsParticipant,
  projector: MinSpecsProjector,
  facilitator: MinSpecsFacilitator,
};
