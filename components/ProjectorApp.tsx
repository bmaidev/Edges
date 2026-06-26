"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePolledState } from "@/components/usePolledState";
import { Countdown } from "@/components/Countdown";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LobbyScreen } from "@/components/LobbyScreen";
import { TourCoach } from "@/components/TourCoach";
import { ConnectionChip } from "@/components/ConnectionStrip";
import { useConnection } from "@/components/useConnection";
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

  return (
    <main className="flex min-h-screen flex-col">
      {tour && <TourCoach surface="screen" />}
      {ribbon && (
        <div className="bg-accent/15 px-10 py-3 text-center text-lg text-accent">
          This is what the room sees on the big screen.
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border px-10 py-5 text-xl text-muted">
        <span>{state.config?.label ?? state.modeName ?? state.topic}</span>
        <span className="flex items-center gap-4">
          <ConnectionChip conn={conn} />
          {/* C1 gate fix: a paused timer (timerEndsAt null, remaining set) must
              freeze on the big screen, never blank. */}
          {(state.timerEndsAt != null || state.timerRemainingMs != null) && (
            <span className="flex items-center gap-3 font-mono text-accent">
              {state.timerEndsAt == null && state.timerRemainingMs != null && (
                <span className="text-sm uppercase tracking-wide text-muted">paused</span>
              )}
              <Countdown
                endsAt={state.timerEndsAt}
                remainingMs={state.timerRemainingMs}
              />
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
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
            timerEndsAt={state.timerEndsAt}
          />
        )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-center text-3xl text-white/90">
      {children}
    </div>
  );
}
