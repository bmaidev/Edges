// Shared types for Edges v2 — a mode/phase engine over shared primitives.

export type Primitive =
  | "lobby"
  | "content"
  | "media"
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
  | "builder"
  // E3 — a calm ambient "break / hold" screen, summoned over the live sequence.
  | "ambient";

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

// F2 — a live-captured commitment: a decision/action with an optional owner and
// due date. Owners are free-text handles/names, never accounts. Verbatim, not AI.
// B3 — a facilitator-PRIVATE run-sheet for a phase: the script, talking points,
// and contingency the facilitator speaks from. Authored in the builder, nested in
// PhaseInstance.config under RUNSHEET_KEY. MUST NEVER reach participants/projector
// (stripped role-side before computeView + before the returned config).
export interface RunSheet {
  script?: string; // what to say / do
  talkingPoints?: string[]; // B3 — discrete bullet notes (was a single string)
  contingency?: string; // "if it goes quiet…"
}

export type ActionItemStatus = "open" | "done";
export interface ActionItem {
  id: string;
  text: string;
  ownerName?: string;
  due?: string; // yyyy-mm-dd
  status: ActionItemStatus;
  createdAt: number;
  updatedAt: number;
}

// AI-generated whole-session synthesis (lives here so the takeaway snapshot can
// reference it without a rooms<->types cycle).
export interface SessionReport {
  summary: string;
  themes: { title: string; detail: string }[];
  tensions: string[];
  decisions: string[];
  nextSteps: string[];
  generatedAt: number;
}

// F3 — the ephemeral "take-away" every participant keeps. Handle-free synthesis
// only (no raw responses, no attribution). Lives in the 24h-TTL session store
// under a random token and self-destructs; published at session end.
export interface TakeawaySnapshot {
  name: string;
  sessionName: string | null;
  publishedAt: number;
  participantCount: number;
  submissionCount: number;
  patterns: string[];
  report: SessionReport | null;
  actionItems?: {
    text: string;
    ownerName?: string;
    due?: string;
    status: ActionItemStatus;
  }[];
  branding?: { logoUrl?: string; headline?: string };
  // F3 — every contribution with its author token. SERVER-SIDE ONLY: never
  // serialized to a client. Each participant receives only their own, resolved
  // server-side into `yourContributions` below.
  contributions?: { token: string; phaseLabel: string; text: string }[];
}
// What actually reaches a client: the shared body WITHOUT the raw contributions,
// plus only the caller's own contributions (resolved server-side by token).
export type TakeawayPayload = Omit<TakeawaySnapshot, "contributions"> & {
  token: string;
  yourContributions?: { phaseLabel: string; text: string }[];
};

// C4 — a spotlight reference: either a live submission (resolved to its current
// text at read time, so a delete makes the overlay vanish cleanly) or a literal
// string the facilitator typed. Room-level, cross-cutting — independent of the
// active phase. Never carries a name to the room (see PublicState.spotlight).
export type SpotlightRef =
  | { kind: "submission"; id: string }
  | { kind: "literal"; text: string; handle?: string | null };

export interface SessionState {
  mode: ModeId | null;
  phaseId: string | null;
  timerEndsAt: number | null;
  // C4 — the spotlighted response (a ref), or null. Lives on the state key so its
  // sole writer is writeState and every set/clear bumps rev (authoritative-apply).
  // Cleared on every relaunch/advance/end so a stale spotlight can't linger.
  spotlight?: SpotlightRef | null;
  // E3 — a calm ambient break/hold summoned over the live sequence. When set, the
  // active phase resolves to a synthetic "ambient" module. Snapshots where to
  // return so resume is non-destructive (restores the prior phase + its timer).
  ambient?: AmbientState | null;
  // C5 — the co-facilitator currently "driving" the room (a soft, advisory baton).
  // Lives ON the state key (NOT the presence hash) so a claim bumps rev and rides
  // the monotonic-apply guard — otherwise an in-flight poll at the same rev could
  // silently revert the claim. Host-only (never on PublicState). Cleared on end.
  driver?: DriverInfo | null;
  // C7 — the co-facilitator controls. `cofacEnabled` (default true) is the lead's
  // one-tap off-switch; `cofacSensitivity` tunes how eager it is. `cofacDismissed`
  // persists dismissals ({phaseId, kind}) so a dismissed nudge stays gone across
  // polls / reloads / co-host devices. All host-only — never on PublicState.
  cofacEnabled?: boolean;
  cofacSensitivity?: import("./cofac").CofacSensitivity;
  cofacDismissed?: { phaseId: string; kind: string }[];
  // E1 — front-of-room lobby authoring. `lobbyCue` is the begin-cue line shown on
  // the join screen (a default is applied when empty); `lobbyCountVisible` toggles
  // the live "N here" count off for a quieter / more anonymous open. Both live ON
  // the state key so a change bumps rev and rides authoritative-apply.
  lobbyCue?: string | null;
  lobbyCountVisible?: boolean;
  // F3 — set at end when a take-away is published. The token keys the snapshot.
  publishedTakeaway?: { token: string; publishedAt: number };
  // F2 — the action-item register. Lives ON the state key (not a side hash) so
  // its sole writer is writeState and every mutation bumps rev — the rev-correct
  // path that stops an in-flight poll clobbering a just-added item.
  actionItems?: ActionItem[];
  // F2 — when on, the register is shown to the room on the projector (a live
  // "commitment board"). Off by default.
  actionItemsPromoted?: boolean;
  // C1 — timer pause. Exactly one of these is non-null at a time:
  //   timerEndsAt set, timerRemainingMs null → RUNNING (counts toward endsAt)
  //   timerEndsAt null, timerRemainingMs set → PAUSED (frozen ms remaining)
  //   both null                              → IDLE (no timer)
  timerRemainingMs?: number | null;
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
  // C1 — frozen ms remaining when the timer is paused (see SessionState). null
  // when running or idle. Surfaces so every screen freezes (never blanks) on pause.
  timerRemainingMs: number | null;
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
  // F3 — when the session has ended with a published take-away, the recap (handle-
  // free synthesis + share token) for the participant's keep screen. Else null.
  takeaway?: TakeawayPayload | null;
  // F2 — the action-item register, role-scoped. Plus whether it's promoted to the
  // projector board (so the host toggle reflects state).
  actionItems?: ActionItem[] | null;
  actionItemsPromoted?: boolean;
  // C2 — glanceable "N of M responded" for the current gather phase, role-scoped
  // and derived (never stored). null on non-gather phases / for roles that
  // shouldn't see it (participants; projector unless opted in above the floor).
  participation: ParticipationSignal | null;
  // C2 nudge — the timestamp of the most recent "nudge the room" on the active
  // gather phase, so a participant who hasn't answered can re-pulse the prompt.
  nudgedAt?: number | null;
  // D1 — honest per-phase attribution regime for the participant's response
  // ("named" / "facilitators-only" / "none"). Transport-only, recomputed each
  // request (can't drift); never overclaims anonymity.
  attribution?: import("./modules/attribution").Attribution;
  // C4 — the spotlighted response resolved for the room: text only. `handle` is
  // ALWAYS null in v1 — the stored submission handle is not a reliable public-ness
  // signal (an anonymous-by-design phase still stores a real handle), so the
  // projector never shows a name. null when nothing is spotlighted.
  spotlight?: { text: string; handle: string | null } | null;
  // E1 — the authored lobby begin-cue (null → the screen's calm default) and the
  // count-visibility toggle (defaults true). Surfaced so the projector lobby and
  // host preview both reflect the facilitator's authoring without a re-fetch.
  lobbyCue?: string | null;
  lobbyCountVisible?: boolean;
}

// C2 — content-free participation signal. Every value is an integer count; no
// surface ever maps a response to a person. `quiet` is suppressed (0) on
// anonymous phases and for the projector.
export interface ParticipationSignal {
  present: number; // participants currently in the room
  responded: number; // distinct participants who responded for THIS phase (<= present)
  typing: number; // always 0 in the MVP (focus/draft heartbeat is a fast-follow)
  quiet: number; // present participants whose heartbeat is stale (>QUIET_MS)
  nudgedAt?: number; // central re-pulse field (Full vision); unused in MVP
}

// H2 — pre-flight readiness. Advisory only: surfaced as a pill+sheet, NEVER
// physically gates advancing (facilitator authority is preserved). Severity
// ordering is purely visual. Content-free, derived, never stored.
export type Severity = "blocker" | "warning" | "info" | "pass";
export interface ReadinessCheck {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  phaseId?: string;
  remedyTab?: "session" | "content"; // which host tab helps fix it
}
export interface Readiness {
  overall: Severity; // the worst severity among the checks
  checks: ReadinessCheck[];
}

export interface FacilitatorState extends PublicState {
  submissions: Submission[];
  participants: Participant[];
  allContent: ContentItem[];
  // H1 — room-wide "who's still with you" (every phase). Derived, never stored.
  roomHealth?: {
    present: number;
    here: number;
    dropped: { handle: string; since: number }[];
  } | null;
  // H2 — pre-flight readiness for the built session. Advisory.
  readiness?: Readiness | null;
  // B3 — per-phase facilitator run-sheets (facilitator-only; phaseId -> notes) and
  // a one-line peek at the next phase. Derived; never on PublicState.
  runsheets?: Record<string, RunSheet>;
  nextPeek?: string | null;
  // F4 — plan-vs-actual phase timing (host-only; null until the room advances).
  // Content-free: per-phase planned vs measured seconds + a verdict. Derived from
  // the off-the-record advance log, never stored on PublicState.
  phaseTimings?: import("./timing").PhaseTiming[] | null;
  // D4 — latecomers awaiting placement on a hold-policy grouping phase (host-only;
  // handle + token, which the facilitator already sees). Empty when none / not a
  // hold phase.
  heldLatecomers?: { token: string; handle: string }[];
  // C4 — the raw spotlight ref (host-only), so the cockpit can ring the active
  // submission card + render the clear chip. Never on the participant/projector.
  spotlightRef?: SpotlightRef | null;
  // C5 — the live co-facilitators currently driving this room (you + co-hosts).
  // Host-only; NEVER on the participant/projector surface. Derived from a
  // heartbeat hash, never stored on the session state.
  presence?: HostPresence[] | null;
  // C5 — the current driving baton (host-only; mirrors SessionState.driver). Never
  // on PublicState — the room must not see co-facilitator names.
  driver?: DriverInfo | null;
  // C5 — true when state.driver is set but no longer live (its presenceId aged out
  // of the roster, or the claim is stale). Derived on read; the next claim wins.
  driverStale?: boolean;
  // C7 — at most one deterministic, content-free co-facilitator nudge (host-only;
  // derived from counts + timings, never participant text). null when all is well.
  cofac?: import("./cofac").CofacNudge | null;
  // C7 full — the co-facilitator settings echoed back so the Session-tab control
  // reflects the live values (enabled + sensitivity).
  cofacEnabled?: boolean;
  cofacSensitivity?: import("./cofac").CofacSensitivity;
}

// E3 — the calm ambient state. `break` runs a countdown; `hold` is open-ended.
// returnPhaseId/returnTimerEndsAt are the snapshot to restore on resume.
// E3 — the ambient SCENE: the visual treatment of a summoned calm screen. `break`
// and `hold` are the originals; `breathe` (a guided box-breathing circle),
// `countdown` (a big shared clock) and `cuecard` (one large instruction) are the
// scene-engine additions. `kind` stays the TIMER semantics (break = timed,
// hold = open); `scene` is independent of it.
export type AmbientScene = "break" | "hold" | "breathe" | "countdown" | "cuecard";

export interface AmbientState {
  kind: "break" | "hold";
  scene?: AmbientScene; // visual; defaults to `kind` when absent (back-compat)
  startedAt?: number; // when the scene began — anchors the breathing pace
  note?: string;
  returnPhaseId: string | null;
  returnTimerEndsAt: number | null;
}

// C5 — the soft driving baton. driverId is the host's presenceId (per-tab).
export interface DriverInfo {
  driverId: string;
  driverName: string;
  claimedAt: number;
}

// C5 — one present host console. `name` is self-asserted (a localStorage label,
// never an account); `role` is the SERVER-resolved passcode tier (never trusted
// from the client). lastSeen ages the entry out of the live roster.
export interface HostPresence {
  presenceId: string;
  name: string; // "" when the operator hasn't named themselves
  role: Role;
  lastSeen: number;
}
