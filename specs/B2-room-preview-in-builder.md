# B2 — Per-module "what the room sees" live preview in the builder

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** 7 days (re-baselined from the 4.5-day design estimate — see Risks. The original estimate assumed "26 trivial literals"; in practice the unfamiliar modules that justify the feature — spectrogram, gradient, synthesis, needs, marketplace, minspecs — need config-reactive sample factories that reuse real `computeView` helpers, which is the bulk of the work. The MVP cut below is ~3 days.)
- **Dependencies (item ids):** none hard. Plays well alongside **B1** (agenda/arc timeline) — both operate on the builder's `phases[]` state and can share the "walk the arc" mental model, but neither blocks the other. No dependency on any server/host/AI item.

This is a **purely client-side, design-time, read-only** feature: no server endpoint, no host command, no capability, no KV read/write, no `rev`, no AI in the live path. It does not touch the authoritative-apply or polling machinery at all.

---

## Problem & facilitator value

### Problem

A facilitator composing a session in the builder (`/r/[room]/build`, `components/BuilderApp.tsx`) picks from a flat palette of ~26 modules by **name + one-line description** (`SERVER_MODULES[k].meta.description`) and an auto-generated config form (`AutoForm`). They cannot see what "Spectrogram", "Gradient", "Two-by-Four", "Marketplace", or "Min Specs" will actually put on the participant phone and the projector **until they launch it into a live room with real people.**

This is the "what is a spectrogram" freeze: the builder is the one place a facilitator commits a method **sight-unseen**, and the cost of guessing wrong is paid in front of a live audience. The only previews that exist today are in the **host console** (`components/HostConsole.tsx` `PreviewPanel`, lines 251–302), which require an **already-running session** — useless at design time. So the builder forces a blind commit, undercutting the platform's core bet that named methods are just configured chains of a few primitives: you can't trust a chain you can't see.

### Facilitator value (in the facilitator's voice)

> "I'm building a session and I hit a module called *Spectrogram*. I have no idea what my group will actually see on their phones — and I am NOT going to find out for the first time standing in front of 30 people. I want to tap it, see the phone, see the projector, type my own statement and watch it change, and *then* decide whether to keep it. When the AI suggests a sequence full of names I don't know, I want to look before I trust it. Make the palette something I can browse and learn from, not a list of jargon I have to take on faith."

Net: removes the single biggest source of pre-session anxiety ("I don't know what my group will see"), turns the palette into a browsable tactile catalog that teaches the primitive vocabulary, and de-risks the AI designer (every unfamiliar module name now comes with a look-before-you-trust preview). Fewer launched-then-abandoned sessions, faster design, builder becomes a teaching surface.

---

## MVP cut (thinnest shippable) and Full vision

The pressure-test's headline finding: **the freeze is killed by per-card preview of the unfamiliar modules.** The storyboard ("Preview all") and the HostConsole→RoomMockup extraction are both fast-follows that add surface area / regression risk for a smaller win. Ship the freeze-killer first.

### MVP (thinnest shippable, ~3 days)

1. **Per-card "Preview the room" toggle** on each phase card in the Sequence, expanding an inline phone + projector mockup fed config-reactive sample data, live-bound to the form.
2. A **new `components/RoomMockup.tsx`** holding the phone/projector chrome (built fresh, copying `PreviewPanel`'s classes — NOT yet refactoring HostConsole; see Risk R6).
3. A **`lib/modules/sample-views.tsx`** sample-factory table + `getSampleView()` accessor, covering **all modules with a participant renderer**, with the graceful "Preview coming for this module" fallback as defense-in-depth.
4. The **coverage + correctness + privacy test** (`test/sample-views.test.ts`).

The MVP explicitly **defers**: the "Preview all" storyboard, and the HostConsole refactor to use `RoomMockup`.

### Full vision (fast-follows)

5. **"Preview all (n)" storyboard** atop the Sequence — a scrollable flipbook of every phase's phone+projector mockup in order, with a sticky Close / Launch footer (launch reuses the exact primary `launch()` path; see Risk R5).
6. **Refactor `HostConsole.PreviewPanel` to render `RoomMockup`** so phone/projector chrome lives in one place — landed as its own behaviour-preserving slice with a render test proving the host preview is byte-identical (Risk R6).
7. Optional: a one-shot `Reveal`-stagger entrance on sample data to gently convey live-ness (calm, not animated-over-time).

---

## Experience & flows

**Aesthetic:** calm, instant, never-wrong. Matches the room — dark surface, accent dot, same fonts — so the preview reads as "this is literally your room." Inline panels, **never a modal**. Read-only and inert (`act = async () => false`, `pointer-events-none`) so nothing can be submitted.

### Screens & states

- **Phase card — collapsed (unchanged + one button):** existing card (number, module name, id, description, `AutoForm`, Advanced toggle, validity error) gains a **"Preview the room ▸"** text button next to the Advanced (JSON) toggle (`BuilderApp.tsx` ~798–806), same muted dotted-underline styling.
- **Phase card — preview expanded:** an inline region below the form containing
  - (a) a **phone frame** (`mx-auto max-w-sm overflow-hidden rounded-xl border border-border bg-bg`, inner `pointer-events-none relative max-h-[460px] transform-gpu overflow-y-auto`) with the **participant** renderer,
  - (b) a **projector frame** (`overflow-hidden rounded-xl border bg-bg text-sm [&_*]:!text-sm`, inner `pointer-events-none relative max-h-[360px] transform-gpu overflow-y-auto`) with the **projector** renderer,
  - (c) caption **"Sample data — your room will fill this in live."**,
  - (d) a **"▾ Hide preview"** toggle.
  Both frames `pointer-events-none` + `ErrorBoundary`-wrapped with a **"Preview unavailable."** fallback.
- **No-participant-view state:** phone frame shows **"Participants have no interactive screen in this phase."** (exact `PreviewPanel` copy); projector frame still renders if a projector renderer exists.
- **No-projector state (capture, coordinator):** render the phone frame only; omit the projector frame (mirror `PreviewPanel`'s conditional on `getClientRenderer(id,'projector')`).
- **No sample-data state (fallback only):** if a module has no sample factory, the frame shows a quiet **"Preview coming for this module."** — graceful, never a crash. Goal is 100% coverage so this is defense-in-depth.
- **Invalid-config state:** if the current config fails `validateConfig` (`BuilderApp.tsx` 143, `valid` at 768), show the existing red message style inline: **"Fix the highlighted field to preview."** instead of attempting to render with bad data.
- **AI-module caption variant:** AI modules (devil/friction/synthesis/needs/persona/emptychair/issuemap/promptrelay/builder) use a **distinct** caption — **"Illustrative example — your room generates its own."** — and where natural surface the `AiGenerating` shimmer, so the facilitator sees the *shape* of the payoff without being taught to expect a specific generated result (Risk R3 / must-fix).
- **Storyboard overlay ("Preview all", full vision):** a full-width scrollable column, one block per phase in order, each = "N. Module name" + phone mockup + projector mockup, with a sticky **Close** / **Launch into room** footer. `Launch` calls the **exact** primary `launch()` (Risk R5). Hidden when `phases.length === 0`.

### Key flows

1. **Audition an unfamiliar module:** click `+ Spectrogram` → new phase card with `defaultConfig` → click "Preview the room" → phone frame renders the spectrogram with a sample distribution + a "you're here" handle, projector renders the histogram with pole labels → facilitator instantly understands a spectrogram and keeps or removes it.
2. **Tune-while-watching:** edit "Pole labels" and "Statement" in `AutoForm` → `setConfig` fires (`BuilderApp.tsx` 568) → the open preview re-derives `getSampleView(config)` (memoized by `JSON.stringify(config)`) and re-renders within the same poll-free React update → poles and statement update live in both frames. No save, no launch, no round-trip.
3. **Trust the AI designer:** run "Suggest a session" → phases populate with unfamiliar modules → expand each phase's preview → accept the plan or remove the one phase whose mockup doesn't fit.
4. **Walk the arc (full vision):** click "Preview all (n)" → storyboard lists every phase in order with mockups → scroll the whole session as the room will experience it → close and launch.
5. **Graceful unknown:** preview a display-only / facilitator-only module → phone shows "Participants have no interactive screen in this phase." and the projector renders → absence is explained, not blank.

---

## Architecture: files, data model, API, capability, rev

### Approach (with the pressure-test's correction folded in)

Pure client React over the existing `phases[].config` object. The builder already holds the live config (`BuilderApp.phases[i].config`, mutated by `setConfig` at 568); `getClientRenderer(moduleId, role)` + `ErrorBoundary` already mount renderers read-only. The **only** new infrastructure is **config-reactive sample view data**.

**Correction folded in (must-fix #1):** the design's stated reason for rejecting a server-computed preview — "computeView is async + server-only because it calls `ctx.store.readVotes`" — is **wrong**. `async` is a non-issue (a `useMemo`/effect awaits fine) and `readVotes` works against the in-memory store the dev/test build already uses. The **real** blocker is the **client bundle boundary**: `defs/*.server.ts` import `zod` + the store module, so they can't cross into the client bundle. Given that, we choose **client-side hand-authored sample factories** for P0 — but with a hard rule to **avoid the drift hazard (must-fix #1):**

> **Factories MUST reuse the real `computeView` aggregation helpers, never re-derive them.** For complex modules (spectrogram's `histogram`/`meanOf`/`clamp01`/bin-branch; gradient/synthesis/needs/marketplace/minspecs equivalents), export those pure helpers from the relevant `defs/<id>.server.ts` into a **pure, store-free, zod-free** sibling — `defs/<id>.compute.ts` — and import it from BOTH the server def AND the sample factory. The factory authors only the **synthetic input** (a hand-made set of sample votes/submissions), then runs it through the same math the room runs. This makes the sample faithful by construction and keeps it from silently lying when `computeView` changes. Where a helper cannot be cleanly extracted, the coverage test (below) is the backstop.

Server-compute-over-synthetic-`ModuleContext` remains the documented escape hatch for any single module whose view logic is too tangled to mirror — revisit per-module, not wholesale.

### New files

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/components/RoomMockup.tsx` | Shared phone+projector mockup chrome. Props `{ moduleId, view, projectorView?, phaseId, caption?, showProjector? }`. Mounts `getClientRenderer(moduleId,'participant'\|'projector')` read-only (`act=async()=>false`, `token=""`, `handle=""`, `pointer-events-none`, `transform-gpu`, `max-h` scroll, `[&_*]:!text-sm` projector shrink) inside `ErrorBoundary` with "Preview unavailable." fallback. Takes **separate** participant + projector payloads (don't leak facilitator-only fields onto the phone). Omits the projector frame when no projector renderer; shows "Participants have no interactive screen in this phase." when no participant renderer. Built fresh for the builder in MVP; HostConsole adopts it in the fast-follow slice. |
| `/Users/jordan/workshop/edges-v2/lib/modules/sample-views.tsx` | The one new infra piece. `SAMPLE_VIEWS: Partial<Record<ModuleKind, (config: Record<string, unknown>, role: Role) => unknown>>` of config-reactive factories, each constructing one literal of that module's already-exported View type (`SpectrogramView`, etc.) by feeding **synthetic input through the reused `compute.ts` helpers**. Plus `getSampleView(moduleId, config, role)` accessor (mirrors `getClientRenderer`; returns `null` when no factory). Imports View types **type-only** and `compute.ts` helpers (pure) — **no server/store/zod runtime** crosses into the client bundle. Populates a plausible non-null `mine`/distribution/results so previews show the interactive/payoff state. AI modules return a representative result and/or shimmer state. |
| `/Users/jordan/workshop/edges-v2/lib/modules/defs/<id>.compute.ts` | (per complex module, as needed) Pure, store-free, zod-free extraction of the aggregation helpers (`histogram`, `meanOf`, `clamp01`, stage resolution, etc.) currently inline in `<id>.server.ts`. Imported by BOTH the server def and the sample factory so there is exactly one implementation. |
| `/Users/jordan/workshop/edges-v2/test/sample-views.test.ts` | Coverage + correctness + privacy test (see Test plan). Runs on in-memory store, no KV/AI. |

### Changed files

| Path | Change |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/modules/render-kit.tsx` | Extend the `ClientModule` interface (line 34) with optional `sampleView?: (config: Record<string, unknown>, role: Role) => unknown`. Kept optional (existing defs still typecheck). The **authoritative** sample table lives in `sample-views.tsx`; this field documents the intent for the module checklist. No behavioural change. |
| `/Users/jordan/workshop/edges-v2/components/BuilderApp.tsx` | Add `previewOpen?: boolean` to `BuilderPhase` (line 10). Add `togglePreview(i)` next to `toggleAdvanced` (571). In the phase-card footer (798–806) add a "Preview the room ▸ / ▾ Hide preview" button beside the Advanced toggle. Below the form, when `previewOpen`: gate on `valid` (768) — if invalid show "Fix the highlighted field to preview.", else compute `useMemo`'d participant + projector sample views via `getSampleView(p.moduleId, p.config, role)` keyed by `[p.moduleId, JSON.stringify(p.config)]` and render `<RoomMockup>` + caption (AI-variant caption for AI modules). (Full vision) Add "Preview all (n)" link above the Sequence header (760), hidden when `phases.length === 0`, toggling a storyboard overlay; the overlay maps phases to labelled `RoomMockup`s with a sticky Close / Launch footer reusing `Button` + the existing `launch()`. Import `RoomMockup` and `getSampleView`. |
| `/Users/jordan/workshop/edges-v2/components/HostConsole.tsx` | **(Full-vision slice 6 only, not MVP.)** Refactor `PreviewPanel` (251–302) to render `<RoomMockup moduleId={state.moduleId} view={state.view.data} projectorView={state.view.data} phaseId={state.phaseId} />`, deleting duplicated frame JSX. Behaviour-preserving — host still feeds the real server-computed view to both surfaces (`view === projectorView`). `ResultsPanel` left as-is for now. Land behind its own verify pass + render test (Risk R6). |

### Data model

**No persisted data model changes. No KV keys, no `SessionState`, no `rev`.**

- New in-memory shape: the sample-factory table `Partial<Record<ModuleKind, (config, role) => unknown>>`, each factory returning an existing exported View-type literal (e.g. `SpectrogramView` with a hand-fed synthetic distribution run through the real `histogram`/`meanOf`, a non-null `mine`, and — for the participant role — `reasons: []` because reasons are facilitator/projector-only per `spectrogram.server.ts:65–67`).
- `BuilderPhase` gains one transient UI flag `previewOpen?: boolean`.
- The builder's existing `config` object is reused unchanged as factory input, so previews are live-bound to the form.

View shapes are the already-exported types (`SpectrogramView` at `spectrogram.server.ts:45`; `views.ts`; per-module `*View` exports). The `.client.tsx` files already type-only-import them, confirming a type-only import into `sample-views.tsx` is safe and won't pull server/store runtime into the client bundle.

### API + host commands + capability gating

- **None.** No new endpoint, no change to `app/api/r/[room]/host/route.ts`, no new host command, no change to `COMMAND_CAP`.
- **Capability gating: UNCHANGED.** The preview is design-time and read-only, so it needs no capability. The existing `configure`-for-`setPhases` gotcha on launch is untouched. (The storyboard's "Launch into room" routes through the **exact** existing `launch()` — including its 403 handling that shows the "needs the room's ADMIN passcode" message — so the gotcha cannot surface as a new, more confusing failure; Risk R5.)

### Rev / authoritative-apply

**Not involved.** Nothing is written, so there is no write-then-show, no read-back, no `navState`/`getFacilitatorState` authoritative-apply, no `usePolledState.apply`. The feature is entirely client React state over `phases[].config`. This is explicitly compliant with the "any new write-then-show flow MUST use authoritative-apply" rule because there is no write-then-show flow.

---

## Implementation plan (ordered, checkable)

**Slice 1 — RoomMockup chrome (MVP)**
- [ ] Create `components/RoomMockup.tsx` copying the exact phone/projector frame classes from `PreviewPanel` (261, 266, 287, 288): `mx-auto max-w-sm …`, inner `pointer-events-none relative max-h-[460px] transform-gpu overflow-y-auto`; projector `[&_*]:!text-sm`, `max-h-[360px]`.
- [ ] Props `{ moduleId, view, projectorView?, phaseId, caption?, showProjector? }`; `act = async () => false`, `token=""`, `handle=""`.
- [ ] Resolve renderers via `getClientRenderer`; conditionally render phone / projector; wrap each in `ErrorBoundary` (`label`, `resetKey={phaseId}`, fallback "Preview unavailable.").
- [ ] No-participant copy: "Participants have no interactive screen in this phase."

**Slice 2 — sample-views table + coverage test (MVP)**
- [ ] Extend `ClientModule` in `render-kit.tsx` with optional `sampleView`.
- [ ] Create `lib/modules/sample-views.tsx` with `SAMPLE_VIEWS` + `getSampleView`.
- [ ] For each **complex** module (spectrogram, gradient, synthesis, needs, marketplace, minspecs): extract aggregation helpers into `defs/<id>.compute.ts`, re-import them in `<id>.server.ts` (behaviour-preserving), and author a factory that feeds **synthetic votes/submissions** through them.
- [ ] For each **simple** module: author a direct config-reactive literal.
- [ ] Populate a plausible non-null `mine`/distribution/results; for role-split modules feed participant-role samples WITHOUT facilitator-only fields (e.g. `reasons: []`).
- [ ] AI modules: return a representative result and/or `AiGenerating` shimmer state.
- [ ] Create `test/sample-views.test.ts` (coverage + correctness + privacy). `npm run verify`.

**Slice 3 — per-card preview wiring (MVP, the freeze-killer)**
- [ ] Add `previewOpen?: boolean` to `BuilderPhase`; add `togglePreview(i)`.
- [ ] Add "Preview the room ▸ / ▾ Hide preview" button in the card footer next to Advanced.
- [ ] On open: gate on `valid`; invalid → "Fix the highlighted field to preview."; valid + factory → `useMemo`'d `getSampleView` (key `[moduleId, JSON.stringify(config)]`) → `<RoomMockup>` + caption (AI-variant for AI modules); no factory → "Preview coming for this module."
- [ ] Verify config-reactivity end-to-end: editing a sample-relevant field in `AutoForm` re-renders both frames (Risk R4 — confirm each such field is form-editable, not JSON-only).
- [ ] `npm run verify` + build on Node 24.

**Slice 4 — "Preview all" storyboard (full vision)**
- [ ] Add "Preview all (n)" link above the Sequence header, hidden when `phases.length === 0`; toggle storyboard overlay state.
- [ ] Render labelled `RoomMockup`s in order; sticky Close / Launch footer; Launch = the **exact** existing `launch()`, same disabled/403 treatment.

**Slice 5 — HostConsole adopts RoomMockup (full vision)**
- [ ] Refactor `PreviewPanel` to render `<RoomMockup>` with `view === projectorView`.
- [ ] Add a render test asserting `RoomMockup` with `view===projectorView` reproduces the old `PreviewPanel` output.
- [ ] Verify-pass confirming the host preview is visually unchanged before merge.

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. **Audition without launching:** From a fresh builder, a facilitator can add `spectrogram` and, without launching or touching a live room, expand a preview that shows the participant phone (with a placed "you're here" handle) and the projector histogram with the configured pole labels.
2. **Tune-while-watching:** Editing the statement / pole labels / scale min-max / options in the form updates the open preview **in the same interaction** (no save, no network round-trip, no poll wait).
3. **Faithful, not stale:** The previewed aggregate (distribution/mean/results) is produced by the **same** helper code path as the live room, so it cannot silently diverge from what `computeView` would render for that config.
4. **Coverage:** Every module that has a participant renderer renders a non-crashing, non-empty preview (interactive/payoff state visible), OR shows the explicit "Preview coming for this module." fallback — never a blank or a crash.
5. **Privacy on the phone:** For role-split modules (e.g. spectrogram), the participant phone mockup never shows facilitator-only fields (`reasons` is empty on the phone).
6. **AI honesty:** AI-module previews are captioned as illustrative ("…your room generates its own.") and do not present a fake result as if it were generated for the room.
7. **Invalid config is safe:** With a config that fails validation, the preview shows "Fix the highlighted field to preview." rather than rendering with bad data.
8. **No regressions to the host:** After the HostConsole refactor (slice 5), the facilitator's live in-session preview is visually identical to before.
9. **Launch gotcha unchanged:** The storyboard "Launch into room" produces exactly the same behaviour and 403/admin-passcode guidance as the primary launch button.
10. **No privacy/state surface:** No KV key, no host command, no `rev`, no AI call, no submission can originate from any preview surface.

---

## Test plan

### Vitest (`test/sample-views.test.ts`, in-memory store, no KV/AI)

- **Coverage:** every `ModuleKind` in `CLIENT_MODULES` that has a `participant` renderer also has a factory in `SAMPLE_VIEWS` (the 100%-coverage guard; a new module can't ship a renderer without a sample).
- **Non-crash:** each factory's output renders without throwing for `defaultConfig` **and** for ≥2 mutated configs (e.g. flipped `mode`/`beforeAfter`, edited `poleLabels`, changed `min`/`max`/`multi`).
- **Payoff state (not just non-crash):** assert the sample exercises the interactive/payoff state — `mine != null` where the View has a `mine` field; `count > 0` / non-empty `distribution`/`results`/`words` where applicable. ("Doesn't throw" is too weak for a trust feature.)
- **Privacy invariant (encoded, not assumed):** for role-split modules the **participant-role** sample omits facilitator-only fields — e.g. `SpectrogramView.reasons === []` for `role === 'participant'`; `SynthesisParticipantView` shape for participant, `SynthesisFacilitatorView` only for facilitator/projector.
- **Faithfulness (drift guard):** for complex modules, assert the factory's aggregate equals running the **same** `compute.ts` helper over the factory's synthetic input (i.e. the factory and the test reference one implementation, not two).
- **Config-reactivity:** changing a sample-relevant config field changes the corresponding field in the factory output (e.g. new `statement` appears in `SpectrogramView.statement`).

### Render test (slice 5)

- `RoomMockup` with `view === projectorView` reproduces the old `PreviewPanel` DOM/structure for a representative module.

### Manual QA

- **Desktop:** add spectrogram / gradient / marketplace / minspecs → preview → confirm phone + projector read as "this is my room"; edit config → both frames react live.
- **Sticky footer containment:** preview a participant renderer that uses `StickyAction` (sticky/fixed submit bar) → confirm `transform-gpu` keeps the bar **inside** the phone frame, not floating over the builder.
- **No-projector modules:** preview `capture` / `coordinator` → phone frame only, no empty projector box.
- **No-participant modules:** preview a display-only phase → "Participants have no interactive screen in this phase."
- **Invalid config:** clear a required field → "Fix the highlighted field to preview."
- **AI modules:** preview `synthesis` / `devil` → illustrative caption + result/shimmer shape, not a polished fake "already generated" result.
- **Mobile / narrow viewport:** on a narrow builder width the phone + projector **stack** (phone first); storyboard is an inline overlay, not a modal; confirm scroll works and nothing overflows. (Confirm during QA whether the builder is ever used on a phone in practice; if desktop-only, stacking is still the correct narrow-width fallback.)
- **Projector surface:** open `/r/<room>/screen` for a launched session built via preview and confirm the live projector matches what the preview promised.

---

## Privacy & ethos check (explicit)

**No privacy/ethos violation — and the trust story is reinforced.**

- Writes/reads **nothing** from KV; runs **no AI** in the live path; touches **no** `SessionState`/`rev`/authoritative-apply.
- Inert by construction: `act = async () => false`, `pointer-events-none` — matching the existing `PreviewPanel` (254–295) which already mounts renderers read-only.
- Uses **hand-authored sample data only** (no real participant data ever flows through a preview).
- **Role-split invariant is a TEST, not a convention (must-fix):** `SpectrogramView.reasons` is facilitator/projector-only (`[]` for participants per `spectrogram.server.ts:65–67`); `SynthesisFacilitatorView` vs `SynthesisParticipantView`. The participant-role sample MUST NOT populate facilitator-only fields, and `test/sample-views.test.ts` asserts this so a sloppy factory literal can't leak `reasons` onto the phone mockup.
- Off-the-record contract, 24h TTL, anonymity, account-less: **untouched** — feature is design-time and account-less by construction.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

- **R1 — Sample-factory faithfulness / maintenance drift (major).** Complex modules' View types are computed aggregates; re-deriving `histogram`/`meanOf`/stage logic by hand creates a second implementation that silently lies when `computeView` changes. **Resolved:** extract those helpers into pure `defs/<id>.compute.ts`, reuse them in BOTH the server def and the factory; factories author only synthetic input. The faithfulness test asserts the factory's aggregate equals running the shared helper over that input. One implementation, drift-proof by construction.
- **R2 — Wrong reason for rejecting server-compute (major).** The "computeView can't run design-time" claim is false (async + in-memory `readVotes` are non-issues; the real blocker is the client bundle boundary). **Resolved:** spec states the correct tradeoff and keeps server-compute-over-synthetic-`ModuleContext` as a documented per-module escape hatch; client factories chosen for P0 speed/fidelity **with** the helper-reuse rule that removes the drift cost that motivated server-compute.
- **R3 — AI-module sample fidelity teaches false trust (major).** A polished fake result manufactures unwarranted trust in AI output. **Resolved:** AI modules use the `AiGenerating` shimmer and/or a clearly distinct caption ("Illustrative example — your room generates its own."), never presented as a real generation; synthesis authors the correct role-split shapes.
- **R4 — Config-reactivity gap vs AutoForm (minor).** A sample-relevant field reachable only via the Advanced-JSON toggle won't react under the "tune-while-watching" flow. **Resolved:** slice 3 includes a per-module check that every sample-reactive field is form-editable; where a field is JSON-only, either add a widget or scope the live-tuning promise to form-exposed fields.
- **R5 — Storyboard launch re-introduces the configure/advance gotcha (minor).** **Resolved:** storyboard Launch routes through the **exact** primary `launch()` (incl. its 403 → "needs the room's ADMIN passcode" message and disabled treatment); no parallel code path.
- **R6 — RoomMockup refactor risks the live host preview (minor).** Sharing chrome means a chrome bug now also breaks the facilitator's in-session preview. **Resolved:** RoomMockup is built fresh for the builder in MVP; the HostConsole adoption is a **separate** slice with a render test (`view===projectorView` reproduces old output) + a verify pass confirming the host preview is unchanged; host call site keeps feeding the real server-computed view to both surfaces.
- **R7 — Coverage test passes while previews are wrong (minor).** "Doesn't throw" with an empty distribution still passes yet shows the empty pre-interaction screen. **Resolved:** the test asserts the payoff state (`mine != null`, non-empty `distribution`/`results`/`words`) and the privacy invariant, not merely non-crash.
- **R8 — Effort underestimate.** 4.5 days assumed trivial literals. **Resolved:** re-baselined to 7 days (MVP ~3); helper extraction for the 6 complex modules is the bulk.

---

## Out of scope / future

- **Server-computed preview endpoint** for any module too tangled to mirror with `compute.ts` reuse (documented escape hatch; not built in P0).
- **Animated sample data over time** (dots arriving, distribution shifting). Static + optional one-shot `Reveal` stagger is calmer and cheaper for P0.
- **ResultsPanel** reuse of `RoomMockup` in HostConsole (left as-is).
- **Facilitator/upload surfaces** in preview (media `upload()` is facilitator-only; preview is participant/projector and inert, so `upload` is undefined — the projector media sample uses a placeholder slide, no real Blob URL).
- **In-builder "teach me this method" copy / tooltips** beyond the mockup itself.
