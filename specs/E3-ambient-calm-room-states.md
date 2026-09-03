# E3 — Ambient / calm room states between activities

> Section E. Front-of-room (projector) · Status: ready to build · Verdict from pressure-test: **needs-changes → all must-fixes folded in below.**

## Priority / effort / dependencies

- **Priority:** P2
- **Effort:** 5.5 days (raised from the original 4.5d: the central mechanism — a synthesized phase in the resolve layer — does not exist yet and is load-bearing; see Risks). MVP cut (below) is ~2.5 days.
- **Dependencies (must exist; all confirmed present):**
  - Module contract + registries (`lib/modules/registry.server.ts`, `registry.client.tsx`) — prior art: `media`.
  - Authoritative-apply path: `getFacilitatorState(room, stateOverride)` + `navState()` in the host route; `usePolledState.apply` in `HostConsole.tsx`.
  - Global timer plumbing: `SessionState.timerEndsAt`, `store.setTimer`, host `setTimer` case, `components/Countdown.tsx` (self-ticks, `onElapsed` once per `endsAt`).
  - `useChime` (currently private inside `components/ParticipantApp.tsx`) — to be lifted to a shared hook.
  - `tailwind.config.ts` `pulseSoft` / `fadeInUp` keyframes; `globals.css` `prefers-reduced-motion` block.
- **No item dependencies on other roadmap modules.** Additive; no feature flag.

---

## Problem & facilitator value

**Problem.** There is no first-class calm scene between activities. Today the projector holds a stale slide, a finished result, or the join-QR while people break, breathe, or wait. The only between-tools are the manual media deck (a deck-advancer, not self-running), a tiny mm-ss timer in the status bar, and a chime that fires **only on participant phones, never on the projector**. So facilitators improvise with a blank slide, the wall clock, or clapping.

**Facilitator value (in their voice).** "Between activities I want one calm thing on the big screen that runs itself. I tap *Break · 10*, and the projector becomes a quiet full-screen countdown with an honest 'back at 2:45' time so latecomers self-regulate — and when it hits zero the **room speakers** chime and I tap Resume to drop straight back where I was. No blank slide, no clapping, no babysitting. I can also pre-plan a 'Coffee break' or a 'Centering breath' as a real step in my session. It never collects anything, never logs, and never flickers."

It is opinionated about restraint: near-black background, one large editorial line, generous whitespace, exactly one slow motion element, and an honest wall-clock back-at label. It inherits the platform's authoritative-apply, anti-flash rev guard, reduced-motion, and privacy guarantees.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP (ship first — ~2.5 days)
- Scenes: **Break** and **Hold** only.
- **Ad-hoc only** (Run-tab presets). No builder phase, no AI suggestion.
- Mechanism: nullable `SessionState.ambient` field, written via `writeState` (rev bumps), **synthesized** into a `PhaseInstance` by the resolve layer. This is the core mechanism and is identical for MVP and full.
- Reuse the global `timerEndsAt` + existing `Countdown.tsx` `onElapsed` for the chime.
- Lift `useChime` to a shared hook; call it on the projector. Kiosk-safe "tap to enable sound" unlock + per-`endsAt` double-fire guard.
- New advance-cap commands `setAmbient` / `resumeAmbient`.
- Matching participant calm card (cheap; reuses media participant aesthetic).

### Full vision (phase two within this spec, build after MVP green)
- Scenes: add **Breathe** (Box / 4-7-8, N cycles, rAF ring + reduced-motion variant), **Countdown** (we-start-in gather with topic teaser), **Cue card** (single full-bleed line).
- **Builder integration:** `ambient` appears in the Structure palette; schema-driven editor; a planned ambient phase renders through the *same* `computeView` branch as ad-hoc (one view-builder, two seed sources).
- `lib/design.ts` can suggest an ambient phase between heavy activities.
- Per-scene pre-chime at T-60s (default on for breaks, off for breathing).

Music bed / uploaded cue sound is **out of scope** (see Out of scope).

---

## Experience & flows

### Run-tab control (Host console — `SessionHeader`, a new row directly under the Timer row)
Compact row: `Ambient:` label, scene preset buttons, contextual minute chips + a one-line note input when **Break** (or Countdown) is chosen, a live readout of the active scene and its countdown, and a prominent **Resume** button (only shown while a scene is active).

- Scene presets: `Break` · `Breathe` · `Countdown` · `Cue card` · `Hold` (MVP: `Break` · `Hold`).
- Tapping `Break` reveals minute chips `5 · 10 · 15 · custom` + a one-line note field, then `Start`.
- While a scene is active: the row shows e.g. `On a break · back at 2:45 · 9:58` and a single `Resume` (and, for breaks, `+1:00` / `+5:00` reusing the existing delta buttons against `endsAt`).
- **Capability:** summoning/resuming a scene is a facilitation action (advance tier) — cohost can do it, participant cannot. **Never** `configure`/`setPhases` (dodges the documented gotcha).

### Projector scenes (the hero; near-black `bg-black`, `font-display`, one motion element)
- **Break** — `Break` line; large wall-clock **back-at** label computed from `endsAt`; big `mm-ss` remaining (`Countdown`); optional one-line note in muted; one slow `pulseSoft` accent dot. At **T-60s** the time tints accent (full vision pre-chime). At **zero**: shows `Resuming…`, chimes on room speakers.
- **Hold** — lowest-key: room logo from `branding.logoUrl` + `We'll resume shortly.` (mirrors the existing `ProjectorApp` fallback aesthetic). No timer.
- **Breathe** (full) — centered ring; scale animation anchored to `startedAt` + pattern-phase math; caption swaps `Breathe in → Hold → Breathe out`; small `breath 3 of 6` counter. Reduced-motion: static ring + caption swapped on `setInterval`.
- **Countdown** (full) — `We start in…` + next phase label / topic teaser as quiet subtitle; chime at zero.
- **Cue card** (full) — one full-bleed facilitator line, `font-display`, no timer, faint `fadeInUp`. Empty `cueText` → soft fallback `Take a moment.` (never an empty black screen).

### Participant phone (quietly matching calm card)
Reuses the media-participant soft-dot centered layout so a stale prompt never lingers. Copy mirrors the scene: `On a break — back at 2:45` / `Breathe with the room` / `We'll resume shortly.` Display-only.

### Build-time (full vision)
`Ambient` appears in the builder **Structure** category next to `media`, `lobby`, `content`, `close`. Schema-driven form (zod introspection) covering `scene`, `durationSeconds`, `note`, `cueText`, `breathPattern`, `cycles`, `preChime`. A planned ambient phase is a normal phase in `state.phases`.

### Copy that matters
- Break: `Break` / `back at {wallClock}` / note (verbatim) / `Resuming…` at zero.
- Hold: `We'll resume shortly.`
- Cue empty fallback: `Take a moment.`
- Projector sound hint (one-time): `Tap once to enable the chime on this screen.`

---

## Architecture

### Files to ADD
| Path | Purpose |
|---|---|
| `lib/modules/defs/ambient.server.ts` | `ModuleServerDef<AmbientConfig>`: zod schema, `defaultConfig`, `vis()`, `capabilities` (`acceptsActions:false`, `projectable:true`), `computeView` (one branch, two seed sources). |
| `lib/modules/defs/ambient.client.tsx` | Per-role renderers (`projector`, `participant`; facilitator surface lives in HostConsole, not here). Client-side rAF motion. Exports `AmbientView`. |
| `components/useChime.ts` | Shared chime hook lifted from `ParticipantApp`, plus AudioContext unlock + per-`endsAt` guard helpers. |
| `test/ambient.test.ts` | Vitest (in-memory store): synthesis, rev bump, resume side-effects, capability, server-stamped time, End wipes. |

### Files to CHANGE
| Path | Change |
|---|---|
| `lib/types.ts` | Add `ambient` to `Primitive` union. Add nullable `SessionState.ambient` field (shape below). Export `AmbientScene` type. |
| `lib/store.ts` | (a) `setAmbient()` + `resumeAmbient()` (below); (b) teach `resolvePhases`/`resolveActive` to **synthesize** the ambient phase; (c) `endSession` already wipes via `writeState(DEFAULT_STATE)` — confirm `DEFAULT_STATE.ambient: null`; (d) add `state.ambient` epoch to `roomSignature`. |
| `app/api/r/[room]/host/route.ts` | Register `setAmbient`/`resumeAmbient` in `COMMAND_CAP` as `advance`; add switch cases returning `navState(...)`. |
| `components/HostConsole.tsx` | New `Ambient:` row in `SessionHeader` under the Timer row; uses existing `cmd(...)` + `apply(d.state)`. |
| `components/ProjectorApp.tsx` | Import shared `useChime`; fire at zero via the projector's own `Countdown.onElapsed`; render sound-unlock hint. |
| `components/ParticipantApp.tsx` | Replace private `useChime` with the shared import (no behaviour change). |
| `lib/modules/registry.server.ts` | Register `ambient: ambientModule` in `SERVER_MODULES`. |
| `lib/modules/registry.client.tsx` | Register `ambient: { renderers: ambientRenderers }` in `CLIENT_MODULES`. |
| `components/BuilderApp.tsx` (full vision) | Add `"ambient"` to the `Structure` `CATEGORIES` kinds. |
| `lib/design.ts` (full vision) | Allow suggesting an `ambient` phase between heavy activities. |

### Data model

**`SessionState.ambient` (the single source of truth — written via `writeState`, so `rev` bumps):**
```ts
// lib/types.ts
export type AmbientScene = "break" | "hold" | "breathe" | "countdown" | "cue";

export interface AmbientState {
  scene: AmbientScene;
  startedAt: number;           // server-stamped epoch ms (animation anchor)
  endsAt: number | null;       // server-stamped; null for hold/cue
  note?: string;               // facilitator free-text (break)
  cueText?: string;            // facilitator free-text (cue)
  breathPattern?: "box" | "478";
  cycles?: number;
  preChime?: boolean;
  returnPhaseId: string | null;   // __return__ : exact phase to resume to
  returnTimerEndsAt: number | null; // snapshot of the timer we overlaid (restored on resume)
}

export interface SessionState {
  // …existing fields…
  ambient?: AmbientState | null; // null/absent = no scene active
}
```
> **No votes hash is used for scene state.** (Pressure-test must-fix: `castVote` does not call `writeState` and so does not bump `rev`; a votes-only scene would be rejected by `usePolledState`'s strictly-increasing rev guard for the timer-less Hold/Cue/Breathe scenes.)

**`AmbientConfig` (zod, builder-facing — shapes a *planned* phase; identical fields so one `computeView` branch serves both seed sources):**
```ts
const ambientSchema = z.object({
  label: z.string().default("Ambient"),
  scene: z.enum(["break","hold","breathe","countdown","cue"]).default("hold"),
  durationSeconds: z.number().int().min(0).max(7200).optional(),
  note: z.string().max(200).optional(),
  cueText: z.string().max(200).optional(),
  breathPattern: z.enum(["box","478"]).optional(),
  cycles: z.number().int().min(1).max(20).optional(),
  preChime: z.boolean().optional(),
}).passthrough();
```

**View shape (`computeView` surfaces server-stamped anchors so projector + phones animate identically):**
```ts
export interface AmbientView {
  scene: AmbientScene;
  startedAt: number;        // server epoch
  endsAt: number | null;    // server epoch
  note?: string;
  cueText?: string;
  breathPattern?: "box" | "478";
  cycles?: number;
  preChime: boolean;
}
```

**Store keys:** none new. Scene lives on `SessionState` (room-scoped `state` key, 24h TTL bumped on write). Timer reuses global `timerEndsAt`.

### Store functions (the must-fixes, resolved)

```ts
// lib/store.ts

// (b) RESOLVE-LAYER SYNTHESIS — the core mechanism. An ad-hoc scene is NOT in
// state.phases; resolveActive(.find) would return null and the projector would
// fall back to the join-QR. So synthesize a PhaseInstance for it.
function ambientPhaseInstance(a: AmbientState): PhaseInstance {
  return {
    id: "__ambient__",
    moduleId: "ambient",
    config: { label: "Ambient", scene: a.scene, durationSeconds: ...,
              note: a.note, cueText: a.cueText, breathPattern: a.breathPattern,
              cycles: a.cycles, preChime: a.preChime ?? false } as Record<string, unknown>,
  };
}
function resolveActive(state: SessionState): PhaseInstance | null {
  if (state.ambient && state.phaseId === "__ambient__")
    return ambientPhaseInstance(state.ambient);          // <-- before the .find
  return resolvePhases(state).find((p) => p.id === state.phaseId) ?? null;
}
```
> `computeView` reads scene params from one normalized source: a **planned** phase from `ctx.config`; the **synthetic** ambient phase from a config shaped identically to `AmbientConfig`. One branch, two seed sources — no drift. The synthetic config carries the *server-stamped* `startedAt`/`endsAt`, surfaced into `AmbientView`.

```ts
// setAmbient — advance-cap. Stamps time server-side, snapshots the phase/timer
// we overlay, writes via writeState (rev bumps).
export async function setAmbient(input: {
  scene: AmbientScene; durationSeconds?: number; note?: string; cueText?: string;
  breathPattern?: "box"|"478"; cycles?: number; preChime?: boolean;
}, roomId = DEFAULT_ROOM_ID): Promise<SessionState> {
  const state = await getState(roomId);
  const now = Date.now();
  const endsAt = input.durationSeconds && input.durationSeconds > 0
    ? now + input.durationSeconds * 1000 : null;
  const ambient: AmbientState = {
    scene: input.scene, startedAt: now, endsAt,
    note: input.note?.slice(0,200), cueText: input.cueText?.slice(0,200),
    breathPattern: input.breathPattern, cycles: input.cycles, preChime: input.preChime ?? false,
    // Remember where we were ONLY when overlaying a real phase (not re-entering ambient).
    returnPhaseId: state.phaseId === "__ambient__" ? state.ambient?.returnPhaseId ?? null : state.phaseId,
    returnTimerEndsAt: state.phaseId === "__ambient__" ? state.ambient?.returnTimerEndsAt ?? null : state.timerEndsAt,
  };
  return writeState({ ...state, ambient, phaseId: "__ambient__", timerEndsAt: endsAt }, roomId);
}

// resumeAmbient — advance-cap. Dedicated resume that does NOT call setPhase
// (setPhase nulls timerEndsAt AND releaseQueuedContent — destructive on resume).
export async function resumeAmbient(roomId = DEFAULT_ROOM_ID): Promise<SessionState> {
  const state = await getState(roomId);
  const a = state.ambient;
  return writeState({
    ...state,
    ambient: null,
    phaseId: a?.returnPhaseId ?? state.phaseId,
    timerEndsAt: a?.returnTimerEndsAt ?? null, // restore the overlaid timer; do NOT release content
  }, roomId);
}
```

### API + host commands (+ capability gating)
- `COMMAND_CAP.setAmbient = "advance"`, `COMMAND_CAP.resumeAmbient = "advance"`. (advance tier ⇒ facilitator **and cohost**; never `configure`.)
- `case "setAmbient":` → `navState(room, await setAmbient({...a}, room), role ?? "facilitator")`.
- `case "resumeAmbient":` → `navState(room, await resumeAmbient(room), role ?? "facilitator")`.
- No `/api/action` participant surface (`acceptsActions:false`).
- `setTimer` (`timer` cap) reused for `+1:00`/`+5:00`/Clear against the active break `endsAt`.

### Rev / authoritative-apply (no KV read-back)
1. Host command mutates state through `setAmbient`/`resumeAmbient` → `writeState` → `rev = max(Date.now(), prev.rev+1)` (strictly increasing).
2. The command handler returns `navState(...)` = `getFacilitatorState(room, written)`, i.e. the view computed from the **just-written** state — never a read-back.
3. `HostConsole` applies it with `apply(d.state)` (already wired at line ~103).
4. Other clients (projector, phones) pick it up on the next 2s poll / SSE tick; the rev guard accepts it (rev advanced) and rejects any later stale poll, so no snap-back / no flicker.
5. All motion is computed **client-side per `requestAnimationFrame`** from the server-stamped `startedAt`/`endsAt` in `AmbientView` — independent of the poll. `computeView` does no AI and stays cheap (honours never-call-AI-in-computeView).

---

## Implementation plan (ordered, checkable)

**MVP**
1. [ ] `lib/types.ts`: add `"ambient"` to `Primitive`; add `SessionState.ambient?: AmbientState|null`; export `AmbientScene`/`AmbientState`/`AmbientView`. Set `DEFAULT_STATE.ambient: null`.
2. [ ] `components/useChime.ts`: lift `useChime` verbatim from `ParticipantApp`; add `unlockAudio()` + a `useElapsedChimeGuard(endsAt)` (fires once per `endsAt`). Point `ParticipantApp` at the shared hook (no behaviour change).
3. [ ] `lib/store.ts`: `ambientPhaseInstance`, synthesis in `resolveActive`, `setAmbient`, `resumeAmbient`; add `state.ambient?.endsAt`/`startedAt` to `roomSignature`.
4. [ ] `lib/modules/defs/ambient.server.ts`: schema, `defaultConfig`, `vis()` (all roles visible), `capabilities` (`acceptsActions:false`, `needsTimer:false`, `projectable:true`), `computeView` (Break + Hold; one branch, two seed sources; surface server-stamped anchors).
5. [ ] `lib/modules/defs/ambient.client.tsx`: `ProjectorAmbient` (Break/Hold) + `ParticipantAmbient` calm card; `pulseSoft` dot; reduced-motion respected.
6. [ ] Register in both registries.
7. [ ] `app/api/r/[room]/host/route.ts`: `COMMAND_CAP` + two switch cases.
8. [ ] `components/HostConsole.tsx`: Ambient row (Break minute chips + note + Start; Hold; live readout; Resume; +1/+5/Clear via `setTimer`).
9. [ ] `components/ProjectorApp.tsx`: shared `useChime` at zero (guarded); sound-unlock hint.
10. [ ] `test/ambient.test.ts` (see Test plan). `npm run verify` green.

**Full vision (after MVP green)**
11. [ ] Add Breathe / Countdown / Cue scenes to schema, `computeView`, renderers (rAF ring + reduced-motion; topic teaser; cue fallback; per-scene `preChime` at T-60s).
12. [ ] `BuilderApp` Structure category + planned-phase render through the same `computeView` branch.
13. [ ] `lib/design.ts` suggestion of ambient between heavy activities.

---

## Acceptance criteria (facilitator-outcome framed)

1. From the Run tab, the facilitator taps **Break · 10** and the projector flips **instantly** to a full-screen calm break countdown with an honest "back at HH:MM" — **without advancing the real sequence**.
2. At zero the projector shows `Resuming…` and the **room speakers** chime (best-effort; phones still chime). No double-chime if a late poll re-applies the same `endsAt`.
3. Tapping **Resume** returns to the **exact** prior phase, and **does not** wipe a timer that phase already had, and **does not** dump queued room content.
4. A **cohost** can summon and resume a scene; a **participant** token is forbidden (403); no `configure`/admin cap is required.
5. The scene **never flickers or snaps back** under 2s polling / eventual consistency (rev advances on every scene change; stale polls rejected).
6. **Hold** shows the room logo + "We'll resume shortly." and never the stale prior result/QR.
7. Participant phones show a quietly matching card, never a stale prompt.
8. Ending the session **wipes** any scene note/cueText and clears the ambient state.
9. (Full) A planned **Ambient** phase placed in the builder renders identically to its ad-hoc twin; Breathe/Countdown/Cue render with their stated motion and reduced-motion variants.

---

## Test plan

### Vitest (`test/ambient.test.ts`, in-memory store)
- **Synthesis:** `setAmbient({scene:"hold"})` then `getPublicState`/`getFacilitatorState` returns `moduleId:"ambient"` and a non-null `view` (proves the synthesized phase is found — guards the must-fix that `.find` alone returns null).
- **Rev bump on timer-less scene:** `setAmbient({scene:"hold"})` yields `state.rev > prevRev` (guards the votes-vs-rev must-fix).
- **Server-stamped time:** `startedAt`/`endsAt` are assigned by the store (client-supplied values ignored); `endsAt === startedAt + durationSeconds*1000` for a break.
- **Resume non-destructive:** set `timerEndsAt:T` + `phaseId:"p2"`, `setAmbient` over it, `resumeAmbient` → `phaseId==="p2"` **and** `timerEndsAt===T`; assert `releaseQueuedContent` did not run (queued content still queued).
- **Return pointer stable across re-entry:** `setAmbient` (hold) then `setAmbient` (break) without resume → `returnPhaseId` still points at the original real phase, not `__ambient__`.
- **Capability:** POST `setAmbient` with cohost code → 200; with participant/no code → 403. POST `resumeAmbient` cohost → 200.
- **End wipes:** after `endSession`, `state.ambient` is null and votes/content keys cleared.
- **Privacy:** `ambient` module `acceptsActions===false`; `dispatchAction` to it returns "not actionable" (409).

### Manual QA
- **Projector (kiosk/cast):** open projector with no prior gesture → break renders; chime is silent no-op; "tap to enable sound" appears; after one tap, chime fires at zero. No double-chime on a forced refresh near zero.
- **Mobile phone:** participant sees the matching calm card; rotate device; confirm reduced-motion (set OS "reduce motion") shows static ring + interval caption (full vision) and no dot pulse on break.
- **Cross-device sync:** projector + 2 phones; confirm back-at time and (full) breathing ring are anchored identically (same `startedAt`).
- **Anti-flash:** during a break, throttle network / force a stale poll; projector must not snap back to the prior slide.
- **Resume:** start an activity timer, overlay a Hold, Resume → activity timer still counting; queued content not released.

---

## Privacy & ethos check (explicit)
- **Display-only:** `acceptsActions:false`; no participant input; no `/api/action` surface; nothing logged (no AI, no submissions).
- **No durable storage / no new keys:** scene lives on the existing room-scoped `state` key under the standard 24h TTL (bumped on each write). Timer reuses global `timerEndsAt`.
- **Facilitator free-text** (`note`/`cueText`) is facilitator-authored, not participant data; capped (200 chars), and **wiped on End** via `writeState(DEFAULT_STATE)` (with `ambient:null`) — covered by a test assertion.
- No anonymity, account-less, or off-the-record violation; no new logging surface. Privacy verdict: **compliant.**

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **[CRITICAL — resolved] "resolveActive finds a phase not in `state.phases`" is impossible.** Verified: `resolveActive` does `.find` over `resolvePhases(state)` (= `state.phases` or the mode), so a synthetic id returns null → `moduleId/view` null → projector falls to the join-QR (`ProjectorApp.tsx` 36-38, 57). **Fix folded in:** `resolveActive` **synthesizes** a `PhaseInstance{id:"__ambient__",moduleId:"ambient",config}` from `SessionState.ambient` *before* the `.find`.
2. **[CRITICAL — resolved] votes-only scene state would not bump `rev`.** `castVote` never calls `writeState` (rev moves only inside `writeState`, line ~207), so timer-less Hold/Cue/Breathe would be rejected by `usePolledState`'s strictly-increasing guard. **Fix:** scene lives on `SessionState.ambient`, written via `writeState`; rev advances on every scene change — also fixes SSE `roomSignature` and authoritative-apply at once.
3. **[MAJOR — resolved] Resume via `setPhase` is destructive.** `setPhase` unconditionally nulls `timerEndsAt` and calls `releaseQueuedContent` (lines ~285-294). **Fix:** dedicated `resumeAmbient` restores `returnPhaseId` + snapshotted `returnTimerEndsAt`, never releases content.
4. **[MAJOR — resolved] Capability gotcha.** Inserting into `state.phases` is a `setPhases`/`configure`-tier mutation (re-triggers the admin-vs-facilitator gotcha). **Fix:** `setAmbient`/`resumeAmbient` are new **advance-cap** commands that mutate the synthesized state field and never touch `state.phases`; test proves cohost-ok / participant-forbidden.
5. **[MAJOR — resolved] Animation anchor / clock skew.** **Fix:** `startedAt`/`endsAt` stamped **server-side** in `setAmbient`, surfaced through `computeView` into `AmbientView`; all clients animate from the identical absolute anchor; test asserts server assignment.
6. **[MINOR — resolved] Chime autoplay + double-fire on a kiosk.** Projectors are often opened once and never clicked, so AudioContext may never unlock. **Fix:** keep the existing silent-fail try-catch; add a one-time "tap to enable sound" affordance that creates+resumes AudioContext on first interaction; persist a per-`endsAt` "already chimed" guard so a re-applied state cannot double-ring. Projector audio is best-effort, never load-bearing.
7. **[MINOR — resolved] Two render paths (planned vs ad-hoc) can drift.** **Fix:** one `computeView` branch, two seed sources (planned ← `ctx.config`; ad-hoc ← synthesized config shaped identically).
8. **[Scope risk]** The central mechanism (resolve-layer synthesis + new state field) did not exist, so effort is bumped to 5.5d and split MVP (Break + Hold, ad-hoc-only) / full. Ship MVP first to de-risk.

---

## Out of scope / future
- **Music bed / uploaded cue sound** via Blob (autoplay, licensing, volume questions) — phase two+; v1 is synthesized chime only.
- **Configurable breathing timings** — fixed Box / 4-7-8 only (calmer, less error-prone).
- **Extending the `media` module with a "scene mode"** — rejected; ambient ships as a sibling so the deck-advancer stays clean and ambient is schema-driven + AI-suggestable.
- Per-participant ambient personalization, scheduled/auto-advancing scene chains, and analytics — not pursued (privacy ethos + restraint).
