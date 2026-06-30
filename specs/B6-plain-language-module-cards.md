# B6 — Plain-language module cards + dependency explainer

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 3.5 days (the engineering core is ~1 day; the bulk is hand-authoring ~40 card triples in a consistent voice — editorial, not code).
- **Section:** B. Session design
- **Depends on:** the existing module contract (`lib/modules/types.ts`), the builder (`components/BuilderApp.tsx`), and the AI designer (`lib/design.ts`). No dependency on other roadmap items. Complements **B1** (agenda arc), **B2** (room preview), **A1** (create-workshop wizard) and the `suggestSession` rationale, but ships independently. Builder-only for B6; `/help` and host Patterns reuse is a fast-follow.

---

## Problem & facilitator value

**The problem, in the facilitator's voice:**

> "I'm staring at a palette of thirty-odd modules and they all look the same. The only sentence I get per module is one dense technical line — *'Mic + textarea. Collects short text submissions.'* — and it shows up as a tooltip *and* as the subtitle once I place the phase. I can't tell what a module is *for* or what my room will actually *do*. And when I wire one thing into another, the dropdown says *'Takes input from: capture-2'* — a phase **id**, not the question I actually asked the room. When the AI builds a session for me, I can't audit whether it wired the right source, because nothing reads back in plain English."

**The value B6 delivers:**

The builder becomes a **deck of method cards**. For every module the facilitator sees three calm labels — **What it is**, **Best for**, **What the room does** — and picks by *intent*, not by guessing from a technical blurb. Chaining reads as plain English tied to *their own prompt text*: instead of "Takes input from: capture-2" it reads **"Reads what the room wrote in 'What's the biggest blocker on your team?'"**. The chain self-explains, and AI-designed sessions become auditable at a glance — a mis-wired source is obvious because the card narrates it.

This is purely additive and presentational. No change to launch, gating, realtime, privacy, or any participant-facing surface.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP (thinnest shippable, ships green at every step)

1. **Contract extension** — two optional fields on `ModuleServerDef['meta']`: `plain?: { whatItIs; bestFor; roomDoes }` and `producesRoomText?: boolean`. `description` stays required as the fallback, so the build is green before any copy exists (`whatItIs := description`).
2. **`lib/modules/source-text.ts`** — pure helpers `promptOf(moduleId, config)` and `producesRoomText(moduleId)`, with a standalone canonical producer map (no registry import into the client bundle).
3. **`components/ModuleCard.tsx`** — `PaletteChip`, `PlacedPhaseCard`, `ModuleCardBody`, `SourceField`.
4. **Vitest guard** — `test/modules/plain-cards.test.ts`, count-agnostic (`Object.keys(SERVER_MODULES)`), soft length caps, producer-set assertion, `promptOf` fallback behaviour.
5. **Authored copy** — `meta.plain` on **every registered module** (count-agnostic; ~40 today: 14 inline + 26 defs), `producesRoomText: true` on the canonical producer set.
6. **Builder rewire** — palette buttons → `PaletteChip`; placed-phase header/description → `PlacedPhaseCard`; `case "source"` → `SourceField`; **plumb earlier-phase `config` through to the widget** (the must-fix).

MVP is builder-only. The card body component is built reusable from day one but **not** wired into `/help` or host in this PR.

### Full vision (fast-follow, out of scope for B6)

- `ModuleCardBody` rendered on `/help` (method reference deck) and on the host **Patterns** tab.
- `lib/design.ts` enriched so the AI designer's catalogue and per-session rationale speak the same card language (low-risk; included as an optional step here).
- Card triples surfaced in B2 room preview and B1 agenda-arc tooltips.

---

## Experience & flows (screens, states, copy)

Voice guide (apply to every triple):
- **What it is** — one calm noun-phrase sentence; what the tool *is*. Default fallback = `meta.description`.
- **Best for** — the facilitator's *intent* ("Surfacing blockers fast", "Turning raw input into themes"). ≤ ~60 chars. Keep neutral for ambiguous AI modules (synthesis, issuemap) — do not over-prescribe.
- **What the room does** — the *participant verb*, second person plural ("Everyone types one blocker", "Each person spends ten credits"). ≤ ~120 chars.

### 1. Palette — `PaletteChip` (collapsed)

- Chip shows **name** + a muted **Best for** line.
- **Hover/focus** pops a floating full card (`ModuleCardBody`: all three labels).
- Replaces the bare `+ {name}` button (BuilderApp.tsx ~742–753) whose only affordance was the `title=` description tooltip.

### 2. Placed phase — `PlacedPhaseCard` (expanded, above the form)

- **What it is** and **Best for** always visible (replaces the single `{mod.meta.description}` `<p>` at ~783).
- **What the room does** behind a gentle disclosure (`▸ What the room does`), collapsed by default to stay scannable.
- The existing `AutoForm` (or Advanced JSON) renders below, unchanged.

### 3. Wiring — `SourceField` (four states)

Replaces the `case "source"` select (BuilderApp.tsx 331–360). The label "Takes input from" is **removed**; the prose label lives inside `SourceField`. Eligibility (which earlier phases are offered, and which are disabled) is driven **solely** by `producesRoomText(moduleId)` of each earlier phase — never by "has a source field".

| State | Condition | Copy |
|---|---|---|
| **Unset + optional** | value `''`/null, `f.optional`, ≥1 eligible source | "Reads everything the room wrote earlier — or focus one phase:" + dropdown defaulting to *"Everything written so far"* |
| **Unset + required** | value `''`/null, required | "Pick a prompt this reads from:" + dropdown placeholder *"Pick a prompt…"*; the line stays a gentle *invitation*, and `validateConfig` owns the hard error |
| **Set** | value is a real earlier phase id | "Reads what the room wrote in **\"{quoted prompt}\"**" (prompt from `promptOf`) |
| **None eligible** | no earlier phase has `producesRoomText` | Disabled invitation: "Add a **Capture** or **Pre-work** phase before this one so there's something to read." |

Dropdown ordering: **text producers first** (`producesRoomText` true), non-producers listed but **disabled**. Each option labelled by `promptOf` (the quoted prompt) with `meta.name` then phase id as fallback — never a bare id alone.

**Critical: `''` and `null` are BOTH treated as unset, regardless of optional/required.** `needs.server.ts` ships `defaultConfig.sourcePhaseId: ""` on a *required* field; without this rule the UI would show a bogus green "wired" state quoting a blank prompt. For required+unset, show the *invitation* state and let `validateConfig` surface the error line (already rendered at BuilderApp.tsx:805).

### 4. AI session audit

Because every placed phase now narrates **What it is / Best for** and every source reads **"Reads what the room wrote in '…'"**, a facilitator scanning an AI-designed flow can immediately see a mis-wired source (e.g. a synthesis pointed at the wrong capture prompt).

---

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/modules/source-text.ts` | Pure, React-free, **store-free**, **registry-import-free** helpers. `promptOf(moduleId, config)` derives the human prompt a phase asked the room. `producesRoomText(moduleId)` reads a **standalone literal map** of producer ids (NOT the registry — avoids pulling server `computeView` into the client bundle). Imported by `BuilderApp` (client) and `lib/design.ts` (server). |
| `/Users/jordan/workshop/edges-v2/components/ModuleCard.tsx` | `"use client"` presentational component. Exports `PaletteChip`, `PlacedPhaseCard`, `ModuleCardBody`, `SourceField`. No state, no store, no renderer-runtime. Takes `earlierPhases` (now incl. config), `value`, `onChange`, `optional`. |
| `/Users/jordan/workshop/edges-v2/test/modules/plain-cards.test.ts` | Vitest guard (in-memory, no KV/AI). |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/modules/types.ts` | Extend `ModuleServerDef['meta']` (line 103) to `{ name: string; description: string; icon?: string; plain?: { whatItIs: string; bestFor: string; roomDoes: string }; producesRoomText?: boolean }`. `description` stays **required**. Type-only; no runtime impact. |
| `lib/modules/registry.server.ts` | Author `meta.plain` on the 14 inline modules (lobby, content, capture, allocate, coordinator, readaround, close, poll, dotvote, rank, scale, wordcloud, qna, matrix). Set `producesRoomText: true` per the **canonical producer set** below. No logic change. |
| `lib/modules/defs/*.server.ts` (26 files) | Author `meta.plain` on every def module. Set `producesRoomText: true` on `brainwrite` and `prework`. No logic change. |
| `components/BuilderApp.tsx` | **(a)** Remove the hardcoded `PRODUCERS` Set (line 40) — import `producesRoomText` from `source-text.ts`. **(b)** Remove the `if (key === "sourcePhaseId") return "Takes input from"` branch in `humanize` (line 135) — prose label moves into `SourceField`. **(c)** Replace `case "source"` (331–360) by delegating to `<SourceField/>`. **(d)** Anchor edits to landmarks, not literal line numbers: the `cat.kinds…map(...)` palette button → `<PaletteChip/>`; the `{mod.meta.description}` `<p>` placed-phase header block → `<PlacedPhaseCard/>` above the existing `AutoForm`. **(e) MUST-FIX plumbing:** change `earlierPhases` construction (line 769) from `phases.slice(0,i).map(q => ({ id: q.id, moduleId: q.moduleId }))` to also carry `config: q.config`, and widen the `earlierPhases` prop type on `AutoForm` (line 187) and `SourceField` to `{ id; moduleId; config }[]`. Without this, `promptOf` never sees the source prompt and the feature degrades to the id-dropdown it replaces. |
| `lib/design.ts` | Optional (recommended, low-risk): enrich `moduleCatalog()` (line 49) to append `meta.plain?.bestFor` / `roomDoes` so the AI designer's rationale aligns with the cards. Pure prompt-text change; AI still never runs in `computeView`. |

### Data model (types / zod / store keys / view shapes)

- **No persisted-data or `SessionState` changes.** No KV keys, no `rev`, no TTL, no migration.
- The only schema change is **compile-time** module metadata on `ModuleServerDef.meta`: two **optional** fields (`plain`, `producesRoomText`). Backward compatible: modules without them compile and render (`whatItIs` falls back to `description`; `producesRoomText` defaults `false`).
- `promptOf` reads only the **in-memory builder draft config** (each earlier phase's already-loaded `config`). No read-back from the store.
- The `type-only` boundary in `lib/modules/views.ts` is unaffected.

**`promptOf(moduleId, config)` derivation (confirmed against the schemas):**

| Module(s) | Field read |
|---|---|
| capture, brainwrite, prework, redistribute, wordcloud, qna | `config.prompt` |
| poll | `config.question` |
| scale | `config.question` / statement |
| prework (alt) | `config.brief` if no `prompt` |
| anything else / blank | fallback to `meta.name`, then phase `id` |

`promptOf` never returns empty — blank prompt → `meta.name` → `id`.

### Canonical producer set (resolves the three conflicting lists)

`producesRoomText === true` for exactly: **`capture`, `prework`, `qna`, `brainwrite`** — i.e. **today's `PRODUCERS` Set, unchanged**.

- **`wordcloud` is OUT.** Its tokens (`maxWords: 3`) are not prose; feeding 3-word tokens into synthesis/issuemap as "what the room wrote" is misleading. (If product later wants it in, label it "tokens, not prose".)
- **`readaround` is a consumer, not a producer** — it re-displays an earlier source. It must NOT be `producesRoomText`, and must be **disabled** in the source dropdown.
- **Zero behaviour delta from today.** The producer set is identical to the existing `PRODUCERS` Set, so source rankings for existing builds do not shift. The Vitest guard asserts the standalone map equals this set, locking the no-drift guarantee.

### API + host commands (+ capability gating)

- **None added or changed.** No new/changed API routes. `setPhases` / `setTemplate` / `suggestSession` / `critiqueSession` / `reviseSession` untouched.
- **Capability gating unchanged:** custom builds still require admin `configure` via `setPhases`; templates still require facilitator `advance` via `setTemplate`. B6 touches neither launch nor gating.

### rev / authoritative-apply pattern (no KV read-back)

**Not involved.** B6 is build-time config UI that operates entirely on the local draft before `setPhases` is dispatched. No `/state`, no `navState`, no `usePolledState.apply`, no eventually-consistent read-back. The anti-flash / authoritative-apply model is untouched and out of scope.

---

## Implementation plan (ordered, checkable)

1. [ ] **Extend the contract.** Add `plain?` and `producesRoomText?` to `ModuleServerDef['meta']` in `lib/modules/types.ts:103`. Run `npm run verify` — green (fields optional).
2. [ ] **Add `lib/modules/source-text.ts`** with `promptOf(moduleId, config)` and `producesRoomText(moduleId)` backed by a standalone literal set `{capture, prework, qna, brainwrite}`. No registry import.
3. [ ] **Add `components/ModuleCard.tsx`** (`PaletteChip`, `PlacedPhaseCard`, `ModuleCardBody`, `SourceField`) using `whatItIs := meta.plain?.whatItIs ?? meta.description`. Calm styling with existing tokens (accent/border/muted/surface).
4. [ ] **Add `test/modules/plain-cards.test.ts`** — count-agnostic guard. Build stays green (fallbacks resolve).
5. [ ] **Author `meta.plain` copy** across all registered modules in 2–3 batches by `CATEGORY` bucket, with the voice guide. Set `producesRoomText: true` only on capture/prework/qna/brainwrite.
6. [ ] **Rewire BuilderApp:**
   - [ ] Remove `PRODUCERS` Set (40); import `producesRoomText`.
   - [ ] Remove `"Takes input from"` branch in `humanize` (135).
   - [ ] **Plumb config:** `earlierPhases` now `{ id, moduleId, config }` (769); widen prop types (187 + `SourceField`).
   - [ ] `case "source"` → `<SourceField/>` (four states; `'' || null` = unset; eligibility from `producesRoomText`).
   - [ ] Palette button → `<PaletteChip/>`.
   - [ ] Placed-phase `{mod.meta.description}` `<p>` block → `<PlacedPhaseCard/>` above `AutoForm`.
7. [ ] **(Optional) Enrich `lib/design.ts`** `moduleCatalog()` (49) with `bestFor`/`roomDoes`.
8. [ ] **Gate:** `npm run verify` (typecheck+lint+test) + Vercel build on Node 24.
9. [ ] **Manual QA** (below) incl. mobile and projector smoke (no projector change expected).

---

## Acceptance criteria (facilitator-outcome framed)

1. **Pick by intent:** In the palette, every module shows its name + a Best-for line; hovering reveals all three labels. The facilitator can choose a module without reading the technical description.
2. **Placed cards self-explain:** Each placed phase shows *What it is* and *Best for* above its form, with *What the room does* one tap away.
3. **Wiring reads as English tied to the real prompt:** A wired source reads "Reads what the room wrote in '\<the actual prompt the earlier phase asked\>'" — never a bare phase id. (Requires the config-plumbing must-fix.)
4. **Unwired is a gentle invitation, not an error spew:** Optional-unset reads "Reads everything…"; required-unset reads "Pick a prompt…"; no eligible source reads "Add a Capture or Pre-work phase first."
5. **`needs` default does not look wired:** A freshly added `needs` phase (ships `sourcePhaseId: ""`) shows the *required-unset invitation*, not a green "wired" state quoting a blank prompt.
6. **Only producers are selectable sources:** `readaround`, poll, dotvote, matrix, etc. appear disabled in source dropdowns; capture/prework/qna/brainwrite appear first and enabled.
7. **No producer-ranking drift:** Existing builds rank sources exactly as before (producer set == today's `PRODUCERS`).
8. **Every module has resolvable card copy:** No module renders an empty card (Vitest-enforced; `whatItIs` falls back to `description`).
9. **Nothing else changes:** Launch, gating, realtime, projector, participant view, and privacy surfaces are byte-for-byte unaffected.

---

## Test plan

### Vitest (`test/modules/plain-cards.test.ts`, in-memory, no KV/AI)

1. **Card resolvability:** For every `Object.keys(SERVER_MODULES)`, resolved `whatItIs` (`plain?.whatItIs ?? description`) is non-empty.
2. **Soft length caps (scannability, not accuracy):** where `meta.plain` is authored, `bestFor.length <= 60`, `roomDoes.length <= 120`, `whatItIs.length <= 140` (warn-or-fail per team taste; assert as cap).
3. **`producesRoomText` type:** every module's flag is `boolean | undefined`.
4. **Canonical producer set:** `producesRoomText` is `true` for exactly `{capture, prework, qna, brainwrite}` — assert the standalone map equals this set (locks no-drift).
5. **`readaround` is a consumer:** `producesRoomText("readaround") === false` and it is excluded from eligible sources.
6. **`promptOf` happy path:** for each producer, `promptOf(id, { prompt: "X" })` (or `question` for poll) returns `"X"`.
7. **`promptOf` fallbacks:** blank/unknown config → `meta.name`; unknown module → phase id; never returns `""`.
8. **`needs` required-default:** `promptOf`/SourceField treats `sourcePhaseId === ""` as unset (logic-level helper test: an `isWired('')` predicate is false).

### Manual QA

- **Desktop builder:** Add capture → synthesis. Edit the capture prompt; confirm the synthesis source line live-re-derives the new quoted text. Move the source phase later than its consumer → consumer shows a re-pick / no longer eligible.
- **Required vs optional:** Add `needs` (required, default `""`) → invitation state, launch disabled with the existing error line. Add `synthesis` (optional) → "Reads everything…" default, launchable.
- **No-source case:** Add `synthesis` as the *first* phase → "Add a Capture or Pre-work phase first."
- **AI session audit:** Run `suggestSession`; scan the placed cards and source lines; confirm a deliberately mis-wired source is visually obvious.
- **Palette hover:** Confirm the floating card appears on hover and on keyboard focus.
- **Mobile (participant phone width):** The builder is facilitator-facing, but verify `PaletteChip` hover-card degrades gracefully to tap/focus on touch and does not overflow narrow viewports.
- **Projector smoke:** Confirm `/r/[room]/screen` is unchanged (no projector surface touched).

---

## Privacy & ethos check (explicit)

**No privacy or ethos impact.** B6 is build-time config UI only:

- No new persistence, logging, `SessionState`/KV/TTL change, API route, or auth/anonymity surface.
- `promptOf` reads **only the facilitator's own draft prompt text** (what *they* authored), never a participant submission. The cards quote the *facilitator's* prompt, not what the room wrote — no submission ever surfaces in the builder.
- Off-the-record contract, 24h TTL, account-less model, and end-session wipe are all untouched.
- No new client-bundle leakage: `source-text.ts` uses a standalone producer map and does **not** import the server registry / `computeView`.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (from pressure-test) | Severity | Resolution folded into this spec |
|---|---|---|
| **Source config never reaches the widget** — `earlierPhases` (BuilderApp.tsx:769) strips `config`, so `promptOf` can't quote the prompt; the headline feature silently degrades to the id-dropdown. | **Critical** | **Must-fix landed in the plan:** `earlierPhases` now carries `config: q.config`; prop types at 187 + `SourceField` widened to `{ id; moduleId; config }[]`. Acceptance #3 and the desktop QA verify the quoted prompt re-derives live. |
| **Three conflicting producer lists** (existing Set vs two design variants); wordcloud ambiguity; silent ranking drift. | **Major** | **Pinned to one canonical set = today's `PRODUCERS` = `{capture, prework, qna, brainwrite}`.** wordcloud explicitly OUT. Vitest test #4 asserts equality → zero behaviour delta, no migration note needed. |
| **Optional vs required source semantics** — `needs` ships required `sourcePhaseId: ""`; naïve "set" detection shows a bogus wired state. | **Major** | `SourceField` treats `value === '' || value == null` as **unset regardless of optional**; required+unset shows the invitation and defers the hard error to `validateConfig`. Acceptance #5, Vitest #8. |
| **`readaround` re-display mistaken for a producer** — driving eligibility off "has a source field". | **Minor** | Eligibility driven **solely** by `producesRoomText(moduleId)`. `readaround` flagged false, disabled in dropdowns. Vitest #5. |
| **Stale line numbers** (766–809, 738–757, etc. clip surrounding JSX). | **Minor** | Edits anchored to **code landmarks** (`case "source"` block; the `{mod.meta.description}` `<p>`; the `cat.kinds.map` button), not literal ranges. |
| **Module count 40 vs 41 as an acceptance bar.** | **Minor** | Guard iterates `Object.keys(SERVER_MODULES)`; no count in acceptance language. |
| **`source-text.ts` import boundary** — reading `producesRoomText` from the registry could pull server `computeView` into the client bundle. | **Minor** | `producesRoomText` reads a **standalone literal map** in `source-text.ts`; no registry import. BuilderApp already imports `SERVER_MODULES` for `validateConfig`, so meta reads there are pre-existing — verify no new client-bundle regression at build. |
| **Editorial scope** — ~40 triples in a consistent voice is the real cost. | Scope | Land type+component+guard scaffolding first (green via `description` fallback), then batch copy by `CATEGORY` with the voice guide. Soft-cap test guards scannability (not accuracy). |

---

## Out of scope / future

- **`/help` method-reference deck and host Patterns tab** rendering of `ModuleCardBody` — fast-follow PR (component is built reusable but not wired here).
- **Auto-deriving copy from capabilities** — rejected; hand-author with a voice guide for quality.
- **Heuristic producer detection** — rejected; explicit `meta.producesRoomText` flag.
- **`wordcloud` as a text source** — deferred; would require "tokens, not prose" labelling.
- **B1/B2 reuse** (agenda-arc tooltips, room-preview cards) — separate items; B6 just makes the card data available.
- **Any launch / gating / realtime / projector / participant-facing change** — explicitly excluded.
