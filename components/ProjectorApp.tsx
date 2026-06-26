"use client";

import { useEffect, useState } from "react";
import { usePolledState } from "@/components/usePolledState";
import { Countdown } from "@/components/Countdown";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LobbyScreen } from "@/components/LobbyScreen";
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

  const { state, error } = usePolledState<PublicState>({
    endpoint: `${apiBase}/state`,
    role: "projector",
    code: tok,
    streamEndpoint: `${apiBase}/stream`,
  });

  // The participant join link for this room — workshop members scan to walk in
  // (no passcode; handle is optional). apiBase is "/api/r/<slug>".
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/r/${slug}`);
  }, [slug]);

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
      <div className="flex items-center justify-between border-b border-border px-10 py-5 text-xl text-muted">
        <span>{state.config?.label ?? state.modeName ?? state.topic}</span>
        <span className="flex items-center gap-4">
          {error && <span className="text-base text-[#ffd7d7]">Reconnecting…</span>}
          {state.timerEndsAt && (
            <span className="font-mono text-accent">
              <Countdown endsAt={state.timerEndsAt} />
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {state.ended ? (
          <Centered>Session closed.</Centered>
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
