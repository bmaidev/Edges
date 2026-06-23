"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolledState } from "@/components/usePolledState";
import { Countdown } from "@/components/Countdown";
import { Button, Screen } from "@/components/ui";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { STRINGS } from "@/lib/strings";
import type { PublicState } from "@/lib/types";

// The participant experience for a room, parameterized by API base
// (apiBase="/api/r/{slug}"). Mounted by /r/[room].
export function ParticipantApp({ apiBase }: { apiBase: string }) {
  const [joined, setJoined] = useState(false);
  const [handle, setHandle] = useState("Anonymous");
  const [token, setToken] = useState<string | undefined>(undefined);
  const { state, error } = usePolledState<PublicState>({
    token,
    endpoint: `${apiBase}/state`,
    streamEndpoint: apiBase.startsWith("/api/r/") ? `${apiBase}/stream` : undefined,
  });

  // Per-room localStorage keys so different rooms don't clobber each other.
  const HK = `edges_handle:${apiBase}`;
  const TK = `edges_token:${apiBase}`;

  useEffect(() => {
    const t = localStorage.getItem(TK);
    const h = localStorage.getItem(HK);
    if (t) {
      setToken(t);
      setJoined(true);
      if (h) setHandle(h);
    }
  }, [TK, HK]);

  if (!state) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center p-8 text-muted">
          Connecting…
        </div>
      </Screen>
    );
  }

  if (state.ended) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-xs text-lg leading-relaxed text-white/90">
            {STRINGS.ended}
          </p>
        </div>
      </Screen>
    );
  }

  if (!joined) {
    return (
      <JoinScreen
        apiBase={apiBase}
        topic={state.topic}
        branding={state.branding ?? null}
        onJoined={(h, t) => {
          localStorage.setItem(TK, t);
          localStorage.setItem(HK, h);
          setHandle(h);
          setToken(t);
          setJoined(true);
        }}
      />
    );
  }

  return (
    <PhaseScreen
      state={state}
      handle={handle}
      token={token!}
      apiBase={apiBase}
      reconnecting={error}
    />
  );
}

// Calm, non-blocking "we lost the connection" strip. The last-good screen stays
// visible underneath — we never block on the network.
function ReconnectBanner() {
  return (
    <div className="sticky top-0 z-20 bg-[#5a2a2a]/90 px-5 py-2 text-center text-xs text-[#ffd7d7] backdrop-blur">
      Reconnecting…
    </div>
  );
}

function JoinScreen({
  apiBase,
  topic,
  branding,
  onJoined,
}: {
  apiBase: string;
  topic?: string;
  branding?: { logoUrl?: string; headline?: string; tagline?: string } | null;
  onJoined: (handle: string, token: string) => void;
}) {
  const [handle, setHandle] = useState("Anonymous");
  const [busy, setBusy] = useState(false);
  const title = branding?.headline || topic || STRINGS.title;
  const subtitle = branding?.tagline || STRINGS.subtitle;

  async function join() {
    setBusy(true);
    const clean = handle.trim() || "Anonymous";
    try {
      const res = await fetch(`${apiBase}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: clean }),
      });
      const data = await res.json();
      onJoined(clean, data.participantToken);
    } catch {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-6 p-6 pt-12 animate-fadeInUp">
        <div className="flex flex-col items-start gap-3">
          {branding?.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={branding.logoUrl} alt="" className="max-h-12 max-w-[60%] object-contain" />
          )}
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-muted">{subtitle}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-white/90">{STRINGS.joinBody}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="handle" className="text-sm text-muted">
            Choose a handle (or stay anonymous)
          </label>
          <input
            id="handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onFocus={(e) => e.target.value === "Anonymous" && e.target.select()}
            maxLength={40}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base focus:border-accent focus:outline-none"
          />
        </div>
        <Button onClick={join} disabled={busy}>
          {busy ? "Joining…" : "Join the room"}
        </Button>
        <div className="mt-auto border-t border-border pt-5">
          <p className="text-xs leading-relaxed text-muted">{STRINGS.privacyLine}</p>
        </div>
      </div>
    </Screen>
  );
}

function StatusBar({ state }: { state: PublicState }) {
  const label = state.config?.label ?? state.modeName ?? "Lobby";
  const chime = useChime();
  const [expired, setExpired] = useState(false);
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/90 px-5 py-3 text-sm text-muted backdrop-blur">
      <span>{label}</span>
      {state.timerEndsAt && (
        <span className={`font-mono ${expired ? "text-[#ff8a8a]" : "text-accent"}`}>
          {expired ? (
            "Time's up"
          ) : (
            <Countdown
              endsAt={state.timerEndsAt}
              onElapsed={() => {
                setExpired(true);
                chime();
                setTimeout(() => setExpired(false), 6000);
              }}
            />
          )}
        </span>
      )}
    </div>
  );
}

// Soft two-note chime via WebAudio — no asset, no autoplay surprise.
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback(() => {
    try {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      if (!ctxRef.current) ctxRef.current = new Ctor();
      const ctx = ctxRef.current!;
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch {
      // chime is a nicety, never a requirement
    }
  }, []);
}

function PhaseScreen({
  state,
  handle,
  token,
  apiBase,
  reconnecting,
}: {
  state: PublicState;
  handle: string;
  token: string;
  apiBase: string;
  reconnecting: boolean;
}) {
  const act = useAct(apiBase, token, handle);
  const pulse = useContentPulse(state.contentVersion);

  const Renderer =
    state.moduleId && state.view
      ? getClientRenderer(state.moduleId, "participant")
      : null;

  // Show the holding screen only when there's no renderable participant view.
  // Crucially this is gated on the ACTIVE PHASE, not on state.mode — custom
  // template/builder sessions have no mode, and the old `!state.mode` check
  // wrongly pinned them on the lobby forever (never syncing past it).
  //   - preSession  (no active phase): a calm "we'll begin shortly".
  //   - active but no participant UI (projector/facilitator-only phase, or a
  //     between-phase blip): "look up at the screen".
  if (!Renderer || !state.view) {
    const preSession = !state.moduleId;
    const message = preSession
      ? state.branding?.headline || STRINGS.lobby
      : "Look up at the screen.";
    return (
      <Screen>
        {reconnecting && <ReconnectBanner />}
        <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center animate-riseIn">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-accent/30 blur-xl animate-pulseSoft" />
            <div className="relative h-16 w-16 rounded-full bg-accent animate-pulseSoft" />
          </div>
          <p className="font-display max-w-xs text-2xl leading-relaxed text-white/90">
            {message}
          </p>
          {preSession && state.branding?.tagline && (
            <p className="max-w-xs text-sm text-muted">{state.branding.tagline}</p>
          )}
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {reconnecting && <ReconnectBanner />}
      <StatusBar state={state} />
      <ErrorBoundary
        label={`participant:${state.moduleId ?? "?"}`}
        resetKey={`${state.phaseId}:${state.rev}`}
      >
        <Renderer
          view={state.view.data}
          token={token}
          handle={handle}
          phaseId={state.phaseId ?? ""}
          act={act}
          pulse={pulse}
        />
      </ErrorBoundary>
    </Screen>
  );
}

// Returns whether the write landed (true/false), retrying once. Renderers use
// this to confirm honestly rather than assuming success.
function useAct(apiBase: string, token: string, handle: string) {
  return useCallback(
    async (action: { type: string; payload?: Record<string, unknown> }) => {
      const post = () =>
        fetch(`${apiBase}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...action, token, handle }),
        });
      try {
        const res = await post();
        if (res.ok) return true;
      } catch {
        // fall through to one retry
      }
      try {
        const res = await post();
        return res.ok;
      } catch {
        return false;
      }
    },
    [apiBase, token, handle],
  );
}

function useContentPulse(version: number): boolean {
  const [pulse, setPulse] = useState(false);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current !== null && version > prev.current) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 3000);
      prev.current = version;
      return () => clearTimeout(id);
    }
    prev.current = version;
  }, [version]);
  return pulse;
}
