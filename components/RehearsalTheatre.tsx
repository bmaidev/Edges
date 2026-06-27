"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui";
import type { ModuleKind, PhaseInstance, PublicState, Readiness } from "@/lib/types";

interface CastMember {
  token: string;
  handle: string;
}
interface SeqItem {
  id: string;
  moduleId: ModuleKind;
  label: string;
}

// B5 — the rehearsal theatre. Drives a synthetic, isolated shadow room and shows
// the room-facing surfaces (projector + a participant phone) for every phase, so a
// facilitator can walk the whole arc populated before going live. The live room is
// never touched (structural isolation in the shadow id); closing tears it down.
export function RehearsalTheatre({
  apiBase,
  code,
  phases,
  onClose,
}: {
  apiBase: string;
  code: string;
  phases: PhaseInstance[];
  onClose: () => void;
}) {
  const nonceRef = useRef(
    `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
  );
  const startedRef = useRef(false);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [sequence, setSequence] = useState<SeqItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [asToken, setAsToken] = useState("");
  const [projector, setProjector] = useState<PublicState | null>(null);
  const [participant, setParticipant] = useState<PublicState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  // B5 — ephemeral per-phase notes the facilitator jots during the walk (a rehearsal
  // scratchpad; not persisted — the dry-run is throwaway).
  const [notes, setNotes] = useState<Record<string, string>>({});

  const post = useCallback(
    async (extra: Record<string, unknown>) =>
      fetch(`${apiBase}/rehearse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extra, nonce: nonceRef.current, code }),
      }),
    [apiBase, code],
  );

  // Start once (guarded against the dev StrictMode double-invoke).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const res = await post({ command: "start", phases, castSize: 8 });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(
          res.status === 403
            ? "Open the builder from your Facilitator link to rehearse."
            : d.error ?? "Couldn't start the rehearsal.",
        );
        setLoading(false);
        return;
      }
      const d = await res.json();
      setCast(d.cast ?? []);
      setSequence(d.sequence ?? []);
      setAsToken(d.cast?.[0]?.token ?? "");
      setProjector(d.projector ?? null);
      setParticipant(d.participant ?? null);
      setReadiness(d.readiness ?? null);
      setLoading(false);
    })();
  }, [post, phases]);

  const goView = useCallback(
    async (newIdx: number, token: string) => {
      const ph = sequence[newIdx];
      if (!ph) return;
      const res = await post({ command: "view", phaseId: ph.id, asToken: token });
      if (res.ok) {
        const d = await res.json();
        setProjector(d.projector ?? null);
        setParticipant(d.participant ?? null);
        setIdx(newIdx);
        setAsToken(token);
      }
    },
    [post, sequence],
  );

  const [castSize, setCastSize] = useState(8);
  const [reseeding, setReseeding] = useState(false);
  // B5 — default to a canned AI preview (free/instant); toggling on lets a real
  // generate run (when an API key is present).
  const [realAi, setRealAi] = useState(false);

  // B5 — re-roll the synthetic data (fresh contributions + tallies) at a chosen
  // cast size, staying on the current phase + viewer.
  const reseed = useCallback(
    async (size: number, useRealAi = realAi) => {
      setReseeding(true);
      const res = await post({
        command: "setCast",
        phases,
        castSize: size,
        phaseId: sequence[idx]?.id,
        realAi: useRealAi,
      });
      if (res.ok) {
        const d = await res.json();
        const nextCast: CastMember[] = d.cast ?? [];
        setCast(nextCast);
        setSequence(d.sequence ?? []);
        setProjector(d.projector ?? null);
        setParticipant(d.participant ?? null);
        setReadiness(d.readiness ?? null);
        setAsToken(nextCast[0]?.token ?? "");
        setCastSize(size);
      }
      setReseeding(false);
    },
    [post, phases, sequence, idx, realAi],
  );

  function close() {
    void post({ command: "end" }); // explicit teardown; 24h TTL is the backstop
    onClose();
  }

  const handleOf = (token: string) => cast.find((c) => c.token === token)?.handle ?? "Guest";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Rehearsal"
    >
      {/* banner */}
      <div className="flex items-center justify-between gap-3 border-b border-accent/40 bg-accent/10 px-5 py-2.5 text-sm">
        <span className="text-accent">
          ● Rehearsal — a synthetic room. Nobody can see this; your live room is untouched.
        </span>
        <button onClick={close} className="rounded border border-border px-3 py-1 hover:border-accent">
          Done
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted">Setting the stage…</div>
      ) : err ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-[#ff8a8a]">{err}</p>
          <Button onClick={close}>Close</Button>
        </div>
      ) : (
        <>
          {/* scrubber */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2 text-xs">
            <button
              disabled={idx === 0}
              onClick={() => goView(idx - 1, asToken)}
              className="rounded border border-border px-2 py-1 disabled:opacity-30"
            >
              ← Back
            </button>
            <div className="flex flex-1 gap-1 overflow-x-auto py-0.5">
              {sequence.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => goView(i, asToken)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 ${
                    i === idx
                      ? "border-accent bg-accent/15 text-accent"
                      : i < idx
                        ? "border-border text-muted"
                        : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {i + 1}. {s.label}
                </button>
              ))}
            </div>
            <button
              disabled={idx >= sequence.length - 1}
              onClick={() => goView(idx + 1, asToken)}
              className="rounded border border-accent bg-accent/10 px-2 py-1 text-accent disabled:opacity-30"
            >
              Next →
            </button>
            <label className="ml-2 flex items-center gap-1 text-muted">
              See as
              <select
                value={asToken}
                onChange={(e) => goView(idx, e.target.value)}
                className="rounded border border-border bg-bg px-2 py-1 text-xs focus:border-accent focus:outline-none"
              >
                {cast.map((c) => (
                  <option key={c.token} value={c.token}>
                    {c.handle}
                  </option>
                ))}
              </select>
            </label>
            {/* B5 — re-roll the synthetic data + resize the cast. */}
            <label className="flex items-center gap-1 text-muted">
              Cast
              <select
                value={castSize}
                onChange={(e) => reseed(Number(e.target.value))}
                disabled={reseeding}
                className="rounded border border-border bg-bg px-2 py-1 text-xs focus:border-accent focus:outline-none"
              >
                {[4, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => reseed(castSize)}
              disabled={reseeding}
              className="rounded border border-border px-2 py-1 hover:border-accent disabled:opacity-40"
              title="Re-roll the synthetic responses"
            >
              {reseeding ? "Reseeding…" : "↻ Reseed"}
            </button>
            {/* B5 — canned AI preview by default; opt into a real generate. */}
            <label className="flex items-center gap-1 text-muted" title="Off = instant canned AI preview; on = run the real AI">
              <input
                type="checkbox"
                checked={realAi}
                disabled={reseeding}
                onChange={(e) => {
                  setRealAi(e.target.checked);
                  reseed(castSize, e.target.checked);
                }}
              />
              real AI
            </label>
          </div>

          {/* B5 — the auto punch-list: issues found while walking the arc. */}
          <PunchList readiness={readiness} onJump={(phaseId) => {
            const i = sequence.findIndex((s) => s.id === phaseId);
            if (i >= 0) goView(i, asToken);
          }} />

          {/* the two room-facing surfaces */}
          <div className="grid flex-1 grid-rows-2 gap-3 overflow-y-auto p-4 lg:grid-cols-2 lg:grid-rows-1">
            <Surface title="On the big screen" state={projector} role="projector" />
            <Surface
              title={`On ${handleOf(asToken)}'s phone`}
              state={participant}
              role="participant"
              token={asToken}
              handle={handleOf(asToken)}
            />
          </div>

          {/* B5 — a scratchpad note for the current phase (ephemeral). */}
          {sequence[idx] && (
            <div className="border-t border-border px-5 py-2">
              <input
                value={notes[sequence[idx].id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [sequence[idx].id]: e.target.value }))}
                placeholder={`Note for “${sequence[idx].label}” (just for this rehearsal)…`}
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-muted focus:border-accent focus:text-white focus:outline-none"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// B5 — the punch list: the advisory issues the readiness engine found in the
// built session, shown while rehearsing so they're caught before going live. Only
// the actionable ones (blocker/warning); tap to jump to the offending phase.
function PunchList({
  readiness,
  onJump,
}: {
  readiness: Readiness | null;
  onJump: (phaseId: string) => void;
}) {
  const issues = (readiness?.checks ?? []).filter(
    (c) => c.severity === "blocker" || c.severity === "warning",
  );
  if (issues.length === 0) {
    return (
      <div className="border-t border-border px-5 py-1.5 text-xs text-emerald-300">
        ✓ Punch list clear — nothing flagged in this session.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-1.5 text-xs">
      <span className="font-semibold text-[#ffd27a]">Punch list · {issues.length}</span>
      {issues.map((c) => (
        <button
          key={c.id}
          onClick={() => c.phaseId && onJump(c.phaseId)}
          title={c.detail}
          className={`rounded-full border px-2 py-0.5 ${
            c.severity === "blocker"
              ? "border-[#ff8a8a]/50 text-[#ff8a8a]"
              : "border-amber-400/40 text-[#ffe2ad]"
          } ${c.phaseId ? "hover:border-accent" : "cursor-default"}`}
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}

// Mount the REAL client renderer for a surface, inert (no live writes). Falls back
// to an honest note when a phase has no screen for that role (e.g. a vote phase's
// projector-only result, or a display phase with no phone interaction).
function Surface({
  title,
  state,
  role,
  token = "",
  handle = "",
}: {
  title: string;
  state: PublicState | null;
  role: "projector" | "participant";
  token?: string;
  handle?: string;
}) {
  const Renderer = state?.moduleId && state.view ? getClientRenderer(state.moduleId, role) : null;
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <p className="border-b border-border px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted">
        {title}
      </p>
      <div className="flex-1 overflow-y-auto p-3">
        {Renderer && state?.view ? (
          <ErrorBoundary label={`rehearsal:${role}:${state.moduleId ?? "?"}`} resetKey={`${state.phaseId}:${role}`}>
            <Renderer
              view={state.view.data}
              token={token}
              handle={handle}
              phaseId={state.phaseId ?? ""}
              act={async () => false}
            />
          </ErrorBoundary>
        ) : (
          <p className="p-4 text-center text-sm text-muted">
            {role === "participant"
              ? "No phone screen this phase — the room looks at the big screen."
              : "No big-screen view this phase."}
          </p>
        )}
      </div>
    </div>
  );
}
