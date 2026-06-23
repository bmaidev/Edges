// Per-module view-data shapes. Computed server-side (registry.server.ts),
// consumed client-side (registry.client.tsx). Type-only — safe to import from
// both sides without pulling server code into the client bundle.

import type { ContentItem } from "@/lib/types";

export interface LobbyView {
  message: string;
  present: number; // how many have joined so far — quiet social proof
}

export interface ContentView {
  heading?: string;
  items: ContentItem[];
  pulseKey: number; // bumps when visible content changes (drives the pulse)
}

export interface CaptureView {
  prompt: string; // already token-substituted server-side
  prompt2?: string;
  placeholder?: string;
  placeholder2?: string;
  multiSubmit: boolean;
  referenceItems: ContentItem[]; // collapsible reference content
  referenceHeading?: string;
  // Constraint-card injection: a live constraint the facilitator can drop into
  // an ideation phase, plus the deck of constraints they can choose from.
  activeConstraint?: string | null;
  constraintDeck?: string[];
}

export interface AllocateOption {
  name: string;
  subtitle?: string;
}
export interface AllocateView {
  header: string;
  kind: "lens" | "side";
  options: AllocateOption[];
  counts: Record<string, number>;
  mine: string | null;
  cap?: number;
}

export interface CoordinatorView {
  kind: "lens-triad" | "pair";
  message: string; // resolved tokens
  members?: string[];
  unpaired?: boolean;
}

export interface ReadAroundView {
  index: number;
  total: number;
  item: { text: string; tag?: string | null } | null;
}

export interface CloseView {
  ended: boolean;
  // The caller's own contributions, so they can keep them.
  yourContributions: { text: string; tag?: string | null }[];
}

// ---- Phase 5 modules ------------------------------------------------------

export interface PollView {
  question: string;
  options: string[];
  multi: boolean;
  total: number;
  counts: Record<string, number> | null; // null = hidden until reveal
  mine: string[] | null;
}

export interface DotVoteView {
  prompt: string;
  options: string[];
  dots: number;
  counts: Record<string, number>;
  mine: Record<string, number>;
  remaining: number;
}

export interface RankView {
  prompt: string;
  items: string[];
  results: { item: string; score: number }[] | null;
  mine: string[] | null;
}

export interface ScaleView {
  statements: string[];
  min: number;
  max: number;
  labels?: [string, string];
  stats: { mean: number; count: number }[] | null;
  mine: number[] | null;
}

export interface WordCloudView {
  prompt: string;
  words: { text: string; count: number }[];
  mine: string[];
}

export interface QnaView {
  prompt: string;
  questions: { id: string; text: string; votes: number; mine: boolean }[];
}

export interface MatrixView {
  prompt: string;
  xLabel: [string, string]; // [low, high]
  yLabel: [string, string];
  min: number;
  max: number;
  items: { text: string; x: number; y: number }[];
  mine: { text: string; x: number; y: number } | null;
}
