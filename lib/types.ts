// Shared types for Edges v2 — a mode/phase engine over shared primitives.

export type Primitive =
  | "lobby"
  | "content"
  | "capture"
  | "allocate"
  | "coordinator"
  | "readaround"
  | "close"
  // Phase 5 facilitation modules
  | "poll"
  | "dotvote"
  | "rank"
  | "scale"
  | "wordcloud"
  // Gap-fill modules
  | "qna"
  | "matrix"
  // Fleet-built modules (research roadmap)
  | "brainwrite"
  | "marketplace"
  | "redistribute"
  | "spectrogram"
  | "gradient"
  | "lightning"
  | "fishbowl"
  | "openspace"
  | "devil"
  | "friction"
  | "synthesis"
  | "needs"
  | "equity"
  | "prework"
  | "consult"
  // Rotation-family modules (groups & rounds engine)
  | "worldcafe"
  | "stations"
  | "onetwofour"
  | "twentyfive10"
  | "minspecs"
  // AI / advanced family
  | "persona"
  | "emptychair"
  | "issuemap"
  | "promptrelay"
  | "builder";

export type ModeId = "case-dissection" | "counter-mapping" | "provocation";

// ---- Module system base types (shared client+server, type-only) -----------
// A module IS a primitive; ModuleKind is the registry-facing alias.
export type ModuleKind = Primitive;

export type Role =
  | "admin"
  | "facilitator"
  | "cohost"
  | "participant"
  | "projector";

export type Visibility = "visible" | "hidden" | "readonly";

// A phase as an instance of a module with a concrete config (builder-facing).
export interface PhaseInstance {
  id: string;
  moduleId: ModuleKind;
  config: Record<string, unknown>;
}

// Module-specific payload computed server-side, rendered client-side.
export interface ModuleView {
  moduleId: ModuleKind;
  data: unknown;
}

export type ContentType = "case" | "lens" | "prompt" | "argument" | "note";

// Per-phase configuration. Each phase points at one primitive + its config.
export interface PhaseConfig {
  label: string; // status-bar phase name
  prompt?: string; // capture prompt; may contain [LENS]/[SIDE]/[PARTNER] tokens
  prompt2?: string; // second capture box (counter-mapping map A/B)
  placeholder?: string;
  placeholder2?: string;
  timerSeconds?: number; // default timer preset for this phase
  multiSubmit?: boolean; // "you can send more"
  // content display: which injected content types to surface, and a heading.
  contentHeading?: string;
  showContentTypes?: ContentType[];
  // self-allocation config
  allocate?: {
    kind: "lens" | "side";
    cap?: number; // per-option cap (3 per lens triad). undefined = no cap.
    optionsFromContentType?: ContentType; // derive cards from visible content (lenses)
    fixedOptions?: string[]; // fixed cards (Defend / Attack)
    header: string;
  };
  // coordinator config
  coordinator?: {
    kind: "lens-triad" | "pair";
    message: string; // may contain [PARTNER] / [LENS] / [MEMBERS]
  };
  // read-around config
  readaround?: {
    source: "submissions" | "patterns";
    sourcePhaseId?: string; // for submissions, which capture phase to page through
  };
  // tag submissions with the participant's current allocation
  tagWith?: "lens" | "side";
}

export interface Phase {
  id: string;
  primitive: Primitive;
  config: PhaseConfig;
}

export interface Mode {
  id: ModeId;
  name: string;
  description: string;
  phases: Phase[];
}

// ---- Persisted records ----------------------------------------------------

export interface SessionState {
  mode: ModeId | null;
  phaseId: string | null;
  timerEndsAt: number | null;
  readaroundIndex: number;
  topic: string;
  ended: boolean;
  // The active phase sequence. Seeded from a built-in mode/template on launch,
  // or set directly for a custom (builder-composed) session. When present, it
  // is the source of truth; otherwise we fall back to the built-in MODES.
  phases?: PhaseInstance[];
  // Optional human label for a custom/template session (shown as the mode name).
  sessionName?: string;
  // Monotonic revision, bumped on every state write. Clients refuse to apply a
  // state with a lower rev than they've already shown — so a stale/eventually-
  // consistent KV read can never make a screen jump backwards.
  rev?: number;
}

export interface Participant {
  token: string;
  handle: string;
  joinedAt: number;
  lens?: string | null;
  side?: string | null;
}

export interface Submission {
  id: string;
  handle: string;
  text: string;
  phaseId: string;
  tag?: string | null;
  token?: string | null; // who submitted (for "your contributions" recap); never shown to others
  createdAt: number;
}

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  visible: boolean;
  queued: boolean; // released to visible on next phase advance
  addedAt: number;
}

export interface Pattern {
  id: string;
  name: string;
  order: number;
  submissionIds: string[];
}

export interface ClusterSuggestion {
  name: string;
  submissionIds: string[];
}

// ---- Composed views (API responses) ---------------------------------------

// What a participant sees about allocations: counts per option, and their own.
export interface AllocationSummary {
  kind: "lens" | "side";
  counts: Record<string, number>;
  mine: string | null;
}

// Coordinator info computed for the current participant.
export interface CoordinatorInfo {
  kind: "lens-triad" | "pair";
  partner?: string; // pair mode
  lens?: string; // triad mode
  members?: string[]; // others sharing your lens
}

// Per-room join-screen branding — logo + custom (often playful) copy shown on
// the projector lobby and the standalone /r/<room>/qr page.
export interface RoomBranding {
  logoUrl?: string;
  headline?: string;
  tagline?: string;
}

export interface PublicState {
  ended: boolean;
  mode: ModeId | null;
  modeName: string | null;
  topic: string;
  // Room branding, attached by the per-room state route (not the core store).
  branding?: RoomBranding | null;
  // Registry-driven: the active module + its server-computed view payload.
  // Legacy fields (allocation/coordinator/readaround/config/primitive) are kept
  // populated for the facilitator console during the migration.
  moduleId: ModuleKind | null;
  view: ModuleView | null;
  // The phase sequence, for host navigation (id + label + module).
  sequence: { id: string; label: string; moduleId: ModuleKind }[];
  // True when a phase actually consumes curated patterns (a read-around sourced
  // from patterns) — so the host console can hide the Patterns tab otherwise.
  usesPatterns: boolean;
  // Monotonic state revision (see SessionState.rev) — clients apply state only
  // if rev >= the highest they've shown, so screens never flap backwards.
  rev: number;
  phaseId: string | null;
  primitive: Primitive | null;
  config: PhaseConfig | null;
  timerEndsAt: number | null;
  participantCount: number;
  visibleContent: ContentItem[];
  contentVersion: number; // bumps when visible content changes (for the pulse)
  // allocation summary for the current phase (counts + the caller's own choice)
  allocation: AllocationSummary | null;
  // coordinator info for the caller, when in a coordinator phase
  coordinator: CoordinatorInfo | null;
  // the caller's own allocation, echoed back for prompt token substitution
  you: { lens: string | null; side: string | null } | null;
  // read-around current item (text), if in a read-around phase
  readaround: {
    index: number;
    total: number;
    item: { text: string; tag?: string | null; handle?: string } | null;
  } | null;
  patterns: Pattern[];
  clusterAssistAvailable: boolean;
}

export interface FacilitatorState extends PublicState {
  submissions: Submission[];
  participants: Participant[];
  allContent: ContentItem[];
}
