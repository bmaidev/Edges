// B2 — config-reactive SAMPLE view factories for the in-builder room preview.
// computeView is server-only (it imports zod + the store), so it can't run in the
// "use client" builder bundle; instead each factory hand-authors a plausible View
// literal — driven by the phase's config — that we render through the REAL client
// renderer. Synthetic data only; nothing here ever touches a room, the store, or
// real participants. Type-only imports keep this client-safe.

import type { ModuleKind } from "@/lib/types";
import type { ContentItem } from "@/lib/types";
import type {
  AllocateView,
  CaptureView,
  CloseView,
  ContentView,
  CoordinatorView,
  DotVoteView,
  LobbyView,
  MatrixView,
  PollView,
  QnaView,
  RankView,
  ReadAroundView,
  ScaleView,
  WordCloudView,
} from "./views";

type Cfg = Record<string, unknown>;
const str = (c: Cfg, k: string, d = "") => (typeof c[k] === "string" ? (c[k] as string) : d);
const arr = (c: Cfg, k: string): string[] =>
  Array.isArray(c[k]) ? (c[k] as unknown[]).filter((x): x is string => typeof x === "string") : [];
const num = (c: Cfg, k: string, d: number) => (typeof c[k] === "number" ? (c[k] as number) : d);

function sampleContent(title: string, body: string): ContentItem {
  return { id: "sample", type: "note", title, body, visible: true, queued: false, addedAt: 0 };
}

// Each factory returns the View its renderer expects, populated illustratively.
// `Partial` — modules without a factory fall back to a "preview coming" card.
export const SAMPLE_VIEWS: Partial<Record<ModuleKind, (config: Cfg) => unknown>> = {
  lobby: (c): LobbyView => ({
    message: str(c, "message", "We'll begin shortly."),
    present: 4,
  }),
  content: (c): ContentView => ({
    heading: str(c, "contentHeading") || undefined,
    items: [sampleContent("Reference", "This is how injected content reads to the room.")],
    pulseKey: 0,
  }),
  capture: (c): CaptureView => ({
    prompt: str(c, "prompt", "What ideas do you have?"),
    prompt2: str(c, "prompt2") || undefined,
    placeholder: str(c, "placeholder") || undefined,
    placeholder2: str(c, "placeholder2") || undefined,
    multiSubmit: Boolean(c.multiSubmit),
    referenceItems: [],
    activeConstraint: null,
    constraintDeck: arr(c, "constraintDeck"),
  }),
  readaround: (): ReadAroundView => ({
    index: 1,
    total: 3,
    item: { text: "A sample contribution, read aloud one at a time.", tag: null },
  }),
  close: (): CloseView => ({
    ended: false,
    yourContributions: [{ text: "An idea you contributed earlier.", tag: null }],
  }),
  coordinator: (c): CoordinatorView => ({
    kind: "pair",
    message: str(c, "message") || "Pair up with the person next to you.",
    members: ["Ada", "Bo"],
  }),
  allocate: (c): AllocateView => {
    const fixed = arr(c, "fixedOptions");
    const options = (fixed.length ? fixed : ["Optimist", "Skeptic", "Realist"]).map((name) => ({ name }));
    return {
      header: str(c, "header", "Pick a lens"),
      kind: "lens",
      options,
      counts: Object.fromEntries(options.map((o, i) => [o.name, [2, 1, 3][i % 3]])),
      mine: null,
    };
  },
  poll: (c): PollView => {
    const options = arr(c, "options").length ? arr(c, "options") : ["Yes", "No", "Maybe"];
    return {
      question: str(c, "question") || str(c, "label", "Which option?"),
      options,
      multi: Boolean(c.multi),
      total: 6,
      counts: Object.fromEntries(options.map((o, i) => [o, [3, 2, 1, 1][i % 4]])),
      mine: [options[0]],
    };
  },
  dotvote: (c): DotVoteView => {
    const options = arr(c, "options").length ? arr(c, "options") : ["Idea A", "Idea B", "Idea C"];
    const dots = num(c, "dots", 5);
    return {
      prompt: str(c, "prompt", "Spend your dots"),
      options,
      dots,
      counts: Object.fromEntries(options.map((o, i) => [o, [4, 3, 2][i % 3]])),
      mine: { [options[0]]: 2 },
      remaining: dots - 2,
    };
  },
  rank: (c): RankView => {
    const items = arr(c, "items").length ? arr(c, "items") : ["First", "Second", "Third"];
    return {
      prompt: str(c, "prompt", "Drag to rank"),
      items,
      results: items.map((item, i) => ({ item, score: items.length - i })),
      mine: items,
    };
  },
  scale: (c): ScaleView => {
    const statements = arr(c, "statements").length ? arr(c, "statements") : ["This excites me"];
    const labels = arr(c, "labels");
    return {
      statements,
      min: num(c, "min", 1),
      max: num(c, "max", 5),
      labels: labels.length >= 2 ? [labels[0], labels[1]] : undefined,
      stats: statements.map(() => ({ mean: 3.6, count: 6 })),
      mine: statements.map(() => 4),
    };
  },
  wordcloud: (c): WordCloudView => ({
    prompt: str(c, "prompt", "One word that comes to mind?"),
    words: [
      { text: "clarity", count: 5 },
      { text: "focus", count: 3 },
      { text: "momentum", count: 2 },
      { text: "trust", count: 2 },
    ],
    mine: ["focus"],
  }),
  qna: (c): QnaView => ({
    prompt: str(c, "prompt", "Ask anything"),
    questions: [
      { id: "q1", text: "How does this scale to a bigger room?", votes: 4, mine: false },
      { id: "q2", text: "What's the timeline?", votes: 2, mine: true },
    ],
  }),
  matrix: (c): MatrixView => {
    const x = arr(c, "xLabel");
    const y = arr(c, "yLabel");
    return {
      prompt: str(c, "prompt", "Place each item"),
      xLabel: x.length >= 2 ? [x[0], x[1]] : ["low effort", "high effort"],
      yLabel: y.length >= 2 ? [y[0], y[1]] : ["low impact", "high impact"],
      min: num(c, "min", 0),
      max: num(c, "max", 10),
      items: [
        { text: "Quick win", x: 2, y: 8 },
        { text: "Big bet", x: 8, y: 9 },
        { text: "Maybe later", x: 3, y: 3 },
      ],
      mine: null,
    };
  },
};

// Returns a sample view for the module, or null when no factory exists yet (the
// caller shows a graceful "preview coming" card).
export function getSampleView(moduleId: ModuleKind, config: Cfg): unknown {
  const f = SAMPLE_VIEWS[moduleId];
  return f ? f(config ?? {}) : null;
}
