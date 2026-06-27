// C7 — the AI co-facilitator's brain, MVP edition: DETERMINISTIC, no AI, no cost,
// no latency. It reasons ONLY over live counts + timings (participation numbers,
// the clock, the planned duration) — NEVER over a single participant's words or
// identity. Pure + content-free, so it's trivially testable and anonymity-safe.
//
// Advisory only: it offers at most one gentle, dismissable nudge with a one-tap
// action that reuses an existing host command. The facilitator always decides.

import type { FacilitatorState } from "./types";

export type CofacKind = "overrunning" | "low-response";

export interface CofacNudge {
  kind: CofacKind;
  message: string;
  action: { command: string; label: string; args?: Record<string, unknown> } | null;
}

// Tunables. Conservative on purpose — silence is the default; a nudge should feel
// timely, not naggy.
const OVERRUN_GRACE_MS = 15_000; // don't fire the instant the clock hits zero
const RESPONSE_FLOOR = 0.5; // "low" = under half the room has responded
const MIN_PRESENT = 3; // never coach a tiny room
const ELAPSED_GATE = 0.6; // only once 60% of the planned time has passed

type CofacInput = Pick<
  FacilitatorState,
  "participation" | "timerEndsAt" | "config" | "phaseId"
>;

// At most one nudge, highest priority first. Returns null when all is well.
export function computeCofac(s: CofacInput, now: number): CofacNudge | null {
  // 1) Overrunning — a live deadline has passed (+ a short grace).
  if (s.timerEndsAt != null && now > s.timerEndsAt + OVERRUN_GRACE_MS) {
    return {
      kind: "overrunning",
      message: "The clock's up — give the room a moment more, or move on.",
      action: { command: "addTime", label: "+2 min", args: { addMs: 120_000 } },
    };
  }

  // 2) Low response — a gather phase (participation is non-null only there), well
  //    into its planned time, with under half responded. The planned duration
  //    (config.timerSeconds) + the live deadline give the elapsed fraction, so
  //    this never fires at the start of a phase.
  const p = s.participation;
  const planned = (s.config as { timerSeconds?: number } | null)?.timerSeconds;
  if (p && p.present >= MIN_PRESENT && s.timerEndsAt != null && planned && planned > 0) {
    const elapsedFrac = 1 - (s.timerEndsAt - now) / (planned * 1000);
    const respondedFrac = p.responded / Math.max(1, p.present);
    if (elapsedFrac >= ELAPSED_GATE && elapsedFrac <= 1 && respondedFrac < RESPONSE_FLOOR) {
      return {
        kind: "low-response",
        message: `Only ${p.responded} of ${p.present} have responded — a gentle nudge might help.`,
        action: { command: "nudgeRoom", label: "Nudge the room", args: { phaseId: s.phaseId } },
      };
    }
  }

  return null;
}
