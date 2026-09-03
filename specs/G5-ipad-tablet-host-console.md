# G5 — iPad/tablet-optimised host console

> Final executable build spec. The pressure-test must-fixes are folded in below — where this spec
> contradicts the original design/architecture JSON, this spec wins (it is the corrected version).

## Priority / effort / dependencies

- **Priority:** P2 (Section G — Differentiators / moonshots).
- **Effort:** **10 days** (revised up from the original 7). Breakdown: Phase 1 extraction 2d · Phase 2 breakpoint + Setup + surface router 1.5d · Phase 3 instrument (FacilitateConsole + DriveBar + DriveDrawer + STAGE + rev-bound confirmation + responded derivation + co-host dimming + keyboard unpin) 4.5d · Phase 4 polish/tests/iPad pass 2d. (The 1017-line monolith split plus a faithful-mirror STAGE and per-module responded derivation are not a 7-day layout pass.)
- **Implements roadmap item:** delivers the **C1 "Facilitate mode" cockpit** surface on tablet (see `specs/C1-facilitate-mode-cockpit.md`).
- **Dependencies (item ids):**
  - **C1** (Facilitate-mode cockpit) — G5 is the tablet realisation of C1; if C1 ships a phone/desktop cockpit first, reuse its components. If G5 lands first, it owns the cockpit and C1 becomes a breakpoint reuse.
  - **C2** (live participation signals) — the "responded" count helper (`lib/host/responded.ts`) is shared; coordinate so it is built once. G5 ships a best-effort version if C2 is not yet built; C2 supersedes it.
  - **C5** (co-facilitation presence) — co-host *presence* indicator is explicitly **out of scope** for G5; G5 only does role-based control dimming (already in state).
  - No hard blocker: G5 can ship standalone. Internal ordering dependency: Phase 1 extraction PR must land green before any instrument code.

---

## Problem & facilitator value (facilitator's voice)

> "I run the room on my feet. I'm holding the iPad in two hands, glancing at it for a beat between
> looking people in the eye. The one thing I do most — move the room to the next step — is a tiny
> text button wedged between a back arrow and a timeline I have to scroll. I'm not *driving*, I'm
> *aiming*. And every time I tap Advance I get a flicker of 'did that actually take?' On a screen
> this big I want a real instrument: phase 2 of 7, twelve people in, three of them answered, three
> minutes left, and one giant **Advance** with 'up next: Devil's advocate' under it so I'm never
> moving blind. When I sit down to set up — inject a case, curate patterns, reassign lenses — *then*
> give me the full console. Standing and running, give me the stage."

**Value delivered:** the single most-used action becomes a confident, unmissable, thumb-reachable
target; phase/joined/responded/time-left/what's-next are glanceable from a metre away in one second;
the "did it take?" anxiety is killed by unmistakable, **authoritative-state-bound** confirmation; and
the calm/privacy ethos is honoured (bigger and quieter, not denser). Co-hosts on their own iPads get
the same instrument with reserved controls visibly dimmed.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (ships first, behind the tablet breakpoint + a default-`setup` surface)

1. **Phase 1 extraction PR** (independently shippable, zero behaviour change): lift the panels +
   gating + `Cmd` type out of `HostConsole.tsx` into `components/host/*` and `lib/host/*`.
2. **Tablet breakpoint** + **SetupConsole** (today's tabs, tablet-tuned, default surface) +
   **surface router** — behaviour identical to today until opted in.
3. **FacilitateConsole, landscape-first** (portrait is a Phase-4 fast-follow but still ships in MVP):
   STATUS band + persistent **STAGE** (projector-perspective mirror) + **DriveBar** (hero Advance with
   next-label, Back, 3-target timer cluster, thin progress track) + **DriveDrawer** (existing driving
   panels, auto-peek when drivable).
4. **rev/phaseId-bound confirmation** (cross-fade + transient "moved to {next phase label}").
5. **moduleAction correctness fix** (see Architecture) so promote/generate is not a stale read-back.
6. **One-tap inject-content** from Facilitate with its phase-visibility warning intact.
7. **Best-effort `responded`** count (per-module, counts *responses* not people).
8. **Co-host dimming** carried from existing role gating; **contrast floor** on timer + Advance.

Default surface stays `setup` until the iPad pass passes; then flip default to
auto-`facilitate`-when-live.

### Full vision (fast-follows, same PR series)

- Portrait fully co-equal with landscape.
- DriveDrawer pull-up gesture polish (vs. tap-to-expand).
- `moduleAction` returns authoritative `navState` server-side (the "better" fix) for *all* drive
  actions, not just promote/generate.
- Stage timer elapsed cue tied to `Countdown.onElapsed` (calm STATUS cue; chime stays projector-only).

---

## Experience & flows

### Surfaces

The host console becomes a router on a `surface` state: **`'facilitate'`** (the stage instrument) or
**`'setup'`** (today's tabbed UI). Phone (`max-w-2xl`) and desktop (`lg:grid`) paths are **untouched**
and never see the new breakpoint instrument.

### Facilitate mode — landscape (tablet-lg ≥1024px)

- **STAGE** (left, ~⅔ / `2fr`): persistent full-size mount of the **projector** renderer — labelled
  **"On the projector"**. This is a *real role's* view (no per-person skew). A separate, visually
  distinct **"Facilitator-only"** zone (right column or drawer) holds host-only results
  (reveal-on-advance counts) so the host never mistakes hidden-from-room data for what the room sees.
- **STATUS band** (right, `1fr`, oversized/glanceable): session name · **`phase {idx+1}/{n}`** ·
  **`{joined} joined · {responded} responded`** (filled `Bars`) · large accent **mm:ss** Countdown ·
  phase context (`now: Capture` / `up next: Devil's advocate`). A quiet **Setup** gear pill and a quiet
  **Inject content** pill live here.
- **DRIVE bar** (pinned full-width bottom, thumb zone): `← Back` (smaller) · **hero Advance** (`min-h-14`,
  ≥56px, `bg-accent`, active-press + glow) with **truncated next-phase label** under it · **timer cluster**
  (`Start preset` / `+1:00` / `Clear`, each ≥44px). A **thin segmented progress track** sits above the bar
  (tap a segment to jump = deliberate secondary act).
- **DRIVE drawer**: pull-up/tap sheet above the DRIVE bar mounting the current phase's existing driving
  panel; **auto-peeks** when `runHasContent`.

### Facilitate mode — portrait (tablet 768–1023px)

Vertical stack: **STATUS band** (top) → **STAGE** (middle) → **thin progress track** → **DRIVE bar**
(pinned at the very bottom thumb zone). DriveDrawer pulls up over the lower STAGE.

### Key flows (copy where it matters)

1. **Stand and run.** Session already configured → console opens in Facilitate (when live) → glance
   ("phase 2/7 · 12 joined · 3 responded · 3:00") → make eye contact → tap **Advance** → STAGE
   cross-fades, "up next" updates, timer resets to the new phase preset, transient **"moved to
   {next phase label}"**. No looking down for more than a beat.
2. **Drive a phase's primitive.** Current phase is a Capture with AI synthesis → DriveDrawer auto-peeks →
   touch-sized `ModuleControlPanel` → tap **Generate** / **Promote to room** → drawer tucks away → STAGE
   chases the new authoritative rev (see Architecture; **not** a single stale read-back) and shows the
   promoted result.
3. **Reach back / jump.** Room needs more time on the previous step → tap `← Back`, or tap a segment on
   the progress track to jump → quieter confirmation. No horizontal pill-hunting.
4. **Adjust the clock live.** Tap `+1:00` or `Start` (preset) → big stage timer updates immediately
   (setTimer already rides authoritative-apply).
5. **Inject mid-room without leaving the stage.** Tap **Inject content** pill in STATUS → opens
   `InjectPanel` as a sheet **with its phase-visibility warning intact** (the "will this be seen now?"
   banner) → push → sheet closes. No full mode switch required.
6. **Sit down to set up.** Tap **Setup** gear → tablet-tuned tabbed layout (segmented control) → inject /
   curate patterns / reassign / end-archive → tap **Facilitate** to return.
7. **Two-facilitator room.** Co-host opens same room on their iPad → identical instrument; Setup's
   End/Archive/reassign and the Session tab are **dimmed/absent** (existing cohost gating). A reserved-
   control tap surfaces the existing 403 toast **above** the DRIVE drawer z-index.
8. **First entry, no session.** `ModeSelector` (modes / research templates / build-custom link) given
   tablet touch-sizing; appears before Facilitate exists for the room.

### States

- **No-drive phase:** DriveDrawer handle hidden/disabled; compact "Nothing to drive — it's display-only"
  note in STATUS; hero Advance still dominant.
- **No timer preset:** `Start preset` hidden when `config.timerSeconds`/preset undefined; `+1:00` / `Clear`
  remain.
- **Timer elapsed:** calm STATUS cue at 0:00 (not an alarm); chime stays projector-only.
- **Auth / checking:** passcode entry + "Checking…" restyled centered/large for tablet; same role-resolved
  auth, no false wrong-passcode flash.
- **Module renderer throws:** existing `ErrorBoundary` fallback inside DriveDrawer/STAGE; a broken control
  never takes down the instrument.

---

## Architecture

### Approach

A presentation/interaction layer over the existing `FacilitatorState` + `cmd()` dispatcher, with **one
small, corrective server change** (the original "no API change" claim is **false** for `moduleAction` and
is downgraded here). The work: (1) extract the reusable pieces out of `components/HostConsole.tsx`;
(2) add a tablet breakpoint + a Facilitate/Setup surface router that re-skins the same state; (3) fix the
authoritative-apply gap for drive-drawer actions; (4) make the STAGE a faithful (not role-skewed) mirror.

### Files to add

| Path | Purpose |
|---|---|
| `components/host/panels.tsx` | Driving/preview sub-components lifted verbatim from `HostConsole.tsx`: `PreviewPanel`, `ResultsPanel`, `ModuleControlPanel`, `AllocationsPanel`, `ReadAroundControls`, `SubmissionsPanel`, `PatternPanel`, `InjectPanel`, `SessionControls`, `ModeSelector`, `Panel`, `Empty`, + the `Cmd` type. **Preserves** the `transform-gpu` + `pointer-events-none` StickyAction containment. |
| `components/host/gating.ts` | Pure helpers lifted from `HostConsole`: `hasModuleControls`, `hasResults`, `isAllocate`, `isReadaround`, `isSubmissions`, `runHasContent` + `RESULT_MODULES`. One source of truth for drive-gating shared by legacy layout, FacilitateConsole, DriveDrawer. |
| `components/host/SetupConsole.tsx` | Today's tabbed console (`Run` / `What they see` / `Content` / `Patterns` / `Session`) extracted from `HostConsole`'s `return()`, tablet-tuned (segmented control `min-h-11`, `lg:grid` two-col preserved). Hosts the `Facilitate` toggle. Phone/desktop paths unchanged. |
| `components/host/FacilitateConsole.tsx` | The C1 stage instrument. STATUS band + persistent STAGE + DriveBar + DriveDrawer + facilitator-only results zone. Orientation-reflowing CSS grid. Watches **applied** `state.rev`/`phaseId` to fire the cross-fade + affirmation. Issues only existing cmds. Hosts the Inject sheet. |
| `components/host/DriveBar.tsx` | Bottom thumb-zone bar: hero `Advance` (`min-h-14`/≥56px) with truncated next-phase label, `Back`, 3-target timer cluster (`Start preset` / `+1:00` / `Clear`), thin segmented progress track. Unpins to `static` when an input is focused or in Setup. |
| `components/host/DriveDrawer.tsx` | Pull-up/tap sheet mounting the current phase's existing driving panel via lifted gating, each `ErrorBoundary`-wrapped. Auto-peeks when `runHasContent`. Dismiss on pull-down / STAGE tap. |
| `components/host/StageMirror.tsx` | The STAGE renderer. Mounts the **projector** renderer (a real, per-person-neutral role) as the "what the room sees" surface. Does **not** put reveal-on-advance host-only counts on the room-mirror. Keeps `transform-gpu` containment. |
| `lib/host/responded.ts` | Pure per-module derivation of a best-effort **responses** count from `FacilitatorState`. Switch over `moduleId`/`primitive`. **No `Submission.token` use.** Index loops / `Array.from()` only. |
| `lib/host/surface.ts` | `resolveSurface(state, room)` + `getSurface`/`setSurface(room, v)` localStorage helpers. Mode decision lives here, out of the component. |
| `test/host-surface.test.ts` | Vitest for `resolveSurface` defaulting/persistence and `responded` derivation incl. null-counts and shared/blank-handle cases. |

### Files to change

| Path | Change |
|---|---|
| `components/HostConsole.tsx` | Becomes a thin router/shell. Keeps the auth gate (passcode + role resolution, checking/wrongCode, restyled for tablet) and the `cmd()` dispatcher (with the moduleAction fix below). Resolves surface via `lib/host/surface.ts`; renders `FacilitateConsole` on tablet+ when live, else `SetupConsole`. The `max-w-2xl` phone + `lg:grid` desktop body moves into `SetupConsole` **unchanged**. All local panel/gating functions deleted here and imported from `components/host/`. |
| `app/api/r/[room]/host/route.ts` | **`moduleAction` case must return authoritative state.** Today (verified, ~L274–286) it returns `{ok, reason}` only. Change at minimum the **promote/generate** paths (and ideally all of `moduleAction`) to return `state: await navState(room, <written state>, role)` like `setPhase` does, so the STAGE applies authoritative state and never reads back a lagging KV replica. No capability change. |
| `components/usePolledState.ts` | No change required (already exposes `refresh`/`refreshUntil`/`apply` + `lastRevRef` monotonic guard). Confirmed sufficient. |
| `tailwind.config.ts` | Add under `theme.extend`: `screens: { tablet: '768px', 'tablet-lg': '1024px' }` (extend, to keep defaults incl. `lg`). No colour/font changes. |
| `app/r/[room]/host/page.tsx` | No logic change; already mounts `HostConsole` with `apiBase`/`roomName`. Pass the room slug through if not already wired (surface.ts uses it for the localStorage key). |

### Data model

**No persisted data-model change.** `FacilitatorState`/`PublicState`/`SessionState`, store keys, and
`rev` semantics are untouched. Two ephemeral, client-only shapes:

- **`RespondedCount = number`** — derived by `lib/host/responded.ts` from existing fields, never persisted,
  never sent to the server. **Per-module switch** (the original "submissions.filter(phaseId).length unique
  handles" generalisation is wrong — fixed here):
  - **poll / vote modules** — use the module's own published count where it exists (e.g. `view.data.total`),
    **not** a re-sum of `counts` (multi-select double-counts; and for `reveal:'onAdvance'` the participant
    counts are `null`). If the module's count is unavailable for the host's view, fall back to joined-only
    and show no responded figure rather than a wrong one.
  - **capture / qna** — count `submissions` filtered to the active `phaseId`. **Count responses, not unique
    people** (handles are not guaranteed unique and may be blank/anonymous; counting unique handles
    *undercounts*). **Never** dedupe with `Submission.token` (it is explicitly never shown to others; using
    it to count distinct humans edges toward de-anonymising participation).
  - **allocate** — sum `allocation.counts` (these are allocations, label accordingly).
  - **Label everywhere as "{n} responded" / "{n} responses", never "{n} people."**
- **Surface preference** — a localStorage string `'facilitate' | 'setup'` under
  `edges:host-surface:{room}`. Never server-side (consistent with account-less/privacy ethos).

### API + host commands (+ capability gating)

- **One corrective change:** `moduleAction` gains a `state` field on its response (see above). Everything
  else is unchanged.
- The instrument issues **only existing commands**: `setPhase` (cap `advance`), `setTimer` (cap `timer`),
  `moduleAction` (cap `advance`), `reassign` (cap `reassign`), `readaroundNext`, `cluster`,
  `createPattern`, `addContent`/`updateContent`/`deleteContent`, etc. — all via the same
  `cmd() → POST /api/r/[room]/host`.
- **Capability gating unchanged** (`auth.ts`, verified): `cohost` = `advance`, `timer`, … but **not**
  `configure`, `reassign`, or `end`. Facilitate mode **never** issues `setPhases` (the admin-only
  `configure` gotcha) — custom builds stay in Setup / the `/build` surface, so co-hosts driving via
  Facilitate never hit the configure wall.

### rev / authoritative-apply usage (no KV read-back)

This is the correctness spine, and the original architecture **over-generalised** it. Corrected rules:

1. **Nav commands** (`setPhase`/`setTimer`/`setMode`/`setTemplate`/`readaroundNext`) already return
   `navState(...)` authoritative state. `cmd()` applies it via `usePolledState.apply(d.state)` — instant,
   and a later stale lower-rev poll is dropped by the monotonic `lastRevRef` guard. **Untouched.**
2. **Drive-drawer actions** (`moduleAction`, and `reassign`/`cluster`/content) **did NOT return state** —
   verified at `app/api/r/[room]/host/route.ts` L274–286: `moduleAction` returns `{ok, reason}` and
   `cmd()` falls through to `refresh()` (a single read of a possibly-lagging KV replica). On a persistent
   hero STAGE that recreates the exact "did it take?" anxiety this item exists to kill. **Fix:**
   - **Minimum (thinnest cut):** after a successful `moduleAction`, call `refreshUntil(currentRev + 1)` so
     the STAGE chases the new rev instead of accepting one stale read.
   - **Preferred (promote/generate at minimum):** have `moduleAction` return `navState(...)` so it rides the
     same authoritative-apply path as `setPhase`. Do this for promote/generate in MVP; extend to all of
     `moduleAction` as a fast-follow.
3. **Confirmation is bound to APPLIED state, never to a fetch resolving or a read-back.** A `useEffect` in
   `FacilitateConsole` watches `state.rev` (and `phaseId`); the **STAGE cross-fade + "moved to {phase}"
   affirmation fire only when `rev` increases AND `phaseId` changes**. A rejected stale backward poll
   (dropped by `lastRevRef`) can therefore never trigger a phantom transition. **The affirmation reads the
   APPLIED phase label, not the requested one** — so concurrent co-host advances can't make it claim a move
   the authoritative state overrode.

---

## Implementation plan (ordered, checkable)

**Phase 1 — extraction (own PR, must be green + manually phone/desktop-regressed before any instrument code)**
1. [ ] Create `components/host/gating.ts`; move `RESULT_MODULES` + all gating helpers; export.
2. [ ] Create `components/host/panels.tsx`; move all listed sub-components + `Cmd` type; thread
       `cmd`/`apiBase`/`code`/`state`/`role` as props (they already take most as props). Preserve
       `transform-gpu`/`pointer-events-none` containment exactly.
3. [ ] `HostConsole.tsx` imports from `components/host/*`; delete the now-duplicated local definitions.
       Body unchanged otherwise.
4. [ ] `npm run verify` (typecheck + lint + test) + `npm run build` green. Manual phone + desktop pass:
       confirm zero visible/behaviour change. **Ship this PR.**

**Phase 2 — breakpoint + Setup + surface router**
5. [ ] `tailwind.config.ts`: add `theme.extend.screens.tablet`/`tablet-lg`.
6. [ ] `lib/host/surface.ts`: `resolveSurface` (localStorage key `edges:host-surface:{room}` if set, else
       `'facilitate'` when live `(s.mode || s.sequence?.length)` AND a phase active, else `'setup'`) +
       get/set. **Default the router to render `setup`** until the iPad pass passes.
7. [ ] `components/host/SetupConsole.tsx`: move `HostConsole`'s `return()` body in; tablet-tune (segmented
       control `min-h-11`; `lg:grid` preserved). Add `Facilitate` toggle (writes surface).
8. [ ] `HostConsole.tsx` becomes router: auth gate + `cmd()` + surface resolution; renders Setup vs
       Facilitate on tablet+. `npm run verify` green; behaviour identical to Phase 1.

**Phase 3 — the instrument**
9. [ ] `lib/host/responded.ts` (per-module switch, responses-not-people, no token) + unit tests first.
10. [ ] `app/api/r/[room]/host/route.ts`: make `moduleAction` promote/generate return `navState(...)`;
        keep `refreshUntil(rev+1)` as the belt-and-braces path in `cmd()` for non-state-returning actions.
11. [ ] `components/host/StageMirror.tsx`: projector-perspective STAGE; facilitator-only results isolated.
12. [ ] `components/host/DriveBar.tsx`: hero Advance + next-label + Back + timer cluster + progress track;
        input-focus/Setup unpin; **contrast-floor foreground** on accent (timer + Advance legible
        regardless of room accent hue).
13. [ ] `components/host/DriveDrawer.tsx`: mounts existing panels via gating, ErrorBoundary-wrapped,
        auto-peek on `runHasContent`.
14. [ ] `components/host/FacilitateConsole.tsx`: STATUS band (incl. responded `Bars`, accent Countdown,
        Setup pill, **Inject content** pill opening `InjectPanel` sheet **with its warning intact**) +
        STAGE + DriveBar + DriveDrawer; orientation-reflowing grid (landscape first-class, portrait
        stack); rev/phaseId-bound cross-fade + affirmation reading the **applied** label.
15. [ ] Co-host dimming carried through (Setup End/Archive/reassign + Session tab dimmed/absent);
        403 `cmdError` toast rendered **above** DriveDrawer z-index.

**Phase 4 — polish + tests + iPad pass**
16. [ ] Portrait/landscape parity; long-phase-list degrades to fixed-width segments (not a scroller);
        "up next" truncates (no wrap shoving the hero button); timer-elapsed calm STATUS cue.
17. [ ] Vitest for surface + responded (incl. null-counts, blank/shared handles).
18. [ ] Manual iPad pass (portrait + landscape, second device as co-host, branded low-contrast accent).
19. [ ] Flip `resolveSurface` default to auto-`facilitate`-when-live.

---

## Acceptance criteria (facilitator-outcome framed)

1. On a 1024px landscape iPad with a live session, the console opens to the stage instrument with a
   **hero Advance ≥56px tall**; tapping it advances the room, cross-fades the STAGE, updates "up next",
   resets the timer to the new preset, and shows "moved to {next phase}" — **without the facilitator
   looking down for more than ~1s**.
2. The "moved to {phase}" affirmation and STAGE cross-fade **only fire on an applied rev increase with a
   phaseId change**; a stale backward poll never triggers a phantom transition, and the affirmation never
   names a phase the authoritative state overrode.
3. **Promote-to-room via the DriveDrawer shows the promoted result on the STAGE without a stale beat** —
   verified against an artificially lagged store (the STAGE chases the authoritative rev, not a single
   read-back).
4. The STAGE **never shows reveal-on-advance results that participants cannot yet see**; host-only results
   appear only in the clearly-labelled "Facilitator-only" zone.
5. The `responded` figure is labelled as **responses** (never "people"), is derived per-module, and is
   correct (or absent) for: a `reveal:'onAdvance'` poll (participant counts null), a capture phase with
   blank/duplicate handles, and an allocate phase.
6. A **co-host** on a second iPad gets the identical instrument; End/Archive/reassign and the Session tab
   are dimmed/absent; tapping a reserved control surfaces a 403 toast **visible over the STAGE/drawer**.
7. From Facilitate, **Inject content is one tap** and opens with its phase-visibility warning intact (no
   full mode switch needed).
8. The **timer and hero Advance remain legible** under a deliberately low-contrast room accent (contrast
   floor holds).
9. **Phone and desktop layouts are byte-for-byte unchanged** (`max-w-2xl` phone + `lg:grid` desktop paths
   never reach the instrument); `npm run verify` + build green at each phase.
10. Setup-mode text entry (`VoiceTextarea`, pattern names, inline edits) is **never trapped under the
    pinned DriveBar** (bar unpins on input focus / in Setup).

---

## Test plan

### Vitest (`test/host-surface.test.ts`, in-memory store, no KV/AI)

- `resolveSurface`: returns persisted localStorage value when set; defaults to `'facilitate'` when a
  session is live + phase active; `'setup'` otherwise; survives missing/empty sequence.
- `setSurface`/`getSurface` round-trip per room key.
- `responded` derivation:
  - capture phase, 3 submissions incl. one blank handle + two identical handles → returns **3** (responses,
    not 1 or 2).
  - poll with `reveal:'live'` → uses `view.data.total`.
  - poll with `reveal:'onAdvance'` from a participant-perspective view (`counts` null) → does **not** crash,
    returns absent/joined-fallback, never a wrong number.
  - allocate phase → sums `allocation.counts`.
  - asserts no `Submission.token` access in the code path (e.g. spy/structural test or a token-free fixture).
- (existing gating helpers) snapshot `runHasContent`/`hasModuleControls`/`hasResults` for a capture,
  display-only, allocate, readaround, and submissions phase to lock the extraction's behaviour.

### Manual QA

- **iPad landscape (1024×768):** stand-and-run flow; hero Advance reach; cross-fade timing; "up next"
  truncation with a long label; progress-track jump.
- **iPad portrait (768×1024):** vertical stack; DriveBar in thumb zone; drawer pull-up over STAGE.
- **Drive a module:** promote/generate on a synthesis capture; confirm STAGE updates with no stale beat
  (test against `?slow` or a deployed Upstash where replica lag is real).
- **Projector cross-check:** open `/r/[room]/screen` on a second screen; confirm the STAGE matches the
  projector and that reveal-on-advance counts hidden on the projector are also hidden on the STAGE.
- **Participant phone:** open `/r/[room]` on a phone; submit; confirm StickyAction submit bar stays inside
  its frame on the host STAGE (containment intact) and the responded count moves.
- **Co-host second device:** join as cohost; confirm dimmed End/Archive/reassign + Session tab; tap a
  reserved control → 403 toast visible over the drawer.
- **Keyboard:** focus a Setup text field; confirm DriveBar unpins and the field is not occluded.
- **Branding:** set a low-contrast room accent; confirm timer + Advance remain readable at arm's length.
- **Regression:** phone + desktop console unchanged; templates and custom `/build` flows unaffected.

---

## Privacy & ethos check (explicit)

- **No new persistence, no new logging.** Surface preference is **localStorage-only** under
  `edges:host-surface:{room}` (consistent with account-less ethos). Submissions still never logged.
- **Anonymity preserved in the responded count:** the count uses module-published counts / in-phase
  submission counts and **never** `Submission.token`. Labelled as **responses**, not people, so it cannot
  imply per-person identity tracking.
- **No room-vs-stage information leak:** the STAGE is a faithful projector-perspective mirror; reveal-on-
  advance results the room cannot see are isolated in a visibly distinct facilitator-only zone, so a host
  glancing at the STAGE cannot accidentally surface or react to anonymised results the room was deliberately
  not shown.
- **Off-the-record / 24h TTL / End-session wipe** contracts untouched (no store/type/auth change beyond the
  `moduleAction` response shape).
- **Calm:** bigger and quieter, not denser. Affirmation is a brief calm toast + opacity cross-fade, not an
  alarm; the stage chime stays projector-only by default.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (must-fix) | Resolution in this spec |
|---|---|
| **`moduleAction` does NOT return state** — drive-drawer hero flows read back a lagging KV replica, recreating the "did it take?" anxiety on a hero STAGE. (Verified L274–286.) | `moduleAction` promote/generate returns `navState(...)`; `cmd()` also routes non-state actions through `refreshUntil(rev+1)`. STAGE cross-fade bound to applied rev only. The "no API change" claim is downgraded to "one optional `moduleAction` response-shape addition." |
| **STAGE shows reveal-on-advance results participants can't see** (host view.data carries counts; `registry.server.ts` L414 `show = reveal==='live' \|\| ctx.role!=='participant'`). | STAGE renders the **projector** perspective (a real, per-person-neutral role); host-only results isolated in a visibly distinct "Facilitator-only" zone, not behind a text label. Must-fix, not an open question. |
| **`responded` derivation is per-module, not a one-liner; token use de-anonymises.** | Per-module switch using module-published counts; capture/qna count **responses not unique handles**; **no `Submission.token`**; labelled "responses." Tests cover null-counts + shared/blank handles. |
| **Preview is a role-skewed mirror**, not the room's real view. | STAGE scoped to the projector role explicitly (labelled "On the projector"), not conflated with the phone mirror. |
| **Auto-default to Facilitate buries the inject-content "will this be seen?" clarity.** | One-tap **Inject content** pill from Facilitate opens `InjectPanel` **with its phase-visibility warning intact** — no mode switch. |
| **1017-line monolith refactor under-budgeted.** | Phase 1 extraction is an independent, verify-green, phone/desktop-regressed PR before any instrument code. Effort re-budgeted to **10 days**; landscape ships first, portrait is a fast-follow. |
| **Two co-hosts both tap a big Advance (double-advance / phase skip).** | Affirmation reads the **applied** phase label (can't claim an overridden move); hero Advance locally disabled ~600ms post-tap to dampen accidental double-fire. Co-host **presence** indicator is out of scope. |
| **Accent-bound timer/Advance can fail contrast** under room branding. | Glanceable timer + hero Advance use a **guaranteed-contrast foreground** + sufficient size/weight, legible independent of accent hue; verified against branded accents in QA. |
| **Participant StickyAction fixed submit bar escapes the STAGE.** | `transform-gpu` + `pointer-events-none` containing-block wrapper preserved on the promoted STAGE (and verified in QA). |
| **Module renderer throws on the stage.** | Existing `ErrorBoundary` wraps every renderer mount in STAGE + DriveDrawer; fallback keeps the instrument alive. |

---

## Out of scope / future

- **Co-host presence indicator** ("who else is driving") — deferred to C5 (scope creep for a layout pass).
- **`pointer: coarse` media-query / touch-laptop detection** — deferred; Tailwind `tablet`/`tablet-lg`
  screens keep Vitest/snapshot behaviour deterministic and avoid regressing the desktop path.
- **Audible chime on the facilitator device** — deferred; chime stays projector-only to preserve calm.
- **`moduleAction` returning authoritative state for ALL actions** (not just promote/generate) — fast-
  follow after MVP.
- **Portrait pull-up gesture polish** (vs. tap-to-expand drawer) — fast-follow.
- **Any store / type / auth / data-model change** — explicitly not part of this item.
