"use client";

// Client renderers for the "persona" module (synthetic-customer panel).
//
// Reactions are AI-authored simulations and room-facing, so participants see
// them too — they are never attributed to a real person. Only facilitator/
// cohost can trigger generation (the "generate" action is gated server-side).
//
// HONESTY: every role carries a banner — synthetic personas validate known
// patterns and will confidently fabricate the unknown. They are not real user
// data.

import { Button } from "@/components/ui";
import { AiGenerating, Bars, Reveal, StatusLine, useSend } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { PersonaView, PersonaReaction } from "./persona.server";

// ---- shared bits ----------------------------------------------------------

const BANNER =
  "Synthetic personas — they validate known patterns and will confidently fabricate the unknown. Not real user data.";

function HonestyBanner() {
  return (
    <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
      {BANNER}
    </p>
  );
}

function averageAdopt(reactions: PersonaReaction[]): number {
  if (reactions.length === 0) return 0;
  const sum = reactions.reduce((s, r) => s + (Number(r.wouldAdopt) || 0), 0);
  return Math.round((sum / reactions.length) * 10) / 10;
}

function ReactionCard({ r }: { r: PersonaReaction }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-accent">{r.persona}</h3>
        <span className="shrink-0 text-xs text-muted">
          would adopt {r.wouldAdopt}/5
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-white/85">{r.reaction}</p>
      {r.objections.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {r.objections.map((o, i) => (
            <li key={i} className="text-sm leading-relaxed text-muted">
              — {o}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---- facilitator ----------------------------------------------------------

const PersonaFacilitator: Renderer = ({ view, act }) => {
  const v = view as PersonaView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-medium leading-snug">Persona panel</p>
        <span className="text-xs text-muted">{v.inputCount} inputs</span>
      </div>

      <HonestyBanner />

      {!v.available && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
          AI is off — set ANTHROPIC_API_KEY to run the panel.
        </p>
      )}

      <Button
        onClick={() => send({ type: "generate" })}
        disabled={!v.available || status === "sending" || v.inputCount === 0}
      >
        {status === "sending"
          ? "Asking the panel…"
          : v.hasResult
            ? "Regenerate"
            : "Run the panel"}
      </Button>
      <StatusLine status={status} sentLabel="Panel reactions generated." />

      <div className="flex flex-col gap-3">
        {status === "sending" ? (
          <AiGenerating
            verb="Stepping into the persona"
            inputCount={v.inputCount}
            cards={3}
          />
        ) : v.reactions.length === 0 ? (
          <p className="text-sm text-muted">
            No reactions yet — run the panel to pressure-test the idea.
          </p>
        ) : (
          v.reactions.map((r, i) => <ReactionCard key={i} r={r} />)
        )}
      </div>
    </div>
  );
};

// ---- projector — persona cards + aggregate adoption gauge -----------------

const PersonaProjector: Renderer = ({ view }) => {
  const v = view as PersonaView;
  if (!v.hasResult || v.reactions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
        <span className="text-2xl uppercase tracking-wide text-accent">
          Persona Panel
        </span>
        <p className="text-2xl text-muted">Assembling the panel…</p>
      </div>
    );
  }

  const avg = averageAdopt(v.reactions);
  const counts: Record<string, number> = {};
  v.reactions.forEach((r) => {
    counts[r.persona] = Number(r.wouldAdopt) || 0;
  });
  const options = v.reactions.map((r) => r.persona);

  return (
    <div className="flex flex-1 flex-col gap-8 p-12">
      <div className="text-center">
        <span className="text-2xl uppercase tracking-wide text-accent">
          Persona Panel
        </span>
        <p className="mt-2 text-3xl font-semibold">
          Average would-adopt: {avg}/5
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <Bars counts={counts} options={options} />
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
        {v.reactions.map((r, i) => (
          <Reveal key={i} i={i}>
            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-accent">
                  {r.persona}
                </h3>
                <span className="shrink-0 text-base text-muted">
                  {r.wouldAdopt}/5
                </span>
              </div>
              <p className="mt-2 text-lg leading-relaxed text-white/85">
                {r.reaction}
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      <p className="text-center text-sm text-muted">{BANNER}</p>
    </div>
  );
};

// ---- participant — read-only reactions + banner ---------------------------

const PersonaParticipant: Renderer = ({ view }) => {
  const v = view as PersonaView;
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">Persona panel</p>
      <HonestyBanner />
      {v.reactions.length === 0 ? (
        <p className="text-sm text-muted">
          No reactions yet — the facilitator will run the panel shortly.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {v.reactions.map((r, i) => (
            <Reveal key={i} i={i}>
              <ReactionCard r={r} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
};

export const personaRenderers: Partial<Record<Role, Renderer>> = {
  participant: PersonaParticipant,
  projector: PersonaProjector,
  facilitator: PersonaFacilitator,
};
