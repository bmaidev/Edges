# B1 — Agenda/timeline view with per-phase timings + energy curve

> Section B. Session design · **P0**
> Final executable build spec. The pressure-test must-fixes are folded into the design below, so this spec is already correct — build it as written.

---

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** 3 days (curated-table review in `lib/arc.ts` is the long pole; budget ~1 day for it alone)
- **Depends on (existing code, not other roadmap items):**
  - `lib/modules/registry.server.ts` — `SERVER_MODULES`, `capabilities.needsTimer`
  - `lib/types.ts` — `ModuleKind` (= `Primitive`, **42 kinds**), `PhaseInstance`, `PhaseConfig.timerSeconds`
  - `lib/design.ts` — `timeGuidance()` budget/target math (refactored to export `timeBudget()`)
  - `components/BuilderApp.tsx` — `BuilderPhase[]`, `CATEGORIES`, `PRODUCERS`, `setConfig`, `parsedPhases`, `minutes` state
  - `lib/modules/render-kit.tsx` — `Bars`/`StatusLine` calm visual language (aesthetic reuse)
  - `lib/templates.ts` — built-in `TEMPLATES` (unit-test fixtures)
  - `test/templates.test.ts` — Vitest harness pattern to mirror
- **Roadmap dependency item ids:** none (self-contained, builder-only).

---

## Problem & facilitator value

### Problem
The session builder (`components/BuilderApp.tsx`) shows my design as a flat vertical list of phase cards. It never surfaces the two things I actually think in as a facilitator: **TIME** and **ARC**. There's no total duration, no per-phase minutes, no warning that my "60-minute" workshop is secretly 95 minutes, and no visual sense of the diverge→converge energy shape. The data already exists — `lib/design.ts timeGuidance()` computes a budget and a ~13-min/phase heuristic and even tells the AI to set `config.timerSeconds` so timers sum to the budget — but that intent is never reflected back to me.

### Facilitator value (my voice)
- **"Does this fit?"** I want a running total against my stated budget with an honest over/under, so I stop shipping 90-minute agendas into 60-minute rooms.
- **"Does it breathe?"** I want a sparkline energy curve that shows my session opening, diverging (wide, generative), converging (narrowing, deciding), and closing — so I can *see* a flat or jagged arc and fix it.
- **"Where's my time going?"** I want per-phase minute chips I can nudge inline, turning abstract `timerSeconds` into a felt budget.
- It makes the AI's existing time-guidance and critique loop **legible** — the AI already targets the budget and the critic already asks "does divergence get converged?". Now I see the same picture it reasons over.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP (what ships in this 3-day item)
1. **`lib/arc.ts`** — pure, exhaustive, unit-tested classifier + estimator over all 42 `ModuleKind`s.
2. **Band 1 — Time ledger.** Proportional bar + `{total} min` + `Budget {n} min · {delta}`, amber tint when over. Total prefixed `~` when any phase is an estimate.
3. **Band 2 — Energy curve.** SVG sparkline (44px), minutes-weighted x-axis, faint baseline, per-phase dots, one-line arc read-out.
4. **Band 3 — Phase rail.** Per-card arc-stage dot + stage label + minutes chip (editable where `acceptsTimerEdit`, greyed `~N min` otherwise).
5. **Shared hover/selection** keyed on **array index** linking ledger segment ↔ curve dot ↔ phase card.
6. **`lib/design.ts` refactor** — export `timeBudget()`; `timeGuidance().text` byte-identical (snapshot-tested).

### Full vision (explicitly OUT of v1 — see Out of scope)
- One-tap **"Trim to {budget} min"** calling `reviseSession`.
- Read-only arc strip in the host **Session tab** / **projector** to track remaining arc mid-run.
- Feeding `arc.ts` structured stages into `critiqueSession`'s prompt so AI critic and UI compute identical stages.

---

## Experience & flows

A new **collapsible "Agenda & arc" card** sits at the **top of the Sequence section** in `BuilderApp`, above the phase cards. Reuse the `rounded-xl border-border bg-surface` treatment. Three stacked calm bands in one card; updates live (`useMemo`) on add / reorder / retime / remove.

### Band 1 — Time ledger
- A single horizontal **proportional bar** (reuse the `Bars` aesthetic, not the component — this is one bar, not a per-option set). Each segment width = `phase minutes / total`, colored by arc stage.
- Right side: **`{total} min`** in large type; beneath, quiet line: **`Budget {budget} min · {delta}`**.
- **Delta copy** (softened for estimate honesty):
  - under: `"{n} min to spare"`
  - on: `"about right"` *(in accent)* — note: **not** "right on time", because untimed phases are estimates
  - over: `"{n} min over — trim a phase"` → **total tints amber** (reuse the warm `#ff8a8a`/amber note, restrained — a warm note, not alarm-red)
- **Estimate honesty:** when ANY phase's minutes came from the default table (no `timerSeconds`), prefix the total with `~` (e.g. `~52 min`).
- No budget set → budget defaults to **60** (matching `timeBudget(undefined)`), delta still shown, plus subtle hint `"Set Minutes above to size the agenda"`.

### Band 2 — Energy curve
- `~full-width` **SVG sparkline, 44px tall**, smooth path over inferred energy per phase.
- **X-axis weighted by minutes** (resolved open question — keeps ledger and curve aligned; a 12-min diverge dominates visually as it should).
- Faint centre baseline. Dots on each phase. Hovering a dot (or its phase card, or its ledger segment) highlights all three (shared selection, **keyed on index**).
- One-line read-out naming the shape:
  - healthy: `"Opens → diverges → converges → closes ✓"`
  - no convergence: `"No convergence after your divergence"`
  - inverted: `"Converges before it diverges — check the order"`
  - flat: `"Flat arc — consider a wider divergence or a sharper close"`

### Band 3 — Phase rail (on existing phase cards)
- Small left rail per card: **arc-stage dot** + **stage label** (`open`/`diverge`/`converge`/`close`) under the module name.
- **Minutes chip:**
  - editable when `acceptsTimerEdit(moduleId)` → click to edit, writes `config.timerSeconds = mins*60` via existing `setConfig(i, …)`, value seeded from `phaseMinutes`.
  - greyed `~N min` otherwise, tooltip `"estimated — this phase has no timer"`. Counted in total, not editable.
- Selected/hovered card gets a highlight ring mirrored on its ledger segment + curve dot.

### Color language (calm, 4 stages)
`open` = slate/neutral · `diverge` = teal / `accent` var (the live generative zone) · `converge` = warm amber-gold · `close` = muted slate. Monochrome-leaning, quiet. **Challenge modules (`devil`/`friction`/`persona`/`emptychair`) fold into `diverge`** with a slightly higher energy value — keep 4 colors.

### Key flows
1. **Design check** — add modules, watch the total climb against the budget chip; crossing budget tints amber + `"{n} min over — trim a phase"`.
2. **Set the budget** — type Minutes (hoisted from AI panel) → ledger budget/delta recompute live; same number still feeds `suggestSession`/`reviseSession`.
3. **Retime a phase** — click chip, type `6` → `timerSeconds=360`; widths, total, curve x-spacing update instantly.
4. **Read the arc** — sparkline never descends after three divergent phases → `"No convergence after your divergence"` → add vote/synthesis → curve descends to close.
5. **Reorder to fix flow** — move a converge phase before the diverge phases → jagged curve + `"Converges before it diverges"`.
6. **Cross-link with AI critique** — after "🔍 Critique this design", the critic's pacing/arc comments now have a visible referent (the same curve).
7. **Hover to locate** — hover a curve dot/segment → its phase card highlights (shared index selection).

### Screens & states
- **Empty (0 phases):** placeholder `"Add modules to see your agenda and arc"`, no bar/curve.
- **Under / on / over budget:** as above.
- **No budget:** default 60, hint shown.
- **Healthy / no-convergence / inverted / flat** arc read-outs.
- **Timer-bearing card:** editable chip. **Untimed card:** greyed `~N min`.
- **Selected/hovered:** mirrored ring.
- **Mobile/narrow:** bands stack; ledger full-width; curve keeps 44px; chips wrap.

---

## Architecture: exact files to add/change

### New files

#### `/Users/jordan/workshop/edges-v2/lib/arc.ts`
Pure, dependency-light, fully unit-tested. **No `Set` spreads / no `.entries()` iteration** (downlevelIteration off — use `Array.from()` / index loops).

Exports:
- `type ArcStage = 'open' | 'diverge' | 'converge' | 'close'` (4 stages; challenge folds into diverge).
- `const STAGE_OF: Record<ModuleKind, ArcStage>` — **EXHAUSTIVE over all 42 kinds** (TS exhaustiveness via `Record<ModuleKind, …>`, not a partial map + fallback). See curated table below.
- `const ENERGY_OF: Record<ModuleKind, number>` — 0..1, exhaustive.
- `const DEFAULT_MINUTES: Record<ModuleKind, number>` — exhaustive default-duration table.
- `const TIMED: Set<ModuleKind>` — modules where a minutes chip is editable. **MUST include `capture`** (it has `needsTimer:false` yet is the only module with a typed `timerSeconds` field).
- `function acceptsTimerEdit(moduleId: ModuleKind): boolean` = `TIMED.has(moduleId) || SERVER_MODULES[moduleId]?.capabilities.needsTimer === true`.
- `function phaseMinutes(phase): { minutes: number; estimated: boolean }` — `config.timerSeconds/60` (rounded) when present & finite (`estimated:false`); else `DEFAULT_MINUTES[kind]` (`estimated:true`).
- `function phaseEnergy(phase): number` — `ENERGY_OF[kind]`, clamped 0..1. **No anonymity bump in v1** (see must-fix #5).
- `function analyzeAgenda(phases, budget): ArcAnalysis`:
  ```ts
  interface ArcAnalysis {
    totalMin: number;
    anyEstimated: boolean;          // → '~' prefix + softened copy
    target: number;                 // from timeBudget()
    delta: { minutes: number; state: 'under' | 'on' | 'over' };
    segments: { index: number; stage: ArcStage; minutes: number; frac: number }[];
    curve:    { index: number; x: number; energy: number }[];  // x weighted by minutes
    arcRead:  { ok: boolean; text: string };
  }
  ```
  `arcRead` detects: healthy rise-then-fall (ok), no-convergence tail, converge-before-diverge, flat (all mid-energy).

**Curated tables (specified up front — all 42 kinds, no implementer guessing):**

| ModuleKind | stage | energy | default min | timed? |
|---|---|---|---|---|
| lobby | open | 0.15 | 1 | no |
| prework | open | 0.30 | 2 | no |
| content | open | 0.20 | 3 | no |
| media | open | 0.20 | 3 | no |
| capture | diverge | 0.75 | 6 | **yes** |
| brainwrite | diverge | 0.80 | 8 | yes (needsTimer) |
| qna | diverge | 0.60 | 5 | no |
| wordcloud | diverge | 0.65 | 4 | no |
| lightning | diverge | 0.80 | 6 | yes (needsTimer) |
| redistribute | diverge | 0.75 | 6 | yes (needsTimer) |
| readaround | diverge | 0.50 | 6 | no |
| marketplace | converge | 0.55 | 8 | no |
| devil | diverge | 0.85 | 6 | no *(challenge bump)* |
| friction | diverge | 0.85 | 6 | no *(challenge bump)* |
| persona | diverge | 0.80 | 6 | no *(challenge bump)* |
| emptychair | diverge | 0.80 | 6 | no *(challenge bump)* |
| poll | converge | 0.45 | 3 | no |
| dotvote | converge | 0.45 | 3 | no |
| rank | converge | 0.40 | 4 | no |
| scale | converge | 0.40 | 3 | no |
| gradient | converge | 0.40 | 4 | no |
| spectrogram | converge | 0.45 | 4 | no |
| matrix | converge | 0.40 | 5 | no |
| minspecs | converge | 0.35 | 6 | no |
| twentyfive10 | converge | 0.45 | 8 | yes (needsTimer) |
| synthesis | converge | 0.30 | 4 | no |
| needs | converge | 0.35 | 4 | no |
| issuemap | converge | 0.40 | 5 | no |
| consult | converge | 0.50 | 8 | yes (needsTimer) |
| onetwofour | converge | 0.50 | 8 | yes (needsTimer) |
| worldcafe | diverge | 0.65 | 12 | yes (needsTimer) |
| stations | diverge | 0.60 | 10 | yes (needsTimer) |
| allocate | open | 0.30 | 3 | no |
| coordinator | open | 0.30 | 3 | no |
| equity | open | 0.25 | 2 | no |
| promptrelay | diverge | 0.55 | 5 | no |
| builder | open | 0.25 | 2 | no |
| fishbowl | diverge | 0.55 | **12** | no *(long dialogue — generous estimate)* |
| openspace | diverge | 0.55 | **15** | no *(long dialogue — generous estimate)* |
| close | close | 0.15 | 2 | no |

> Dialogue modules with no clear breadth direction (`fishbowl`/`openspace`) are given a deliberate home in `diverge` (generative dialogue) with **generous** default minutes so the "does it fit?" claim isn't confidently wrong. `coordinator`/`allocate`/`equity`/`builder` are facilitation-logistics → `open`, low energy. This table is the most-reviewed surface; `arc.test.ts` assertion (a) guards it against drift when modules are added.

#### `/Users/jordan/workshop/edges-v2/components/AgendaArc.tsx`
`'use client'`. Props:
```ts
{ phases: { id: string; moduleId: ModuleKind; config: unknown }[];
  budget: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void; }
```
Renders the bordered card with Band 1 (ledger from `segments.frac`), Band 2 (SVG sparkline via a **pure index-loop path builder** over `curve`, faint baseline, dots), Band 3 read-out. Hover on segment/dot → `onSelect(index)`; `selectedIndex` drives mirrored ring. Empty state for 0 phases. `useMemo(analyzeAgenda, [phases, budget])` so reorder/edit stays instant. Reuse `Bars`/`StatusLine` aesthetic.

#### `/Users/jordan/workshop/edges-v2/test/arc.test.ts`
Mirrors `test/templates.test.ts`. (See Test plan.)

### Changed files

#### `/Users/jordan/workshop/edges-v2/lib/design.ts`
Factor budget/target math out of private `timeGuidance()` into:
```ts
export function timeBudget(minutes?: number): { budget: number; target: number } {
  const budget = minutes && minutes > 0 ? minutes : 60;
  const target = Math.min(10, Math.max(3, Math.round(budget / 13)));
  return { budget, target };
}
```
Rewrite `timeGuidance()` to call it and build the **byte-identical** template literal from `{budget, target}`. No behavior change to `suggestSession`/`reviseSession`/`critiqueSession`.

#### `/Users/jordan/workshop/edges-v2/components/BuilderApp.tsx`
1. Keep `minutes` state; derive `const budget = useMemo(() => timeBudget(minutes ? Number(minutes) : undefined).budget, [minutes])`. Pass to `AgendaArc`. AI calls already send `minutes` — one number feeds ledger + AI.
2. Add `const [selectedIndex, setSelectedIndex] = useState<number | null>(null)` — **index-keyed**, NOT `phase.id` (see must-fix #2).
3. Mount `<AgendaArc phases={parsedPhases()} budget={budget} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />` at the **top of the Sequence section**, above the phase-card map.
4. In the phase-card map (`phases.map((p, i) => …)`) add the left rail: stage dot + label (from `STAGE_OF[p.moduleId]`), and a minutes chip — editable (`setConfig(i, { ...p.config, timerSeconds: mins*60 })` when `acceptsTimerEdit(p.moduleId)`, seeded from `phaseMinutes`) or greyed `~N min` with tooltip otherwise.
5. `onMouseEnter/Leave` on each card → `setSelectedIndex(i)` / `null`; ring when `selectedIndex === i`.
6. Subtle hint `"Minutes above sizes the agenda"` when `minutes` empty (budget defaults 60).

All new derivations memoized; **no new network calls**.

### Data model
**No persistent data-model change.** `SessionState`, `PhaseInstance`, `PhaseConfig`, the `rev` counter, the store, all KV keys untouched. The only "model" added is the in-memory derived `ArcAnalysis` from `lib/arc.ts`, computed live in the browser via `useMemo`, never written anywhere. `config.timerSeconds` is an already-existing optional `PhaseConfig` field and survives every module's `.passthrough()` schema, so the chip introduces no new schema field and cannot break launch validation.

### API + host commands (+ capability gating)
**None.** No new/changed API routes. No new/changed host commands in `app/api/r/[room]/host/route.ts`. `setPhases`/`setTemplate`/`suggestSession`/`critiqueSession`/`reviseSession` and their gating (`configure` for setPhases, `advance` for setTemplate) unchanged. `minutes` already travels to `suggestSession`/`reviseSession` via the existing POST body — B1 adds no field.

### Rev / authoritative-apply / KV read-back
**Not implicated.** B1 is design-time, client-only computation (`useMemo` over the local `BuilderPhase[]` array). It writes nothing to the store, touches no `rev`, no `/state` polling, no SSE, no `withLock`, no authoritative-apply, no read-back. The eventually-consistent-KV and stale-read failure classes are structurally unreachable. The "no AI / no work every 2s in computeView" rule does not apply (builder is not `computeView`).

---

## Implementation plan (ordered, checkable)

1. [ ] **`lib/design.ts`** — extract `timeBudget()`, rewrite `timeGuidance()` to call it. Typecheck-only, zero behavior change.
2. [ ] **Snapshot-lock the prompt** — add test asserting `timeGuidance(60).text` and `timeGuidance(undefined).text` are byte-identical to current output.
3. [ ] **`lib/arc.ts`** — write the 4 exhaustive `Record<ModuleKind,…>` tables + `TIMED` (incl. `capture`) + `acceptsTimerEdit` + `phaseMinutes` + `phaseEnergy` + `analyzeAgenda`. Index loops only, no `Set` spreads / `.entries()`.
4. [ ] **`test/arc.test.ts`** — to green (riskiest surface, most review). See Test plan.
5. [ ] **`components/AgendaArc.tsx`** — three bands, pure SVG path builder, empty state, memoized, index-keyed selection.
6. [ ] **`components/BuilderApp.tsx`** — hoist `budget`, add `selectedIndex`, mount `AgendaArc`, add per-card rail + chip + hover ring + hint.
7. [ ] **`npm run verify`** (typecheck + lint + test) + build on Node 24, with `arc.test.ts` in CI.
8. [ ] **Manual QA** (desktop + mobile + projector unaffected check).

---

## Acceptance criteria (facilitator-outcome framed)

1. With 0 phases, the panel shows `"Add modules to see your agenda and arc"` and no bar/curve.
2. Adding modules updates the total live; when the total exceeds the budget the total tints amber and the line reads `"{n} min over — trim a phase"`. **Launch is never blocked** by over-budget.
3. Typing a different Minutes value recomputes budget + delta live, and the same number is what `suggestSession`/`reviseSession` receive.
4. Clicking a minutes chip on a timer-editable phase (e.g. capture) and typing `6` writes `config.timerSeconds=360`, and the ledger width / total / curve x-spacing update instantly.
5. An agenda that opens → diverges → converges → closes shows `"… ✓"`; a diverge-only tail shows `"No convergence after your divergence"`; a converge-before-diverge shows `"Converges before it diverges — check the order"`; all-mid-energy shows `"Flat arc …"`.
6. Hovering a curve dot, a ledger segment, or a phase card highlights all three (the same phase), with no double-highlight even after adding/removing duplicate modules.
7. When any phase's minutes is an estimate, the total is prefixed `~` and the "on budget" copy reads `"about right"` (never "right on time").
8. Untimed phases (e.g. lobby, synthesis, fishbowl) show a greyed `~N min` chip with tooltip `"estimated — this phase has no timer"` and are counted in the total but not editable.
9. `npm run verify` and build pass on Node 24 with `arc.test.ts` included; the AI prompt text is unchanged.

---

## Test plan

### Vitest (`test/arc.test.ts`, mirroring `test/templates.test.ts`)
- **(a) Completeness / drift guard:** every `ModuleKind` in `SERVER_MODULES` has a `STAGE_OF`, `ENERGY_OF`, `DEFAULT_MINUTES` entry. (Exhaustive `Record` makes this compile-time too; the test catches registry additions.)
- **(b) Estimator over TEMPLATES:** for each built-in `TEMPLATE`, `analyzeAgenda` total is within a sane band for the template's tag, and `phaseMinutes` matches `timerSeconds/60` where set (e.g. Blue Sky capture `timerSeconds:360` → 6 min, `estimated:false`).
- **(c) arcRead classification:** hand-built healthy open→diverge→converge→close → `ok:true`; diverge-only tail → `"No convergence after your divergence"`; converge-before-diverge → `"Converges before it diverges …"`; all-mid-energy → `"Flat arc …"`.
- **(d) acceptsTimerEdit:** `true` for `capture` and the 8 `needsTimer` modules (`brainwrite`, `consult`, `lightning`, `onetwofour`, `redistribute`, `worldcafe`, `twentyfive10`, `stations`); `false` for `lobby`, `content`, `close`, `synthesis`.
- **(e) Empty list:** `analyzeAgenda([], 60)` does not throw; returns `totalMin:0`, empty segments/curve.
- **(f) Estimate honesty:** an agenda mixing a timed and an untimed phase reports `anyEstimated:true`.

### `lib/design.ts` snapshot
- `timeGuidance(60).text` and `timeGuidance(undefined).text` byte-identical to pre-refactor (locks the no-op claim, since the string is interpolated into live AI prompts).

### Manual QA
- **Desktop builder:** add/reorder/remove phases; verify live total, amber over-budget, all 4 arc read-outs, chip edit writes `timerSeconds`, hover links the three surfaces with no double-highlight after a remove+re-add of the same module.
- **Mobile/narrow:** bands stack, ledger full-width, curve stays 44px, chips wrap, chip editable on touch.
- **Projector:** confirm `/r/[room]/screen` is **unchanged** (B1 is builder-only; nothing should appear there).
- **Launch unaffected:** an over-budget agenda still launches (gated only by zod validity).
- **Regression:** AI "Design with AI" and "Critique this design" still work and receive the same `minutes`.

---

## Privacy & ethos check (explicit)

**PASS.** B1 is purely builder-side (client) visualization over the in-memory `BuilderPhase[]` array. It writes nothing to the store, adds no `SessionState`/`rev` field, makes no network call, and logs nothing. `anonymity` is not read at all in v1 (the bump is dropped — see must-fix #5). The off-the-record contract, 24h TTL, account-less model, and End-session wipe are untouched. `config.timerSeconds` is an already-existing optional `PhaseConfig` field; editing it introduces no new persisted surface. No privacy ethos violation.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Unmapped ModuleKinds would fail-build** *(major → resolved).* The design only mapped ~30 of the 42 kinds. **Resolved:** the curated table above is exhaustive over all 42, with deliberate homes for the 8 previously-missing kinds (`allocate`/`coordinator`/`equity`/`builder` → `open` logistics; `fishbowl`/`openspace`/`readaround`/`promptrelay` → `diverge`). Tables are `Record<ModuleKind,…>` (compile-time exhaustiveness) + `arc.test.ts` (a) guard.
2. **Selection keyed on non-unique `id`** *(major → resolved).* `BuilderApp.add()` mints `id = ${moduleId}-${n}` with no dedup across removals, so ids collide → double-highlight + mis-targeted chip writes + React key collisions. **Resolved:** shared selection is keyed on **array index** (`selectedIndex: number | null`), not `phase.id`. We do **not** scope-creep into rewriting id generation.
3. **`acceptsTimerEdit` must include `capture`** *(minor → resolved).* `capture` has `needsTimer:false` yet is the only module with a typed `timerSeconds` field. **Resolved:** `TIMED` explicitly includes `capture`; unit test (d) asserts `acceptsTimerEdit('capture')===true`.
4. **Prompt-string drift in refactor** *(minor → resolved).* **Resolved:** `timeBudget()` reproduces the exact clamp/round; `timeGuidance().text` rebuilt from the two numbers and snapshot-tested byte-identical.
5. **Dead anonymity signal** *(major → resolved).* `anonymity` is declared in exactly one schema (`capture`), so a general "anonymous = wider" bump fires almost only for capture and is invisible across the diverge band. **Resolved:** the anonymity energy bump is **dropped from v1**; no arcRead/UI copy implies anonymity is read across the band.
6. **Untimed-phase under-estimation** *(minor → resolved).* Long untimed phases (`fishbowl`/`openspace`/`readaround`, long synthesis) would make the headline "does it fit?" confidently wrong. **Resolved:** `phaseMinutes` returns `estimated`; the total is `~`-prefixed when `anyEstimated`; delta copy softened to "about right"; `DEFAULT_MINUTES` for `fishbowl`/`openspace`/`readaround` are generous (12/15/6).

### Other risks
- **Curated-table review is the long pole** — budget ~1 day; the table is fully specified here to de-risk it.
- **Scope creep inward** — resist fixing `add()` id generation; index-keyed selection sidesteps it entirely.

---

## Out of scope / future (fast-follows)

- One-tap **"Trim to {budget} min"** calling `reviseSession` with an injected issue (adds an AI call).
- Read-only **arc strip** in the host Session tab / projector to track remaining arc mid-run.
- Feeding `arc.ts` structured stages into **`critiqueSession`'s prompt** so AI critic and UI compute identical stages (small critic-prompt refactor).
- Re-introducing an **anonymity / breadth energy signal** once more modules declare `anonymity` in their schemas.
