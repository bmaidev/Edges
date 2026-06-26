"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui";
import type { ModuleKind, PhaseInstance, PublicState } from "@/lib/types";

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
          </div>

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
        </>
      )}
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
