"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Countdown } from "@/components/Countdown";
import { countCopy } from "@/lib/modules/lobby-copy";
import type { RoomBranding } from "@/lib/types";

// The front-of-room join lobby (E1). A pure presentational component fed by the
// top-level PublicState from ProjectorApp (NOT a module renderer — the Renderer
// contract has no access to branding/count/timer). Two contrast-safe zones:
// a FIXED-DARK hero (logo + room name) and a FIXED-WHITE QR card, so it stays
// legible + scannable regardless of the room's themed palette.
export interface LobbyScreenProps {
  branding?: RoomBranding | null;
  title?: string; // room topic — the hero when there's no branding headline
  joinUrl: string;
  present: number;
  countVisible?: boolean; // default true; false hides the count (anonymity)
  cue?: string; // facilitator begin-cue; default applied when empty
  timerEndsAt: number | null;
  variant: "wide" | "portrait";
}

// A small, dependency-free chime so the projector sets the room's tempo when the
// armed countdown hits zero. Best-effort — silently no-ops if audio is blocked.
function chime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 1.15);
  } catch {
    /* audio unavailable — fine */
  }
}

export function LobbyScreen({
  branding,
  title,
  joinUrl,
  present,
  countVisible = true,
  cue,
  timerEndsAt,
  variant,
}: LobbyScreenProps) {
  const portrait = variant === "portrait";

  // Pulse the count only when it STRICTLY INCREASES — a rev bump can carry a
  // stale-low count on an eventually-consistent store, and a decrease (never
  // expected) must stay silent. Re-keying the node retriggers the entrance anim.
  const prev = useRef(present);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (present > prev.current) setPulse((p) => p + 1);
    prev.current = present;
  }, [present]);

  const [elapsed, setElapsed] = useState(false);
  const future = timerEndsAt != null && timerEndsAt > Date.now();
  const past = timerEndsAt != null && !future;

  const heroName = branding?.headline || "";
  const logo = branding?.logoUrl;
  const tagline =
    branding?.tagline ||
    "No app, no code — just pick a name, or stay anonymous.";

  const ribbon = (
    <div className="text-center">
      {future || (timerEndsAt != null && !elapsed) ? (
        <p className="font-display text-3xl text-accent md:text-4xl">
          Starting in{" "}
          <span className="font-mono">
            <Countdown
              endsAt={timerEndsAt!}
              onElapsed={() => {
                setElapsed(true);
                chime();
              }}
            />
          </span>
        </p>
      ) : past || elapsed ? (
        <p className="font-display text-3xl text-accent md:text-4xl">
          We&apos;re starting now
        </p>
      ) : (
        <p className="text-2xl text-muted">
          {cue?.trim() || "We'll begin shortly."}
        </p>
      )}
    </div>
  );

  const countBlock = countVisible ? (
    <div key={pulse} className="animate-fadeInUp flex items-center justify-center gap-2.5">
      <span className="inline-block h-3 w-3 animate-pulseSoft rounded-full bg-accent" />
      <span className="text-xl text-white/80 md:text-2xl">{countCopy(present)}</span>
    </div>
  ) : null;

  const heroZone = (
    <div
      className={`flex flex-col justify-center gap-6 bg-[#0a0e1d] p-10 md:p-14 ${
        portrait ? "items-center text-center" : "items-start"
      }`}
    >
      {logo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logo}
          alt=""
          className={`object-contain ${
            portrait ? "max-h-[22vh] max-w-[80vw]" : "max-h-[40vh] max-w-[48vw]"
          }`}
        />
      )}
      <h1
        className="min-w-0 font-display font-semibold leading-[1.05] tracking-tight text-white"
        style={{ fontSize: portrait ? "clamp(2rem,7vw,3.5rem)" : "clamp(3rem,6vw,5.5rem)" }}
      >
        {heroName || title?.trim() || joinDisplayName(joinUrl)}
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-white/60">{tagline}</p>
    </div>
  );

  const actionZone = (
    <div className="flex flex-col items-center justify-center gap-6 p-10 md:p-14">
      <p className="text-center text-lg uppercase tracking-wide text-accent">
        Scan to join — no app, no passcode
      </p>
      <div className="rounded-3xl bg-white p-6 shadow-2xl">
        {joinUrl && (
          <QRCodeSVG
            value={joinUrl}
            // clamp(280px, 32vw, 460px) — scannable from the back of a room.
            style={{ width: "clamp(220px, 30vw, 440px)", height: "auto" }}
          />
        )}
      </div>
      <p className="break-all text-center font-mono text-base text-white/50">{joinUrl}</p>
    </div>
  );

  if (portrait) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        {heroZone}
        {actionZone}
        <div className="flex flex-col items-center gap-5 px-8 pb-12">
          {countBlock}
          {ribbon}
        </div>
      </div>
    );
  }

  // wide (projector)
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[55fr_45fr]">
        {heroZone}
        {actionZone}
      </div>
      <div className="flex flex-col items-center gap-5 border-t border-white/10 px-8 py-8">
        {countBlock}
        {ribbon}
      </div>
    </div>
  );
}

// Fallback hero title when a room has no branding headline: a tidy version of
// the slug from the join URL (…/r/<slug>).
function joinDisplayName(joinUrl: string): string {
  const slug = joinUrl.split("/r/")[1]?.split(/[/?#]/)[0] ?? "";
  if (!slug) return "Welcome";
  return slug
    .replace(/-[a-z0-9]{4,}$/i, "") // drop a trailing random suffix
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || "Welcome";
}
