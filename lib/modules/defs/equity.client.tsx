"use client";

// Client renderers for the "equity" module. Pure functions of the server-
// computed view (equity.server.ts). The facilitator renderer is a small
// dashboard; the participant renderer is a deliberately neutral, non-revealing
// placeholder (participants must not learn that they're being measured).

import { Bars } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type {
  EquityFacilitatorView,
  EquityParticipantView,
  EquityView,
} from "./equity.server";

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

// ---- facilitator ----------------------------------------------------------

const facilitator: Renderer = ({ view }) => {
  const v = view as EquityView;

  // Defensive: the server returns the guarded shape for participants, but this
  // renderer should only ever receive the facilitator shape.
  if ((v as EquityParticipantView).facilitatorOnly) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-muted">
        This view is for facilitators only.
      </div>
    );
  }

  const f = v as EquityFacilitatorView;
  const counts: Record<string, number> = {};
  f.perPerson.forEach((p) => (counts[p.label] = p.count));
  const options = f.perPerson.map((p) => p.label);
  const silent = f.perPerson.filter((p) => p.count === 0);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Contributions", value: f.total },
          { label: "People", value: f.participantCount },
          { label: "Silent", value: f.silentCount },
          { label: "Median", value: f.median },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-surface px-4 py-3"
          >
            <div className="text-2xl font-semibold text-accent">{s.value}</div>
            <div className="text-xs uppercase tracking-wide text-muted">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ask-first nudge — a calm callout, not an alarm */}
      {f.nudge && (
        <div className="rounded-xl border border-accent bg-accent/10 px-4 py-3">
          <p className="text-sm leading-relaxed text-accent">{f.nudge}</p>
        </div>
      )}

      {/* per-person contribution bars */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-muted">
          Contributions per person{f.anonymized ? " (anonymized)" : ""}
        </h2>
        {f.perPerson.length === 0 ? (
          <p className="text-sm text-muted">No participants yet.</p>
        ) : (
          <Bars counts={counts} options={options} />
        )}
      </div>

      {/* highlighted silent list */}
      {silent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-wide text-muted">
            Haven&apos;t contributed yet
          </h2>
          <div className="flex flex-wrap gap-2">
            {silent.map((p) => (
              <span
                key={p.label}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted"
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* recency detail for those who have contributed */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm uppercase tracking-wide text-muted">Recency</h2>
        <div className="flex flex-col gap-1">
          {f.perPerson
            .filter((p) => p.count > 0)
            .map((p) => (
              <div
                key={p.label}
                className="flex items-center justify-between border-b border-border/40 py-1 text-sm"
              >
                <span>{p.label}</span>
                <span className="text-muted">
                  {p.count} · {p.lastActive ? relTime(p.lastActive) : "—"}
                </span>
              </div>
            ))}
          {f.perPerson.every((p) => p.count === 0) && (
            <p className="text-sm text-muted">No contributions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- participant (neutral placeholder; reveals nothing) -------------------

const participant: Renderer = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
    <div className="h-12 w-12 rounded-full bg-surface" />
    <p className="max-w-xs text-sm leading-relaxed text-muted">
      The facilitator is reviewing the session. Hang tight.
    </p>
  </div>
);

export const equityRenderers: Partial<Record<Role, Renderer>> = {
  facilitator,
  participant,
};
