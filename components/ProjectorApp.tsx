"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePolledState } from "@/components/usePolledState";
import { Countdown } from "@/components/Countdown";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { PublicState } from "@/lib/types";

// Read-only big-screen view for the room. Renders the active module's projector
// renderer (falls back to a calm title card + a join QR when a module has none).
export function ProjectorApp({ apiBase }: { apiBase: string }) {
  const { state, error } = usePolledState<PublicState>({
    endpoint: `${apiBase}/state`,
    role: "projector",
    streamEndpoint: `${apiBase}/stream`,
  });

  // The participant join link for this room — workshop members scan to walk in
  // (no passcode; handle is optional). apiBase is "/api/r/<slug>".
  const slug = apiBase.replace("/api/r/", "");
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
          <Centered>
            <span className="flex flex-col items-center gap-5">
              {state.branding?.logoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={state.branding.logoUrl}
                  alt=""
                  className="max-h-28 max-w-[60vw] object-contain"
                />
              )}
              <span className="font-display text-5xl font-semibold tracking-tight text-white">
                {state.branding?.headline || state.topic}
              </span>
              {joinUrl && (
                <span className="flex flex-col items-center gap-3">
                  <span className="rounded-2xl bg-white p-5">
                    <QRCodeSVG value={joinUrl} size={240} />
                  </span>
                  <span className="text-2xl text-accent">Scan to join</span>
                  <span className="font-mono text-lg text-muted">{joinUrl}</span>
                  <span className="max-w-xl text-base text-muted">
                    {state.branding?.tagline ||
                      "No app, no code — just pick a name (or stay anonymous)."}
                  </span>
                </span>
              )}
              <span className="text-xl text-muted">
                {state.modeName ? "Look up here when the room shares." : "We’ll begin shortly."}
              </span>
            </span>
          </Centered>
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
