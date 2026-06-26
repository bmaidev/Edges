# D1 — Dead-simple join + crystal per-phase instructions + anonymity clarity

> Status: **Ready to build.** This spec folds in every must-fix from the pressure-test. The P0 scope below is deliberately the **honest core**; the deferred pieces (anonymous-strict chip, per-phase override, AI/host parity) are spelled out in *Full vision* and *Out of scope* and must NOT be built in the first cut.

---

## Priority / effort / dependencies

- **Priority:** P0
- **Effort (this MVP cut):** **3.0 days** (down from the 6.5-day full vision; the cut removes the builder override, AI passthrough, design.ts critique, host-tab parity, and the anonymous-strict storage change).
- **Effort (full vision, for planning):** ~6.5 days across the fast-follows.
- **Dependencies:**
  - None blocking — D1 is additive and ships with no flag.
  - **Internal ordering dependency** (within this item): the `Attribution` type + `resolveAttribution` helper must land before `store.ts`/`registry.server.ts` consume it; `PublicState` fields before `getPublicState` populates them; `PhaseHeader` before `PhaseScreen` renders it; each module's instruction default must land **in the same commit** that removes that module's ad-hoc instruction line (gradient, lightning).
  - **Fast-follow D1.1 (anonymous-strict storage)** depends on the capture token-stripping change landing before any "not even facilitators" chip copy is shown. Until then capture-anonymous renders as the honest **Facilitators only**.

---

## Problem & facilitator value

### Problem (three gaps)

1. **No per-phase "here's what to do" line.** A participant lands inside a module renderer that assumes context. The `StatusBar` shows only `config.label` ("Capture", "Gradient", "2x2") — a *category*, not an instruction. A couple of modules embed an ad-hoc instruction (gradient.client.tsx:71 "Where do you stand?…", lightning.client.tsx:66 "Keep it tight."), but most don't, and there's no contract guaranteeing one. A non-technical participant who glances down mid-session has to infer the ask from the UI shape. This is the single biggest friction in the participant experience.

2. **Anonymity is REAL but INVISIBLE and INCONSISTENT.** Attribution genuinely varies per module — capture has config-driven `anonymity: "named" | "anonymous"`; equity has `anonymize` (default true); spectrogram/brainwrite/redistribute/marketplace/fishbowl never leak tokens to peers; lightning/consult/onetwofour/builder show handles by name to the room. The participant has **no way to know, at the keystroke**, which regime applies. The single global join line ("Your raw notes are seen only by the facilitators") is sometimes **false** (lightning shows your name to everyone) and sometimes **undersells** the protection (anonymous capture intends to hide you even from the facilitator). That erodes the off-the-record trust story exactly where it matters.

3. **Join front-loads a wall of privacy prose** (~70 words) before the person has any reason to care, and the "Anonymous" default is a pre-filled editable string rather than an explicit, reassuring named-vs-anonymous choice.

### Facilitator value (in the facilitator's voice)

> "My whole reputation is psychological safety and a room that just works without me babysitting phones.
>
> With this, **I stop narrating the obvious.** I don't have to say 'now open your phone and pick where you stand' — every phase tells them, in one line, the moment it starts. Fewer 'what do I do?' hands, less dead air, more eyes up in the room.
>
> And my off-the-record promise finally **looks** as true as it is. When I run an anonymous safety capture, they SEE that it's off the record, and they tell me the real thing. When a round is named — lightning, consult — nobody is blindsided seeing their name on the projector, because the app told them up front. That honesty is what I'm selling.
>
> Best of all it's **zero extra work for me.** Every phase already knows its own privacy behaviour in the code; the app just surfaces it. I don't label anything."

---

## MVP cut (thinnest shippable) vs Full vision

### MVP cut — the honest core (build this)

Four things, no capability surface, no AI, no false privacy claim:

1. **Per-phase instruction line** — module-default strings only (hand-written, product-voice, token-substituted), surfaced in a new `PhaseHeader` band. **No** per-phase override, **no** builder field, **no** design.ts passthrough.
2. **Anonymity chip in only the two states it can prove today:** **Facilitators only** and **Named (as `<handle>`)**. The third state (**Anonymous — not even facilitators**) is **deferred to D1.1** until storage is actually token-anonymous. Capture-anonymous renders as **Facilitators only** in the MVP (true but modest), never as "Anonymous".
3. **tagWith qualifier:** when a capture phase is anonymous **and** `tagWith` is set, the chip copy is the qualified form so we never over-promise (see Copy).
4. **JoinScreen rework** — segmented `[Stay anonymous* | Use a name]` control, collapsed privacy disclosure, one-line summary. One tap to enter anonymously, two to name.

Plus the named-phase **submit echo** ("Shared as `<handle>`") on the four named modules, and removal of the two ad-hoc instruction lines (each replaced by its module default in the same commit).

### Full vision (fast-follows, not in P0)

- **D1.1 — Anonymous-strict storage + chip.** Make capture-anonymous actually token-anonymous (drop `token` at write + strip from facilitator payload), then enable the **Anonymous — not even the facilitators** chip with the strong guarantee copy. (See Risks #1.)
- **D1.2 — Per-phase instruction override (admin-gated) + host "What they see" parity.** Builder `Instruction` field, explicitly labelled admin-only; `PhaseHeader` mirrored in the host PreviewPanel.
- **D1.3 — AI authoring.** `design.ts` `suggestSession`/`reviseSession` emit/rewrite the instruction; `critiqueSession` flags missing/over-long lines; length-capped at author time.

---

## Experience & flows

### Screens & states

- **JoinScreen — anonymous default (1 tap):** branding header (logo/headline/tagline unchanged) → one-line privacy summary → `[Stay anonymous* | Use a name]` segmented control with "Stay anonymous" pre-selected → **"How this stays private"** `<details>` disclosure (collapsed) → **"Join the room"** CTA. Tap CTA → token minted with handle `Anonymous` → enter session. No typing.
- **JoinScreen — named variant (2 interactions):** tap **Use a name** → handle input slides in, autofocused, `maxLength={40}` → type → CTA. Empty name silently falls back to `Anonymous` (the join route already coerces).
- **PhaseHeader band (new), directly under StatusBar, above the Renderer:**
  - **Line 1 — instruction:** one imperative present-tense second-person sentence, `text-white/90`, wraps to **max 2 lines** (`line-clamp-2`), never truncated mid-word. It is the phase's accessible heading.
  - **Line 2 — AttributionChip:** small pill button, `aria-expanded`, in one of the **two MVP states**: **Facilitators only** (eye-with-line icon, muted) / **Named** (person icon, neutral, reads "Shared with the room as `<handle>`"). Tap expands a calm sheet with the one-sentence guarantee + "Deleted when the session ends." Collapses on tap-away.
- **PhaseHeader hidden** when `attribution === "none"` **and** no instruction (lobby / content / media / close): the existing holding ("We'll begin shortly") and look-up ("Look up at the screen.") screens already cover those. **Never render an empty band.**
- **Named-phase submit echo:** on lightning / consult / onetwofour / builder only, the StickyAction/submit area shows "Shared as `<handle>`" so identity exposure is confirmed before the tap.
- **Holding states (unchanged):** preSession "We'll begin shortly"; active-but-no-participant-UI "Look up at the screen." — no instruction band.

### Copy (load-bearing — use verbatim)

Join:
- Summary one-liner: **"Off the record. Nothing is kept after the session."**
- `<details>` label: **"How this stays private"**
- Disclosure body (the tightened ethos): **"Nothing here is recorded beyond this session. What you write is shown only as patterns or to the facilitators — never to other participants by name unless a round explicitly shares names. Everything is deleted when the session ends."**
- Segment labels: **"Stay anonymous"** / **"Use a name"**
- Named input label: **"Your name or handle"**

Attribution chip (the per-regime copy map in `lib/modules/attribution.ts`):
- `facilitators-only` → label **"Facilitators only"**; guarantee **"Your note goes only to the facilitators, never other participants. Off the record. Deleted when the session ends."**
- `named` → label **"Named"**; guarantee **"This is shared with the room as <handle>. Deleted when the session ends."**
- `anonymous-strict` (DEFERRED, D1.1) → label **"Anonymous"**; guarantee **"Not even the facilitators can see this is you. Deleted when the session ends."** — **do not ship until storage is strict.**
- **tagWith qualifier** (capture anonymous/facilitators-only with `tagWith` set): chip label **"Facilitators only"**; the guarantee sheet appends **"Your <lens|side> is still attached."** so the visible tag is never hidden behind an unqualified promise.

### Key flows

1. **Join (anonymous, 1 tap):** land → "Stay anonymous" pre-selected → tap "Join the room" → token minted handle `Anonymous` → session. No typing.
2. **Join (named, 2 interactions):** tap "Use a name" → autofocused input → type → CTA → handle persisted to `localStorage` `HK` key as today.
3. **Per-phase instruction:** facilitator advances → `getPublicState` computes `instruction` + `attribution` for the active module **alongside** `view` → host route returns the authoritative state via `navState`/`getFacilitatorState(room, written)` → client applies (rev-guarded) via `usePolledState.apply` → `PhaseHeader` renders the new band atomically with the new module. No frame of new-module-under-old-instruction.
4. **Anonymity confirm at keystroke:** the chip is already visible in the header; on a named phase the submit area echoes "Shared as `<handle>`".

---

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/modules/attribution.ts` | `Attribution` union (`'facilitators-only' \| 'named' \| 'none'` for MVP; `'anonymous-strict'` reserved/typed but never emitted until D1.1), the `resolveAttribution(mod, ctx)` default-from-capabilities helper, and the per-regime copy map (chip label + one-sentence guarantee). Server-safe/type-only so `store.ts` and the client chip share the shape. |
| `/Users/jordan/workshop/edges-v2/components/PhaseHeader.tsx` | New participant band: instruction line (accessible heading) + `AttributionChip` (`aria-expanded` button, expandable guarantee sheet). Pure function of `{ instruction, attribution, handle }`. Hooks above early returns; PascalCase; no `Set` spreads / `.entries()`. |
| `/Users/jordan/workshop/edges-v2/test/instruction-attribution.test.ts` | Vitest (in-memory store): instruction substitution + ~90-char cap; attribution per regime; throwing-computeView still returns instruction/attribution; actionable-module-has-default assertion; capture token-anonymity guard test (see Test plan). |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/modules/types.ts` | Add optional `instruction?(ctx: ModuleContext): string \| undefined` and `attribution?(ctx: ModuleContext): Attribution` to `ModuleServerDef`. Export `Attribution`. Add `resolveAttribution(mod, ctx)` beside `resolveVisibility`. |
| `lib/types.ts` | `PublicState`: add `instruction: string \| null` and `attribution: Attribution \| null`. (`PhaseConfig.instruction?` is **deferred to D1.2** — not added in MVP.) |
| `lib/store.ts` | In `getPublicState`, compute `instruction` + `attribution` **OUTSIDE** the `computeView` try/catch (the try at ~:773 nulls only `view`); both null-safe; populate the two new fields; they flow through `getFacilitatorState`/`navState` unchanged. |
| `lib/modules/registry.server.ts` | Add static `instruction` strings + `attribution` resolvers to in-file defs (lobby/content/close → `none`; capture → config resolver, never visibility-default; etc.). Reuse `substitute()` for instruction token replacement. **Extend `substitute()` to also replace `[PARTNER]`** (today it only does `[LENS]`/`[SIDE]`; the coordinator handles `[PARTNER]` inline) so an instruction referencing `[PARTNER]` substitutes correctly. Export `substitute` (or a thin `substituteInstruction`) for `store.ts`. |
| `lib/modules/defs/equity.server.ts` | Add `attribution` resolver reading `ctx.config.anonymize` (default true via `!== false`) → `facilitators-only` either way for MVP (peers never see identities); add instruction default. |
| `lib/modules/defs/spectrogram.server.ts` (+ brainwrite/redistribute/marketplace/fishbowl/consult/onetwofour/builder/gradient/lightning) | Add `attribution` (participant-anonymous → `facilitators-only`; lightning/consult/onetwofour/builder → `named`) + instruction default, computed per-module (no id hardcoding). |
| `components/ParticipantApp.tsx` | Rework `JoinScreen` (segmented anonymous/named control + collapsible disclosure). Render `<PhaseHeader>` between `<StatusBar>` and the `ErrorBoundary` in `PhaseScreen`, gated so it never shows an empty band. |
| `lib/modules/defs/gradient.client.tsx` | Remove the hardcoded "Where do you stand?…" line (:71); now supplied by the module instruction default (same commit). |
| `lib/modules/defs/lightning.client.tsx` | Remove the hardcoded "Keep it tight." line (:66); add "Shared as `<handle>`" submit echo for this named module (same commit). |
| `lib/strings.ts` | Replace verbose `joinBody`/`privacyLine` with the tightened one-liner + disclosure body (Copy section), kept to the off-the-record ethos incl. "Deleted when the session ends." |

### Data model

- **No durable schema change.** Account-less, ephemeral KV unchanged. **No new KV keys, no migration.**
- **Transport-only additions** on `PublicState` (computed per-request in `getPublicState`):
  - `instruction: string | null`
  - `attribution: Attribution | null` — `Attribution = 'facilitators-only' | 'named' | 'none'` in MVP; the union also reserves `'anonymous-strict'` (typed, never emitted until D1.1).
- `attribution` is **never persisted** — always recomputed from module + config, so it cannot drift.
- **No `view` shape change** — `instruction`/`attribution` sit at the top level of `PublicState`, beside `view`, not inside `ModuleView.data`.
- **Deferred (D1.2):** `PhaseConfig.instruction?: string` stored inside the existing `phases[]` array under the same 24h-TTL room key (absent = inherit module default). Not in MVP.

### API + host commands (+ capability gating)

- `GET /api/r/[room]/state` and the facilitator state route: response `PublicState` now includes `instruction` + `attribution` (**additive, back-compat**; older clients ignore unknown fields).
- **No host-command or capability changes in the MVP.** No `setPhases` payload change (override is deferred), so the `setPhases = 'configure'` admin gate is untouched — and the admin-vs-facilitator trap is **avoided entirely** for this cut.
- `POST /api/r/[room]/join` unchanged (already coerces empty handle → `Anonymous`, route.ts:16-20).
- `POST /api/r/[room]/action` unchanged.

### Rev / authoritative-apply (no KV read-back)

`instruction` + `attribution` are computed **inside** the same `PublicState` that the host route returns authoritatively via `navState → getFacilitatorState(room, written)` (store.ts). They ride the existing **monotonic `rev`** and are applied atomically with `view` by `usePolledState.apply` — **never a read-back** against eventually-consistent Upstash, so the anti-flash guarantee holds for free. Because they are computed **outside** the `computeView` try/catch, a throwing module that nulls `view` still returns a correct instruction/attribution (no stale-instruction stranding). `computeView` purity is preserved: instruction is a static string + `substitute()`, attribution is a config resolver — both AI-free and safe to run every 2 s in the poll path.

---

## Implementation plan (ordered, checkable)

**Stage 1 — contract + transport (verify green, no UI yet)**
1. [ ] Add `lib/modules/attribution.ts`: `Attribution` union, `resolveAttribution(mod, ctx)`, per-regime copy map.
2. [ ] `lib/modules/types.ts`: add optional `instruction?` / `attribution?` to `ModuleServerDef`; export `Attribution`; add `resolveAttribution` (default: `acceptsActions === false` → `none`; participant visibility hidden + facilitator visible → `facilitators-only`; else `named`).
3. [ ] `lib/types.ts`: add `instruction: string | null` + `attribution: Attribution | null` to `PublicState`.
4. [ ] `lib/store.ts`: in `getPublicState`, compute both **outside** the `computeView` try; populate fields; null-safe.
5. [ ] Write `test/instruction-attribution.test.ts` (cases below). `npm run verify` green — fields present, unused by UI.

**Stage 2 — per-module authoring + participant UI**
6. [ ] Extend `substitute()` in `registry.server.ts` to replace `[PARTNER]`; export it (or `substituteInstruction`).
7. [ ] Author static `instruction` defaults + `attribution` resolvers across all actionable modules in one pass. **capture.attribution is an explicit config resolver**, never the visibility fallback: `anonymity === 'anonymous'` → `facilitators-only` (MVP; becomes `anonymous-strict` in D1.1) else `facilitators-only`; with `tagWith` set, mark the qualified copy. lobby/content/close/media → `none`.
8. [ ] Add `components/PhaseHeader.tsx` (instruction heading + `AttributionChip`).
9. [ ] `components/ParticipantApp.tsx`: render `<PhaseHeader>` between `StatusBar` and the `ErrorBoundary`, gated against the empty band; rework `JoinScreen` (segmented control + disclosure).
10. [ ] Remove gradient (:71) and lightning (:66) ad-hoc lines **in the same commit** as their module defaults; add the lightning "Shared as `<handle>`" submit echo (+ consult/onetwofour/builder echoes).
11. [ ] `lib/strings.ts`: swap `joinBody`/`privacyLine` for the tightened copy.
12. [ ] Add the verify-time assertion: every module with `capabilities.acceptsActions === true` supplies a non-empty `instruction` default (or an explicit opt-out). `npm run verify` green.

**Stage 3 — manual smoke** (see Test plan).

---

## Acceptance criteria (facilitator-outcome framed)

1. **Every actionable phase self-narrates.** Advancing into any module with `acceptsActions === true` shows a one-line instruction band under the status bar before the participant interacts. No actionable module ships without a default (enforced at `npm run verify`).
2. **No false privacy claim ever renders.** The chip shows only **Facilitators only** or **Named**. Capture-anonymous renders as **Facilitators only** (honest), never "Anonymous", until D1.1. Where a tag is attached, the guarantee sheet states the tag is still visible.
3. **No projector-name surprise.** On lightning/consult/onetwofour/builder the chip reads **Named** and the submit area echoes "Shared as `<handle>`" before submission.
4. **Join is one tap for anonymity, two for a name.** Default lands on "Stay anonymous"; the ~70-word prose is collapsed behind "How this stays private".
5. **No flash / no read-back.** The instruction + chip change atomically with the module view; a host advance never shows the new module under the old instruction. Verified by the authoritative-apply path (no KV read-back).
6. **A broken module never strands the band.** If `computeView` throws (view → null → "Look up at the screen."), the instruction/attribution are still correct (or null), never stale.
7. **Zero facilitator authoring overhead** in this cut — defaults are automatic; no builder field, no capability confusion.

---

## Test plan

### Vitest (`test/instruction-attribution.test.ts`, in-memory store)
- `getPublicState` returns the correct **instruction** for capture/gradient/lightning, **token-substituted** (`[LENS]`/`[SIDE]`/`[PARTNER]`), and **capped at ~90 chars** (over-length input truncated server-side at a word boundary).
- **attribution per regime:** capture `anonymity` undefined → `facilitators-only`; `named` → `facilitators-only` (named-to-facilitator-only, NOT `named`); `anonymous` → `facilitators-only` (MVP) with the tagWith-qualified copy flag set when `tagWith` present; equity `anonymize` true/false → `facilitators-only`; lightning/consult/onetwofour/builder → `named`; lobby/content/close → `none`.
- **capture never resolves to `named`** via the visibility fallback (explicit-resolver guard).
- **throwing `computeView`** still returns a correct instruction/attribution (computed outside the try); `view` is null.
- **actionable-module-has-default:** iterate `SERVER_MODULES`; assert every `capabilities.acceptsActions === true` module yields a non-empty instruction for a representative config.
- **Privacy guard (locks the must-fix):** for an `anonymity: 'anonymous'` capture phase in the MVP, assert the chip copy is **never** the "not even the facilitators" string — i.e. `attribution !== 'anonymous-strict'`. (When D1.1 lands, this test flips to assert that no persisted submission for that phase retains a `token` that maps to a real participant handle.)

### Manual QA — mobile (participant phone)
- Join with **Stay anonymous** (1 tap) → enter session, handle is `Anonymous`. Join with **Use a name** (input autofocuses, 40-char cap) → handle persists across refresh (localStorage `HK`).
- Advance through capture (anonymity undefined), gradient, lightning(named): band shows the right one-liner each time; chip states are **Facilitators only** / **Named**; tapping the chip expands the guarantee sheet and collapses on tap-away.
- Capture with `anonymity: 'anonymous'` + `tagWith: 'lens'`: chip = **Facilitators only**, guarantee sheet says "Your lens is still attached." (never an unqualified "Anonymous").
- Named phase: submit area echoes "Shared as `<handle>`".
- Long instruction wraps to **2 lines max**, no mid-word truncation; band never shows empty on lobby/content/close.
- Reconnect: band rides last-good state under the ReconnectBanner.
- Screen-reader (VoiceOver/TalkBack): instruction announced once on phase change (not re-announced on every 2 s poll / SSE tick — gate `aria-live` on `phaseId`/instruction change, not on every apply); chip is a real button with `aria-expanded`.

### Manual QA — projector
- Advancing phases on the projector and the host console: no flash of new-module-under-old-instruction (authoritative-apply). Projector view unaffected (band is participant-only in MVP).

---

## Privacy & ethos check (explicit)

- **This item touches privacy-facing copy** (`strings.ts` join prose) and **surfaces** per-phase attribution. It **strengthens, never weakens** the off-the-record contract: the only chip states shipped are **Facilitators only** (true today) and **Named** (disclosed up front, preventing the projector-name surprise).
- **The flagship "not even the facilitators" claim is BLOCKED in the MVP.** Capture-anonymous strips `Submission.handle` but still persists `Submission.token` (registry.server.ts), and `getFacilitatorState` ships both `submissions[]` (with token) and `participants[]` (token→handle). Shipping the strong chip now would convert a true-but-vague promise into a **false-but-precise** one — a net trust regression. It is gated behind **D1.1**, which makes storage actually token-anonymous first.
- **tagWith is never over-promised:** the qualified copy states the lens/side tag remains visible.
- **No durable storage, no accounts, no TTL change, no new logging.** `PublicState` additions are transport-only; nothing new is persisted. The ephemeral/account-less ethos is intact.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **[CRITICAL — resolved by deferral] False "not even facilitators" claim.** Capture-anonymous persists the token. → **Mitigation:** the anonymous-strict chip is **not in the MVP**; capture-anonymous renders **Facilitators only**. D1.1 makes storage strict (write `token = null` for anonymous capture + strip token from facilitator `submissions[]`) and adds the strong chip + a Vitest proving no token→handle linkage survives.
2. **[CRITICAL — resolved] Resolver mislabels capture.** Capture's `anonymity` is optional/undefined-default, and the visibility-default would mislabel. → **Mitigation:** capture has an **explicit config resolver** that never returns `named`; all three configs (undefined/named/anonymous) + tagWith are unit-tested.
3. **[MAJOR — resolved] tagWith over-promise.** Tag persisted and shown to facilitator. → **Mitigation:** qualified copy in the resolver (has `ctx.config.tagWith`); decided before build, not a fast-follow.
4. **[MAJOR — resolved] Builder override re-creates the admin-vs-facilitator trap** (`setPhases = 'configure'`). → **Mitigation:** the override is **cut from the MVP entirely** (option b). Defaults deliver ~90% of the value with zero capability surface. When D1.2 ships the override it will be explicitly labelled admin-only in the builder.
5. **[MAJOR — resolved] Scope creep (6.5 d / ~26 modules + builder + AI + host).** → **Mitigation:** cut to the 3.0-day honest core; AI/host-parity/override deferred.
6. **[MAJOR — resolved] `[PARTNER]` not substituted.** Shared `substitute()` only does `[LENS]`/`[SIDE]`. → **Mitigation:** extend `substitute()` to also replace `[PARTNER]` (Stage 2 step 6) before any instruction uses it.
7. **[MINOR — resolved] aria-live double-announce** on the 2 s poll + SSE path. → **Mitigation:** gate the announcement on `phaseId`/instruction-string change, not on every state apply; covered in manual SR QA.
8. **[MINOR — resolved] Removing ad-hoc lines leaves a gap.** → **Mitigation:** verify-time assertion that every actionable module has a default; land each default in the **same commit** that removes its ad-hoc line.
9. **[MINOR — N/A in MVP] Uncapped AI instruction length.** Deferred with the AI passthrough (D1.3); when added, cap in `design.ts buildPhases` AND `getPublicState`, with `line-clamp-2` in CSS and an over-length test.

---

## Out of scope / future

- **D1.1** Anonymous-strict storage + the "not even the facilitators" chip (token-stripping at write + facilitator-payload strip + linkage Vitest).
- **D1.2** Per-phase `PhaseConfig.instruction` override (admin-gated, labelled in `BuilderApp`) + host **"What they see"** `PhaseHeader` parity + read-only "Attribution: …" indicator in the phase editor.
- **D1.3** AI authoring: `design.ts suggestSession`/`reviseSession` emit/rewrite instructions, `critiqueSession` flags missing/over-long lines, author-time length cap.
- A room-level "show anonymity chips" toggle — intentionally **not** built; always-on, collapsed is the trust default.
- Projector-facing attribution display — participant band only in this cut.
