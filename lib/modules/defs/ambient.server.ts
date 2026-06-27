// Module: ambient (E3) — a calm "break / hold" screen.
//
// Unlike a normal module, ambient is never placed in a builder sequence. It's
// SYNTHESISED by the store (resolveActive) when state.ambient is set, summoned by
// the facilitator over the live arc. Display-only: no actions, no votes, no AI.
// The countdown (for a break) rides the room-wide timerEndsAt, already in
// PublicState — this view just carries the calm copy.

import { z } from "zod";
import type { ModuleServerDef } from "../types";

export interface AmbientConfig {
  label: string;
  kind: "break" | "hold";
  note?: string;
}

export interface AmbientView {
  kind: "break" | "hold";
  note: string | null;
  headline: string;
}

function vis() {
  const v = "visible" as const;
  return { admin: v, participant: v, facilitator: v, cohost: v, projector: v };
}

export const ambientModule: ModuleServerDef<AmbientConfig> = {
  id: "ambient",
  meta: {
    name: "Break",
    description: "A calm break or holding screen between activities.",
    icon: "moon",
  },
  schema: z
    .object({
      label: z.string(),
      kind: z.enum(["break", "hold"]),
      note: z.string().optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Break", kind: "break" },
  defaultVisibility: vis(),
  capabilities: {
    gatherSource: "none",
    acceptsActions: false,
    liveResults: false,
    needsTimer: false,
    projectable: true,
  },
  computeView(ctx) {
    const cfg = ctx.config as unknown as AmbientConfig;
    const view: AmbientView = {
      kind: cfg.kind === "hold" ? "hold" : "break",
      note: cfg.note?.trim() ? cfg.note.trim() : null,
      headline: cfg.kind === "hold" ? "We'll resume shortly" : "Taking a short break",
    };
    return view;
  },
};
