# Edges — MVP → Full-vision build plan

Every shipped spec is at **MVP level**. This is the complete, dependency-ordered
plan to take each to its spec's **full vision**. Verified against current code by
a per-section audit (Sept reading of `origin/feature/backlog-specs` specs vs the
live tree). Effort: **S** ≤0.5d · **M** ~1–2d · **L** ~3d+.

Two audit corrections folded in: (1) B4's `saveDesign`/`deleteDesign` **do**
enforce `checkSuperAdmin` already — the gap is a *room-scoped* tier, not an
ungated write. (2) F4 shipped a deliberately simpler `lastRun` rollup than the
spec's `SessionMetrics` architecture — "remaining" there ≈ the whole spec v1.

Order principle: **privacy/correctness → cheap-high-value + unblockers →
config/builder completions → heavy/architectural**, respecting dependencies.

---

## WAVE 0 — Privacy & correctness (do first, any effort)

- [x] **F3** Per-phase anonymity filtering in `publishTakeaway` — only include `anonymity !== "anonymous"` phases — **M** — *real leak: anonymous-phase text can currently reach a token holder* — *#77*
- [x] **D2** Self-host Atkinson Hyperlegible (vendor woff2 + `lib/a11y/fonts.ts`), drop `next/font/google` — **S** — *kills a Google Fonts network call (privacy regression) + offline risk* — *✓ v0.95.0 — vendored woff2, dropped next/font/google entirely*

## WAVE 1 — Cheap, high-value, and unblockers (mostly S)

- [x] **D2** Admin contrast strip — wire the already-built `paletteAudit`/`contrastRatio` into the admin theme editor (live ratio + pass/fail chips + non-blocking save warning) — **M** — *code already written, just unused* — *#78*
- [x] **D1** Anonymous-strict storage + chip — strip token at write for anonymous capture, strip from facilitator payload, add `anonymous-strict` to the `Attribution` union + chip state — **M** — *converts "facilitators only" into the flagship off-the-record claim* — *✓ v0.96.0 — token dropped at write; 🔒 chip + host parity*
- [x] **A1/A5** Extract shared `PasscodeReveal` component (StepShare + legacy CreateRoom + A5 cards) — **S** — *✓ v0.97.0*
- [x] **C1** Screen Wake Lock + visibility re-acquire in `FacilitateCockpit` — **S** — *cockpit currently lets the laptop sleep mid-session* — *#79 (`useWakeLock`)*
- [x] **H1** Extend `computeRoomHealth` to return `{ droppedHandles, since }` (content-free) — **S** — *prereq for the health sheet + advance caption* — *lib/health.ts (`dropped:[{handle,since}]`)*
- [x] **B1** Named arc read-out strings + inverted/flat detection; softened over-budget/delta copy ("{n} min over — trim a phase" / "{n} to spare" / "about right") — **S** — *the "does it breathe?" payoff* — *#80*
- [x] **B1** Minutes-weighted x-axis on the energy curve (align ledger ↔ sparkline) — **S** — *AgendaArc time-midpoint dots*
- [x] **C3** Skip affordance + caption on Advance; Recovery subsection in the Session tab — **S** — *#84*
- [x] **F1** Admin report parity (render `ReportDocument` + export row in `/admin`); token expiry gate; no-AI facilitator-summary fallback in HandoverPanel — **S** ×3 — *✓ v0.89.0 — honest structural-report caption*
- [x] **F3** `.ics` calendar export; Save/Print-PDF on TakeawayScreen; `STRINGS.ended` honesty rewrite; optional `alsoArchive` before wipe — **S** ×4 — *✓ v0.90.0 — alsoArchive on the end path*
- [x] **F2** Due-date presets; three-state status + overdue styling; send-after Copy/CSV from the archive modal — **S** ×3 — *✓ v0.91.0 — archive Copy list / CSV*
- [x] **B6** Enrich `design.ts` `moduleCatalog()` with `bestFor`/`roomDoes` so AI rationale speaks the card language — **S** — *#80*
- [x] **C5** Directed `handoffDriver{toPresenceId,toName}` (currently aliased to claim); one-time `NamePrompt` + cross-room name fallback — **S** ×2 — *✓ v0.92.0 — directed verb + one-time NamePrompt*
- [x] **C6** Host "Warned the room · 2:00 left" transient line; admin per-room timer-sound opt-out — **S** ×2 — *✓ v0.98.0 — cockpit warn line + room-wide timer mute*
- [x] **D4** `latecomerPolicy: 'hold'|'append'` builder toggle; gap-based (>8s wake) WelcomeBack trigger; per-room presence-off — **S** ×3 — *WelcomeBackCard + test*
- [x] **A1** Wizard StepReady "Mark live" toggle + draft/live badge styling in the list — **S** ×2 — *✓ v0.93.0*
- [x] **E2** Ambient timer hairline; `nowBreathe` keyframe + one-shot; ribbon position (top/bottom) toggle; chime debounce (≤1/~1.5s) — **S** ×4 — *#81 (`nowBreathe`)*
- [x] **A5** Fix `blueprintSummary` to the spec `{chips, phaseCount}` shape — **XS** — *blueprintSummary + test*

## WAVE 2 — Config-field + builder-surface completions (mostly M)

- [x] **C2** Builder toggles `showLiveCount` / `nudgeable` (gather-phase schema + BuilderApp editor) → then projector social-proof "N of M" (gated `showLiveCount && present≥3`) — **M** + **S** — *unblocks Slice 4* — *#85*
- [x] **B3** `plannedMinutes` field + write-through to `timerSeconds` → timing chip "Planned 8m · 2m left · on track" (+ degraded states) — **S** + **M** — *the "run from it live" promise* — *#86 — pacing chip shipped (reuses `timerSeconds`)*
- [x] **C6** Server-driven `timerWarnSeconds` + per-room "Warn at 1/2/3 min" → projector amber "N min left" band + drain bar + 6s soft-landing fade; `timerStartedAt` progress bar — **M** ×3 — *#91*
- [x] **C7** Per-room `cofacEnabled`/`cofacSensitivity` toggle (`cofacToggle` configure-tier, Session-tab control) + server dismissal persistence (`__cofac__` votes) + `nudgeSeq` flap guard + `CofacDot` — **M** ×3 — *the lead's one-tap off-switch* — *#95*
- [x] **C4** Literal-ref spotlight wiring (read-around / synthesis / qna / lightning) → opt-in per-spotlight attribution — **M** ×2 — *#102*
- [x] **C1** Jump-to-phase progress rail (tap-to-`setPhase`); per-phase script line (`config.note` in centre band); persistent chime-mute pref — **S** ×3 (rail/note need the config field) — *✓ v0.94.0 — per-phase scriptNote in the cockpit*
- [x] **D1** Per-phase `instruction` override (admin-gated builder field) + host "What they see" parity + read-only attribution indicator — **M** — *#87 (HostParityBadge)*
- [x] **E1** Persisted `lobbyCue`/`lobbyCountVisible` on state + `setLobbyCue` store fn + `getPublicState`/`roomSignature` + host command (cap `timer`) + ModeSelector lobby controls — **M** — *count-visibility privacy toggle* — *#92*
- [x] **H1** Room-health expandable sheet (With you / Dropped off, handle + "last seen 40s ago") + non-blocking "N look disconnected" caption on Advance — **M** — *#88*
- [x] **H2** Projector heartbeat + "Projector not connected/lost" preflight row; cohost-gated remedies; pass-row collapse + "Re-check" + empty-session check — **L** + **S** ×3 — *closes the "presenting to a dark screen" failure* — *#104–105*
- [x] **D4** Host presence dots + "live N · quiet M" header + joinedAt labels in HostConsole; explicit `placeLatecomer`/`holdLatecomer` commands + Place-now/Hold UI — **M** ×2 — *#97–98*
- [x] **C3** `GhostDataNote` — inline Run-tab warning when a phase already holds answers — **M** — *#93*
- [x] **B4** Room-scoped tier (`scope: room|global`, default room); validated share/import envelope (`lib/design-share.ts`: base64url + checksum + caps + read-only preview + `.edges.json`); shared `DesignLibrary`/`ShareImportPanel` + HostConsole relaunch grid; `renameDesign` + duplicate; metadata (tag/description/origin/moduleIds) — **M** ×4 + **S** — *#106–107 (lib/design-share.ts)*
- [x] **A5** Standalone named blueprint registry (`listBlueprints`/`stamp`/`rename`/`delete`) → save-as-blueprint + "Start: \<blueprint\>" post-wipe rescue in HostConsole → `SavedBlueprintCard` + Stamp UI + `fromBlueprint` POST → "My workshops" grouping (Live now / Recent / Saved) + trust banner — **M** ×3 + **S–M** — *#101 (reuses B4 registry)*
- [x] **B1** "Trim to {budget} min" one-tap revise (dep reviseSession) + arc strip in host Session tab / projector — **M** — *#103*
- [x] **F2** Owner tap-list of present participant handles (chip popover + `ownerHandle` match) — **M** — *#96*
- [x] **B2** Module coverage gap (~20 modules → 100% factories); "Preview all (n)" storyboard; HostConsole `PreviewPanel` adopts `RoomMockup` + render test; AI-module honesty caption/shimmer — **M** ×3 + **S** — *#99–100 (RoomMockup)*
- [x] **F4** Phase-advance timing log (`rpush` in `setPhase` → `readPhaseLog`) → plan-vs-actual phase timing — **M** — *#94*

## WAVE 3 — Heavy / architectural (L)

- [x] **B2** Faithfulness via shared `defs/*.compute.ts` helpers (kill the hand-authored sample drift) — **L** — *biggest single item; without it previews can silently lie* — *PRs #108–110; byte-identical previews for all 7 aggregate modules*
- [x] **B5** Host-cockpit surface in the theatre; `setPhase` scrubber + `setCast` + `reseed` commands; `seeAs` cross-cast incl. unallocated; per-module `seedRehearsal?` hooks (vote/poll tally seeding); auto-issue/punch-list engine + per-phase notes; canned-AI sample library + "use real AI" toggle; persona/topic-aware seeding; mobile tabbed polish — **M** ×5 + **L** + **M** — *PRs #118–123*
- [ ] **B7** Per-row LCS sequence-aligned diff card (added/removed/moved/retimed badges + reason); mid-session Apply via `setPhasesPreserving`; remaining 6 named chips (longer/energy/rebalance/calm/anonymity/tighten); anonymity-safe coarse-band `participationHint`; delta stepper + refinement history — **L** ×2 + **M** ×2 + **S**
- [ ] **C7** `cofacDraft` "[reword for my room]" AI affordance (`__cofac__` cache, withGenerateLock); additional nudge kinds (DOMINATED / SKEWED_VOTE / LOW_JOIN_AT_START); content-free telemetry — **L** ×2 + **S**
- [ ] **C2** `typing` breakdown via a participant focus/draft heartbeat — **L**
- [x] **D2** Colour-safe `Bars` (`useColourSafe` + `.a11y-pattern` + direct labels); projector a11y slice (`projectorA11y` state + `setProjectorA11y` + ProjectorApp + SR landmarks + host AA card); light high-contrast preset + OpenDyslexic font — **L** + **M** + **S** ×2 — *PRs #129–130*
- [x] **D1** AI instruction authoring (suggest/revise emit instructions; critique flags missing/over-long) — **M** — *PR #114*
- [x] **E3** Scene engine — widen the server enum + `AmbientView` anchors (`startedAt`/`endsAt`/`scene`) first, then: Breathe (rAF box/4-7-8 + reduced-motion), Countdown, Cue card, per-scene pre-chime; builder integration (`ambient` in palette + schema); `design.ts` suggests ambient between heavy phases — **L** + **M** + **S** ×3 + **M** — *PRs #113, #117*
- [x] **F1** Inline light curation (`editReport`/`setReportMeta`/`regenerateReport` — rename theme, drop tension, reorder steps, edit summary); quotes toggle + privacy/attribution `ReportMeta` — **M** ×2 — *the headline "glance, fix, send" promise* — *PRs #111–112*
- [x] **F2** Participant "Yours-first" actions module (`actions.server.ts`/`.client.tsx` + registry + builder placement) — **L** — *v0.88.0; privacy: participant own-only, projector counts-only, facilitator list*
- [x] **F3** Host review/curate modal + `previewTakeawayReport` (per-item include/exclude, anonymity badge, live preview) — **L** — *PR #126*
- [x] **F4** `SessionMetrics` capture at archive (de-identified, durable `analytics:index`); method-engagement / phase drop-off / reuse / ended-early (N<3 suppression + drill-down); Export JSON/CSV + Clear-history — **L** ×2 + **M** — *the spec's whole evidence layer* — *PRs #124–125*
- [x] **A4** Slug rename slice (`renameRoom` + `migrateRoomState` + `rooms:redirect` resolved in the state route → `usePolledState` follows; admin "address" affordance, gated on a live-quiesce signal) — **L** + **M** — *v0.87.0*
- [x] **B3** `runSheetSchema` zod validation + AI per-phase runsheet emission; `talkingPoints` as `string[]` — **M** + **S** — *PR #128*
- [x] **B6** Export `ModuleCardBody` → render on `/help` method-reference + host Patterns tab; surface card triples in B2 preview + B1 arc tooltips — **M** ×2 — *PR #127*

---

## Totals (approx.)

- **~115 items** across 29 specs (A2, A3 are already full; D3 + G1–G5 are unbuilt, excluded).
- Wave 0: **2** · Wave 1: **~30 (mostly S)** · Wave 2: **~45 (mostly M)** · Wave 3: **~38 (L-heavy)**.
- Rough effort: ~10d (W1) + ~50d (W2) + ~70d (W3) ≈ **130 dev-days** to take everything to full vision.
- Specs already at/near full: **A2, A3, E1** (E1 only needs the cue-authoring backend).

## Suggested execution

Run **Wave 0 immediately** (privacy/correctness). Then Wave 1 as one sweep (lots
of S wins, several deploys). Wave 2 by area-cluster. Wave 3 last, heaviest first
within each area. The single highest-value Wave-3 item is **B2 `compute.ts`**
(stops previews lying); the highest-risk-if-skipped is **F3 anonymity filtering**
(already pulled to Wave 0).
