"use client";

// Client renderers for the marketplace module. Participants invest credits
// across idea cards with −/+ steppers (optimistic local state like DotVote);
// the projector shows a leaderboard of the top-funded ideas as Bars.

import { Bars, StatusLine, useSend, useSyncedState } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { MarketplaceView } from "./marketplace.server";

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((s, n) => s + (n || 0), 0);
}

const MarketplaceParticipant: Renderer = ({ view, act }) => {
  const v = view as MarketplaceView;
  // Optimistic local copy of my investments; resyncs when the server's "mine"
  // (the per-idea amounts) changes identity.
  const mineKey = JSON.stringify(
    v.ideas.map((i) => [i.id, i.mine] as const),
  );
  const initialMine: Record<string, number> = {};
  for (const i of v.ideas) if (i.mine) initialMine[i.id] = i.mine;
  const [mine, setMine] = useSyncedState<Record<string, number>>(
    initialMine,
    mineKey,
  );
  const { status, setStatus } = useSend(act);

  const used = sumValues(mine);
  const remaining = Math.max(0, v.budget - used);

  async function invest(ideaId: string, delta: 1 | -1) {
    const cur = mine[ideaId] ?? 0;
    if (delta === 1 && remaining <= 0) return;
    if (delta === 1 && v.maxPerIdea != null && cur >= v.maxPerIdea) return;
    if (delta === -1 && cur <= 0) return;

    const prev = mine;
    const next = { ...mine };
    const amount = Math.max(0, cur + delta);
    if (amount === 0) delete next[ideaId];
    else next[ideaId] = amount;
    setMine(next); // optimistic
    setStatus("sending");
    const ok = await act({ type: "invest", payload: { ideaId, delta } });
    setStatus(ok ? "idle" : "error");
    if (!ok) setMine(prev); // revert on failure
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {v.prompt && (
        <p className="text-lg font-medium leading-snug">{v.prompt}</p>
      )}

      {/* Budget meter */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-accent">
            {remaining} / {v.budget} {v.currencyLabel} left
          </span>
          <span className="text-muted">
            {used} invested
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-bg">
          <div
            className="h-2 rounded bg-accent transition-all"
            style={{
              width: `${v.budget > 0 ? (used / v.budget) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {v.ideas.length === 0 ? (
          <p className="text-sm text-muted">
            No ideas yet — they appear once the earlier phase has submissions.
          </p>
        ) : (
          v.ideas.map((idea) => {
            const cur = mine[idea.id] ?? 0;
            const atCap = v.maxPerIdea != null && cur >= v.maxPerIdea;
            return (
              <div
                key={idea.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex-1 text-base leading-snug">
                    {idea.text}
                  </span>
                  {v.showLeaderboard && idea.total != null && (
                    <span className="shrink-0 text-xs text-muted">
                      {idea.total} total
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">
                    <span className="text-accent">{cur}</span>{" "}
                    {v.currencyLabel}
                    {v.maxPerIdea != null ? ` / ${v.maxPerIdea}` : ""}
                  </span>
                  <div className="flex gap-2">
                    <button
                      aria-label={`Withdraw one ${v.currencyLabel} from this idea`}
                      className="h-11 w-11 rounded-lg border border-border text-xl disabled:opacity-30"
                      disabled={cur <= 0}
                      onClick={() => invest(idea.id, -1)}
                    >
                      −
                    </button>
                    <button
                      aria-label={`Invest one ${v.currencyLabel} in this idea`}
                      className="h-11 w-11 rounded-lg border border-border text-xl disabled:opacity-30"
                      disabled={remaining <= 0 || atCap}
                      onClick={() => invest(idea.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <StatusLine status={status === "sent" ? "idle" : status} />
    </div>
  );
};

const MarketplaceProjector: Renderer = ({ view }) => {
  const v = view as MarketplaceView;
  // Leaderboard of top-funded ideas. Truncate idea text for the bar labels and
  // map back to totals by that same label.
  const top = v.ideas
    .filter((i) => i.total != null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 8);
  const labels: string[] = [];
  const counts: Record<string, number> = {};
  top.forEach((idea, i) => {
    const base = idea.text.length > 40 ? `${idea.text.slice(0, 40)}…` : idea.text;
    // Disambiguate identical truncations so the bar map stays 1:1.
    const label = counts[base] != null ? `${base} (${i + 1})` : base;
    labels.push(label);
    counts[label] = idea.total ?? 0;
  });

  return (
    <div className="flex flex-1 flex-col justify-center gap-6 p-12 text-2xl">
      <h2 className="text-3xl font-semibold">
        {v.prompt || "Idea marketplace"}
      </h2>
      {top.length === 0 ? (
        <p className="text-muted">
          No investments yet — leaderboard appears as {v.currencyLabel} are
          invested.
        </p>
      ) : (
        <Bars counts={counts} options={labels} />
      )}
    </div>
  );
};

export const marketplaceRenderers: Partial<Record<Role, Renderer>> = {
  participant: MarketplaceParticipant,
  projector: MarketplaceProjector,
};
