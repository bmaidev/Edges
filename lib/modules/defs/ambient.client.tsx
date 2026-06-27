"use client";

// E3 — the calm ambient renderer (break / hold). Display-only on both surfaces.
// Near-black, one editorial line, one slow breathing dot; the countdown (for a
// break) is carried by the surrounding StatusBar / PresenterRibbon, so this stays
// serene. Respects reduce-motion via the global a11y-reduce-motion body class.

import { useA11y } from "@/components/A11yProvider";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { AmbientView } from "./ambient.server";

function AmbientScreen({ view, big }: { view: AmbientView; big: boolean }) {
  // The participant tree has the A11yProvider; the projector doesn't — default to
  // motion-on there (a shared wall isn't a personal a11y device, and the global
  // CSS still neutralises animation under the manual reduce-motion class).
  const reduceMotion = useA11y()?.prefs.reduceMotion ?? false;
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
      <p className={`font-display leading-relaxed text-white/90 ${big ? "max-w-2xl text-5xl" : "max-w-xs text-2xl"}`}>
        {view.headline}
      </p>
      {view.note && (
        <p className={`text-muted ${big ? "max-w-xl text-2xl" : "max-w-xs text-base"}`}>
          {view.note}
        </p>
      )}
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
