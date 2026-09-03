# E2 — Presenter polish (transitions, fullscreen, now/next ribbon)

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 3.5 days (suggest 3 PRs — see Implementation plan)
- **Surface:** `/r/[room]/screen` (projector, read-only) — plus two behavior-preserving extractions on host + participant surfaces.
- **Dependencies (component/infra, not other roadmap items):**
  - `usePolledState` rev-reject anti-flash guard + `apply` (`components/usePolledState.ts`) — the transition keys off applied state only.
  - `PublicState` fields already shipped by the `/state` route: `sequence` (`{id,label,moduleId}[]`), `phaseId`, `config.label`, `timerEndsAt`, `modeName`, `branding`, `contentVersion`, `ended`, `rev`.
  - `HostConsole` `PhaseStepper` nav math (refactor target).
  - `ParticipantApp` private `useChime` (extraction source).
  - `Countdown` (reused as-is, incl. `onElapsed`).
  - `ErrorBoundary` keyed `${phaseId}:${rev}` (transition wraps it; reset semantics preserved).
  - tailwind `riseIn`/`pulseSoft` easing vocabulary + `globals.css` `prefers-reduced-motion` block + `.grain`/gradient-mesh canvas.
  - `getClientRenderer(moduleId, "projector")` (unchanged; transition only wraps its mount).
- **No dependency on:** any API route, host command, capability gate, store key, or module-contract change. None are touched.

---

## Problem & facilitator value

**In the facilitator's voice:**

> "The projector is my room's focal point for a whole hour, and right now it looks like a debug view. When I hit Advance the wall hard-cuts — a flash that breaks the calm I'm working to build, especially when a module's AI was mid-reveal. The screen is just a browser tab: address bar, tab strip, and a real risk the laptop falls asleep mid-session. And the wall never tells the room where we are. I end up saying out loud, again, 'we're three of six, next is the read-around' — labor the screen should be doing for me.
>
> I want to walk in, click one thing, and have the laptop become an appliance: true fullscreen, no chrome, won't sleep. I want phase changes to feel intentional — a soft dissolve and a quiet chime that buys me a beat of attention exactly when I want the room to look up. And I want a slim ribbon along the bottom that quietly answers 'where are we / what's next / how far in' so a latecomer or a distracted participant or my co-host can re-orient at a glance without me breaking stride. I shouldn't have to configure any of this. It should just appear."

**The three concrete gaps:**

1. **No transitions.** Active module's projector renderer swaps instantly inside an `ErrorBoundary` keyed `${phaseId}:${rev}`. Hard cut; breaks calm; clobbers mid-reveal shimmer.
2. **No true fullscreen.** No Fullscreen API call, no wake-lock anywhere. Browser chrome on the wall; sleeping-laptop risk.
3. **No sense of place.** Top bar shows only the current phase label + timer. The room never knows where it is in the arc, even though `sequence` + `phaseId` are already in `PublicState`.

**Why this respects the keystone idea:** methods are configured chains of primitives. E2 adds **zero** configuration and **no** new primitive — it improves the *chrome around any chain*, reading entirely from state that already exists.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP (ship first — the load-bearing 80%)

1. **`lib/sequence.ts` `phaseNav` helper** + unit tests; refactor `PhaseStepper` and the ribbon to both consume it (single source of truth, can't drift).
2. **`<PresenterRibbon>`** — bottom-edge glass ribbon: segment dots (collapse to progress bar > 10 phases), `NOW — {label}`, `NEXT — {label}` (→ `Wrapping up.` on final), `3 / 6` counter, and the reused `<Countdown>` timer cell. Hidden in lobby + on ended. Reconnecting chip in the right cell. Retires the top status bar.
3. **`<PhaseTransition>`** cross-dissolve on applied `phaseId` change, with the must-fixes baked in (frozen outgoing snapshot, CSS-end-driven unmount, single applied-`phaseId` source). Wraps the `ErrorBoundary`.
4. **`components/useChime.ts`** — extract verbatim from `ParticipantApp`; fire once per phase change (debounced ≤ 1/1.5s) and on timer elapse; `ParticipantApp` imports the shared hook.
5. **`usePresentMode` + `<PresentPill>`** — Fullscreen API + Screen Wake Lock, auto-hiding control, cinema CSS fallback when Fullscreen is denied.

That is the whole feature. There is no smaller honest cut — each of the three gaps is independently visible on the wall.

### Full vision (deferred — see Out of scope)

- Per-phase `hideNext` opt-out (surprise-reframe methods) — requires widening persisted phase config + `/state` projection.
- Per-room top/bottom ribbon position toggle (v1: a one-line constant, bottom).
- Ambient 1px timer-remaining progress hairline along the very bottom edge.
- One-shot `nowBreathe` on the NOW label at phase begin (nice-to-have; include if cheap).

---

## Experience & flows

### Screens & states

| State | Canvas | Ribbon | Present pill |
|---|---|---|---|
| **Lobby** (`!moduleId` / empty sequence) | branded title card + join QR (unchanged) | **hidden** | **visible** (over lobby) |
| **Active, has projector renderer** | module view, `flex-1`, scrolls internally | NOW / NEXT / counter / timer | visible, auto-hides |
| **Active, no renderer / `view` degraded to null** | calm logo + headline + "Look up here when the room shares." | **visible** (keeps room oriented) | visible, auto-hides |
| **Mid-transition (~280ms)** | outgoing snapshot + incoming co-mounted, opacity+drift tween; outgoing `pointer-events:none` | **static** (only labels/segments tween) | unchanged |
| **Present mode** | identical content, browser chrome gone, cursor hidden after idle | unchanged | hidden until mousemove/keypress |
| **Session closed** (`ended`) | "Session closed." centered | **hidden** | wake-lock released; auto-exit fullscreen after a few seconds |
| **Reconnecting** (`error` truthy) | keeps last-good view (never blanks) | "Reconnecting…" chip in right cell | unchanged |

### Ribbon anatomy (left → right)

- **Segments:** one dot per phase up to ~10; current dot filled in room accent, done dots muted-filled, upcoming hollow. **>10 phases:** collapse to a slim filled progress bar (`idx+1 / total` width).
- **NOW — {current label}** — accent emphasis; truncates with ellipsis on overflow (host console has the full title).
- hairline divider
- **NEXT — {next label}** — muted; on the final phase → **"Wrapping up."**; hides first on narrow/portrait projectors.
- **counter `3 / 6`** — always present, carries precise position even when segments collapse.
- **timer cell** — `<Countdown>` in mono accent when `timerEndsAt` set; on elapse flips to **"Time's up"** (warm, not alarming) and fires the chime; on `error` shows **"Reconnecting…"**.

Visual: full-bleed, ~64px on a 1080p wall, `bg-bg/70 backdrop-blur` glass over the existing `.grain`. Muted tones; accent reserved for the active segment + the timer. Stays **mounted across phase changes** — only its labels/segments tween, so the room's anchor never blinks.

### Key flows

1. **Enter present mode.** Click `⤢ Present` → `document.documentElement.requestFullscreen()` + `navigator.wakeLock.request('screen')` → **resume/create the AudioContext on this gesture** → controls auto-hide after 3s idle, reveal on mousemove/keypress, cursor hidden when idle. Esc or the pill exits fullscreen and releases the wake-lock. Wake-lock re-acquired on `visibilitychange`→visible.
2. **Phase advance.** Host hits Advance/jumps in `PhaseStepper` → `setPhase` → authoritative state applied via `usePolledState.apply` (new `rev`+`phaseId`) → `<PhaseTransition>` detects the **applied** `phaseId` change → cross-dissolve (outgoing snapshot → incoming live) + single chime. `ErrorBoundary` resetKey stays `${phaseId}:${rev}`; the dissolve wraps the boundary.
3. **Now/next derivation.** `phaseNav(state.sequence, state.phaseId)` → `{idx, current, prev, next, total}`. Identical helper feeds `PhaseStepper`.
4. **Timer on ribbon.** `<Countdown endsAt={state.timerEndsAt} onElapsed={chime}/>`; on elapse → "Time's up" + chime, so wall and phones chime together.
5. **Fullscreen fallback.** Fullscreen unavailable/denied → toggle a `.cinema` class on `<main>` (maximize canvas, hide chrome affordances) + one-time "press F11 for fullscreen" hint (dismissable, Esc-bound to exit cinema).

### Copy that matters

- Present pill: `⤢ Present` (lobby + canvas overlay).
- Final-phase NEXT: `Wrapping up.`
- Timer elapsed: `Time's up`
- Reconnecting chip: `Reconnecting…`
- Fullscreen-denied hint: `Press F11 for fullscreen`
- Rendererless fallback line: `Look up here when the room shares.` (unchanged)

---

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/sequence.ts` | Pure, dependency-free `phaseNav(sequence, phaseId) => {idx, current, prev, next, total}`. Generic over the `{id,label,moduleId}` entry shape used by both `PublicState.sequence` and `FacilitatorState`. Single source of truth for now/next/prev. |
| `/Users/jordan/workshop/edges-v2/components/useChime.ts` | Two-note zero-asset WebAudio chime, extracted **verbatim** from the private `useChime` in `ParticipantApp.tsx` (~L196-222), plus a `resume()` affordance so a user gesture can wake a suspended `AudioContext`. |
| `/Users/jordan/workshop/edges-v2/components/usePresentMode.ts` | Fullscreen API + Screen Wake Lock hook: `{ enter, exit, toggle, active, supported, controlsVisible }`. Auto-hide idle controls (3s), reveal on mousemove/keypress, wake-lock re-acquire on `visibilitychange`→visible, swallow all rejections, never block render. Exposes `supported=false` to trigger the `.cinema` fallback path. |
| `/Users/jordan/workshop/edges-v2/components/PresenterRibbon.tsx` | Read-only bottom ribbon (see anatomy). Derives everything from `phaseNav`. Stays mounted across phase changes. |
| `/Users/jordan/workshop/edges-v2/components/PhaseTransition.tsx` | Cross-dissolve wrapper around the `ErrorBoundary`. Frozen outgoing snapshot, CSS-end-driven unmount, debounced chime, rapid-advance snap. |
| `/Users/jordan/workshop/edges-v2/components/PresentPill.tsx` | Auto-hiding `⤢ Present` control + exit affordance, wired to `usePresentMode`. Optional speaker toggle (chime opt-in; **defaults OFF** until present mode entered). Pure presentational. |
| `/Users/jordan/workshop/edges-v2/test/sequence.test.ts` | Vitest unit tests for `phaseNav` (in-memory, no KV/AI). |

### Files to CHANGE

| Path | Change |
|---|---|
| `components/ProjectorApp.tsx` | Main integration. Restructure into `flex-col <main>` (toggling `.cinema` from `usePresentMode` fallback) → `flex-1` canvas that scrolls internally → fixed bottom `<PresenterRibbon>` outside the scroll region. Wrap the active-module branch in `<PhaseTransition>` around the existing `ErrorBoundary` (resetKey unchanged). Keep rendererless branch but **also render the ribbon beneath it**. Retire the top status-bar label into the ribbon (move `Reconnecting…` + `Countdown` down). Add `<PresentPill>` overlay. Hide ribbon in lobby + on ended; release wake-lock + auto-exit fullscreen a few seconds after `ended`. |
| `components/HostConsole.tsx` | Refactor `PhaseStepper` (~L519-523) to compute `idx/prev/next` via `phaseNav` from `lib/sequence.ts`. Pure internal change; identical rendering + `setPhase` behavior. |
| `components/ParticipantApp.tsx` | Delete the private `useChime` (~L196-222); import the shared hook from `components/useChime.ts`. Behavior unchanged (still fired on timer elapse in `StatusBar`). |
| `tailwind.config.ts` | Add `crossFadeIn`/`crossFadeOut` keyframes + animations in the existing `cubic-bezier(0.22,1,0.36,1)` easing (opacity + 6px `translateY` drift, ~280ms). Optionally a one-shot `nowBreathe` (pulseSoft-derived) for the NOW label. |
| `app/globals.css` | Add a minimal `.cinema` utility (maximize canvas, hide chrome affordances) for the Fullscreen-denied fallback, and a `cursor: none` rule for present-mode idle. **No new `prefers-reduced-motion` block** — the existing one (L64-72) already neutralizes the new animations/transitions to `0.001ms`. |

### Data model

**No persisted-state changes and no new `SessionState`/`PublicState` fields.** All inputs already ship in `PublicState`:

```ts
sequence: { id: string; label: string; moduleId: ModuleKind }[];  // L226
phaseId: string | null;       // L233
config: PhaseConfig | null;   // L235  (config.label for the NOW label)
timerEndsAt: number | null;   // L236
modeName: string | null;      // L216
branding?: RoomBranding | null; // L219
contentVersion: number;       // L239  — read ONLY to EXCLUDE it from the trigger
ended: boolean;               // L214
rev: number;                  // L232
```

New **derived (non-persisted)** type in `lib/sequence.ts`:

```ts
export type PhaseEntry = { id: string; label: string; moduleId: ModuleKind };
export interface PhaseNav<T extends { id: string }> {
  idx: number;        // -1 if phaseId not found / null
  current: T | null;
  prev: T | null;
  next: T | null;
  total: number;
}
export function phaseNav<T extends { id: string }>(
  sequence: readonly T[],
  phaseId: string | null,
): PhaseNav<T> {
  const total = sequence.length;
  const idx = phaseId == null ? -1 : sequence.findIndex((p) => p.id === phaseId);
  return {
    idx,
    current: idx >= 0 ? sequence[idx] : null,
    prev: idx > 0 ? sequence[idx - 1] : null,
    next: idx >= 0 && idx < total - 1 ? sequence[idx + 1] : null,
    total,
  };
}
```

(Matches `PhaseStepper`'s existing `findIndex` / `idx±1` math exactly — the refactor is provably behavior-preserving.)

Present-mode / fullscreen / wake-lock state is **entirely client-local** (refs + `useState` in `usePresentMode`), never written to the store.

### Store keys / view shapes

**None added or changed.** No new module view type, no `render-kit`/`registry`/`views` change.

### API + host commands (+ capability gating)

**NONE.** The projector is read-only: `act` stays `async () => false`, `token`/`handle` stay `""`. No new endpoints; no change to `app/api/r/[room]/host/route.ts`, the `/state` projection, or the SSE `/stream` accelerator. **No capability gating required** — the projector never calls `cmd`/host actions, so the `auth.ts` `CAPABILITIES` map, `requireCapability`, and the painful `configure`-vs-`advance` distinction are entirely out of scope.

### How it uses the rev / authoritative-apply pattern (no KV read-back)

- The transition trigger keys **only on the applied `state.phaseId`** from `usePolledState` (a `useEffect` dependency on `state.phaseId`). Because both the poll path (L72-78) and the `apply` path (L140) drop any state with `rev < lastRevRef`, a stale/eventually-consistent read can **never reach** the phaseId-change effect → no spurious dissolve.
- **One source of truth for three things:** dissolve trigger, dissolve target, and ribbon all read `state.phaseId`/`phaseNav(state.sequence, state.phaseId)` off the same applied state. They can never diverge, so the wall's NOW/NEXT can't point at a different phase than the canvas is dissolving toward.
- **No read-back, no new write-then-show flow.** The host's existing authoritative-apply (`navState` → `getFacilitatorState` → `usePolledState.apply`) is untouched. E2 introduces no write, so the `navState` pattern is unaffected.
- **`contentVersion` / `timerEndsAt` bumps never dissolve or chime** — they arrive as a fresh state object with the **same** `phaseId`; the active renderer re-renders with new `view.data`, and the phaseId-keyed effect does not fire. This mirrors the `ErrorBoundary`'s phaseId-keyed reset semantics.

---

## Implementation plan (ordered, checkable)

**PR (a) — sequence helper + host refactor**
- [ ] Add `lib/sequence.ts` with `phaseNav` + `PhaseNav`/`PhaseEntry` types.
- [ ] Add `test/sequence.test.ts` (cases below).
- [ ] Refactor `HostConsole.PhaseStepper` to derive `idx/prev/next` from `phaseNav`. Confirm identical render + `setPhase` behavior; existing tests pass.

**PR (b) — chime extraction**
- [ ] Add `components/useChime.ts` (verbatim two-note chime + a `resume()` that calls `ctx.resume()` and lazily creates the context).
- [ ] Replace `ParticipantApp`'s private `useChime` with an import; confirm timer-elapse chime in `StatusBar` unchanged.

**PR (c) — projector polish**
- [ ] tailwind: add `crossFadeIn`/`crossFadeOut` keyframes+animations (opacity + 6px drift, ~280ms, riseIn easing); optional `nowBreathe`.
- [ ] globals.css: add `.cinema` utility + present-mode `cursor: none` idle rule.
- [ ] Add `components/usePresentMode.ts` (Fullscreen + Wake Lock + auto-hide + re-acquire + cinema fallback + Esc handling for cinema).
- [ ] Add `components/PresentPill.tsx` (auto-hiding control, chime speaker toggle defaulting OFF, gesture wakes AudioContext).
- [ ] Add `components/PresenterRibbon.tsx` (segments/progress-bar collapse, NOW/NEXT/counter, `<Countdown>` cell with Time's up / Reconnecting states).
- [ ] Add `components/PhaseTransition.tsx`:
  - [ ] Track applied `phaseId` in a ref; on change, snapshot the **outgoing React node** (built from the `view.data` value at transition start — a frozen constant, NOT live `state.view`).
  - [ ] Co-mount outgoing (frozen, `pointer-events:none`) + incoming (live). Apply `crossFadeOut`/`crossFadeIn` classes.
  - [ ] Unmount the outgoing layer on its `onAnimationEnd`/`onTransitionEnd` (so reduced-motion's `0.001ms` yields a true instant swap — no JS `setTimeout`).
  - [ ] On a newer `phaseId` mid-dissolve: **force-unmount** the stale outgoing layer synchronously, re-snapshot, snap to latest.
  - [ ] Fire the chime once per phaseId change, debounced ≤ once per ~1.5s; chime only when present mode entered (or speaker toggled on).
- [ ] Rewrite `ProjectorApp` layout: `flex-col <main>` (`.cinema` toggle) → `flex-1` canvas → fixed `<PresenterRibbon>`. Wrap active branch in `<PhaseTransition>` around the `ErrorBoundary` (resetKey unchanged). Render ribbon under the rendererless branch too. Hide ribbon in lobby + on ended. On `ended`: release wake-lock + auto-exit fullscreen after a few seconds. Add `<PresentPill>`.
- [ ] Run `npm run verify` (typecheck+lint+test) + build on Node 24. Watch the no-`Set`-spread / no-`.entries()` convention (use `Array.from()`/index loops); PascalCase Renderer-style consts with hooks above early returns.

---

## Acceptance criteria (facilitator-outcome framed)

1. **The room always knows where it is.** During any active phase (renderer or not), the wall shows a bottom ribbon with the current phase highlighted, the next phase named, and a `N / total` counter. A latecomer can re-orient at a glance without the facilitator speaking.
2. **Phase changes feel intentional, not technical.** Hitting Advance produces a soft ~280ms cross-dissolve (not a hard cut) and a single soft two-note chime; the ribbon stays put while its labels/segments tween.
3. **Content pulses and timer changes are silent.** Injecting content or changing the timer updates the wall **without** any dissolve or chime — only an actual phase change moves the room.
4. **Rapid advancing doesn't machine-gun.** Several quick Advances snap to the latest phase with no queued dissolves and at most one chime per ~1.5s; the ribbon and the canvas always agree on the current phase.
5. **One click makes the laptop an appliance.** Clicking `⤢ Present` goes true fullscreen and acquires a wake-lock; controls + cursor auto-hide after 3s and return on mousemove/keypress; Esc exits and releases the lock; the lock survives a tab-away (re-acquired on return).
6. **Locked-down displays still present cleanly.** When Fullscreen is denied, the pill maximizes the canvas via `.cinema` and shows a dismissable "Press F11 for fullscreen" hint instead of throwing; Esc exits cinema.
7. **The wall never blanks on a blip.** A reconnect shows a "Reconnecting…" chip in the ribbon while keeping the last-good view and ribbon; a stale/out-of-order poll never triggers a dissolve.
8. **Reduced-motion is honored without going silent.** With `prefers-reduced-motion`, phase changes are an instant swap (no drift, no breathe, no lingering double-mount ghost) — but the chime still fires.
9. **Long sequences stay legible.** A 12-phase session collapses segment dots to a slim progress bar; the `N / total` counter still carries exact position; the ribbon never wraps or overflows.
10. **End-session returns the laptop to normal.** On `ended`, the wall shows "Session closed.", the ribbon hides, the wake-lock releases, and fullscreen auto-exits after a few seconds.
11. **Zero new configuration.** The polish appears automatically on every existing room/template; the builder and host flows are unchanged; no module, capability, API, or store change is required.

---

## Test plan

### Vitest (`test/sequence.test.ts`, in-memory, no KV/AI)

- Empty sequence → `{idx:-1, current:null, prev:null, next:null, total:0}`.
- Single phase, matching `phaseId` → `idx:0`, `current` set, `prev`/`next` null, `total:1`.
- First position → `prev:null`, `next` = second.
- Middle position → `prev`/`current`/`next` all set.
- Last position → `next:null`, `prev` = penultimate.
- `phaseId` null → `idx:-1`, all null, `total` correct.
- Unknown `phaseId` (not in sequence) → `idx:-1`, `current/prev/next` null, `total` correct.
- (Regression) feed a real multi-phase template's sequence and assert parity with the old `PhaseStepper` math.

Existing `HostConsole` and `ParticipantApp` tests must continue to pass unchanged (refactor + extraction are behavior-preserving).

### Manual QA — projector (`/r/[room]/screen`, 1080p wall + a laptop)

1. Advance in `/host` → soft cross-dissolve + single chime; ribbon static; NOW/NEXT update.
2. Inject content + change timer during a phase → **no** dissolve, **no** chime; module re-renders with new data.
3. Rapid-advance 4× quickly → snaps to latest, no machine-gun chime, ribbon = canvas phase.
4. Click `⤢ Present` → fullscreen + wake-lock; controls + cursor auto-hide after 3s; mousemove/keypress reveal; Esc exits + releases lock.
5. Tab away ~5s and return → wake-lock re-acquired (verify the screen still won't sleep).
6. Fullscreen-denied browser/iframe → `.cinema` fallback maximizes canvas + "Press F11" hint; Esc exits cinema; pill still functional.
7. `prefers-reduced-motion: reduce` (OS or devtools) → instant swap, no ghost double-mount, **chime still fires**.
8. 12-phase template (pick from `lib/templates.ts`) → dots collapse to progress bar; `N / 12` correct.
9. Reconnect blip (kill network briefly) → "Reconnecting…" chip; ribbon + canvas keep last-good; never blank.
10. End session in `/host` → "Session closed."; ribbon hidden; wake-lock released; fullscreen auto-exits.
11. Lobby state → ribbon hidden, join QR owns the screen, present pill visible.
12. Rendererless phase (a module with no projector renderer, and a `computeView`-throw degrade) → calm logo + headline **+ ribbon** (not a bare line, not blank).
13. Multiple projectors on one room → each manages its own fullscreen/wake-lock; both show identical ribbon state.

### Manual QA — mobile / cross-surface (`/r/[room]`)

14. Phone timer-elapse chime in `StatusBar` still fires (chime extraction regression).
15. With a projector laptop speaker near phones, confirm the wall chime defaults OFF until present mode is entered (no surprise double-chime on an untouched lobby tab).

---

## Privacy & ethos check (explicit)

- **No new data captured, logged, or persisted.** Fullscreen + wake-lock + present-mode are client-local refs/`useState`, never written to the store. Off-the-record contract, 24h TTL, end-session wipe, account-less, submissions-never-logged are all untouched.
- **No new exposure surface.** The ribbon renders `sequence` labels that `getPublicState` **already ships** to the projector role (identical to what participants' `/state` returns). This is not a new data exposure or a TTL/anonymity regression.
- **One behavioral nuance, stated out loud (not "zero behavior change"):** the v1 ribbon reveals **NEXT** for every method, including surprise-reframe sessions, with no opt-out. This is an intentional, accepted v1 trade. The per-phase `hideNext` opt-out is **deferred** (it would require widening the persisted phase config + the `/state` sequence projection) and is the future remedy.
- **Read-only authority preserved.** The projector issues zero host commands; `act` stays a no-op, `token`/`handle` stay empty. The ribbon and present controls are orientation/chrome only — zero room authority. The facilitator still drives from `/host`.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

**Must-fix 1 — Reduced-motion ghost / outgoing-layer unmount.**
The `prefers-reduced-motion` block only neutralizes `animation-duration`/`transition-duration` to `0.001ms`; a JS `setTimeout(280)` to unmount would ignore it and leave a 280ms double-mount ghost.
→ **Resolved:** drive the outgoing-layer unmount off the dissolve's `onAnimationEnd`/`onTransitionEnd` (fires near-instantly at `0.001ms` under reduced-motion). Plus a hard guard: a newer `phaseId` **force-unmounts** the stale outgoing layer synchronously rather than awaiting any end event.

**Must-fix 2 — Frozen outgoing snapshot vs content pulse.**
`render-kit` `Reveal`/`AiGenerating`/`useSyncedState` are stateful/effect-driven. If the outgoing layer re-rendered with fresh `view.data` (a `contentVersion`/`rev` bump arriving mid-dissolve), its shimmer/Reveal effects would re-fire on a layer meant to be a static fading snapshot — re-introducing the exact flicker this feature removes.
→ **Resolved:** at phaseId-change, capture the **outgoing render as a frozen element snapshot** (the React node / `view.data` value at transition start) and render that constant for the outgoing layer — never live `state.view`. Only the incoming layer reads live state.

**Must-fix 3 — Single applied-`phaseId` source.**
If the dissolve trigger, dissolve target, or ribbon read different sources, the wall could show NOW=X while the canvas dissolves to Y, or a stale poll could spawn a spurious dissolve.
→ **Resolved:** trigger, target, and ribbon all derive from the **same applied `state.phaseId`** (behind the existing rev-reject guard); never off raw poll responses; never split sources.

**Must-fix 4 — WebAudio autoplay / suspended context.**
An `AudioContext` created without a prior user gesture starts suspended, so the first chime on a never-clicked projector is silently dropped.
→ **Resolved:** create/`resume()` the `AudioContext` on the Present-pill click (guaranteed gesture) and on mousemove-reveal; call `ctx.resume()` before scheduling notes. Projector chime **defaults OFF until present mode is entered**; document that an un-clicked lobby projector may not chime (acceptable — that's the intended default).

**Minor — rapid-advance ribbon truth:** ribbon reads `phaseNav(state.sequence, state.phaseId)` off applied state and never animates between values; the dissolve target derives from the same applied `phaseId` → can't diverge (covered by must-fix 3).

**Minor — rendererless / `view==null` degrade:** keep the existing `Renderer && state.view` active-branch condition; the else branch (logo/headline + ribbon) covers both "no projector renderer" and "`computeView` threw → `view:null` with `moduleId` set." Confirm the ribbon renders in that else branch.

**Minor — present-mode accessibility:** in the `.cinema` fallback, bind Esc to toggle cinema off; reveal the Present pill on any keypress (not only mousemove); keep the "Press F11" hint dismissable and re-summonable. Native Esc already exits real fullscreen.

**Scope risk:** low/well-bounded — 6 new files + 5 behavior-preserving edits, no flags/migration. Only cross-surface edits (PhaseStepper refactor, chime extraction) are pure extractions covered by existing tests. Before picking the dot→bar collapse threshold (~10), eyeball the phase-count distribution in `lib/templates.ts`. Keep cinema CSS minimal — maximize canvas + hint, don't reimplement fullscreen layout.

---

## Out of scope / future

- **Per-phase `hideNext`** opt-out for surprise-reframe methods (needs a new persisted phase-config field + `/state` sequence projection widening). The remedy for the v1 "NEXT always visible" nuance.
- **Per-room ribbon position** (top vs bottom) toggle — v1 is a one-line constant (bottom).
- **Ambient 1px timer-remaining progress hairline** along the very bottom edge.
- **`nowBreathe`** on phase-begin NOW label (include only if trivially cheap in PR (c)).
- **Speaker-icon chime persistence** across reloads (v1: in-memory toggle, defaults OFF).
- Any API/store/capability/module-contract change — explicitly none in E2.
