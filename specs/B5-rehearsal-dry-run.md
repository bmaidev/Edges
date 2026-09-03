# B5 — Rehearsal / dry-run mode

> Final executable build spec. The pressure-test must-fixes are folded in — this
> document is already corrected; build it as written.

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 4 days (MVP cut below). Full vision ~7 days; the deferred extras are scoped as a fast-follow, off the critical path.
- **Depends on (item ids):** none hard. Synergistic with the B-series design tools (B1–B4 builder/AI-designer) — rehearsal is how a facilitator pressure-tests an AI-suggested session experientially. No blocking dependency.
- **Touches existing seams (not item deps):** `lib/store.ts` (`getPublicState`/`getFacilitatorState`/`dispatchAction`/seeding helpers, all already `roomId`-parameterized), `lib/session.ts` (`roomKeys`), `lib/auth.ts` (capability matrix), `components/HostConsole.tsx` (`PreviewPanel` reuse), `components/BuilderApp.tsx` (entry button).

## Problem & facilitator value (facilitator's voice)

"I design a session — brainwrite → synthesis → dot-vote — or pick a template, and then I walk into a real room having literally never seen it run. The only way to know what each phase puts on a participant's phone and on the projector, and whether the arc flows, is to launch it live and click through. But with zero or one person, every group/rotation/vote module reads empty or degenerate — World Café shows no tables, the poll shows no bars, dot-vote has nothing to tally, the read-around has no cards. And clicking through live burns the room's real state, so a half-rehearsed session could be exactly what people join into.

What I want: sit alone the night before, press one button, and walk my whole session as if 12 people were in it — every phone, the projector, my own console, for every phase — then tweak prompts and timing and re-walk. Without touching the live room, without a second device, without dragging in a colleague. I want to catch 'the dot-vote only shows 5 options but I wrote 8', 'the [LENS] token reads awkwardly', 'synthesis has nothing to chew on because I forgot to point it at the capture phase', 'this phase is display-only so my injected note won't show' — *before* it matters. And I never want a rehearsal to leak into the live room or leave real data anywhere."

## MVP cut (thinnest shippable) vs Full vision

### MVP (4 days) — "felt walkthrough, honestly populated"

1. **Real ephemeral KV shadow room** keyed `${slug}::rehearsal:${nonce}`, isolated by `roomKeys()`. Reuses store/registry/computeView/dispatchAction/renderers wholesale.
2. **One `rehearse` endpoint** with commands `start`, `setPhase`, `setCast`, `reseed`, `moduleAction`, `seeAs`, `end`. Gated on a NEW `rehearse` capability (admin + facilitator + cohost), NOT `configure`.
3. **Cast seeding for ~5 high-value module families** via a **co-located, type-checked per-module seed hook** (`seedRehearsal?` on `ModuleServerDef`). Every un-seeded module renders **honestly empty with a chip** ("no synthetic data for this module yet") — never fake-populated, never silently empty.
4. **Three-up Rehearsal Theatre**: phone + projector + host-strip, reusing `PreviewPanel`'s renderer mounts + `ErrorBoundary` + transform-gpu trick verbatim; `PhaseStepper`-based scrubber with Back/Next and per-phase + planned-total timing.
5. **See-as switcher** (participant frame flips between synthetic cast members, incl. an unallocated case so `[LENS]/[SIDE]/[PARTNER]` substitution and its absence are both inspectable).
6. **AI policy, explicit:** keyed → real `dispatchAction` (genuine synthesis/devil). Unkeyed → honest **"AI not configured — this phase will be blank live too"** chip (real, useful feedback). No fake AI output in MVP.
7. **Accessible dialog**: `role="dialog"` + `aria-modal`, focus trap, ESC + "Done rehearsing" both exit and restore focus, `aria-live` phase/banner announcements. Preview frames inert; only host strip + scrubber interactive.
8. **Entry points:** builder ("Rehearse this design") + host console Session tab / ModeSelector empty-state ("Walk through before going live").
9. **Explicit teardown** that `del`s the shadow **state key too** (a rehearsal-only variant of `endSession`, guarded by `isRehearsalRoom()`), atop the 24h TTL backstop.

### Full vision (fast-follow, +~3 days)

- **Auto-issue / punch-list engine**: derive "capture has no downstream consumer", "display-only phase swallows injected content", "missing allocation for a token-substitution phase", "AI unconfigured", plus freeform per-phase notes collected into an exit punch-list.
- **Canned AI sample library** (`lib/rehearsalSamples.ts`): when unkeyed, write the module result cache directly (e.g. `votes['__ai__']`) so AI modules *demonstrate* their dynamic — documented as a rehearsal-only seam that **bypasses `handleAction`** (because `handleAction` hard-refuses without a key). A "use real AI in rehearsal" toggle when keyed.
- **Persona/topic-aware seeding** (ties to the persona module) so fake submissions read like real contributions, not "Idea 1, Idea 2".
- **Mobile tabbed polish** (Phone | Projector | You) beyond the MVP stacked fallback.
- **Re-runnable cast + notes** so a facilitator can rehearse, tweak in the builder, and re-rehearse the same crowd for a fair before/after.

## Experience & flows (screens, states, copy)

### Entry points

- **Builder** — "Rehearse this design" button next to "Launch into room". Enabled once phases validate locally. **Requires ANY facilitator-tier+ passcode (the new `rehearse` cap) — NOT the admin passcode.** Reuse the existing builder `code` field; if empty, show the same inline prompt the AI tools use: *"Enter your facilitator passcode above first — rehearsal needs it (no admin passcode required)."*
- **Host console** — Session tab and ModeSelector empty-state: "Walk through before going live." Uses the session's CURRENT resolved sequence (`state.phases` or resolved mode/template) as the rehearsal script.

### Rehearsal Theatre

- **Persistent banner** (aria-live, polite): **"REHEARSAL — nobody can see this; the live room is untouched."**
- **Three-up stage:** phone frame (participant renderer), projector frame (projector renderer), slim host-controls strip (facilitator renderer via the `ModuleControlPanel` pattern). All from the real registry renderers fed synthetic server-computed views. Phone + projector frames inert (`aria-hidden`, `pointer-events-none`, transform-gpu containing block). Host strip interactive.
- **Scrubber/timeline (bottom):** the full sequence as clickable `PhaseStepper` pills, current highlighted, Back / Advance, each phase's `timerSeconds` shown + a running **"planned total"** so the agenda length is visible.
- **Cast panel:** headcount stepper (4–30, default ~10), "reseed cast", and the see-as selector listing synthetic handles with role hints (*host / traveller, unallocated, solo / unpaired*).
- **Mobile/narrow:** stage stacks to a tabbed **Phone | Projector | You** switcher with the same scrubber (MVP = simple stacked/tabbed fallback).
- **Degraded states:**
  - AI module + no key → **"AI not configured — this phase will be blank live too"** chip (not a fake bar).
  - Un-seeded module → **"No synthetic data for this module yet — this is honestly blank, not a config bug"** chip.
  - Empty-by-design phase (lobby/content/close) → reads as intentionally calm.
  - `computeView` throws → `ErrorBoundary` shows the phase as a contained error, walkthrough continues.
- **Exit:** "Done rehearsing" → teardown wipes the shadow room → returns to builder/console exactly where they were. Reassurance copy: *"Rehearsal room wiped; live room untouched."*

### Flows

1. **Enter from builder:** compose/load sequence → "Rehearse this design" → client POSTs parsed phases + `code` + `castSize` to the rehearse endpoint `start`. Endpoint validates each phase via `getServerModule(moduleId).schema.safeParse` (same loop as `setPhases`), mints a shadow `roomId`, seeds the cast, and returns the first phase's three-surface views + nonce. Theatre opens. No `configure` cap, no live write.
2. **Enter from host console:** "Walk through before going live" → `start` with `useCurrent: true` → endpoint reads the live `state.phases`/resolved sequence (read-only on the live slug) and rehearses exactly that.
3. **Step the arc:** Next/Back → `setPhase(nonce, phaseId)` against the shadow room → returns authoritative `{participantView, projectorView, hostView}` for the new phase → applied instantly via the rev guard, no read-back.
4. **Set the cast:** headcount change / reseed → `setCast` / `reseed` regenerates synthetic participants + plausible per-module data for the whole sequence (deterministic) → every downstream phase looks populated.
5. **See-as switch:** pick a synthetic participant → `seeAs(nonce, token)` recomputes the participant view for that token.
6. **Drive a module action:** host strip "generate synthesis", "advance round", "reveal poll" → `moduleAction(nonce, actionType, payload)` → real `dispatchAction` against the shadow room with resolved role (real AI if keyed) → surfaces update.
7. **Exit:** "Done rehearsing" → `end(nonce)` (idempotent) wipes the shadow room → return.

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `app/api/r/[room]/rehearse/route.ts` | Single rehearse endpoint. **Path room param is the LIVE slug** (used only for auth). Command router mirroring the host route's `navState` pattern: `start`, `setPhase`, `setCast`, `reseed`, `moduleAction`, `seeAs`, `end`. Gated on the new `rehearse` cap. Every state-moving command returns authoritative three-surface views computed **from the just-written state and seeded arrays** (see rev pattern). `export const runtime = "nodejs"; export const maxDuration = 60; export const dynamic = "force-dynamic";` |
| `lib/rehearsal.ts` | Server lib: `shadowRoomId(slug, nonce)`, `isRehearsalRoom(id)` guard, `seedRehearsal(shadowId, phases, castSize)` (deterministic cast + per-module seeding, **returns the seeded participant/vote/submission arrays**), `tearDownRehearsal(shadowId)` (endSession variant that also `del`s the state key, guarded by `isRehearsalRoom`), `computeThreeSurface(shadowId, written, seeded, asToken)`. Runs on the in-memory store in tests. |
| `components/RehearsalTheatre.tsx` | Full-screen accessible dialog. Banner; three-up stage via `getClientRenderer` + `ErrorBoundary` + transform-gpu (reuse `PreviewPanel`'s mount); `PhaseStepper` scrubber with per-phase + planned-total timing; cast panel (4–30 stepper, reseed); see-as selector; honest-empty / AI-unconfigured chips; mobile stacked/tabbed fallback. Drives the rehearse endpoint; applies views via a local rev guard. |
| `test/rehearsal.test.ts` | Vitest on the in-memory store (cases below). |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/auth.ts` | Add `"rehearse"` to the `Capability` union and `ALL`; add it explicitly to `COHOST`. Result: admin (via `ALL`), facilitator (via `ALL.filter(c=>c!=="configure")`), and cohost all get `rehearse`; participant + projector do not. Distinct from `advance`/`configure` to sidestep the documented `configure` gotcha. |
| `lib/modules/types.ts` (`ModuleServerDef`) | Add optional `seedRehearsal?(args: { phases: PhaseInstance[]; cast: SyntheticParticipant[]; store: ModuleStore; phaseId: string }): Promise<void>`. Co-locates each module's private vote/submission encoding with the module, so it rots loudly (typecheck) not silently. |
| `lib/modules/defs/{brainwrite,worldcafe,synthesis,<dotvote-host>,<allocate-host>}.server.ts` | Implement `seedRehearsal` for the ~5 MVP families (see seeding below). |
| `components/BuilderApp.tsx` | Add "Rehearse this design" button next to launch, enabled once phases validate locally, NOT gated on the admin passcode. Sends the same parsed phases the launch flow builds, plus `code` (existing field) + `castSize`, to the rehearse endpoint `start`. On success mount `RehearsalTheatre`; on "Done rehearsing" return to the builder where they were. No `setPhases`/`configure` involved. |
| `components/HostConsole.tsx` | Add "Walk through before going live" in the Session tab + ModeSelector empty-state, using the current resolved sequence (`start` with `useCurrent`). Optionally extract the `PreviewPanel` phone-frame markup into a small shared `SurfaceFrame` helper reused by `RehearsalTheatre` (no behavior change to the live preview). |
| `lib/store.ts` | **Likely zero change.** `addParticipant`/`allocate`/`castVote`/`addSubmission`/`getPublicState`/`getFacilitatorState`/`dispatchAction` are all already `roomId`-parameterized. Touch only if seeding needs a convenience not already exported. Do NOT add a `writeState` guard — shadow isolation is structural via `roomKeys()`. |

### Data model (types / zod / store keys / view shapes)

- **No schema migration, no durable DB** (privacy ethos preserved).
- **Shadow room** reuses the EXISTING `SessionState` + `roomKeys()` namespace under `roomId = `${slug}::rehearsal:${nonce}``: separate state/participants/submissions/votes/words/content keys, its own monotonic `rev`, standard 24h TTL backstop. No live key is read or written during rehearsal (except a **read-only** load of `state.phases` for the `useCurrent` host-console entry).
- **`isRehearsalRoom(id)`** = `id.includes("::rehearsal:")`. `randomSlug()` only emits `${word}-${4 hex}` (confirmed: `SLUG_WORDS[i] + "-" + randomBytes(2).toString("hex")`), so a `::`-separated shadow id **can never collide with a real slug**. The teardown helper asserts `isRehearsalRoom` before any delete, so a shadow wipe can never target a live room.
- **Seeded shapes (all via existing helpers, shadow keys only):**
  - `Participant`: token, handle (deterministic from a fixed name list indexed by N), joinedAt, optional lens, optional side. Leave 1–2 with lens/side `undefined` to exercise the unallocated see-as + missing-substitution case.
  - Votes: per-module via the module's own `seedRehearsal` hook calling `ctx.store.castVote` — e.g. worldcafe writes `votes["__round__"]` (field `${phaseId}::__round__`) so `cafeRound(tokens, n, round)` yields real tables; vote modules write `${phaseId}::${token}` with the module's own value shape.
  - Submissions: per-phase tagged entries for capture/brainwrite so synthesis/readaround/patterns have content.
- **New ephemeral CLIENT-ONLY types (no persistence):**
  - `RehearsalScript { phases: PhaseInstance[]; castSize: number; notes: Record<string, string> }`
  - `ThreeSurfaceView { participantView: PublicState; projectorView: PublicState; hostView: FacilitatorState }`
  - `SyntheticParticipant { token; handle; lens?; side? }`
  - `RehearsalIssue { phaseId; code; label }` (full vision only)
  - The shadow `nonce` lives in client state only; discarded on exit.

### Per-module seeding (MVP set, co-located + type-checked)

Implement `seedRehearsal` on exactly these (chosen for highest demo value), via the module's OWN `ctx.store.castVote` / `ctx.store.addSubmission`:

1. **brainwrite / capture** — `addSubmission` per cast member, tagged by phaseId. Feeds synthesis/readaround/patterns.
2. **worldcafe** — `castVote(phaseId, "__round__", round)` + a couple of table-note submissions tagged `t{table}:r{round}`. `cafeRound` makes real tables from seeded tokens.
3. **synthesis** — only seeds *input* (relies on an upstream capture phase having submissions). The AI output itself is keyed real-AI or the honest chip; no fake `__ai__` write in MVP.
4. **dotvote / poll host module** — `castVote(phaseId, token, value)` spread across options so bars/tallies populate.
5. **allocate host module** — `allocate(token, "lens"|"side", value)` spread across lenses/sides, leaving 1–2 unallocated, so `[LENS]/[SIDE]` substitution AND the unallocated case are both exercised.

Every OTHER module: no hook → renders honestly empty with the "no synthetic data yet" chip. Never blind-seed a private vote shape.

### API + host commands (+ capability gating)

NEW `POST /api/r/[room]/rehearse` — `room` segment is the LIVE slug. Body `{ command, code, ... }`. Auth: `requireCapability(slug, code, "rehearse")` once per request; module-internal facilitator gates then use the resolved role.

| Command | Args | Behavior | Returns |
|---|---|---|---|
| `start` | `phases?` or `useCurrent`, `castSize` | Validate each phase via `getServerModule(id).schema.safeParse` (same loop as `setPhases`). Mint `shadowId`. `seedRehearsal(...)` → seeded arrays. `setPhases(phases, name, shadowId)` → written state. Compute first three-surface view **from `written` + seeded arrays**. | `{ ok, nonce, view }` |
| `setPhase` | `nonce`, `phaseId` | `setPhase(phaseId, shadowId)` → written. Compute view. | `{ ok, view }` |
| `setCast` | `nonce`, `castSize` | Re-seed at new size, re-set current phase, compute. | `{ ok, view }` |
| `reseed` | `nonce` | Re-seed (deterministic from shadowId+castSize+phases). | `{ ok, view }` |
| `moduleAction` | `nonce`, `actionType`, `payload` | `dispatchAction(shadowId, {type, payload, token:"__host__"}, role)`. Real AI if keyed. Then compute view from re-read shadow state for THIS command (see rev note). | `{ ok, reason, view }` |
| `seeAs` | `nonce`, `token` | Recompute participant view for that token (no write). | `{ ok, participantView }` |
| `end` | `nonce` | `tearDownRehearsal(shadowId)` — idempotent. | `{ ok }` |

- **No change to host/action/state/stream/join routes.** They gate on `getRoom(room)` returning a real `Room` record; the shadow id has none, so they **structurally 404 the shadow namespace** — a free safety wall. This is precisely why rehearsal needs its own route (auth'd on the live slug, driving the shadow id) rather than reusing the host route.
- **`COMMAND_CAP` in the host route is unchanged.** Rehearsal is a separate route; the live command surface and its capability map are untouched.

### Rev / authoritative-apply (no KV read-back) — and the two enforced hazards

The Theatre applies returned views through a local `rev`-guarded apply (the `usePolledState.apply` contract): a response is rejected if its `rev` is `<=` the last applied. The shadow `rev` is its own monotonic counter and cannot collide with the live room.

Two eventually-consistent KV hazards are **confirmed in code** and must be handled (not hand-waved):

1. **seed-then-compute.** `buildContext` reads participants/votes/submissions from KV directly — only `state` accepts a `stateOverride` (confirmed: `lib/store.ts` `buildContext` reads `listParticipants`/`listSubmissions`/`readVotes` with no override param). So seeding then immediately computing the view in the SAME request can serve a stale/empty read on Upstash — the first frame renders empty exactly when the feature must impress. **Fix:** `seedRehearsal` RETURNS the seeded participant/vote/submission arrays, and `start`/`setCast`/`reseed` compute the first view from those returned arrays (build the `ModuleContext` from the in-hand seeded data + the just-written `state`), NOT from a KV re-read.
2. **moduleAction-then-compute.** A keyed synthesis `generate` writes `votes["__ai__"]` then we need to show it; a re-read has the same stale window. For `moduleAction`, either (a) have the response carry a "re-poll the shadow `/state` and let the rev guard tolerate one tick late" semantic, OR (b) read-back is acceptable here ONLY because the Theatre also polls the shadow `/state` every 2s with the same hook and the rev guard converges. **Decision:** Theatre polls shadow `/state` (the shadow room is a real room; `/state` works for it because… it does NOT — `/state` gates on `getRoom`). Therefore: the Theatre does **NOT** poll a live route; `moduleAction` returns its view computed from a short bounded re-read with a single retry if the `__ai__`/vote field is absent. Document that `moduleAction` is the one command with a possible one-retry read; `start`/`setPhase`/`setCast`/`reseed`/`seeAs` are strictly no-read-back.

> Note on `/state` for the shadow room: because every live route (`/state`, `/stream`, `/host`, `/action`, `/join`) gates on `getRoom(room)`, they all 404 the shadow id. The Theatre therefore drives ALL shadow interaction through the rehearse route's command responses (no background polling of a live route). This is why `start`/`setPhase`/etc. must each return the full authoritative three-surface view.

## Implementation plan (ordered, checkable)

1. [ ] `lib/auth.ts`: add `rehearse` to `Capability`, `ALL`, and `COHOST`. Add a cap-matrix test asserting facilitator + cohost have `rehearse`, participant/projector don't, and `rehearse !== configure`.
2. [ ] `lib/modules/types.ts`: add optional `seedRehearsal?` to `ModuleServerDef`.
3. [ ] `lib/rehearsal.ts`: `shadowRoomId`, `isRehearsalRoom`, `tearDownRehearsal` (del state key + endSession keys, guarded), `seedRehearsal` (deterministic cast, returns seeded arrays), `computeThreeSurface(shadowId, written, seeded, asToken)`. Tests: deterministic reproducibility; shadow isolation (live state + rev untouched after start/step/end); teardown wipes ALL shadow keys incl. state.
4. [ ] Implement `seedRehearsal` on the 5 MVP module families; test each: after seeding, `computeView` returns a non-degenerate view (worldcafe real tables, dotvote/poll bars, allocate lens/side spread incl. an unallocated token, brainwrite submissions present).
5. [ ] `app/api/r/[room]/rehearse/route.ts`: `start` → `setPhase` → `end` first (assert live state + rev untouched, shadow keys wiped on end), then `setCast`, `reseed`, `moduleAction`, `seeAs`. Enforce no-read-back for all but `moduleAction`; `moduleAction` single-retry read.
6. [ ] `components/RehearsalTheatre.tsx`: accessible dialog, three-up stage (reuse `PreviewPanel` mount + `ErrorBoundary` + transform-gpu), `PhaseStepper` scrubber + timing total, cast panel, see-as, honest-empty + AI-unconfigured chips, mobile fallback, local rev guard.
7. [ ] `components/BuilderApp.tsx` + `components/HostConsole.tsx`: entry buttons wired (builder = parsed phases + existing `code`; console = `useCurrent`). Inline "needs facilitator passcode (not admin)" prompt when `code` empty.
8. [ ] `npm run verify` (typecheck + lint + Vitest, in-memory, no KV/AI) + build. Manual smoke (below).

## Acceptance criteria (testable, facilitator-outcome framed)

1. A facilitator with ONLY a facilitator (non-admin) passcode can open rehearsal from the builder; an admin passcode is NOT required; an empty passcode shows the inline prompt, not a silent 403.
2. Pressing "Rehearse this design" opens a three-up stage showing the SAME renderers as the live surfaces, populated as if ~10 people were present: World Café shows real tables, the poll/dot-vote shows real bars, allocate spreads people across lenses/sides.
3. Stepping Back/Next moves the whole arc; each step shows the new phase's phone, projector, and host views; the scrubber shows per-phase timing and a planned total.
4. "See as Dana" vs "see as the unallocated person" render different participant views; `[LENS]/[SIDE]/[PARTNER]` resolves for allocated cast and the unallocated case is visibly inspectable.
5. With an AI key present, "generate synthesis" produces real AI output in rehearsal; with no key, the phase shows the honest "AI not configured — blank live too" chip (no fake bars).
6. A module with no seed hook renders an honest "no synthetic data yet" chip — never silently empty, never fake-populated.
7. After a full rehearse → step → action → exit cycle, the LIVE room's `rev`, participants, votes, content, and lobby count are byte-for-byte unchanged; the shadow room's keys (incl. state) are gone.
8. A phase whose `computeView` throws shows a contained error and the walkthrough continues (no 500, no trapped scrubber).
9. The Theatre is keyboard-operable: ESC and "Done rehearsing" both exit and restore focus to the launching control; the banner + current phase are announced via `aria-live`.

## Test plan

### Vitest (`test/rehearsal.test.ts`, in-memory store, no KV/AI)

1. **Shadow isolation:** snapshot live `getState(slug)` + `rev`; run `start`/`setPhase`/`moduleAction`/`end`; assert live state + rev identical after.
2. **Deterministic seeding:** seed twice with same (shadowId, castSize, phases) → identical participants/votes/submissions.
3. **Worldcafe real tables:** after seed, `computeView` yields >1 table with assigned tokens; `__round__` advance changes assignments.
4. **Poll/dot-vote bars:** after seed, view has non-zero tallies across multiple options.
5. **Allocate substitution:** lens/side spread; ≥1 unallocated token; `[LENS]` resolves for allocated, unallocated path renders without throwing.
6. **Degrade-not-500:** a phase with a deliberately bad config → `getPublicState` returns `view.data: null` (not a throw), via the existing try/catch.
7. **Teardown:** after `end`, ALL `roomKeys(shadowId)` (incl. `.state`) are absent; `end` is idempotent (second call no-ops).
8. **Cap matrix:** facilitator + cohost have `rehearse`; participant/projector don't; `rehearse` never equals `configure`; the rehearse route 403s a participant code.
9. **No-read-back:** `start` computes its view from seeded arrays (mock the KV read to return empty and assert the response view is still populated).
10. **Collision guard:** `isRehearsalRoom` true for `::rehearsal:` ids, false for `${word}-${hex}` real slugs; `tearDownRehearsal` throws/no-ops if handed a non-rehearsal id.

### Manual QA

- Rehearse a `worldcafe + synthesis + dotvote` sequence with NO key (synthesis shows honest chip) and WITH a key (real AI). Confirm tables + bars populate, token substitution renders, unallocated see-as renders, live `rev` does not move.
- **Mobile/tablet:** open in a narrow viewport — stage stacks to Phone | Projector | You tabs with the same scrubber.
- **Projector:** confirm the projector frame renders the projector renderer (not the phone one) and reads as a room-front display.
- **A11y:** keyboard-only walk; ESC + Done both restore focus; screen reader announces banner + phase changes.
- Open a second rehearsal in another tab → distinct shadow room, no rev collision; close first tab without "Done" → orphan expires within 24h.

## Privacy & ethos check (explicit)

- **Strengthens the ethos.** Rehearsal uses ZERO real participant data — a synthetic cast in an isolated `${slug}::rehearsal:{nonce}` namespace. `roomKeys()` namespaces every key by roomId (verified), so state/participants/submissions/votes/words/content/patterns are structurally isolated from the live room.
- **Free safety wall:** all live routes gate on `getRoom(room)`; the shadow id has no `Room` record, so `/host`, `/state`, `/stream`, `/action`, `/join`, the admin lobby (`listRooms`/`getRoom`), `roomSignature`/SSE, and archive all ignore the shadow namespace.
- **Submissions still never logged;** AI inherits content-free logging, `withGenerateLock`, 55s timeout.
- **Collision-proof:** `randomSlug` cannot emit `::`, so a shadow id can never equal a real slug; `isRehearsalRoom` guards every teardown so a wipe can never hit a live room.
- **Wipe corrected:** `endSession` re-creates an empty `:state` key (confirmed — it `del`s the data keys then `writeState({...DEFAULT_STATE, ended:true})`). `tearDownRehearsal` therefore ALSO `backend.del`s the shadow `:state` key, so nothing lingers; the 24h TTL is only a backstop for tab-close/crash orphans.
- **One deliberate, flagged auth change:** the new `rehearse` capability (admin/facilitator/cohost). Cohost may rehearse `configure`-gated custom builds they cannot launch live — defensible because rehearsal never writes the live room. No accounts, no durable DB introduced.

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **AI canned-sample contradiction (major).** `synthesis.server.ts` line 242 hard-returns `{ ok:false, reason:"AI unavailable" }` BEFORE writing when `!aiAvailable()` (confirmed), so "canned sample via real `handleAction`" is impossible. **Resolved:** MVP keyed → real `dispatchAction`; unkeyed → honest "AI not configured — blank live too" chip. Canned samples (writing `votes['__ai__']` directly, bypassing `handleAction`, documented as a rehearsal-only seam) are DEFERRED to fast-follow. We do NOT claim `handleAction` is reused unmodified for the unkeyed AI path.
2. **Blind per-module seeding (major).** Seeding private vote shapes (`__round__`, `__ai__`, dotvote/rank/scale) externally rots silently → false-confidence empty renders. **Resolved:** co-located, type-checked `seedRehearsal?` hook per module using the module's own `castVote`/`addSubmission`; ~5 modules in MVP; every other module renders honestly-empty-with-a-chip. A test asserts each seeded module's `computeView` is non-degenerate.
3. **"No passcode gate" wrong (major).** The rehearse route and `BuilderApp` both already require a `code` (confirmed). **Resolved:** rehearse needs ANY facilitator-tier+ passcode (`rehearse` cap), NOT admin; reuse the existing builder `code` field + inline prompt. Copy says "no ADMIN passcode needed".
4. **Seed-then-compute stale read (major).** `buildContext` reads participants/votes/submissions from KV with no override (confirmed). **Resolved:** `seedRehearsal` returns seeded arrays; `start`/`setCast`/`reseed` compute the first view from them, no read-back. `moduleAction` is the only command with a single bounded retry read, documented.
5. **"Wiped on exit" overstated (minor).** **Resolved:** `tearDownRehearsal` `del`s the shadow `:state` key too; `isRehearsalRoom` guards it; copy corrected.
6. **Collision risk (minor).** **Resolved:** `::` separator (impossible for `randomSlug`) + `isRehearsalRoom` assertion.
7. **Re-entrancy / nonce ownership (minor).** No server identity (account-less). **Resolved:** re-entrancy is purely client-side — the Theatre holds one nonce, `start` first `end`s any prior nonce, then `start`. Distinct browser sessions get distinct shadow rooms (correct); abandoned ones expire via TTL. Shadow id keeps the nonce (never derived from the slug alone), so concurrent rehearsals can't clobber each other's rev.
8. **In-Theatre action routing (minor).** **Resolved:** 100% of navigation/actions go through the rehearse route (gates once on `rehearse`, dispatches with resolved role for module-internal checks); nothing touches the host route (which would 404 the shadow id anyway). Cap-matrix test included.
9. **Accessibility (minor).** **Resolved:** `role="dialog"` + `aria-modal`, focus trap, ESC + Done exit & restore focus, `aria-live` banner/phase; preview frames inert, only host strip + scrubber focusable.
10. **Scope creep (minor).** **Resolved:** auto-issue engine, canned AI samples, persona seeding, real-AI toggle, mobile tabbed polish, notes punch-list all DEFERRED to fast-follow. MVP lands the felt-walkthrough whose worst failure is "honestly blank", not "falsely alive".

## Out of scope / future

- Auto-issue / punch-list engine (static "takes input from" reachability analysis) + freeform per-phase notes.
- Canned AI sample library + "use real AI in rehearsal" toggle.
- Persona/topic-aware synthetic contributions.
- Re-runnable cast+notes for fair before/after comparisons.
- Spinning a fully throwaway rehearsal from a design payload before any room exists (pre-sales/design-time use).
- Expanding `seedRehearsal` coverage to the remaining ~21 modules.
