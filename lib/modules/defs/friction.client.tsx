"use client";

// Module: friction (AI tension / friction map) — client renderers.
//
// facilitator: the control surface. Shows the current input count, a
//   "Map the tensions" / "Regenerate" button that triggers the AI "generate"
//   action, then each tension with its poles, intensity, de-identified example
//   phrases, and a suggested discussion prompt.
// projector: a striking room-facing visual — each tension as
//   poleA ←——→ poleB with a two-sided intensity bar. No examples.
// participant: the tensions (axis + one-liner + intensity), no examples.
//
// Renderers are pure functions of the server-computed view + an action
// dispatcher. The AI result is produced server-side (handleAction "generate"),
// cached in ctx.store, and surfaced through computeView — renderers never call
// Claude.

import type { Role } from "../types";
import { AiGenerating, Reveal, StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { FrictionTension, FrictionView } from "./friction.server";
import { Button } from "@/components/ui";

// ---- shared two-sided intensity bar ---------------------------------------

// A horizontal poleA ←——→ poleB track. The fill leans toward the higher
// intensity; here intensity simply drives how "charged" (wide/bright) the bar
// reads, centred between the two poles.
function TensionBar({
  intensity,
  height = 10,
}: {
  intensity: number;
  height?: number;
}) {
  const pct = (Math.min(5, Math.max(1, intensity)) / 5) * 100;
  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-surface"
      style={{ height }}
      aria-hidden="true"
    >
      {/* centred fill that grows outward with intensity */}
      <div
        className="absolute left-1/2 top-0 h-full -translate-x-1/2 rounded-full bg-accent transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function intensityWord(n: number): string {
  return ["", "faint", "mild", "real", "sharp", "fierce"][
    Math.min(5, Math.max(1, n))
  ];
}

// ---- facilitator ----------------------------------------------------------

const FrictionFacilitator: Renderer = ({ view, act }) => {
  const v = view as FrictionView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-muted">
          {v.inputCount} contribution{v.inputCount === 1 ? "" : "s"} to analyse
        </p>
        {!v.available && (
          <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
            AI is not configured for this room — set ANTHROPIC_API_KEY to enable
            the tension map.
          </p>
        )}
        {v.available && (
          <Button
            disabled={status === "sending" || v.inputCount === 0}
            onClick={() => send({ type: "generate" })}
          >
            {status === "sending"
              ? "Mapping…"
              : v.hasResult
                ? "Regenerate"
                : "Map the tensions"}
          </Button>
        )}
        <StatusLine status={status} sentLabel="Tension map updated." />
      </div>

      {status === "sending" ? (
        <AiGenerating
          verb="Surfacing the frictions"
          inputCount={v.inputCount}
          cards={3}
        />
      ) : !v.hasResult ? (
        <p className="text-muted">
          {v.available
            ? "No map yet — collect contributions, then map the tensions."
            : "Unavailable."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {v.tensions.length === 0 ? (
            <p className="text-muted">
              No clear tensions surfaced — the room may largely agree.
            </p>
          ) : (
            v.tensions.map((t, i) => (
              <FacilitatorTension key={i} t={t} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

function FacilitatorTension({ t }: { t: FrictionTension }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{t.axis}</h3>
        <span className="shrink-0 text-xs uppercase tracking-wide text-accent">
          {intensityWord(t.intensity)} · {t.intensity}/5
        </span>
      </div>

      <p className="text-sm text-white/90">The real tension is {t.tension}</p>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex-1 text-right">{t.poleA}</span>
        <span className="shrink-0">←→</span>
        <span className="flex-1">{t.poleB}</span>
      </div>
      <TensionBar intensity={t.intensity} />

      {t.examples &&
        (t.examples.poleA.length > 0 || t.examples.poleB.length > 0) && (
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-white/80">{t.poleA}</span>
              {t.examples.poleA.map((e, j) => (
                <span key={j} className="text-muted">
                  “{e}”
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-white/80">{t.poleB}</span>
              {t.examples.poleB.map((e, j) => (
                <span key={j} className="text-muted">
                  “{e}”
                </span>
              ))}
            </div>
          </div>
        )}

      <p className="rounded-lg bg-bg/40 px-3 py-2 text-xs text-accent">
        Try asking: “Where do you each land between {t.poleA} and {t.poleB}, and
        what would move you?”
      </p>
    </article>
  );
}

// ---- projector ------------------------------------------------------------

const FrictionProjector: Renderer = ({ view }) => {
  const v = view as FrictionView;

  if (!v.hasResult || v.tensions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="text-2xl text-muted">
          {v.available
            ? "The tensions will appear here shortly."
            : "—"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-10 p-12">
      <h2 className="text-3xl font-semibold">The real tensions in the room</h2>
      <div className="flex flex-col gap-8">
        {v.tensions.map((t, i) => (
          <Reveal key={i} i={i} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-xl text-muted">{t.axis}</span>
              <span className="text-lg uppercase tracking-wide text-accent">
                {intensityWord(t.intensity)}
              </span>
            </div>
            <div className="flex items-center gap-6 text-2xl">
              <span className="flex-1 text-right">{t.poleA}</span>
              <span className="shrink-0 text-muted">←——→</span>
              <span className="flex-1">{t.poleB}</span>
            </div>
            <TensionBar intensity={t.intensity} height={16} />
            <p className="text-lg text-white/85">
              The real tension is {t.tension}
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  );
};

// ---- participant ----------------------------------------------------------

const FrictionParticipant: Renderer = ({ view }) => {
  const v = view as FrictionView;

  if (!v.hasResult || v.tensions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="max-w-xs text-muted">
          The facilitator will surface the tensions here shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h2 className="text-sm uppercase tracking-wide text-muted">
        The tensions in the room
      </h2>
      {v.tensions.map((t, i) => (
        <Reveal
          key={i}
          i={i}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">{t.axis}</h3>
            <span className="shrink-0 text-xs uppercase tracking-wide text-accent">
              {intensityWord(t.intensity)}
            </span>
          </div>
          <p className="text-sm text-white/90">
            The real tension is {t.tension}
          </p>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex-1 text-right">{t.poleA}</span>
            <span className="shrink-0">←→</span>
            <span className="flex-1">{t.poleB}</span>
          </div>
          <TensionBar intensity={t.intensity} />
        </Reveal>
      ))}
    </div>
  );
};

// ---- exports --------------------------------------------------------------

export const frictionRenderers: Partial<Record<Role, Renderer>> = {
  participant: FrictionParticipant,
  projector: FrictionProjector,
  facilitator: FrictionFacilitator,
};
