// B6 — plain-language method cards for the builder. A single catalog (not copy
// scattered across 40 def files) keyed by ModuleKind, so a non-technical
// facilitator reads "what it is / best for / what the room does" instead of a
// dense one-liner. `satisfies Record<ModuleKind, PlainCard>` makes the catalog
// exhaustive at COMPILE time — a new module won't build until it has a card — and
// a runtime guard test backs that up. No registry import here (keeps it tiny and
// client-safe).

import type { ModuleKind } from "@/lib/types";

export interface PlainCard {
  whatItIs: string; // one plain sentence: what this method is
  bestFor: string; // when to reach for it
  roomDoes: string; // what a participant actually does
}

export const MODULE_CARDS = {
  // ---- core primitives ----
  lobby: {
    whatItIs: "A calm holding screen before things begin.",
    bestFor: "The opening, while people arrive and settle.",
    roomDoes: "Waits, watching the screen for the first activity.",
  },
  content: {
    whatItIs: "Shows a piece of reference material to the room.",
    bestFor: "Framing a case or shared context everyone needs.",
    roomDoes: "Reads the shared material on their phone.",
  },
  media: {
    whatItIs: "Presents slides or a short talk to the room.",
    bestFor: "A framing input or presentation.",
    roomDoes: "Watches the presentation on the big screen.",
  },
  capture: {
    whatItIs: "Open-text capture — everyone types short contributions.",
    bestFor: "Diverging — surfacing lots of ideas fast.",
    roomDoes: "Types short ideas; they stream in live.",
  },
  allocate: {
    whatItIs: "Self-allocation to a lens, side, or role.",
    bestFor: "Splitting the room into perspectives or teams.",
    roomDoes: "Picks (or is assigned) a lens or side to work from.",
  },
  coordinator: {
    whatItIs: "Pairs or triads people into small groups.",
    bestFor: "Setting up a paired or small-group exchange.",
    roomDoes: "Sees who they're grouped with and a shared prompt.",
  },
  readaround: {
    whatItIs: "Reads contributions back to the room one at a time.",
    bestFor: "Honouring every voice; a gentle convergence.",
    roomDoes: "Watches each contribution surface on the screen.",
  },
  close: {
    whatItIs: "A calm closing screen.",
    bestFor: "Ending the session warmly.",
    roomDoes: "Sees a closing message as the session wraps.",
  },
  // ---- vote / converge family ----
  poll: {
    whatItIs: "A single- or multi-choice poll.",
    bestFor: "A quick read of the room's preference.",
    roomDoes: "Taps an option; results animate in.",
  },
  dotvote: {
    whatItIs: "Dot / budget voting — spend points across options.",
    bestFor: "Converging on priorities from a longlist.",
    roomDoes: "Spends their dots across the options.",
  },
  rank: {
    whatItIs: "Ranked-choice ordering of options.",
    bestFor: "Forcing trade-offs to find a clear order.",
    roomDoes: "Drags options into their preferred order.",
  },
  scale: {
    whatItIs: "Rates each statement on a 0–N scale.",
    bestFor: "Measuring sentiment or confidence across items.",
    roomDoes: "Drags a slider for each statement.",
  },
  wordcloud: {
    whatItIs: "A live word cloud from one- to three-word answers.",
    bestFor: "A fast, visual pulse of the room.",
    roomDoes: "Submits a few words; they size by frequency.",
  },
  qna: {
    whatItIs: "Q&A with upvoting — questions rise by popularity.",
    bestFor: "Surfacing the questions that matter most.",
    roomDoes: "Posts questions and upvotes others'.",
  },
  matrix: {
    whatItIs: "A 2×2 / impact-effort matrix.",
    bestFor: "Plotting items on two dimensions to prioritise.",
    roomDoes: "Rates each item on two sliders; bubbles place it.",
  },
  // ---- fleet modules ----
  brainwrite: {
    whatItIs: "Silent written idea generation (brainwriting).",
    bestFor: "Equal-voice divergence before any discussion.",
    roomDoes: "Writes ideas privately; all surface together.",
  },
  marketplace: {
    whatItIs: "An idea marketplace — browse and back proposals.",
    bestFor: "Letting strong ideas attract support organically.",
    roomDoes: "Browses proposals and backs the ones they like.",
  },
  redistribute: {
    whatItIs: "Redistributes contributions for fresh eyes.",
    bestFor: "Building on others' ideas without ego.",
    roomDoes: "Receives someone else's idea to extend.",
  },
  spectrogram: {
    whatItIs: "A human spectrogram along an agree↔disagree line.",
    bestFor: "Making a spread of opinion visible.",
    roomDoes: "Places themselves along the spectrum.",
  },
  gradient: {
    whatItIs: "Gradient of agreement — degrees of yes / no.",
    bestFor: "Testing consensus beyond a binary vote.",
    roomDoes: "Picks their level of agreement.",
  },
  lightning: {
    whatItIs: "Lightning talks — quick timed shares.",
    bestFor: "Rapid-fire sharing from many voices.",
    roomDoes: "Gives (or hears) a short timed talk.",
  },
  fishbowl: {
    whatItIs: "A fishbowl — an inner circle talks, others observe.",
    bestFor: "Focused dialogue with an attentive audience.",
    roomDoes: "Speaks in the circle or watches and rotates in.",
  },
  openspace: {
    whatItIs: "Open Space — participants set the agenda.",
    bestFor: "Self-organising around what people care about.",
    roomDoes: "Proposes or joins a self-chosen topic.",
  },
  devil: {
    whatItIs: "Devil's advocate — argue the opposing case.",
    bestFor: "Stress-testing an idea before committing.",
    roomDoes: "Raises and votes on the strongest counter-arguments.",
  },
  friction: {
    whatItIs: "A tension map — where forces pull against each other.",
    bestFor: "Naming the real trade-offs in a decision.",
    roomDoes: "Marks where the tensions sit.",
  },
  synthesis: {
    whatItIs: "AI synthesis of the room's contributions.",
    bestFor: "Pulling themes and tensions from a lot of input.",
    roomDoes: "Reads the synthesised summary on the screen.",
  },
  needs: {
    whatItIs: "Latent-needs analysis (AI) of what's been said.",
    bestFor: "Finding the unspoken need under the asks.",
    roomDoes: "Sees the surfaced needs on the screen.",
  },
  equity: {
    whatItIs: "Participation equity — a read on who's contributed.",
    bestFor: "Checking the room is genuinely inclusive.",
    roomDoes: "Nothing to do — it reflects participation back.",
  },
  prework: {
    whatItIs: "A pre-work jam — gather input before the live session.",
    bestFor: "Warming up thinking before everyone meets.",
    roomDoes: "Submits prepared thoughts in advance.",
  },
  consult: {
    whatItIs: "Consult — gather targeted input on a question.",
    bestFor: "Getting focused advice from the room.",
    roomDoes: "Offers their input on the posed question.",
  },
  // ---- rotation family ----
  worldcafe: {
    whatItIs: "World Café — small tables with a host; ideas cross-pollinate.",
    bestFor: "Rich small-group conversation that mixes the room.",
    roomDoes: "Moves between tables carrying ideas; a host stays.",
  },
  stations: {
    whatItIs: "Shift & Share — intact groups tour a set of stations.",
    bestFor: "Exposing every group to several stations in turn.",
    roomDoes: "Tours stations with their group, capturing notes.",
  },
  onetwofour: {
    whatItIs: "1-2-4-All — think alone, then pairs, fours, whole group.",
    bestFor: "Surfacing everyone's thinking before convergence.",
    roomDoes: "Works the same question at widening scales.",
  },
  twentyfive10: {
    whatItIs: "25/10 — write one bold idea, blind-score others.",
    bestFor: "Surfacing the boldest ideas without dominance.",
    roomDoes: "Writes one idea, then blind-scores a few.",
  },
  minspecs: {
    whatItIs: "Min Specs — find the few must-do rules.",
    bestFor: "Stripping a plan to its essential constraints.",
    roomDoes: "Proposes and tests the minimum specifications.",
  },
  // ---- AI / advanced family ----
  persona: {
    whatItIs: "A skeptical budget-holder persona to pitch to.",
    bestFor: "Pressure-testing a proposal against a tough buyer.",
    roomDoes: "Votes on the pitch as the persona would react.",
  },
  emptychair: {
    whatItIs: "The empty chair — speak for an absent stakeholder.",
    bestFor: "Bringing a missing voice into the room.",
    roomDoes: "Contributes on behalf of who isn't present.",
  },
  issuemap: {
    whatItIs: "An issue map — cluster and relate the open issues.",
    bestFor: "Seeing how problems connect before solving.",
    roomDoes: "Votes to map and relate the issues.",
  },
  promptrelay: {
    whatItIs: "A prompt relay — each builds on the last response.",
    bestFor: "Compounding a chain of thinking across the room.",
    roomDoes: "Adds the next link to a growing chain.",
  },
  builder: {
    whatItIs: "A prototype builder — assemble a rough solution.",
    bestFor: "Making an idea concrete enough to react to.",
    roomDoes: "Helps assemble a quick prototype.",
  },
  // E3 — synthetic break/hold screen; never placed in the builder palette, but the
  // catalog must stay exhaustive over ModuleKind.
  ambient: {
    whatItIs: "A calm break or holding screen between activities.",
    bestFor: "A pause, a stretch break, or holding before the next step.",
    roomDoes: "Rests — a serene screen, nothing to do.",
  },
} satisfies Record<ModuleKind, PlainCard>;

export function getCard(id: ModuleKind): PlainCard {
  return MODULE_CARDS[id];
}

// B6 — the modules whose output is room-authored TEXT a later phase can read via
// sourcePhaseId (the "feeds into" chain: brainstorm → cluster → vote). Kept as a
// readonly array (downlevelIteration is off) — this is the canonical producer set
// the builder ranks/explains by.
export const PRODUCES_ROOM_TEXT: readonly ModuleKind[] = [
  "capture",
  "prework",
  "qna",
  "brainwrite",
];

export function producesRoomText(id: ModuleKind): boolean {
  return PRODUCES_ROOM_TEXT.includes(id);
}

// The prompt (or label) a producer phase posed — for the "Reads what the room
// wrote in '…'" explainer. Never empty: falls back to the phase label.
export function promptOf(config: Record<string, unknown> | undefined): string {
  if (!config) return "";
  return (
    (typeof config.prompt === "string" && config.prompt) ||
    (typeof config.label === "string" && config.label) ||
    ""
  );
}
