"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChime } from "@/components/useChime";

// E2 — a soft cross-dissolve between projector screens. When the screen key
// changes (a phase advance, or lobby↔phase↔ended), we keep the PREVIOUS rendered
// node — a frozen React element holding its old props, so a later contentVersion
// bump can't re-animate it — fade it out over the incoming one, then UNMOUNT it on
// animationend. Driving the unmount off animationend (not a timer) means
// `body.a11y-reduce-motion` (which collapses the animation to ~0ms) yields a true
// instant swap with no lingering ghost. A single chime marks each change.
export function PhaseTransition({
  screenKey,
  chime: doChime = true,
  children,
}: {
  screenKey: string;
  chime?: boolean;
  children: ReactNode;
}) {
  const [outgoing, setOutgoing] = useState<ReactNode>(null);
  const prevKey = useRef<string>(screenKey);
  const prevChildren = useRef<ReactNode>(children);
  const chime = useChime();

  useEffect(() => {
    if (prevKey.current !== screenKey) {
      setOutgoing(prevChildren.current); // freeze the old screen, fade it out
      if (doChime) chime();
      prevKey.current = screenKey;
    }
    prevChildren.current = children;
  }, [screenKey, children, chime, doChime]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {outgoing && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden animate-crossFadeOut"
          aria-hidden
          onAnimationEnd={() => setOutgoing(null)}
        >
          {outgoing}
        </div>
      )}
      <div
        key={screenKey}
        className={`flex flex-1 flex-col overflow-y-auto ${outgoing ? "animate-crossFadeIn" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
