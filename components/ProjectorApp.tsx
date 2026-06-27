"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePolledState } from "@/components/usePolledState";
import { useChime } from "@/components/useChime";
import { useTimerMilestones, warnThresholds } from "@/components/useTimerMilestones";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LobbyScreen } from "@/components/LobbyScreen";
import { TourCoach } from "@/components/TourCoach";
import { ConnectionChip } from "@/components/ConnectionStrip";
import { useConnection } from "@/components/useConnection";
import { usePresentMode } from "@/components/usePresentMode";
import { PresentPill } from "@/components/PresentPill";
import { PresenterRibbon } from "@/components/PresenterRibbon";
import { PhaseTransition } from "@/components/PhaseTransition";
import { bootToken } from "@/lib/magicLink";
import type { PublicState } from "@/lib/types";

// Read-only big-screen view for the room. Renders the active module's projector
// renderer (falls back to a calm title card + a join QR when a module has none).
export function ProjectorApp({ apiBase }: { apiBase: string }) {
  const slug = apiBase.replace("/api/r/", "");
  // A2: a Big-screen link carries an optional projector token. The projector
  // view is read-only either way (a bare /screen still works), so this is just
  // an anti-casual-takeover affordance — never depended on for confidentiality.
  const [tok, setTok] = useState<string | undefined>(undefined);
  useEffect(() => {
    const t = bootToken(slug);
    if (t) setTok(t);
  }, [slug]);

  const { state, error, lastAppliedAt } = usePolledState<PublicState>({
    endpoint: `${apiBase}/state`,
    role: "projector",
    code: tok,
    streamEndpoint: `${apiBase}/stream`,
  });
  const conn = useConnection({ error, lastAppliedAt });
  // E2 — present mode (fullscreen + wake-lock + auto-hiding chrome). Called here,
  // above the early "Connecting…" return, to keep hook order stable.
  const present = usePresentMode();
  // C6 — room-felt timer cues on the projector. Chime only in present mode (a real
  // gesture unlocked audio); previously the projector clock was entirely silent.
  const chime = useChime();
  const onWarn = useCallback(() => {
    if (present.active) chime("warn");
  }, [present.active, chime]);
  // C6 full — honour the builder-authored amber threshold; the chime + clock tint
  // fire at the facilitator's chosen "minutes left", and the drain bar's window
  // matches it. Defaults to 120s when unauthored.
  const warnSeconds =
    (state?.config as { timerWarnSeconds?: number } | null)?.timerWarnSeconds ??
    120;
  const thresholds = useMemo(() => warnThresholds(warnSeconds), [warnSeconds]);
  const timerLevel = useTimerMilestones(
    state?.timerEndsAt ?? null,
    state?.timerRemainingMs ?? null,
    onWarn,
    thresholds,
  );

  // The participant join link for this room — workshop members scan to walk in
  // (no passcode; handle is optional). apiBase is "/api/r/<slug>".
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/r/${slug}`);
  }, [slug]);

  // A3 tour: `?tour=1` shows a one-time "this is the big screen" ribbon that
  // auto-hides after a few seconds OR on the next host phase advance (the polled
  // phaseId change), and mounts the screen coach.
  const [tour, setTour] = useState(false);
  const [ribbon, setRibbon] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tour") === "1") {
      setTour(true);
      setRibbon(true);
      const t = window.setTimeout(() => setRibbon(false), 6000);
      return () => window.clearTimeout(t);
    }
  }, []);
  const phaseId = state?.phaseId ?? null;
  const seenPhase = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Skip the initial observation; only an actual advance dismisses the ribbon.
    if (seenPhase.current === undefined) {
      seenPhase.current = phaseId;
      return;
    }
    if (phaseId !== seenPhase.current) {
      seenPhase.current = phaseId;
      setRibbon(false);
    }
  }, [phaseId]);

  // D2 — the projector has no per-device a11y prefs (it's a shared wall), so the
  // host drives high-contrast / colour-safe mode for everyone. Toggle the same
  // body class the participant A11yProvider uses; clean up on unmount.
  const projectorA11y = state?.projectorA11y === true;
  useEffect(() => {
    document.body.classList.toggle("a11y-contrast", projectorA11y);
    return () => document.body.classList.remove("a11y-contrast");
  }, [projectorA11y]);

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center text-2xl text-muted">
        Connecting…
      </main>
    );
  }

  const Renderer =
    state.moduleId && state.view
      ? getClientRenderer(state.moduleId, "projector")
      : null;

  // E2 — a single key that changes on every screen change (advance, lobby↔phase↔
  // ended) to drive the cross-dissolve + per-change chime.
  const chromeHidden = present.active && present.controlsHidden;
  const screenKey = state.ended ? "__ended__" : state.phaseId ?? "__lobby__";

  return (
    <main
      role="main"
      aria-label={`Big screen — ${state.config?.label ?? state.modeName ?? state.topic ?? "session"}`}
      className={`flex min-h-screen flex-col ${present.cinema ? "cinema" : ""} ${chromeHidden ? "controls-hidden" : ""}`}
    >
      {tour && <TourCoach surface="screen" />}
      {ribbon && (
        <div className="bg-accent/15 px-10 py-3 text-center text-lg text-accent">
          This is what the room sees on the big screen.
        </div>
      )}
      {/* E2 — connection status is now ambient chrome (the top status bar is
          retired in favour of the bottom presenter ribbon). Auto-hides with the
          rest of the controls in present mode. */}
      <div
        className={`fixed right-5 top-5 z-40 flex items-center gap-3 transition-opacity duration-500 ${chromeHidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        {/* C2 — live social-proof count, only when the facilitator opted in for
            this phase AND it's above the privacy floor (the store gates both). */}
        {!state.ended && state.participation && (
          <span className="rounded-full bg-bg/70 px-3 py-1 text-sm text-muted backdrop-blur">
            {state.participation.responded} of {state.participation.present} responded
          </span>
        )}
        <ConnectionChip conn={conn} />
      </div>
      <PresentPill
        active={present.active}
        cinema={present.cinema}
        hidden={chromeHidden}
        onToggle={present.toggle}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* C4 — a spotlighted response blooms over the live module (kept mounted,
            dimmed, behind). Outside the module ErrorBoundary so neither can take
            the other down. Cleared by the host or any phase advance. */}
        {!state.ended && state.spotlight && (
          <SpotlightOverlay
            text={state.spotlight.text}
            handle={state.spotlight.handle ?? null}
          />
        )}
        {/* F2 — the live commitment board, when the facilitator promotes it. */}
        {!state.ended && state.actionItems && state.actionItems.length > 0 && (
          <div className="border-b-2 border-accent/40 bg-accent/5 px-10 py-5">
            <p className="text-sm uppercase tracking-wide text-accent">Our commitments</p>
            <ul className="mt-2 grid gap-1.5 text-2xl text-white/90 sm:grid-cols-2">
              {state.actionItems.map((a, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className={a.status === "done" ? "text-accent" : "text-muted"}>
                    {a.status === "done" ? "✓" : "•"}
                  </span>
                  <span className={a.status === "done" ? "text-muted line-through" : ""}>
                    {a.text}
                    {a.ownerName ? <span className="text-muted"> — {a.ownerName}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* E2 — soft cross-dissolve between screens; chime only in present mode
            (so a lobby projector with a suspended AudioContext stays silent). */}
        <PhaseTransition screenKey={screenKey} chime={present.active}>
          {state.ended ? (
            state.takeaway && joinUrl ? (
              // F3 — let the room keep their recap on the way out.
              <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
                <p className="font-display text-4xl text-white/90">
                  Take your recap with you
                </p>
                <span className="rounded-2xl bg-white p-4">
                  <QRCodeSVG
                    value={`${joinUrl}/takeaway?k=${state.takeaway.token}`}
                    size={220}
                  />
                </span>
                <p className="max-w-md text-xl text-muted">
                  Scan to keep the session summary — yours for 24 hours.
                </p>
              </div>
            ) : (
              <Centered>Session closed.</Centered>
            )
          ) : Renderer && state.view ? (
            <ErrorBoundary
              label={`projector:${state.moduleId ?? "?"}`}
              resetKey={`${state.phaseId}:${state.rev}`}
            >
              <Renderer
                view={state.view.data}
                token=""
                handle=""
                phaseId={state.phaseId ?? ""}
                act={async () => false}
              />
            </ErrorBoundary>
          ) : (
            <LobbyScreen
              variant="wide"
              branding={state.branding}
              title={state.topic}
              joinUrl={joinUrl}
              present={state.participantCount}
              cue={state.lobbyCue ?? undefined}
              countVisible={state.lobbyCountVisible ?? true}
              timerEndsAt={state.timerEndsAt}
            />
          )}
        </PhaseTransition>
      </div>
      {/* E2 — the bottom presenter ribbon: now/next + position + clock. Hidden on
          the closed screen (nothing to navigate). */}
      {!state.ended && (
        <PresenterRibbon
          sequence={state.sequence ?? []}
          phaseId={state.phaseId}
          fallbackLabel={state.config?.label ?? state.modeName ?? state.topic}
          timerEndsAt={state.timerEndsAt}
          timerRemainingMs={state.timerRemainingMs}
          lowLevel={timerLevel}
          warnSeconds={warnSeconds}
          onElapsed={() => present.active && chime()}
        />
      )}
    </main>
  );
}

// C4 — the spotlight bloom. The live module stays mounted and dimmed behind the
// scrim. Long responses down-scale and soft-fade at the bottom rather than
// overflow. A gentle rise-in honours reduce-motion. An OPTIONAL attribution line
// ("— Name") appears only for an explicitly-attributed literal spotlight (the
// host opted in for a named, non-anonymous source); it's null for everything else.
function SpotlightOverlay({ text, handle }: { text: string; handle?: string | null }) {
  // Three coarse type tiers so a one-liner fills the wall and a paragraph still fits.
  const size =
    text.length <= 80
      ? "text-6xl sm:text-7xl"
      : text.length <= 200
        ? "text-5xl sm:text-6xl"
        : "text-3xl sm:text-4xl";
  const long = text.length > 280;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-bg/80 p-12 backdrop-blur-md animate-riseIn"
      role="status"
      aria-live="polite"
    >
      <div className="relative max-h-full max-w-5xl overflow-hidden text-center">
        <p
          className={`font-display leading-tight text-white/95 ${size} ${long ? "max-h-[70vh] overflow-hidden" : ""}`}
        >
          {text}
        </p>
        {handle && (
          <p className="mt-6 text-2xl font-medium text-accent/90">— {handle}</p>
        )}
        {long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-center text-3xl text-white/90">
      {children}
    </div>
  );
}
