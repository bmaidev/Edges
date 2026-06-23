"use client";

// Renderers for the "needs" module (latent jobs-to-be-done miner).
//
// FACILITATOR-ONLY output: the facilitator renderer shows the mined needs,
// their JTBD framing, confidence, and de-identified evidence, plus an
// off-the-record reminder. The participant renderer is a neutral placeholder
// that leaks nothing — there is deliberately no projector renderer.

import { Button } from "@/components/ui";
import { AiGenerating, Renderer, Reveal, StatusLine, useSend } from "../render-kit";
import type { Role } from "../types";
import type {
  NeedItem,
  NeedsFacilitatorView,
  NeedsParticipantView,
} from "./needs.server";

const CONFIDENCE_CLASS: Record<NeedItem["confidence"], string> = {
  high: "border-accent bg-accent/10 text-accent",
  medium: "border-border bg-surface text-white/85",
  low: "border-border bg-surface text-muted",
};

const NeedsFacilitator: Renderer = ({ view, act }) => {
  const v = view as NeedsFacilitatorView;
  const { status, send } = useSend(act);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold">Latent needs</h2>
          <p className="text-xs text-muted">
            {v.inputCount} {v.inputCount === 1 ? "capture" : "captures"} from the
            source phase
          </p>
        </div>
        {v.available ? (
          <Button
            onClick={() => send({ type: "generate" })}
            disabled={status === "sending" || v.inputCount === 0}
          >
            {status === "sending"
              ? "Mining…"
              : v.hasResult
                ? "Regenerate"
                : "Mine the needs"}
          </Button>
        ) : null}
      </div>

      {!v.available && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          AI is not configured for this session, so needs mining is unavailable.
        </p>
      )}

      {v.available && v.inputCount === 0 && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
          No input captured yet in the source phase.
        </p>
      )}

      <StatusLine status={status} sentLabel="Mined." />

      {status === "sending" && (
        <AiGenerating verb="Mapping the needs" inputCount={v.inputCount} cards={3} />
      )}

      {status !== "sending" && v.hasResult && v.needs.length === 0 && (
        <p className="text-sm text-muted">
          No clear latent needs surfaced — try regenerating after more input.
        </p>
      )}

      {status !== "sending" && v.hasResult && v.needs.length > 0 && (
        <div className="flex flex-col gap-3">
          {v.needs.map((n, i) => (
            <Reveal key={i} i={i}>
            <article
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-medium leading-snug">{n.need}</h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${CONFIDENCE_CLASS[n.confidence]}`}
                >
                  {n.confidence}
                </span>
              </div>
              <p className="text-sm italic text-white/85">{n.jtbd}</p>
              {n.evidence.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    De-identified signals
                  </p>
                  <ul className="flex flex-col gap-1">
                    {n.evidence.map((e, j) => (
                      <li key={j} className="text-xs text-muted">
                        — {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
            </Reveal>
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-[11px] text-muted">
        Off-the-record — facilitator only. Not shown to participants or the
        projector.
      </p>
    </div>
  );
};

const NeedsParticipant: Renderer = ({ view }) => {
  // Neutral placeholder. Never render any inferred content here.
  void (view as NeedsParticipantView);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-accent animate-pulseSoft" />
      <p className="max-w-xs text-lg leading-relaxed text-white/90">
        The facilitator is reviewing the room&apos;s input.
      </p>
    </div>
  );
};

export const needsRenderers: Partial<Record<Role, Renderer>> = {
  participant: NeedsParticipant,
  facilitator: NeedsFacilitator,
};
