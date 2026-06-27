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
// Fleet-module view shapes. type-only imports are erased before bundling, so the
// zod/store inside these .server files never reaches the client.
import type { SpectrogramView } from "./defs/spectrogram.server";
import type { GradientView } from "./defs/gradient.server";
import type { MarketplaceView } from "./defs/marketplace.server";
import type { MinSpecsView } from "./defs/minspecs.server";
import type { SynthesisFacilitatorView } from "./defs/synthesis.server";
import type { NeedsFacilitatorView } from "./defs/needs.server";
import type { DevilView } from "./defs/devil.server";
import type { EmptychairView } from "./defs/emptychair.server";
import type { FrictionView } from "./defs/friction.server";
import type { FishbowlView } from "./defs/fishbowl.server";
import type { ConsultParticipantView } from "./defs/consult.server";
import type { BrainwriteParticipantView } from "./defs/brainwrite.server";
import type { PreworkParticipantView } from "./defs/prework.server";

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
  // ---- fleet modules (the unfamiliar ones B2 is most for) ----
  spectrogram: (c): SpectrogramView => {
    const poles = arr(c, "poleLabels");
    return {
      statement: str(c, "statement") || str(c, "label", "How strongly do you agree?"),
      poleLabels: poles.length >= 2 ? [poles[0], poles[1]] : ["strongly disagree", "strongly agree"],
      mode: "continuous",
      buckets: 5,
      distribution: [
        { binCenter: 0.1, count: 1 },
        { binCenter: 0.3, count: 2 },
        { binCenter: 0.5, count: 1 },
        { binCenter: 0.7, count: 3 },
        { binCenter: 0.9, count: 2 },
      ],
      mean: 0.58,
      count: 9,
      mine: null,
      allowReasons: Boolean(c.allowReasons),
      beforeAfter: false,
      stage: "after",
      reasons: [],
    };
  },
  gradient: (c): GradientView => {
    const levels = ["✊ block", "concerns", "lukewarm", "support", "🖐 all in"];
    return {
      proposal: str(c, "proposal") || str(c, "label", "Do we have consent to proceed?"),
      scale: (str(c, "scale") as GradientView["scale"]) || "fist5",
      levels,
      distribution: [0, 1, 2, 4, 3],
      total: 10,
      dissentCount: 1,
      dissentLevels: [0, 1],
      mine: null,
    };
  },
  marketplace: (c): MarketplaceView => {
    const budget = num(c, "budget", 100);
    return {
      prompt: str(c, "prompt") || str(c, "label", "Invest in the ideas you believe in"),
      currencyLabel: str(c, "currencyLabel", "credits"),
      budget,
      remaining: Math.round(budget * 0.6),
      ideas: [
        { id: "i1", text: "A weekly demo to share progress", total: 220, mine: Math.round(budget * 0.4) },
        { id: "i2", text: "Pair-programming Fridays", total: 140, mine: 0 },
        { id: "i3", text: "A shared customer-call rota", total: 90, mine: 0 },
      ],
      showLeaderboard: true,
    };
  },
  minspecs: (c): MinSpecsView => ({
    phase: "expand",
    prompt: str(c, "prompt") || str(c, "label", "What are the rules we must keep?"),
    rules: [
      { id: "r1", text: "Every decision has a named owner", keep: 6, cut: 1, survivor: true },
      { id: "r2", text: "No meeting without an agenda", keep: 4, cut: 3, survivor: true },
      { id: "r3", text: "Ship behind a flag", keep: 2, cut: 5, survivor: false },
    ],
  }),
  synthesis: (): SynthesisFacilitatorView => ({
    hasResult: true,
    bullets: [
      "The room keeps returning to trust as the unlock",
      "Speed and quality are framed as a trade-off no one wants",
    ],
    tension: "Move fast vs. get it right",
    inputCount: 12,
    available: true,
    promoted: true,
    stale: false,
  }),
  needs: (): NeedsFacilitatorView => ({
    hasResult: true,
    needs: [
      {
        need: "Confidence the work will land",
        jtbd: "When I commit to a plan, I want early signal it's working, so I can adjust without losing face.",
        evidence: ["“we never know if it's working until too late”", "“I want a faster feedback loop”"],
        confidence: "high",
      },
    ],
    inputCount: 12,
    available: true,
    stale: false,
  }),
  devil: (): DevilView => ({
    hasResult: true,
    objections: [
      {
        title: "Who actually owns this?",
        body: "With no single accountable person, the plan stalls the first time it meets resistance.",
      },
      {
        title: "What if adoption is only partial?",
        body: "The benefit assumes everyone switches at once — a half-adopted change can be worse than today.",
      },
    ],
    inputCount: 12,
    available: true,
    stale: false,
  }),
  emptychair: (c): EmptychairView => ({
    hasResult: true,
    available: true,
    personaName: str(c, "personaName") || str(c, "label", "The absent customer"),
    personaDescription: str(
      c,
      "personaDescription",
      "The person most affected by this decision who isn't in the room.",
    ),
    questions: [
      { id: "q1", text: "What would make you trust this?" },
      { id: "q2", text: "Where would you quietly give up?" },
    ],
    answers: [
      {
        question: "What would make you trust this?",
        answer: "Show me it working for someone like me — not a polished demo.",
      },
    ],
    stale: false,
  }),
  friction: (): FrictionView => ({
    hasResult: true,
    available: true,
    stale: false,
    inputCount: 12,
    tensions: [
      {
        axis: "Speed vs. rigor",
        tension: "The room wants to move fast but fears shipping something half-baked.",
        poleA: "Ship and learn",
        poleB: "Get it right first",
        intensity: 4,
      },
    ],
  }),
  // ---- interactive small-group / async modules ----
  fishbowl: (c): FishbowlView => {
    const innerSeats = num(c, "innerSeats", 4);
    const occupantCount = Math.min(3, innerSeats);
    return {
      innerSeats,
      occupantCount,
      emptySeats: innerSeats - occupantCount,
      amSeated: false,
      canSit: true,
      speakers: Array.from({ length: occupantCount }, (_, i) => ({
        label: `Speaker ${i + 1}`,
      })),
      questions: [
        { id: "q1", text: "What are we not saying out loud?" },
        { id: "q2", text: "Who else is affected by this?" },
      ],
      allowQuestions: c.allowQuestions !== false,
    };
  },
  consult: (c): ConsultParticipantView => ({
    format: (str(c, "format") as ConsultParticipantView["format"]) || "troika",
    prompt: str(c, "prompt") || str(c, "label", "Share your challenge; the others advise."),
    round: 1,
    role: "client",
    groupMembers: ["You", "Ada", "Bo"],
    clientName: "You",
    silent: false,
    myAdviceSubmitted: false,
  }),
  brainwrite: (c): BrainwriteParticipantView => ({
    for: "participant",
    prompt: str(c, "prompt") || str(c, "label", "Build on the idea in front of you."),
    maxLen: num(c, "maxLen", 140),
    card: {
      id: "c1",
      lines: [
        { text: "A weekly demo so progress is visible to everyone." },
        { text: "…and a short written summary for those who miss it." },
      ],
    },
    myContributionCount: 1,
  }),
  prework: (c): PreworkParticipantView => ({
    for: "participant",
    brief: str(c, "brief") || undefined,
    prompt: str(c, "prompt") || str(c, "label", "Add your thoughts before we meet."),
    placeholder: str(c, "placeholder") || undefined,
    mine: [{ text: "One thing I'm hoping we resolve is the ownership question.", at: 0 }],
  }),
};

// Returns a sample view for the module, or null when no factory exists yet (the
// caller shows a graceful "preview coming" card).
export function getSampleView(moduleId: ModuleKind, config: Cfg): unknown {
  const f = SAMPLE_VIEWS[moduleId];
  return f ? f(config ?? {}) : null;
}
