"use client";

import { useEffect, useRef, useState } from "react";
import { Countdown } from "@/components/Countdown";
import { useChime } from "@/components/useChime";
import { useWakeLock } from "@/components/useWakeLock";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getClientRenderer } from "@/lib/modules/registry.client";
import type { FacilitatorState, Role } from "@/lib/types";
import type { Cmd } from "@/components/HostConsole";

// C1 — the "Facilitate" mode: a calm, two-metre-legible stage that replaces the
// cramped tabbed console while you're actually running the room. Three bands:
// status · a giant timer with a true pause · a live projector mirror + one big
// NEXT. Pure render over the console's shared, rev-guarded poll — no second
// fetch, same auth, same authoritative-apply cmd path.
export function FacilitateCockpit({
  s,
  cmd,
  role,
  slug,
}: {
  s: FacilitatorState;
  cmd: Cmd;
  role: Role;
  slug: string;
}) {
  const running = s.timerEndsAt != null;
  const paused = s.timerEndsAt == null && s.timerRemainingMs != null;
  const idle = !running && !paused;

  const seq = s.sequence ?? [];
  const idx = seq.findIndex((p) => p.id === s.phaseId);
  const next = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
  const isLast = idx >= 0 && idx === seq.length - 1;
  const canEnd = role !== "cohost"; // cohost lacks the `end` cap

  const chime = useChime();
  // C1 — hold a screen wake-lock for the whole live session so the laptop never
  // sleeps mid-facilitation. Released automatically when the cockpit unmounts/ends.
  useWakeLock(!s.ended);
  // C1 — a persistent per-device chime-mute (some rooms want a silent cockpit).
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem("edges_cockpit_muted") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem("edges_cockpit_muted", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#070710] text-white">
      {/* Band 1 — status */}
      <header className="flex items-center justify-between gap-4 px-8 py-5 text-sm text-white/55">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-base font-semibold text-white/90">
            {s.modeName ?? "Session"}
          </span>
          <span className="text-white/40">·</span>
          <span className="truncate">{s.config?.label ?? "—"}</span>
        </div>
        <div className="flex items-center gap-5">
          {s.participation ? (
            <span className="tabular-nums">
              {s.participation.responded} of {s.participation.present} in
            </span>
          ) : (
            <span className="tabular-nums">{s.participantCount} here</span>
          )}
          <a
            href={`/r/${slug}/host`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5"
          >
            Exit
          </a>
        </div>
      </header>

      {/* Band 2 — the giant timer */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 py-8">
        <Countdown
          endsAt={s.timerEndsAt}
          remainingMs={s.timerRemainingMs}
          onElapsed={muted ? undefined : chime}
          className={`font-mono text-[19vw] leading-none tracking-tight tabular-nums sm:text-[15vw] lg:text-[11rem] ${
            paused ? "text-white/40" : running ? "text-accent" : "text-white/25"
          }`}
        />
        {paused && (
          <p className="text-sm uppercase tracking-[0.3em] text-white/45">paused</p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {idle && (
            <>
              {[1, 2, 5].map((m) => (
                <TimerBtn
                  key={m}
                  onClick={() => cmd("setTimer", { endsAt: Date.now() + m * 60_000 })}
                >
                  Start {m}:00
                </TimerBtn>
              ))}
            </>
          )}
          {running && (
            <>
              <TimerBtn onClick={() => cmd("pauseTimer")}>Pause</TimerBtn>
              <TimerBtn onClick={() => cmd("addTime", { addMs: 120_000 })}>
                +2:00
              </TimerBtn>
            </>
          )}
          {paused && (
            <>
              <TimerBtn primary onClick={() => cmd("resumeTimer")}>
                Resume
              </TimerBtn>
              <TimerBtn onClick={() => cmd("addTime", { addMs: 120_000 })}>
                +2:00
              </TimerBtn>
            </>
          )}
          {!idle && (
            <TimerBtn ghost onClick={() => cmd("setTimer", { endsAt: null })}>
              Reset
            </TimerBtn>
          )}
        </div>
      </section>

      {/* C1 — jump-to-phase rail (tap any phase to go there) + chime mute. */}
      {seq.length > 1 && (
        <div className="flex items-center gap-2 px-8 pb-1">
          <div className="flex flex-1 gap-1.5 overflow-x-auto py-1">
            {seq.map((p, i) => (
              <button
                key={p.id}
                onClick={() => cmd("setPhase", { phaseId: p.id })}
                title={p.label}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  i === idx
                    ? "border-accent bg-accent/15 text-accent"
                    : i < idx
                      ? "border-white/10 text-white/35"
                      : "border-white/10 text-white/55 hover:border-accent"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={toggleMute}
            title={muted ? "Chime is muted — tap to unmute" : "Mute the chime"}
            aria-pressed={muted}
            className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/55 hover:border-accent"
          >
            {muted ? "🔇" : "🔔"}
          </button>
        </div>
      )}

      {/* Band 3 — projector mirror + the one big action */}
      <section className="mt-auto grid gap-6 px-8 pb-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-white/40">
            On the big screen
          </p>
          <Mirror s={s} />
        </div>
        <div className="flex flex-col gap-3">
          {next ? (
            <button
              onClick={() => cmd("setPhase", { phaseId: next.id })}
              className="group rounded-2xl border border-accent bg-accent/15 px-6 py-6 text-left transition-colors hover:bg-accent/25"
            >
              <span className="block text-xs uppercase tracking-wide text-accent/80">
                Next
              </span>
              <span className="mt-1 block font-display text-2xl font-semibold text-white">
                {next.label} →
              </span>
            </button>
          ) : isLast && canEnd ? (
            <button
              onClick={() => cmd("end")}
              className="rounded-2xl border border-[#ff8a8a]/50 bg-[#ff8a8a]/10 px-6 py-6 text-left transition-colors hover:bg-[#ff8a8a]/20"
            >
              <span className="block text-xs uppercase tracking-wide text-[#ff8a8a]/80">
                Final phase
              </span>
              <span className="mt-1 block font-display text-2xl font-semibold text-white">
                Wrap up &amp; end session
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-white/10 px-6 py-6 text-sm text-white/50">
              {isLast
                ? "Final phase — hand back to the lead facilitator to close."
                : "Set up a session in the console to begin."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function TimerBtn({
  children,
  onClick,
  primary,
  ghost,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  ghost?: boolean;
}) {
  const cls = primary
    ? "border-accent bg-accent/20 text-white hover:bg-accent/30"
    : ghost
      ? "border-white/10 text-white/55 hover:bg-white/5"
      : "border-white/20 text-white/90 hover:bg-white/10";
  return (
    <button
      onClick={onClick}
      className={`min-w-[5.5rem] rounded-xl border px-5 py-3 text-base font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

// A faithful, letterboxed 16:9 mirror of the projector view. Renders the active
// module's projector renderer at a fixed 1280×720 design size, scaled to fit —
// so the facilitator drives AND sees exactly what the room sees. Read-only.
function Mirror({ s }: { s: FacilitatorState }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / 1280);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const Renderer =
    s.moduleId && s.view ? getClientRenderer(s.moduleId, "projector") : null;

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black"
      style={{ aspectRatio: "16 / 9" }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: 1280, height: 720, transform: `scale(${scale})` }}
      >
        {Renderer && s.view ? (
          <ErrorBoundary
            label={`cockpit-mirror:${s.moduleId ?? "?"}`}
            resetKey={`${s.phaseId}:${s.rev}`}
          >
            <div className="flex h-[720px] w-[1280px] items-center justify-center p-12 text-white">
              <Renderer
                view={s.view.data}
                token=""
                handle=""
                phaseId={s.phaseId ?? ""}
                act={async () => false}
              />
            </div>
          </ErrorBoundary>
        ) : (
          <div className="flex h-[720px] w-[1280px] items-center justify-center p-12 text-center font-display text-5xl text-white/80">
            {s.config?.label ?? s.modeName ?? "—"}
          </div>
        )}
      </div>
    </div>
  );
}
