# C1 — "Facilitate" mode — one-screen live cockpit

> **Section C. Running live · Priority P0**
> Final executable build spec. All pressure-test must-fixes are folded in; build to this without further design.

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** 4.5 days (only if the truthiness-gate fix and `withLock` fix are treated as in-scope must-fixes from the start, not discovered late)
- **Depends on (already in repo, reused not rebuilt):**
  - `navState` authoritative-apply contract — `app/api/r/[room]/host/route.ts:39`
  - `usePolledState` (`apply`/`refresh`/`refreshUntil`) + the `cmd` dispatcher — `components/HostConsole.tsx:62,80`
  - `getClientRenderer(moduleId,'projector')` + `ErrorBoundary` (the mirror) — `components/ProjectorApp.tsx:58`
  - `Countdown` onElapsed-once + null-endsAt `—` handling — `components/Countdown.tsx`
  - `getPublicState`/`getFacilitatorState` mapping — `lib/store.ts:794`
  - `withLock` (SET NX EX, per-room) — `lib/store.ts:652`
  - `useChime` (gesture-gated WebAudio) — `components/ParticipantApp.tsx:196`
- **No new npm dependencies.**

---

## Problem & facilitator value

### Problem
When I'm standing in front of a room actually *running* a session, the current `/r/[room]/host` console is the wrong tool. It's a five-tab setup-and-operate surface (Run / What they see / Content / Patterns / Session) crammed into a `max-w-5xl` column. The single most important live action — "move the room forward" — is a small "Advance →" pill sharing a sticky header with a phase timeline, a session name, a participant count, a help link, and four tiny timer text-buttons. The timer is a `2xl` mono numeral wedged top-right. Glancing down mid-sentence, or co-hosting from across the room, I have to read and aim at 3px-tall controls among a dozen others.

Three concrete pains fall out of the code:
1. **No pause.** `setTimer` writes a single `timerEndsAt` epoch (`lib/store.ts:297`). The only "stop the clock" affordance is Clear, which *destroys* the remaining time. "+2 min" doesn't exist as a button (only +1/+5).
2. **"What's on the room screen right now" hides behind a tab** (`activeTab === 'preview'`) or a narrow desktop rail scaled with `[&_*]:!text-sm`. I can't trust at a glance that the projector shows what I think.
3. **Everything is the same visual weight,** so it reads as a control panel, not a stage.

### Facilitator value (in my voice)
> My attention belongs on the room, not the laptop. Give me one calm screen with one big target per decision: *where am I, what does the room see, how much time is left, what's next.* Let me **pause** the clock for a tangent without losing the remaining time, and let me give the room **+2 minutes** with one thumb. Let a co-host on a phone at the back drive the same view. And never strand me — when I genuinely need Content or Patterns, one tap takes me back to the full console.

This is a **mode of the existing console**, not a new app: same auth, same role gating, same authoritative-apply command path. It inherits the privacy story by construction.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (thinnest shippable, still trust-complete)
Ships in two coherent slices, additive and opt-in by route — no feature flag.

**Slice 1 — Authoritative pause across ALL surfaces (lands safely alone):**
- `timerRemainingMs` added to `SessionState` / `PublicState` / `FacilitatorState`.
- `pauseTimer` / `resumeTimer` store fns + host commands; `setTimer` gains an additive `addMs` shape.
- All three mutations serialized under `withLock`.
- `roomSignature` includes `timerRemainingMs` (so +2-while-paused emits an SSE tick).
- `Countdown` paused mode; **render gates in `ProjectorApp` and `ParticipantApp` changed so paused FREEZES the numeral (never blanks it)**.
- Safe to land with no cockpit: nothing emits a pause yet, so behaviour is unchanged.

**Slice 2 — The cockpit:**
- `FacilitateCockpit` + `/r/[room]/facilitate` route + `cockpit` prop on `HostConsole` + Facilitate/Exit navigation.
- Three bands: status / giant timer with Start·Pause·+2min·Reset / mirror + giant Next.
- Chime on zero-crossing; final-phase Wrap-up gated on the `end` capability.

**MVP may drop, if time-pressed (both independent, neither load-bearing for glance/pace/advance):**
- Screen Wake Lock.
- The jump-to-phase progress rail (keep a recessive *non-interactive* position indicator instead).

### Full vision (out of C1 — see Out of scope)
Optional per-phase facilitator script line; persistent chime-mute preference; shareable co-host link (rejected on privacy grounds — co-host enters their own passcode).

---

## Experience & flows

A **full-bleed dark stage**, no app chrome, generous negative space. Three horizontal bands. Accent color appears on **only two** things: the timer numeral and the Next button. The only motion is a gentle pulse under ~30s and a soft chime at zero. Legible from two metres; operable one-handed (all primary targets ≥ 44px).

### Bands
- **TOP (small, muted):** `{sessionName} · Phase 3 of 7 · {N} here`. A single **"Exit Facilitate"** affordance. A tiny **"co-host"** tag when `role === 'cohost'`. A **"Reconnecting…"** chip when `usePolledState` reports an error (last-known state stays on screen; the rev guard prevents backward flaps).
- **CENTER (the gravitational center — pacing is the live worry):** the current phase label in a large secondary weight (`"Triad diagnosis"`), then one enormous mono numeral (`clamp()` ≈ 22vh, accent). Beneath it, three large pills:
  - **Start / Pause** (primary; label + icon swap on state; becomes **Resume** when paused),
  - **+2 min** (first-class big button),
  - **Reset** (quieter; back to the phase preset).
  - When **paused**, the numeral freezes AND shifts to a dimmed/outline treatment with a small **"Paused"** caption — readable across the room.
- **BOTTOM (live mirror + Next):**
  - **Left — "On the room screen now":** an honest, full-fidelity mirror of the projector renderer for the current phase (not shrunken text). Rendered with the real `getClientRenderer(moduleId,'projector')` inside `ErrorBoundary`, `pointer-events-none`, `act:async()=>false`. A fixed 1280×720 design box, `transform: scale(containerWidth/1280)`, `transform-origin: top left`, inside an `overflow-hidden` 16:9 frame — so it letterboxes honestly instead of clipping.
  - **Right — the hero:** a very large **NEXT** button showing the next phase label (`"Next: Interventions →"`), the biggest tappable target on the page.
- **PROGRESS RAIL (very bottom, recessive):** filled dots showing position; tappable for jump-to-phase (`cmd('setPhase')`) but visually never competing with Next. (Droppable in MVP → non-interactive dots.)

### Key flows

| Flow | Action | Result |
|---|---|---|
| **Enter** | "Facilitate" button atop `HostConsole` (beside tabs) → navigate to `/r/{room}/facilitate` | Mounts `HostConsole` in `cockpit` mode (same poll). Refresh/co-host links land straight here. |
| **Exit** | "Exit Facilitate" | Navigate to `/r/{room}/host` at the same phase. |
| **Advance** | tap giant NEXT → `cmd('setPhase',{phaseId: next.id})` | Host route returns authoritative `navState`; `apply(d.state)` flips timer + mirror + Next together, even on Upstash. No read-back. |
| **Start** | tap Start → `cmd('setTimer',{endsAt: Date.now()+preset*1000})` using `config.timerSeconds` | Numeral counts down. First tap also unlocks the AudioContext for the chime. |
| **Pause** | tap Pause → `cmd('pauseTimer')` | Store computes `remaining = max(0, timerEndsAt-now)`, writes `{timerEndsAt:null, timerRemainingMs:remaining}`. Numeral freezes + dims on host, **projector, and every phone** (authoritative). |
| **Resume** | tap Resume → `cmd('resumeTimer')` | Store writes `{timerEndsAt: now+remaining, timerRemainingMs:null}`. |
| **+2 min** | tap +2 min → `cmd('setTimer',{addMs:120000})` | Running → `endsAt += 120000`; paused → `timerRemainingMs += 120000` (does NOT start the clock); idle → `endsAt = now+120000`. |
| **Glance-and-trust** | look down | Read phase label + remaining + live mirror; confirm; look up. No tab switch, no scroll. |
| **Zero crossing** | `Countdown.onElapsed` fires once | Soft chime; numeral rests at `0:00` in a calm "time's up" treatment (not red-alarm). No auto-advance — pacing stays human. |
| **Wrap up (final phase, lead only)** | NEXT becomes "Wrap up →" → opens End/Archive confirm (reuses `SessionControls` copy) | |
| **Wrap up (final phase, co-host)** | NEXT shows calm "**Final phase — hand back to the lead to close**" non-action state | Never a button that 403s. |

### Screens & states
- **Timer stopped (idle):** phase preset shown as a startable value (dim `12:00 · Start`), Next live.
- **Running:** accent numeral counting; Start reads Pause; +2 min & Reset available.
- **Paused:** numeral frozen + dimmed/outline, "Paused" caption; button reads Resume; mirror + Next still live.
- **Under 30s:** numeral gently pulses; calm accent, not red.
- **Elapsed (0:00):** soft chime fired once; muted "time's up"; +2 min and Next both prominent.
- **No driveable timer (display-only/lobby phase):** timer band shows `—` with a quiet "No timer this phase"; Next stays hero; Start hidden (manual +2 min still works → `addMs`).
- **Mirror has nothing interactive (lobby/content/no projector renderer):** show the same calm title-card/logo/QR the projector shows (match `ProjectorApp` fallback intent).
- **Final phase / co-host:** see table above.
- **No sequence yet:** unreachable — Facilitate button hidden until `s.mode || s.sequence?.length` (same guard as the `ModeSelector` branch).
- **Mirror error:** `ErrorBoundary` fallback renders a quiet "Preview unavailable — room screen may still be fine" card; a renderer crash never blanks the cockpit.
- **Connection blip:** "Reconnecting…" chip; last-known state persists.

---

## Architecture

### Approach
"Facilitate" is an **opt-in mode of `HostConsole`**, sharing the same `usePolledState` (`state`/`refresh`/`apply`) and the same `cmd` dispatcher already in scope — inheriting auth, role gating, and the `navState` authoritative-apply contract verbatim. **No new control endpoint** for advance/timer; both already round-trip authoritative state via `navState()` and apply client-side with `apply(d.state)`. **The module contract is UNTOUCHED** — no new module / `ModuleServerDef` / renderer / registry change. The mirror consumes the existing projector renderer read-only.

### Files to ADD

| Path | Purpose |
|---|---|
| `app/r/[room]/facilitate/page.tsx` | Client route mounting `<HostConsole apiBase cockpit />` — the deep-linkable cockpit surface; mirrors `host/page.tsx` (params via `use()`). |
| `components/FacilitateCockpit.tsx` | Full-bleed dark stage. Props: `{ state, cmd, apply, refresh, code, role, apiBase, onExit }`. Three bands + progress rail + wake-lock + chime-on-zero. **Pure render over the shared poll — no second `usePolledState`.** |
| `components/useChime.ts` | Shared gesture-gated WebAudio two-note chime, lifted verbatim from `ParticipantApp.tsx:196`. |
| `test/timer-pause.test.ts` | Vitest (in-memory store) coverage — see Test plan. |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/types.ts` | Add `timerRemainingMs?: number \| null` to `SessionState` (~`:132`) and `timerRemainingMs: number \| null` to `PublicState` (~`:236`). `FacilitatorState` inherits it. |
| `lib/store.ts` | (1) Add `timerRemainingMs: null` to `DEFAULT_STATE` (`:179`). (2) Add `timerRemainingMs: null` to `setPhase`'s write (`:286`) and to `setPhases` (`:264`). (3) Add `pauseTimer(roomId)` / `resumeTimer(roomId)`; extend `setTimer` to clear `timerRemainingMs` on absolute set and to support an additive shape. **All three timer mutations run inside `withLock(roomId,'timer',…)`.** (4) Map `state.timerRemainingMs ?? null` into `getPublicState` return (`:807`). (5) Add `state.timerRemainingMs` to the `roomSignature` join array (`:836`). |
| `components/Countdown.tsx` | Add optional `remainingMs?: number \| null`. When provided and `endsAt == null`, render a **static frozen mm:ss** from `remainingMs` and **suppress `onElapsed`**. Existing `endsAt` path unchanged — no caller breaks. |
| `components/ProjectorApp.tsx` | **Change the gate at `:47`** from `state.timerEndsAt && (…)` to `(state.timerEndsAt != null \|\| state.timerRemainingMs != null) && (…)` and pass both props to `Countdown`; add a quiet "Paused" affordance. |
| `components/ParticipantApp.tsx` | **Change the StatusBar gate at `:175`** identically; pass both props to `Countdown`. **Reset the local `expired` flag when `timerEndsAt` transitions to a fresh non-null value** (`useEffect` on `endsAt`). Replace the local `useChime` with `import { useChime } from "@/components/useChime"`. |
| `components/HostConsole.tsx` | Add optional `cockpit?: boolean` prop. When `cockpit && authed && (s.mode \|\| s.sequence?.length)`, render `<FacilitateCockpit state={s} cmd={cmd} apply={apply} refresh={refresh} code={code} role={role} apiBase={apiBase} onExit={…}/>` instead of the tabbed `<main>` — **reusing the same `usePolledState`/`cmd` (no second poll).** Add a persistent "Facilitate" link beside `TABS` → `/r/{room}/facilitate`, shown under the same sequence guard. (Tab/`<main>` markup at `:175–179`.) |
| `app/api/r/[room]/host/route.ts` | Add `pauseTimer`/`resumeTimer` to `COMMAND_CAP` with capability `'timer'`. Add switch cases returning `navState(...)` for both. Extend the `setTimer` case (`:205`) to accept `{ addMs }` in addition to `{ endsAt }`. Import `pauseTimer`/`resumeTimer` from store. |

### Data model
`SessionState` gains `timerRemainingMs?: number | null`; `PublicState`/`FacilitatorState` gain `timerRemainingMs: number | null`. The timer is a **3-state machine over two fields**:

```
RUNNING = timerEndsAt != null  && timerRemainingMs == null
PAUSED  = timerEndsAt == null  && timerRemainingMs != null
IDLE    = timerEndsAt == null  && timerRemainingMs == null
```

`setPhase` (and `setPhases`) clear **both** → no stale pause inherited across phases. `rev` still bumps on every `writeState`, so the anti-flash guard and authoritative-apply work unchanged for pause/resume. **No new Redis keys, no durable DB** — same room state key, 24h TTL, in-memory dev/test fallback. Field is optional → existing rooms read `undefined` → IDLE; no migration.

### Store functions (semantics)

```ts
// All three run inside withLock(roomId, "timer", …) to serialize read-compute-write.
pauseTimer(roomId):  s = getState();
                     remaining = s.timerEndsAt != null ? max(0, s.timerEndsAt - Date.now())
                                                        : (s.timerRemainingMs ?? 0); // idempotent
                     writeState({ ...s, timerEndsAt: null, timerRemainingMs: remaining });

resumeTimer(roomId): s = getState();
                     if (s.timerRemainingMs == null) return s;            // idempotent if running/idle
                     writeState({ ...s, timerEndsAt: Date.now() + s.timerRemainingMs, timerRemainingMs: null });

setTimer({endsAt}):  writeState({ ...s, timerEndsAt: endsAt, timerRemainingMs: null }); // absolute (Start/Reset/Clear)
setTimer({addMs}):   if PAUSED  → writeState({ ...s, timerRemainingMs: s.timerRemainingMs + addMs });
                     if RUNNING → writeState({ ...s, timerEndsAt: s.timerEndsAt + addMs });
                     if IDLE    → writeState({ ...s, timerEndsAt: Date.now() + addMs });
```

### API + host commands (+ capability gating)

| Command | Capability | Cohost? | Body | Returns |
|---|---|---|---|---|
| `pauseTimer` (NEW) | `timer` | yes | `{command, code}` | `{ ok, state: navState(...) }` |
| `resumeTimer` (NEW) | `timer` | yes | `{command, code}` | `{ ok, state: navState(...) }` |
| `setTimer` (EXTENDED) | `timer` | yes | `{command, code, endsAt}` **or** `{command, code, addMs}` | `{ ok, state: navState(...) }` |
| `setPhase` (unchanged) | `advance` | yes | `{command, code, phaseId}` | `{ ok, state: navState(...) }` |
| `end` / `archive` (unchanged) | `end` | **no** | — | — |

Capabilities confirmed in `lib/auth.ts`: cohost has `advance` + `timer` but **not** `end`. The cockpit touches only `advance`/`timer`/(lead-only `end`), never `setPhases`/`configure`/`reassign` — so the documented "configure" gotcha never bites, and the co-host second-screen works fully except End/Archive (handled by the Wrap-up gate).

**No change to `/state`, `/stream`, or `/api/action`.**

### How it uses rev / authoritative-apply (no KV read-back)
Every cockpit nav action rides the existing contract: the host route computes the response from the **just-written** state via `navState(room, written, role)` (`route.ts:39`), and the cockpit applies it with `apply(d.state)` — exactly the path in `HostConsole.cmd` (`HostConsole.tsx:102`). **Never refresh-then-read.** Because `pauseTimer`/`resumeTimer`/`setTimer` all return the full authoritative `FacilitatorState`, the cockpit's timer/mirror/Next flip instantly and correctly even on an eventually-consistent store. The client-side `apply` rev-guard rejects any later stale read with a lower rev.

> **Why client authoritative-apply isn't enough on its own:** it fixes stale *reads on the client*, but does nothing for stale reads *inside* a read-compute-write store mutation. That's why `pauseTimer`/`resumeTimer`/`setTimer-addMs` must be serialized under `withLock` (the cockpit is a designed two-driver lead+cohost surface).

---

## Implementation plan (ordered, checkable)

**Slice 1 — authoritative pause (safe to land alone):**
1. [ ] `lib/types.ts`: add `timerRemainingMs` to `SessionState` (optional) and `PublicState` (required).
2. [ ] `lib/store.ts`: add `timerRemainingMs: null` to `DEFAULT_STATE`, `setPhases`, and `setPhase` writes.
3. [ ] `lib/store.ts`: add `pauseTimer`/`resumeTimer`; extend `setTimer` for `addMs`; wrap all three in `withLock(roomId,'timer',…)`.
4. [ ] `lib/store.ts`: map `timerRemainingMs` into `getPublicState` return; add it to the `roomSignature` join array.
5. [ ] `components/Countdown.tsx`: add `remainingMs` prop → frozen mm:ss + suppressed `onElapsed` when `endsAt == null`.
6. [ ] `components/ProjectorApp.tsx`: **change the timer gate** to `(endsAt != null || remainingMs != null)`, pass both props, add "Paused" affordance.
7. [ ] `components/ParticipantApp.tsx`: **change the StatusBar gate** identically; pass both props; reset `expired` on fresh non-null `endsAt`.
8. [ ] `app/api/r/[room]/host/route.ts`: add `pauseTimer`/`resumeTimer` to `COMMAND_CAP` (cap `timer`) + switch cases returning `navState`; extend `setTimer` for `{addMs}`; import the two store fns.
9. [ ] `test/timer-pause.test.ts`: write the cases below. Run `npm run verify`.

**Slice 2 — the cockpit:**
10. [ ] `components/useChime.ts`: lift `useChime` verbatim; swap `ParticipantApp` to import it (no behaviour change).
11. [ ] `components/FacilitateCockpit.tsx`: three bands, progress rail, mirror (1280×720 → `scale()` in 16:9 `overflow-hidden`, `pointer-events-none`, `ErrorBoundary resetKey=`${phaseId}:${rev}``), chime on `Countdown.onElapsed`, Start/Pause/Resume/+2/Reset, NEXT, final-phase Wrap-up gated on `end` capability.
12. [ ] Wake-lock: request on mount, release on unmount, **re-acquire on `visibilitychange`** when the tab regains focus; feature-detected and failure-tolerant (never let an exception blank the cockpit). *(Droppable for thinnest MVP.)*
13. [ ] `components/HostConsole.tsx`: add `cockpit?` prop → render `FacilitateCockpit` over the shared poll; add the "Facilitate" link under the sequence guard.
14. [ ] `app/r/[room]/facilitate/page.tsx`: mount `<HostConsole apiBase cockpit />`.
15. [ ] `npm run verify` (typecheck + lint + test, Node 24) then `npm run build`; manual QA (below).

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. **I can drive the whole arc from one screen.** From a templated room as facilitator, entering `/facilitate` shows phase label, live timer, an honest room mirror, and a giant Next — no tabs, no scroll. Tapping Next advances the room; timer + mirror + Next label all flip together with no pre-write flash (even on Upstash).
2. **Pause holds the clock everywhere, and the room still SHOWS the time.** Tapping Pause freezes the numeral on the host AND on the projector AND on every participant phone — each shows a **frozen numeral, never a blank** — with a "Paused" caption. Resume continues from the held value on all surfaces.
3. **+2 min works in every state, including paused.** +2 while running extends `endsAt`; +2 while paused adds to the held remaining **without starting the clock**; +2 while idle starts a 2-minute timer. A +2-while-paused reaches the room within the SSE tick (no waiting for an unrelated change).
4. **Two drivers can't drop time.** A lead's +2 min concurrent with a cohost's Pause never silently loses the 2 minutes (serialized under `withLock`).
5. **The mirror is honest.** It renders the actual projector renderer at real proportions (letterboxed, not text-shrunk); a renderer crash shows a quiet card, never a blank cockpit; advancing remounts it cleanly.
6. **The co-host is never dead-ended.** As cohost, Next/Start/Pause/+2 all work; on the final phase the hero shows "Final phase — hand back to the lead to close" (no 403, no dead button). As facilitator, the final phase shows "Wrap up →" → the existing End/Archive confirm.
7. **The chime is calm and singular.** It fires once at zero (gesture-unlocked by the first Start/Next tap); pause-at-zero then +2 min does **not** re-chime every phone or leave a stuck "Time's up".
8. **No timer, no nonsense.** A display-only/lobby phase shows `—` + "No timer this phase"; Start is hidden; +2 min still gives the room two minutes.
9. **Privacy intact.** `/facilitate` is passcode-gated identically to `/host`; co-host enters their own passcode (no secret in any URL).

---

## Test plan

### Vitest — `test/timer-pause.test.ts` (in-memory store, no KV/AI)
- `pauseTimer` from RUNNING → `timerEndsAt == null`, `timerRemainingMs ≈ (endsAt - now)` (tolerance), invariant PAUSED holds.
- `resumeTimer` from PAUSED → `timerEndsAt ≈ now + remaining`, `timerRemainingMs == null`, invariant RUNNING.
- `setTimer({addMs})` while **paused** → `timerRemainingMs += addMs`, `timerEndsAt` stays `null` (does NOT start the clock).
- `setTimer({addMs})` while **running** → `timerEndsAt += addMs`.
- `setTimer({addMs})` while **idle** → `timerEndsAt ≈ now + addMs`.
- `setTimer({endsAt})` (absolute) clears `timerRemainingMs`.
- `setPhase` from a PAUSED state → both `timerEndsAt` and `timerRemainingMs` null (no stale pause across phases).
- `pauseTimer` / `resumeTimer` idempotency (pause-when-already-paused, resume-when-running).
- **`roomSignature` differs before/after a +2-min-while-paused** (asserts the SSE tick on a remaining-only change).
- Concurrent **lead +2 min vs cohost pause** does not drop the 2 minutes (exercise the `withLock` serialization).
- Invariant assertion helper: exactly one of RUNNING/PAUSED/IDLE holds after every mutation.

### Manual QA
**Trust-critical (do not ship without):** enter a templated room on three devices (host laptop / projector screen URL / participant phone). Start a timer, then Pause → **all three show a frozen numeral, not a blank**, with "Paused". +2 min while paused → all three reflect the new held value within ~2s. Resume → all three continue together.

**Roles:** repeat Next/Start/Pause/+2 as **facilitator** and as **cohost**. Confirm cohost's final-phase Next shows "hand back to the lead" (no 403); facilitator's shows "Wrap up →" → End/Archive confirm copy.

**Chime:** zero-crossing chimes once. Pause-at-zero then +2 min does not re-chime every phone or stick "Time's up".

**Mirror:** verify fidelity against a viewport-unit / media-heavy projector module — it letterboxes, doesn't clip; force a renderer error and confirm the quiet fallback card.

**Mobile one-hand:** Next, Start/Pause, +2 min all ≥ 44px and thumb-reachable; progress rail not fat-finger-jumpable.

**Deep-link/refresh:** refresh on `/facilitate` lands back in the cockpit at the same phase; Exit → `/host` at the same phase.

**Wake lock (if shipped):** screen stays lit on a static cockpit; flip away and back → lock re-acquired; no exception blanks the screen.

---

## Privacy & ethos check (explicit)
- **No regression.** `/facilitate` is passcode-gated identically to `/host` via the same `requireCapability`/resolved-role path.
- **No secret in URLs.** Co-host enters their **own** passcode (open-question recommendation kept) — a passcode-bearing cohost URL would be a real regression and is rejected.
- `timerRemainingMs` is **non-identifying pacing state**, ephemeral in the existing room key under the 24h TTL. **No new Redis keys, no durable DB, account-less, off-the-record all untouched.**
- **No submissions or participant content** touched, logged, or rendered differently. The mirror is read-only (`act:async()=>false`).
- End-session wipe semantics unchanged (`endSession` already resets `DEFAULT_STATE`, which now includes `timerRemainingMs:null`).

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk | Resolution (folded into spec) |
|---|---|
| **CRITICAL — paused timer VANISHES from the room.** `ProjectorApp:47` / `ParticipantApp:175` gate on `timerEndsAt` truthiness; paused writes `endsAt:null` → renders nothing. | **Change the gates** to `(timerEndsAt != null \|\| timerRemainingMs != null)` and pass both props to `Countdown` (paused branch renders frozen mm:ss). Trust-critical manual + Vitest intent assert "pause SHOWS a frozen numeral, never blank." |
| **CRITICAL — +2-while-paused emits no SSE tick.** `roomSignature` keys on `timerEndsAt`; a remaining-only change wouldn't tick the stream. | Add `state.timerRemainingMs` to the `roomSignature` join array (`:836`). Build gate, with a test asserting the signature differs across a paused +2. |
| **MAJOR — eventually-consistent read-compute-write race (two drivers).** Stale `getState()` inside `pauseTimer`/`addMs` can drop time. | Serialize `pauseTimer`/`resumeTimer`/`setTimer-addMs` under the existing per-room `withLock`. Test concurrent +2-vs-pause. |
| **MAJOR — cohost Wrap-up dead-ends.** Cohost lacks `end` cap and the Session tab; routing Wrap-up through `SessionControls` 403s. | Gate final-phase Next on the `end` capability; cohost sees a calm "hand back to the lead to close" non-action state. |
| **MAJOR — stuck "Time's up" / chime swarm across pause→+2.** `expired` flag + 6s timer in indeterminate state on remount. | Keep `onElapsed` suppressed in paused mode; reset `expired` on each fresh non-null `endsAt`. Smoke: pause-at-zero then +2 doesn't re-chime. |
| **MINOR — Wake Lock is net-new surface (zero prior use), unsupported iOS Safari <16.4, auto-released on blur.** | Feature-detected + failure-tolerant; re-acquire on `visibilitychange`; budget real time; droppable for thinnest MVP. Never let an exception blank the cockpit. |
| **MINOR — mirror transform-scale fidelity.** Approximate scale clips viewport-unit renderers. | Fixed 1280×720 design box, `scale(containerWidth/1280)`, `transform-origin: top left`, `overflow-hidden` 16:9, `pointer-events-none`. Verify against a viewport-unit-heavy module before calling it honest. |
| **Scope creep** (per-phase note, chime-mute persistence, cohost link). | Held out of C1 (see below). Keep Slice 1 / Slice 2 ordering strict; Slice 1 is safe alone because nothing emits a pause until the cockpit exists. |

---

## Out of scope / future
- **Per-phase facilitator script/note** in the center band (`PhaseConfig` has no such field today; could later read an optional `config.note` with no schema churn elsewhere).
- **Persistent chime-mute preference** (cockpit ships with chime on + a session-local mute, matching participant behaviour).
- **Shareable cohost driving link** — explicitly rejected on privacy grounds; co-host enters their own passcode.
- **Auto-start next phase's timer on advance** — rejected; explicit Start keeps pacing human.
- **Auto-advance at zero** — rejected; the facilitator decides (+2 or advance).
