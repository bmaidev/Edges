"use client";

import type { FacilitatorState } from "@/lib/types";

// D1 — host/room parity: a glanceable badge telling the facilitator exactly what
// the room sees this phase — the attribution regime (mirroring the participant's
// AttributionChip) and the instruction line, if any. So the lead never has to
// guess whether responses are named, and never overclaims anonymity.
const REGIME: Record<string, { label: string; cls: string }> = {
  named: { label: "Room sees names", cls: "border-accent/40 text-accent" },
  "facilitators-only": {
    label: "Room sees responses anonymously (you can still see who)",
    cls: "border-border text-muted",
  },
};

export function HostParityBadge({ state }: { state: FacilitatorState }) {
  const attribution = state.attribution;
  const instruction = (state.config as { instruction?: string } | null)?.instruction?.trim();
  const regime = attribution ? REGIME[attribution] : undefined;
  if (!regime && !instruction) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {regime && (
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${regime.cls}`}>
          <span aria-hidden>{attribution === "named" ? "👤" : "🙈"}</span>
          {regime.label}
        </span>
      )}
      {instruction && (
        <p className="text-xs text-muted">
          <span className="text-muted/70">They&apos;re told:</span> “{instruction}”
        </p>
      )}
    </div>
  );
}
