// Module: ambient (E3) — a calm "break / hold" screen.
//
// Unlike a normal module, ambient is never placed in a builder sequence. It's
// SYNTHESISED by the store (resolveActive) when state.ambient is set, summoned by
// the facilitator over the live arc. Display-only: no actions, no votes, no AI.
// The countdown (for a break) rides the room-wide timerEndsAt, already in
// PublicState — this view just carries the calm copy.

import { z } from "zod";
import type { ModuleServerDef } from "../types";
import type { AmbientScene } from "@/lib/types";

export interface AmbientConfig {
  label: string;
  kind: "break" | "hold";
  scene?: AmbientScene;
  startedAt?: number | null;
  note?: string;
}

export interface AmbientView {
  kind: "break" | "hold";
  scene: AmbientScene;
  note: string | null;
  headline: string;
  startedAt: number | null; // E3 — anchors the breathing pace (rAF-free, CSS-driven)
  endsAt: number | null; // E3 — drives the countdown scene's big clock
}

const HEADLINE: Record<AmbientScene, string> = {
  break: "Taking a short break",
  hold: "We'll resume shortly",
  breathe: "Let's take a breath",
  countdown: "Back in a moment",
  cuecard: "",
};

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
      scene: z.enum(["break", "hold", "breathe", "countdown", "cuecard"]).optional(),
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
    const scene: AmbientScene = cfg.scene ?? (cfg.kind === "hold" ? "hold" : "break");
    const note = cfg.note?.trim() ? cfg.note.trim() : null;
    const view: AmbientView = {
      kind: cfg.kind === "hold" ? "hold" : "break",
      scene,
      note,
      // A cue card leads with the note itself; the others have a calm headline.
      headline: scene === "cuecard" ? note ?? "" : HEADLINE[scene],
      startedAt: typeof cfg.startedAt === "number" ? cfg.startedAt : null,
      endsAt: ctx.state.timerEndsAt ?? null,
    };
    return view;
  },
};
