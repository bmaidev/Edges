"use client";

import { useState } from "react";
import type { Attribution } from "@/lib/modules/attribution";

// D1 — the honest anonymity indicator: per phase, tells the participant whether
// their response is named to the room or kept to the facilitators. Tap to expand
// the exact guarantee. Never overclaims (no "anonymous even from facilitators").
export function AttributionChip({
  attribution,
  handle,
}: {
  attribution?: Attribution;
  handle: string;
}) {
  const [open, setOpen] = useState(false);
  if (!attribution || attribution === "none") return null;
  const named = attribution === "named";

  return (
    <div className="px-5 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
          named
            ? "border-accent/40 text-accent"
            : "border-border text-muted"
        }`}
      >
        <span aria-hidden>{named ? "👤" : "🙈"}</span>
        {named ? (
          <>
            Named — shared as <span className="font-medium">{handle}</span>
          </>
        ) : (
          "Facilitators only"
        )}
        <span aria-hidden className="text-[10px] opacity-60">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted" role="note">
          {named ? (
            <>
              Your response is shown to the whole room with your name (
              <span className="text-white/80">{handle}</span>).
            </>
          ) : (
            <>
              The room sees responses without names. The facilitators can still see
              who said what — this isn&apos;t anonymous from them.
            </>
          )}
        </p>
      )}
    </div>
  );
}
