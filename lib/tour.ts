// Static, type-only tour script — no React, no server imports. The TourCoach
// rail reads this to spotlight one real element at a time and advance off the
// authoritative state the host console already holds (never a /state read-back).
//
// Steps are grouped by surface. Each surface's coach is self-contained: it shows
// only its own steps with its own counter and persists its own progress, so the
// narrative flows across tabs (admin → open host → host) without a fragile shared
// cross-surface index.

export type TourSurface = "admin" | "host" | "screen";

// A gate on "Next": the step can't be completed until an authoritative state
// change is observed (off the rev-guarded console state, not a poll).
export type TourAwait = "phaseChanged" | "sessionEnded";

export interface TourStep {
  id: string;
  surface: TourSurface;
  anchor: string | null; // data-tour-id value to spotlight (null = centred card)
  title: string;
  body: string; // ≤2 lines of load-bearing keystone copy
  doneBody?: string; // celebratory swap shown once an `await` gate fires
  cta?: { label: string; href?: string };
  await?: TourAwait; // gate completion on an authoritative state change
}

export const TOUR_STEPS: TourStep[] = [
  // ---- admin ----
  {
    id: "admin-welcome",
    surface: "admin",
    anchor: "create-workshop",
    title: "This is your control room",
    body: "Every room — its passcodes, branding, and live monitor — starts here. Let's poke a safe demo first.",
  },
  {
    id: "admin-sample",
    surface: "admin",
    anchor: "sample-card",
    title: "A workshop you can't break",
    body: "Seven fake people, real messy ideas, a running timer. Hit “open host” to drive it — no extra passcode.",
  },
  // ---- host (the spine) ----
  {
    id: "host-advance",
    surface: "host",
    anchor: "advance",
    title: "One method, phase by phase",
    body: "A named workshop is just a few primitives chained together. Press Advance to move the room on.",
    doneBody: "That's the whole job — one method, advanced phase by phase.",
    await: "phaseChanged",
  },
  {
    id: "host-preview",
    surface: "host",
    anchor: "tab-preview",
    title: "See exactly what they see",
    body: "“What they see” mirrors every participant's screen live, so you're never guessing what's up.",
  },
  {
    id: "host-patterns",
    surface: "host",
    anchor: "tab-patterns",
    title: "The room's thinking, made legible",
    body: "Patterns groups raw ideas into named themes. We've pre-clustered a few in the demo.",
  },
  {
    id: "host-content",
    surface: "host",
    anchor: "tab-content",
    title: "Inject a slide or a note",
    body: "Drop reference material in the moment the room needs it — it appears on their screens at once.",
  },
  {
    id: "host-end",
    surface: "host",
    anchor: "end-session",
    title: "End wipes everything",
    body: "Off the record by design. Open Session, end the demo, and watch every trace vanish. Try it.",
    doneBody: "Gone. No trace — that's the off-the-record contract.",
    await: "sessionEnded",
  },
  {
    id: "host-done",
    surface: "host",
    anchor: null,
    title: "Now make it real",
    body: "Nothing you did could touch a real cohort. Spin up your own room when you're ready.",
    cta: { label: "Create your first real room", href: "/admin" },
  },
  // ---- screen ----
  {
    id: "screen-intro",
    surface: "screen",
    anchor: null,
    title: "This is the big screen",
    body: "Project this. It shows the room only what it needs — and updates the instant you advance.",
  },
];

export function stepsForSurface(s: TourSurface): TourStep[] {
  return TOUR_STEPS.filter((step) => step.surface === s);
}
