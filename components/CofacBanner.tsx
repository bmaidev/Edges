"use client";

import { useState } from "react";
import type { CofacNudge } from "@/lib/cofac";

type Cmd = (command: string, args?: Record<string, unknown>) => Promise<Response>;

// C7 — the co-facilitator nudge banner. Shows at most one gentle, dismissable
// suggestion with a one-tap action that reuses an existing host command. Advisory
// only — silence is the default; the facilitator always decides. Self-hides when
// there's no nudge, or once dismissed for this phase + kind.
export function CofacBanner({
  cofac,
  phaseId,
  cmd,
}: {
  cofac: CofacNudge | null;
  phaseId: string;
  cmd: Cmd;
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (!cofac) return null;
  const key = `${phaseId}:${cofac.kind}`;
  if (dismissedKey === key) return null;
  // C7 — dismiss locally for an instant hide AND persist server-side so the nudge
  // stays gone across polls / reloads / co-host devices (the server suppresses it
  // from `cofac` on the next state).
  const dismiss = () => {
    setDismissedKey(key);
    void cmd("cofacDismiss", { phaseId, kind: cofac.kind });
  };

  return (
    <div
      className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="text-accent">🧭</span>
      <span className="min-w-0 flex-1 text-white/90">{cofac.message}</span>
      {cofac.action && (
        <button
          onClick={() => {
            void cmd(cofac.action!.command, cofac.action!.args);
            dismiss();
          }}
          className="shrink-0 rounded border border-accent bg-accent/10 px-2 py-1 text-accent hover:border-accent"
        >
          {cofac.action.label}
        </button>
      )}
      <button
        onClick={dismiss}
        className="shrink-0 text-muted underline hover:text-white"
      >
        dismiss
      </button>
    </div>
  );
}
