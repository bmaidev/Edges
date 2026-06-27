// B1 — the session "arc" classifier: the curated knowledge that turns a phase
// sequence into the two things a facilitator thinks in — TIME and ENERGY/ARC.
// Pure, no I/O. Shared by the agenda timeline (B1) and reused by the runsheet
// (B3) / room preview (B2). The tables below are EXHAUSTIVE over every ModuleKind
// (a drift test enforces it), so a new module forces a conscious classification.

import type { ModuleKind, PhaseInstance } from "./types";
import { timeBudget } from "./design";

// The four beats of a well-formed workshop. Challenge/dialogue activities fold
// into "diverge" (they widen the space before the room converges).
export type ArcStage = "open" | "diverge" | "converge" | "close";

// moduleId -> where it sits in the arc.
export const STAGE_OF: Record<ModuleKind, ArcStage> = {
  // open — orient, present, group
  lobby: "open",
  ambient: "open", // E3 — synthetic break/hold (never in a real arc)
  content: "open",
  media: "open",
  allocate: "open",
  coordinator: "open",
  prework: "open",
  // diverge — generate, explore, challenge, dialogue
  capture: "diverge",
  brainwrite: "diverge",
  lightning: "diverge",
  onetwofour: "diverge",
  twentyfive10: "diverge",
  qna: "diverge",
  minspecs: "diverge",
  persona: "diverge",
  emptychair: "diverge",
  openspace: "diverge",
  worldcafe: "diverge",
  stations: "diverge",
  promptrelay: "diverge",
  redistribute: "diverge",
  consult: "diverge",
  fishbowl: "diverge",
  wordcloud: "diverge",
  devil: "diverge",
  friction: "diverge",
  issuemap: "diverge",
  marketplace: "diverge",
  needs: "diverge",
  spectrogram: "diverge",
  gradient: "diverge",
  builder: "diverge",
  // converge — prioritise, decide, synthesise, hear-back
  poll: "converge",
  dotvote: "converge",
  rank: "converge",
  scale: "converge",
  matrix: "converge",
  synthesis: "converge",
  readaround: "converge",
  equity: "converge",
  // close — commit, wrap
  actions: "close",
  close: "close",
};

// moduleId -> felt "energy" of the activity, 0 (calm/receptive) .. 1 (high/active).
// Used only to draw the energy sparkline; not a runtime value.
export const ENERGY_OF: Record<ModuleKind, number> = {
  lobby: 0.1,
  ambient: 0, // E3
  content: 0.2,
  media: 0.3,
  allocate: 0.4,
  coordinator: 0.4,
  prework: 0.4,
  capture: 0.6,
  brainwrite: 0.6,
  lightning: 0.75,
  onetwofour: 0.7,
  twentyfive10: 0.75,
  qna: 0.5,
  minspecs: 0.5,
  persona: 0.6,
  emptychair: 0.55,
  openspace: 0.6,
  worldcafe: 0.6,
  stations: 0.65,
  promptrelay: 0.6,
  redistribute: 0.6,
  consult: 0.55,
  fishbowl: 0.6,
  wordcloud: 0.5,
  devil: 0.7,
  friction: 0.6,
  issuemap: 0.55,
  marketplace: 0.65,
  needs: 0.5,
  spectrogram: 0.7,
  gradient: 0.6,
  builder: 0.6,
  poll: 0.4,
  dotvote: 0.55,
  rank: 0.5,
  scale: 0.45,
  matrix: 0.6,
  synthesis: 0.4,
  readaround: 0.45,
  equity: 0.3,
  actions: 0.4,
  close: 0.2,
};

// Fallback planned minutes when a phase has no explicit timerSeconds. Generous
// for untimed long-form dialogue (a fishbowl/open-space genuinely runs long).
export const DEFAULT_MINUTES: Record<ModuleKind, number> = {
  lobby: 2,
  ambient: 0, // E3
  content: 5,
  media: 8,
  allocate: 3,
  coordinator: 4,
  prework: 6,
  capture: 6,
  brainwrite: 6,
  lightning: 5,
  onetwofour: 10,
  twentyfive10: 12,
  qna: 8,
  minspecs: 8,
  persona: 6,
  emptychair: 10,
  openspace: 15,
  worldcafe: 12,
  stations: 10,
  promptrelay: 6,
  redistribute: 6,
  consult: 10,
  fishbowl: 12,
  wordcloud: 5,
  devil: 8,
  friction: 6,
  issuemap: 6,
  marketplace: 8,
  needs: 6,
  spectrogram: 7,
  gradient: 5,
  builder: 10,
  poll: 4,
  dotvote: 5,
  rank: 5,
  scale: 5,
  matrix: 8,
  synthesis: 5,
  readaround: 8,
  equity: 3,
  actions: 5,
  close: 5,
};

// Modules whose minutes meaningfully drive a live timer (needsTimer:true): the
// agenda chip writes config.timerSeconds for these; others show a planning-only
// estimate.
export const TIMED: Record<ModuleKind, boolean> = (() => {
  const timed = new Set<ModuleKind>([
    "capture",
    "brainwrite",
    "consult",
    "lightning",
    "onetwofour",
    "redistribute",
    "stations",
    "twentyfive10",
    "worldcafe",
    // F2 — a timeboxed "capture your commitments" close.
    "actions",
    // E3 — a placed break / countdown wants a duration (the minutes input).
    "ambient",
  ]);
  const out = {} as Record<ModuleKind, boolean>;
  for (const k of Object.keys(STAGE_OF) as ModuleKind[]) out[k] = timed.has(k);
  return out;
})();

export function acceptsTimerEdit(moduleId: ModuleKind): boolean {
  return Boolean(TIMED[moduleId]);
}

// Planned minutes for a phase: from config.timerSeconds when set (exact), else
// the curated default (estimated).
export function phaseMinutes(phase: {
  moduleId: ModuleKind;
  config: Record<string, unknown>;
}): { minutes: number; estimated: boolean } {
  const ts = phase.config?.timerSeconds;
  if (typeof ts === "number" && Number.isFinite(ts) && ts > 0)
    return { minutes: Math.round(ts / 60) || 1, estimated: false };
  return { minutes: DEFAULT_MINUTES[phase.moduleId] ?? 5, estimated: true };
}

export function phaseStage(moduleId: ModuleKind): ArcStage {
  return STAGE_OF[moduleId] ?? "diverge";
}
export function phaseEnergy(moduleId: ModuleKind): number {
  return ENERGY_OF[moduleId] ?? 0.5;
}

export interface ArcPhasePoint {
  index: number;
  moduleId: ModuleKind;
  stage: ArcStage;
  energy: number;
  minutes: number;
  estimated: boolean;
}
export interface ArcAnalysis {
  points: ArcPhasePoint[];
  totalMinutes: number;
  estimated: boolean; // any phase used a default
  budget: number;
  overBudget: boolean;
  // a coarse read of whether the arc opens, widens, then narrows to a close
  hasOpen: boolean;
  hasDiverge: boolean;
  hasConverge: boolean;
  hasClose: boolean;
}

// Analyse a phase sequence into the agenda/arc model. Index loops only (no Set
// spreads / .entries()).
export function analyzeAgenda(
  phases: Pick<PhaseInstance, "moduleId" | "config">[],
  minutes?: number,
): ArcAnalysis {
  const points: ArcPhasePoint[] = [];
  let total = 0;
  let anyEstimated = false;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const m = phaseMinutes(p);
    total += m.minutes;
    if (m.estimated) anyEstimated = true;
    points.push({
      index: i,
      moduleId: p.moduleId,
      stage: phaseStage(p.moduleId),
      energy: phaseEnergy(p.moduleId),
      minutes: m.minutes,
      estimated: m.estimated,
    });
  }
  const budget = timeBudget(minutes);
  const has = (s: ArcStage) => points.some((pt) => pt.stage === s);
  return {
    points,
    totalMinutes: total,
    estimated: anyEstimated,
    budget,
    overBudget: total > budget,
    hasOpen: has("open"),
    hasDiverge: has("diverge"),
    hasConverge: has("converge"),
    hasClose: has("close"),
  };
}

// B1 — a named "does it breathe?" read-out classifying the arc shape (vs the
// old boolean-only "full arc usually …" hint). Pure; covered by arc tests.
export type ArcVerdict = "healthy" | "no-converge" | "inverted" | "flat" | "incomplete";

export function arcReadout(a: ArcAnalysis): { verdict: ArcVerdict; text: string } {
  const stages = a.points.map((p) => p.stage);
  const firstDiverge = stages.indexOf("diverge");
  const firstConverge = stages.indexOf("converge");
  // Converging before diverging — narrowing before there's anything to narrow.
  if (firstDiverge >= 0 && firstConverge >= 0 && firstConverge < firstDiverge)
    return { verdict: "inverted", text: "Converges before it diverges — generate before you narrow." };
  // Diverged but never landed it.
  if (a.hasDiverge && !a.hasConverge)
    return { verdict: "no-converge", text: "No convergence after your divergence — add a vote or synthesis to land it." };
  // No shape at all across a few phases.
  if (!a.hasDiverge && !a.hasConverge && a.points.length >= 3)
    return { verdict: "flat", text: "Flat arc — consider a divergent then a convergent move." };
  // The full canonical shape.
  if (a.hasOpen && a.hasDiverge && a.hasConverge && a.hasClose)
    return { verdict: "healthy", text: "Opens, diverges, converges, closes ✓" };
  return { verdict: "incomplete", text: "A full arc usually opens, diverges, converges, then closes." };
}

// B1 — softened budget delta copy.
export function budgetReadout(a: ArcAnalysis): string {
  const delta = a.totalMinutes - a.budget;
  if (delta > 0) return `${delta} min over — trim a phase`;
  if (delta < -5) return `${-delta} min to spare`;
  return "about right";
}
