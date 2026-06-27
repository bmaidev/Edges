// C7 — the AI co-facilitator's brain, MVP edition: DETERMINISTIC, no AI, no cost,
// no latency. It reasons ONLY over live counts + timings (participation numbers,
// the clock, the planned duration) — NEVER over a single participant's words or
// identity. Pure + content-free, so it's trivially testable and anonymity-safe.
//
// Advisory only: it offers at most one gentle, dismissable nudge with a one-tap
// action that reuses an existing host command. The facilitator always decides —
// and can turn the co-facilitator off entirely, or tune how eager it is.

export type CofacKind = "overrunning" | "low-response";

// C7 full — the lead's eagerness dial. `off` is handled separately (cofacEnabled);
// these three tune the thresholds so a room can run quieter or more attentive.
export type CofacSensitivity = "calm" | "standard" | "keen";

export interface CofacNudge {
  kind: CofacKind;
  message: string;
  action: { command: string; label: string; args?: Record<string, unknown> } | null;
}

// Per-sensitivity tunables. Conservative on purpose — silence is the default; a
// nudge should feel timely, not naggy. `calm` nudges rarely; `keen` leans in.
interface Tunables {
  overrunGraceMs: number; // don't fire the instant the clock hits zero
  responseFloor: number; // "low" = under this fraction has responded
  minPresent: number; // never coach a room smaller than this
  elapsedGate: number; // only once this fraction of planned time has passed
}
const TUNABLES: Record<CofacSensitivity, Tunables> = {
  calm: { overrunGraceMs: 45_000, responseFloor: 0.4, minPresent: 4, elapsedGate: 0.75 },
  standard: { overrunGraceMs: 15_000, responseFloor: 0.5, minPresent: 3, elapsedGate: 0.6 },
  keen: { overrunGraceMs: 5_000, responseFloor: 0.6, minPresent: 3, elapsedGate: 0.5 },
};

export interface CofacInput {
  participation:
    | { present: number; responded: number; typing: number; quiet: number }
    | null;
  timerEndsAt: number | null;
  config: { timerSeconds?: number } | null | Record<string, unknown>;
  phaseId: string | null;
  // C7 full — the lead's controls, read from session state. Off → always silent.
  cofacEnabled?: boolean;
  cofacSensitivity?: CofacSensitivity;
  // C7 full — server-persisted dismissals ({phaseId, kind}); a dismissed nudge
  // stays gone for that phase across polls / reloads / co-host devices.
  cofacDismissed?: { phaseId: string; kind: string }[];
}

// At most one nudge, highest priority first. Returns null when all is well, when
// the co-facilitator is switched off, or when the candidate was dismissed.
export function computeCofac(s: CofacInput, now: number): CofacNudge | null {
  if (s.cofacEnabled === false) return null; // the lead turned it off
  const t = TUNABLES[s.cofacSensitivity ?? "standard"];

  const dismissed = (kind: CofacKind) =>
    (s.cofacDismissed ?? []).some(
      (d) => d.phaseId === (s.phaseId ?? "") && d.kind === kind,
    );

  // 1) Overrunning — a live deadline has passed (+ a sensitivity-scaled grace).
  if (
    !dismissed("overrunning") &&
    s.timerEndsAt != null &&
    now > s.timerEndsAt + t.overrunGraceMs
  ) {
    return {
      kind: "overrunning",
      message: "The clock's up — give the room a moment more, or move on.",
      action: { command: "addTime", label: "+2 min", args: { addMs: 120_000 } },
    };
  }

  // 2) Low response — a gather phase (participation is non-null only there), well
  //    into its planned time, with under the floor responded. The planned duration
  //    (config.timerSeconds) + the live deadline give the elapsed fraction, so
  //    this never fires at the start of a phase.
  const p = s.participation;
  const planned = (s.config as { timerSeconds?: number } | null)?.timerSeconds;
  if (
    !dismissed("low-response") &&
    p &&
    p.present >= t.minPresent &&
    s.timerEndsAt != null &&
    planned &&
    planned > 0
  ) {
    const elapsedFrac = 1 - (s.timerEndsAt - now) / (planned * 1000);
    const respondedFrac = p.responded / Math.max(1, p.present);
    if (elapsedFrac >= t.elapsedGate && elapsedFrac <= 1 && respondedFrac < t.responseFloor) {
      return {
        kind: "low-response",
        message: `Only ${p.responded} of ${p.present} have responded — a gentle nudge might help.`,
        action: { command: "nudgeRoom", label: "Nudge the room", args: { phaseId: s.phaseId } },
      };
    }
  }

  return null;
}
