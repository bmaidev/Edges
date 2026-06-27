"use client";

// E3 scene engine — the calm ambient renderer. One of several SCENES summoned by
// the facilitator over the live arc; display-only on both phone + projector.
//   break / hold → one slow breathing dot + an editorial line.
//   breathe      → a guided box-breathing circle (inhale·hold·exhale·hold, 16s)
//                  with a phase caption, so the whole room can breathe together.
//   countdown    → a big shared mm:ss clock.
//   cuecard      → one large instruction (the note), nothing else.
// All respect reduce-motion via the global a11y-reduce-motion body class + the
// participant A11yProvider; the animation degrades to a calm static state.

import { useEffect, useState } from "react";
import { useA11y } from "@/components/A11yProvider";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { AmbientView } from "./ambient.server";

// Which 4s quarter of the 16s box-breathing cycle we're in → a word to follow.
const BREATHE_PHASES = ["Breathe in", "Hold", "Breathe out", "Hold"] as const;
function breathePhase(startedAt: number | null, now: number): string {
  if (startedAt == null) return "Breathe in";
  const q = Math.floor((((now - startedAt) / 1000) % 16) / 4);
  return BREATHE_PHASES[((q % 4) + 4) % 4];
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function AmbientScreen({ view, big }: { view: AmbientView; big: boolean }) {
  // The participant tree has the A11yProvider; the projector doesn't — default to
  // motion-on there (a shared wall isn't a personal a11y device; the global CSS
  // still neutralises animation under the manual reduce-motion class).
  const reduceMotion = useA11y()?.prefs.reduceMotion ?? false;

  // A slow local tick drives the breathe caption + the countdown numerals.
  const [now, setNow] = useState(() => Date.now());
  const live = view.scene === "breathe" || view.scene === "countdown";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [live]);

  const headlineCls = `font-display leading-relaxed text-white/90 ${
    big ? "max-w-2xl text-5xl" : "max-w-xs text-2xl"
  }`;
  const noteCls = `text-muted ${big ? "max-w-xl text-2xl" : "max-w-xs text-base"}`;

  // ---- countdown: a big shared clock ----
  if (view.scene === "countdown" && view.endsAt != null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
        <p className={`font-mono tabular-nums text-accent ${big ? "text-[12rem] leading-none" : "text-7xl"}`}>
          {mmss(view.endsAt - now)}
        </p>
        <p className={headlineCls}>{view.headline}</p>
        {view.note && <p className={noteCls}>{view.note}</p>}
      </div>
    );
  }

  // ---- breathe: a guided box-breathing circle ----
  if (view.scene === "breathe") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-10 text-center">
        <div className={`relative ${big ? "h-56 w-56" : "h-32 w-32"}`}>
          <div className="absolute inset-0 rounded-full bg-accent/15 blur-2xl" />
          <div
            className={`relative h-full w-full rounded-full bg-accent/60 ${reduceMotion ? "scale-90 opacity-90" : "animate-breathe"}`}
          />
        </div>
        <p className={headlineCls}>
          {reduceMotion ? view.headline : breathePhase(view.startedAt, now)}
        </p>
        {view.note && <p className={noteCls}>{view.note}</p>}
      </div>
    );
  }

  // ---- cuecard: one large instruction ----
  if (view.scene === "cuecard" && view.note) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-center">
        <p className={`font-display leading-snug text-white/95 ${big ? "max-w-4xl text-6xl" : "max-w-sm text-3xl"}`}>
          {view.note}
        </p>
      </div>
    );
  }

  // ---- break / hold (default): a single slow breathing dot ----
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="relative h-12 w-12">
        {!reduceMotion && (
          <div className="absolute inset-0 rounded-full bg-accent/25 blur-xl animate-pulseSoft" />
        )}
        <div
          className={`relative h-12 w-12 rounded-full bg-accent/70 ${reduceMotion ? "" : "animate-pulseSoft"}`}
        />
      </div>
      <p className={headlineCls}>{view.headline}</p>
      {view.note && <p className={noteCls}>{view.note}</p>}
    </div>
  );
}

const AmbientParticipant: Renderer = ({ view }) => (
  <AmbientScreen view={view as AmbientView} big={false} />
);
const AmbientProjector: Renderer = ({ view }) => (
  <AmbientScreen view={view as AmbientView} big />
);

export const ambientRenderers: Partial<Record<Role, Renderer>> = {
  participant: AmbientParticipant,
  projector: AmbientProjector,
};
