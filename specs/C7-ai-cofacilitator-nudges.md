# C7 — AI co-facilitator — live nudges

> Section C. Running live · Priority **P2**

A calm, opt-in co-facilitator that watches the live signals already inside the host
state and — at most once in a while — offers **one** concrete, dismissible nudge with a
one-tap action. It never calls AI in the poll path, never reads participant text, and
stays silent by default.

---

## Priority / effort / dependencies

- **Priority:** P2
- **Effort:** **6 days** full vision · **2.5–3 days** for the MVP cut below.
- **Depends on (existing systems — all present, nothing new to build first):**
  - `lib/ai.ts` — `generateJSON` (tier `fast`), `topicLine()`, `withGenerateLock`, `aiAvailable()`.
  - `lib/store.ts` — `getFacilitatorState`, `castVote`/`readVotes` under a reserved `__cofac__` key, `endSession` (wipes `votes`).
  - `app/api/r/[room]/host/route.ts` — `navState()` authoritative-apply; existing `setTimer`/`addContent`/`setPhase`/`moduleAction` commands the nudges compose; `COMMAND_CAP` gating.
  - `app/api/r/[room]/state/route.ts` — host poll where `roomRec` + `FacilitatorState` are both loaded (the **correct** attach point — see Architecture).
  - `lib/rooms.ts` — `Room` record + `updateRoom` for the per-room toggle.
  - `lib/auth.ts` — existing `advance` and `configure` capabilities (no new capability).
  - `components/HostConsole.tsx` — `cmd()`/`apply()`, `SessionHeader`, `PhaseStepper`, `SessionControls`.
  - `lib/modules/render-kit.tsx` — `AiGenerating` shimmer for the reword-in-flight state.
- **Conceptual prior art (patterns to mirror, not call):** `lib/design.ts` (AI-proposes / human-applies / validated against the real catalogue) and `lib/modules/defs/synthesis.server.ts` (AI only inside a host `handleAction`, result cached in `votes`, `computeView` stays pure).
- **No new npm deps. No new module. No new KV key. No new capability. No migration.**

---

## Problem & facilitator value (facilitator's voice)

> "When I'm running a live room I'm the one person who can't look at my own screen calmly.
> I'm reading the room, watching the clock, and driving phases all at once. The platform
> already *knows* submissions have stalled, or that one person has spoken six times, or that
> I'm four minutes over — but it makes *me* notice it, then remember which of two-dozen
> modules would help, then do it in front of everyone.
>
> What I want isn't a dashboard of metrics to interpret. I want a quiet peer who, every
> so often, leans over and says one specific, useful thing — *'4 of 18 have sent, nothing
> in the last 3 minutes; want to add 2 minutes and drop a sentence-starter?'* — with a
> button that just does it. And when there's nothing worth saying, I want it to say nothing.
> It has to never put words in front of my participants, never log what they wrote, and I
> have to be able to switch it off for a room in one tap."

The value is that it is **rare, concrete, and actionable**, and that its suggestions are
**real moves available in this room** (it knows the session's own arc and the module
catalogue), so a less-experienced facilitator runs like an experienced one and an
experienced one offloads vigilance — without ever breaking the calm, off-the-record ethos.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP — deterministic, anonymity-safe, no AI (ship this first)

The pressure-test's recommended thinnest viable cut. Delivers ~80% of the value with **none**
of the privacy, KV-write, or AI-cost risk.

- **Two nudge kinds only**, both time-derived and anonymity-safe:
  - `STALLED` — submissions have dried up (count vs. participantCount + no arrivals in N seconds), past a warm-up grace and a minimum-headcount guard.
  - `OVERRUNNING` — wall clock has passed `config.timerSeconds` / `timerEndsAt` by a margin.
- **Pure rules in `lib/cofac.ts`**, computed in the **route layer** (not `getFacilitatorState`), gated entirely off when the room toggle is off.
- **Banner** between `PhaseStepper` and the tab row; one nudge at a time; `[Do it]` + `[Dismiss]`.
- **Actions reuse existing commands** (`setTimer` extend; `addContent` sentence-starter; `setPhase` to a real later phase only).
- **No poll-path writes**: cooldowns/relevance derived from existing timestamps; the **only** write is on the explicit `cofacDismiss` tap; the global "don't re-animate" floor is a **client-side debounce** in `CofacBanner`.
- **Per-room toggle** (`cofacToggle`, `configure`-tier) + sensitivity (Gentle / Standard / Off-this-phase).
- **Monotonic `nudgeSeq`** so same-rev out-of-order polls can't flap the banner.
- `[reword for my room]` affordance **hidden** (no AI).

### Full vision — adds AI rewording + the dominance signal (fast-follow)

- `cofacDraft` host command (`advance`-tier): `[reword for my room]` calls `generateJSON` tier `fast`, `withGenerateLock`-guarded keyed `cofac:<phaseId>:<kind>`, cached in the `__cofac__` votes hash; deterministic text shows instantly, AI text swaps in with a tiny `AI` tag; silent fallback to template on failure. **AI is invoked ONLY here.**
- `DOMINATED` nudge — **strictly scoped** to modules that already make speaking order public to the room (fishbowl seats, read-around index). Never derived from `Submission.token` or `handle`. Does not fire in anonymous modes.
- `SKEWED_VOTE` and `LOW_JOIN_AT_START` as later conservative additions.
- Optional content-free telemetry (nudge shown / acted / dismissed counts, no text) aligned with existing `[ai]` logging.

---

## Experience & flows

### Placement & voice

- A **slim, dismissible banner** in the host **Run** view, structurally **between `<PhaseStepper>` and the tab row** — calmest possible placement: in the facilitator's eyeline, never covering controls. **Never** on participant phones or the projector (it lives on `FacilitatorState`, which neither receives).
- **Default state is ABSENT.** No banner, no badge. The room looks exactly as today.
- When the feature is **on and watching**, a small **steady (un-pulsing) dot** sits near the `SessionHeader` participant count: steady = watching/all calm, gentle pulse = a nudge is present.
- **At most one nudge visible at a time.** A higher-priority nudge **cross-fades** the current one out and in — never a stack (ordering guaranteed by `nudgeSeq`, see Architecture).
- **Voice:** a calm peer, never an alarm. Lowercase-leaning, specific numbers, always an offer (*"want to…?"*), never an imperative.

### Screens & states (with copy)

1. **Run — OFF, or ON with nothing to say:** identical to today. If ON, only the faint steady dot.
2. **Run — deterministic `STALLED` nudge:**
   - Observation: `submissions stalled — 4 of 18 people, nothing in the last 3 min`
   - Offer: `want to give them a nudge? i can add 2 minutes and drop a sentence-starter.`
   - Buttons: **[Do it]** (primary) · **[Dismiss]** (ghost). No shimmer (no AI used).
3. **Run — `OVERRUNNING` nudge:**
   - Observation: `you're 4 min over on this phase`
   - Offer (only if a real later phase exists): `want to advance to "synthesis"?` → `[Do it]` / `[Dismiss]`
   - If no suitable later phase: downgrade to observation only (no `[Do it]`), or offer `addContent` "time check" card.
4. **Run — AI-drafted nudge in flight (Full vision):** deterministic text shows immediately; on `[reword for my room]` the offer line shows the `AiGenerating` shimmer for <~3s, then swaps to the tailored sentence with a tiny `AI` tag. Failure falls back silently to the template.
5. **Session tab (lead-only) — Co-facilitator settings:**
   - Toggle: **Live co-facilitator nudges** (On / Off)
   - Sensitivity: **Gentle · Standard · Off during this phase**
   - Privacy note (verbatim): *"Reads only live counts and timing — never your participants' words. Nothing is stored or logged."*
   - Cohosts **see** the banner and **can act** on it, but **cannot** toggle or change sensitivity (mirrors the `configure`/`advance` capability split).
6. **No `ANTHROPIC_API_KEY`:** deterministic rules still fire; `[reword for my room]` is hidden; settings copy notes AI rewording is off. The feature **degrades to a pure-rules assistant — it never disappears.**

### Five flows

- **WATCH (cheap, no AI):** every host poll, the route computes deterministic **signals** from the already-loaded `FacilitatorState` — participation (submission **count** vs `participantCount`), 90s arrival rate (`Submission.createdAt`), seconds-over-timer (`timerEndsAt` / `config.timerSeconds`), and (Full vision) public per-seat turn share. Pure arithmetic, same cost class as `roomSignature()`.
- **TRIGGER (rules, no AI):** `evaluateRules(signals, dismissals, now, sensitivity, sequence)` → at most **one** candidate nudge, honoring warm-up grace, min-headcount, per-kind relevance windows, dismissals, and **module applicability** (only offer `setPhase` to a phase that actually exists later in `PublicState.sequence`).
- **DRAFT on demand (Full vision; AI in host action only):** `[reword]` → `cofacDraft` → `generateJSON` tier `fast`, locked + cached. Prompt is fed **kind + numbers + module catalogue + topicLine()** — never participant text.
- **ACT (one tap, authoritative):** `[Do it]` dispatches an **existing** host command via `cmd()`. Those return `navState` (authoritative state, no read-back), so the room updates instantly and correctly on eventually-consistent KV. The nudge then clears.
- **DISMISS / SILENCE:** `[Dismiss]` (and acting on the room another way) writes a `kind+phaseId` entry into the `__cofac__` dismissal set via `cofacDismiss` so it can't re-fire this phase. Dismissals reset on phase change. The lead-only master toggle turns the whole thing off for the room.

---

## Architecture

### Hard constraints (the spine of the design)

1. **No AI in the poll path.** Signals + rules are pure arithmetic. AI lives **only** in the optional `cofacDraft` host action.
2. **No writes in the poll path.** The poll computes nudges as a **pure read**. Cooldown/relevance is **derived from existing timestamps** (`phaseId`, `timerEndsAt`, last submission `createdAt`), never from a persisted "lastFired" blob. The **only** ephemeral write is the explicit `cofacDismiss` tap (a real user action, exactly like `synthesis` writes only on a tap). The global "don't re-animate the same kind within N seconds" floor is a **client-side debounce**, not server state.
3. **Authoritative-apply, no read-back.** `[Do it]` and `cofacToggle` return `navState`; `cofacDraft`/`cofacDismiss` just re-poll.
4. **Privacy.** Signals read **counts / timings / distributions** only. Never `Submission.text`. Never per-person identity (`token`) for dominance. `handle == "Anonymous"` is never treated as a person.

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/cofac.ts` | The co-facilitator brain. Pure, store-free, AI-free. Exports types + `computeSignals(facState)`, `evaluateRules(...)`, `computeCofac(facState, opts)` (the single entry the route calls), and (Full vision) `buildDraftPrompt`/`mapDraft`. Uses `Object.keys().forEach`/indexed loops only — **no `.entries()` / Set spreads** (downlevelIteration off). |
| `/Users/jordan/workshop/edges-v2/components/CofacBanner.tsx` | `'use client'` banner mounted between `PhaseStepper` and the tab row. Reads `state.cofac`; renders observation + offer + `[Do it]` (maps `nudge.action` → existing `cmd()`) + `[Dismiss]` (`cmd('cofacDismiss', {kind})`). Holds the **client-side debounce** + the **`nudgeSeq` guard** (ignores incoming nudge whose `seq <=` the shown one). Cross-fades on kind change. Also exports `CofacDot` for `SessionHeader`. (Full vision: `[reword]` → `cmd('cofacDraft', {kind, phaseId})` + `AiGenerating` shimmer.) |
| `/Users/jordan/workshop/edges-v2/test/cofac.test.ts` | Vitest coverage of the pure layer (in-memory store, no KV/AI). |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/types.ts` | Add `cofac?: CofacState \| null` to **`FacilitatorState`** (the `extends PublicState` block at line 256) — facilitator-only, **NOT** on `PublicState`, so it never reaches participants/projector. Import `CofacState`/`CofacNudge` **type-only** from `lib/cofac.ts` (mirrors the `lib/modules/views.ts` boundary). |
| `app/api/r/[room]/state/route.ts` | In the host branch (`role !== 'participant' && role !== 'projector'`), after `getFacilitatorState`, call `computeCofac(state, { enabled: roomRec.cofacEnabled ?? aiAvailable(), sensitivity: roomRec.cofacSensitivity ?? 'standard', topic, dismissals })` and attach `cofac` to the response. **Skip entirely (zero cost) when disabled.** `roomRec` and `topic` are already loaded here — this is the correct attach point. The `__cofac__` dismissal read: fold into the host branch only (see KV note). |
| `app/api/r/[room]/host/route.ts` | `navState()` already loads `roomRec`; attach `cofac` there too (so `[Do it]` results carry a fresh nudge). Add three commands to `COMMAND_CAP` + the switch: `cofacToggle` (`configure`, returns `navState`), `cofacDismiss` (`advance`, writes `__cofac__` dismissal, re-polls), and (Full vision) `cofacDraft` (`advance`, `withGenerateLock` + `generateJSON` tier `fast` + `__cofac__` cache, re-polls). |
| `lib/rooms.ts` | Add `cofacEnabled?: boolean` and `cofacSensitivity?: 'gentle' \| 'standard' \| 'off'` to the **`Room` interface** (line 86 block) **and** to the **`updateRoom` `Pick<>` allow-list** (currently `'name' \| 'topic' \| 'templateId' \| 'status' \| 'theme'`, line 193) — **both**, or `cofacToggle` silently no-ops. Resolve `enabled ?? aiAvailable()` at **read** time. |
| `components/HostConsole.tsx` | Mount `<CofacBanner state={s} cmd={cmd} />` between `<PhaseStepper>` and the tab row in the Run column. Add `<CofacDot state={s} />` into `SessionHeader` near the participant count (lead + cohost visible). Add the lead-only toggle + sensitivity control + privacy note to `SessionControls` (Session tab, already `role !== 'cohost'`-gated), wired to `cmd('cofacToggle', {...})`. No change to `cmd()`/`apply()`. |

### Data model

**No durable DB. No new KV key. Three touch-points, all existing infrastructure.**

**1. Per-room toggle (persisted — the only persisted addition):** two optional fields on the
existing `Room` record (KV key `rooms:room:<slug>`):

```ts
cofacEnabled?: boolean;                              // resolved `?? aiAvailable()` at read time; always Off-able
cofacSensitivity?: 'gentle' | 'standard' | 'off';   // 'off' = off-during-this-phase
```

Written via existing `updateRoom()` (24h TTL inherited). Stores a **setting**, never participant content.

**2. Dismissal set (ephemeral):** stored in the existing room **votes hash** under the reserved
phase key `__cofac__` via existing `castVote`/`readVotes`. **Written only on the explicit
`cofacDismiss` tap** — never on the poll. Shape (one field, `dismissals::__cofac__`):

```ts
type CofacDismissals = Record<CofacNudgeKind, string /* phaseId it was dismissed in */>;
```

A kind is suppressed only while its recorded `phaseId === current phaseId` (so dismissals
reset naturally on phase change). Inherits the 24h TTL; **`endSession` deletes `votes`**, so
End-session wipe is inherited. (Full vision adds an optional `draftByKind` cache field, also
under `__cofac__`, written only inside `cofacDraft` under its lock.)

**3. Wire-only (never stored) — on `FacilitatorState`:**

```ts
export type CofacNudgeKind = 'STALLED' | 'OVERRUNNING' | 'DOMINATED' | 'SKEWED_VOTE' | 'LOW_JOIN_AT_START';

export type CofacAction =
  | { cmd: 'setTimer'; endsAt: number }
  | { cmd: 'addContent'; type: ContentType; title: string; body: string; target: 'now' | 'next' }
  | { cmd: 'setPhase'; phaseId: string }                       // ALWAYS a verified-existing later phase
  | { cmd: 'moduleAction'; actionType: string; payload?: Record<string, unknown> };

export interface CofacNudge {
  kind: CofacNudgeKind;
  priority: number;            // higher wins when two fire
  seq: number;                 // monotonic ordinal — see rev note below
  observation: string;         // deterministic, with real numbers
  offer: string;               // deterministic, phrased as an offer
  action: CofacAction | null;  // null ⇒ observation-only
  draft?: { text: string };    // Full vision: AI-reworded offer
}

export interface CofacState {
  watching: boolean;           // feature on for this room
  nudge: CofacNudge | null;    // at most one
}
```

**Signals (`CofacSignals`, transient, never stored, never text):**

```ts
interface CofacSignals {
  participantCount: number;
  submissionCount: number;          // raw count this phase — anonymity-safe
  arrivalRate90s: number;           // submissions in last 90s via createdAt
  secondsSincePhaseStart: number;   // warm-up grace gate
  secondsOverTimer: number;         // now − timerEndsAt (0 if under/none)
  maxSeatShare: number | null;      // Full vision: public fishbowl/read-around only; null otherwise
  voteSkew: number | null;          // Full vision: top-option share from module view; null otherwise
}
```

> **Anonymity-safe by construction:** `STALLED`/participation use the raw **count** and **rate**,
> never a distinct-`token` ratio. `maxSeatShare` is `null` unless the active module already
> publishes speaking order to the room; it is **never** derived from `Submission.token` or
> `handle`.

### The rev / authoritative-apply note (no KV read-back)

The nudge is **derived, not written**, so it does **not** bump `SessionState.rev`. Two
consequences, both handled:

- **`[Do it]` / `cofacToggle`** return `navState` (built from the just-written `SessionState`).
  `HostConsole.cmd` applies any response whose `state.rev` is a number via `apply()` — the
  established authoritative-apply path — so the room (and the freshly-recomputed nudge) update
  instantly with **no read-back**, correct on eventually-consistent KV.
- **Same-rev flapping** (the pressure-test catch): because nudges share a rev,
  `usePolledState`'s `rev < lastRev` guard cannot order two same-rev poll responses. Fix:
  `CofacNudge.seq` is a **server-computed monotonic ordinal** (`max` of the relevant timestamps
  — phase start, `timerEndsAt`, latest submission `createdAt`). `CofacBanner` **ignores any
  incoming nudge whose `seq <= the currently-shown seq`**. Nudge selection is fully
  deterministic (priority, then seq), so identical inputs always yield the same single nudge and
  same-rev races are idempotent. `cofacDraft`/`cofacDismiss` simply re-poll.

### API + host commands (capability gating)

| Command | Capability | Returns | Notes |
|---|---|---|---|
| `cofacToggle` `{ enabled, sensitivity }` | **`configure`** (lead-only) | `navState` | Persists on `Room` via `updateRoom`; dot/banner apply authoritatively. Mirrors the `setPhases`/`configure` gotcha. |
| `cofacDismiss` `{ kind }` | **`advance`** (cohosts may clear) | `{ ok: true }` → re-poll | Writes `kind → current phaseId` into `__cofac__`. |
| `cofacDraft` `{ kind, phaseId }` *(Full vision)* | **`advance`** (cohosts may reword) | `{ ok, draft: { text } }` → re-poll | `withGenerateLock('cofac:<phaseId>:<kind>')`, `generateJSON` tier `fast`, cached in `__cofac__`. **The only AI call site.** |
| `[Do it]` actions | inherit the target command's cap (`setTimer`=`timer`, `addContent`=`inject`, `setPhase`=`advance`, `moduleAction`=`advance`) | `navState` | **Unchanged existing commands.** |

- **GET host `/state`:** response now carries facilitator-only `cofac` (design's fold-in over a separate endpoint — the data is already loaded). `PublicState` unchanged.
- **No participant- or projector-facing API change.**

---

## Implementation plan (ordered, checkable)

1. [ ] **`lib/cofac.ts` — pure layer.** Types; `computeSignals`; `evaluateRules` (MVP: `STALLED`, `OVERRUNNING`) with warm-up grace, min-headcount, dismissal read, module-applicability against `PublicState.sequence`, `seq` computation; `computeCofac(facState, opts)` entry. No store/AI imports. No `.entries()`/Set spreads.
2. [ ] **`test/cofac.test.ts`** — write **before** wiring (riskiest logic = false positives). Covers the cases below. `npm run verify` green.
3. [ ] **`lib/types.ts`** — add `cofac?` to `FacilitatorState` (type-only import).
4. [ ] **`lib/rooms.ts`** — add the two fields to the `Room` interface **and** the `updateRoom` `Pick<>` allow-list; round-trip test.
5. [ ] **`app/api/r/[room]/host/route.ts`** — `cofacToggle` (`configure`), `cofacDismiss` (`advance`); attach `cofac` in `navState`. (Full vision: `cofacDraft`.)
6. [ ] **`app/api/r/[room]/state/route.ts`** — attach `cofac` in the host branch; **skip when disabled**; fold the `__cofac__` dismissal read into the host branch only.
7. [ ] **`components/CofacBanner.tsx`** + `CofacDot` — banner, `[Do it]` action-mapping, `[Dismiss]`, client-side debounce, `seq` guard, cross-fade.
8. [ ] **`components/HostConsole.tsx`** — mount banner between `PhaseStepper` and tabs; `CofacDot` in `SessionHeader`; toggle + sensitivity + privacy note in `SessionControls`.
9. [ ] **Default-off at first ship** (override the `aiAvailable()` default during rollout) so existing live rooms are byte-identical until turned on. Dogfood, tune thresholds via Gentle/Standard.
10. [ ] **(Full vision)** `cofacDraft` + `[reword]` shimmer + `DOMINATED` (fishbowl/read-around only). Flip default to ON-when-key-present once thresholds feel calm.

---

## Acceptance criteria (facilitator-outcome framed)

1. With the feature **off** (or absent toggle on an existing room), the Run view, host poll bytes, and participant/projector views are **identical to today** — no banner, no dot, no extra cost.
2. When a phase **stalls** past the warm-up grace and min-headcount, **within one poll (~2s)** a single banner appears with **real numbers** and a working `[Do it]` that extends the timer / drops a sentence-starter; tapping it updates the room **instantly** (no revert on eventually-consistent KV) and clears the nudge.
3. When the facilitator is **over the phase timer**, an `OVERRUNNING` nudge appears; its `[Do it]` advances only to a phase that **actually exists later** in this room's sequence — never the current or a non-existent phase. If none exists, no `[Do it]` is shown.
4. The assistant is **rare**: at most one nudge at a time; a dismissed kind does **not** re-fire within the same phase; nothing chatters every 2s.
5. A **higher-priority** nudge replaces a lower one with a cross-fade; out-of-order same-rev polls **never** leave a stale nudge showing (verified by `seq` guard).
6. **No participant ever sees a nudge** on their phone or the projector.
7. A **cohost** can act on a nudge but **cannot** toggle the feature or change sensitivity; the **lead** can.
8. With **no `ANTHROPIC_API_KEY`**, deterministic nudges still fire and `[reword]` is hidden — the feature degrades, never disappears.
9. The host **poll path performs no KV write and no AI call** under any nudge state (verified by inspection/instrumentation).
10. **No signal or AI prompt ever reads `Submission.text`**, and **no signal is derived from `token` or from `handle == 'Anonymous'`** as a person.

### Pure-layer Vitest (`test/cofac.test.ts`)

- `STALLED` fires **only** past threshold **and** warm-up grace **and** min-headcount; does **not** fire in the first 30s of a phase or in a 2-person room.
- `STALLED` uses **count/rate**, not distinct-token ratio (passes identically whether handles are real or all `"Anonymous"`).
- `OVERRUNNING` keys on `config.timerSeconds`/`timerEndsAt`; fires only past the over-margin.
- Module applicability: `setPhase` is offered **only** when a later phase with the intended `moduleId` exists in `PublicState.sequence`; otherwise the action is downgraded (never a non-existent or current phase).
- Dismissal of a kind suppresses re-fire **within** the phase and **resets** on phase change.
- Selection is deterministic (priority, then `seq`); identical inputs → identical single nudge; `seq` is monotonic across the relevant timestamps.
- (Full vision) `DOMINATED` fires **only** for modules exposing public per-seat data and **never** in anonymous mode; `maxSeatShare` is `null` for free-text submission modules.
- Signals never reference `Submission.text` or `Submission.token` (assert by feeding submissions whose text/token are present but irrelevant to the result).

### Manual QA

- **Desktop host:** stall a real phase → nudge → `[Do it]` extends/injects → room + projector update instantly; `[Dismiss]` → no re-fire this phase → advance phase → kind can fire again.
- **Mobile host:** banner sits between PhaseStepper and tabs, never covers controls, tappable targets; dot visible near participant count.
- **Cohost device:** sees + acts on the banner; Session-tab toggle absent/disabled.
- **Projector + participant phones:** **never** show a nudge or dot (open both during a fired nudge).
- **No-key build:** nudges fire; `[reword]` hidden; privacy copy notes AI off.
- **Toggle off mid-session:** banner + dot disappear instantly (authoritative `navState`).

---

## Privacy & ethos check (explicit)

- **Submissions never logged / off-the-record — intact.** Signals read **counts, timings, distributions** only. The AI draft prompt (Full vision) is fed **kind + numeric signals + module catalogue + `topicLine()`** — **never** participant text.
- **No deanonymization.** Dominance is **never** computed from `Submission.token` (the deanonymization-resistant field) or from `handle == 'Anonymous'` (which collapses all anonymous submitters). `DOMINATED` is scoped strictly to modules that already make speaking order **public to the room**, and does **not** fire in anonymous modes. `STALLED`/participation use raw count/rate, not per-person identity.
- **24h TTL + End-session wipe — inherited.** `__cofac__` rides the votes hash; `endSession` deletes `votes`; `updateRoom` bumps the room TTL.
- **Facilitator-only.** `cofac` is on `FacilitatorState` (not `PublicState`); participants/projector never receive it.
- **Account-less, opt-in, never autonomous.** Off-able per room in one tap by the lead; it suggests, the human acts. **Silence is the default** and a feature.
- **One flagged setting change:** `cofacEnabled` / `cofacSensitivity` on the `Room` record — a stored **setting**, never content. The Session-tab privacy note states the contract verbatim to the facilitator.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution folded into this spec |
|---|---|
| **Cooldown blob needs a poll-path write** (corrupts under host+cohost `hset` races; hot-path write). | **Eliminated.** Relevance/cooldown **derived** from existing timestamps. Only write is the explicit `cofacDismiss` tap. Global "don't re-animate" floor is a **client-side debounce** in `CofacBanner`. Poll path is a **pure read**. |
| **`DOMINATED` mis-keys on handle / pushes toward token correlation.** | Scoped to **public-speaking-order modules only** (fishbowl/read-around); **never** token/handle; **off** in anonymous modes; deferred to Full vision (MVP omits it). |
| **`getFacilitatorState` has no `Room` record** (can't read `cofacEnabled`/topic there; layering). | `cofac` computed in the **route layer** (`state/route.ts` host branch + `navState`), where `roomRec` + `topic` are already loaded. `lib/store.ts` stays free of a `lib/rooms.ts` dependency; disabled rooms skip computation entirely. |
| **`updateRoom` allow-list + `Room` interface omit the fields** → `cofacToggle` no-ops. | Add both fields to **both** the interface and the `Pick<>` allow-list; resolve `enabled ?? aiAvailable()` at read; round-trip test. |
| **Same-rev out-of-order polls flap the banner** (nudges don't bump rev). | Server-computed monotonic **`nudgeSeq`**; `CofacBanner` ignores `seq <=` shown; deterministic selection (priority, then seq). |
| **`setPhase` could target a non-existent/current phase.** | Resolved against live `PublicState.sequence` at eval time; downgrade to observation/`addContent` when no suitable later phase exists; covered by test. |
| **SSE won't tick on time-only nudges** (`roomSignature` is data-derived). | **Accepted and documented:** nudges ride the **2s poll**; up-to-2s latency is fine for a deliberately-rare assistant. No SSE change. |
| **Participation ratio degrades under anonymity.** | Use raw count + 90s rate, not distinct-token ratio; warm-up grace + min-headcount guards. |
| **AI double-fire / cost** (Full vision). | `cofacDraft` only on tap, `withGenerateLock` keyed phase+kind, `__cofac__`-cached, tier `fast`. |
| **`.entries()` / Set spreads fail `verify`.** | `lib/cofac.ts` uses `Object.keys().forEach`/indexed loops; verify gate + new test catch regressions. |
| **Nagging / chatter.** | Conservative thresholds, per-kind relevance windows, dismissals, Gentle/Standard sensitivity; silence is default. |

---

## Out of scope / future

- `SKEWED_VOTE` and `LOW_JOIN_AT_START` kinds (conservative later additions).
- Auto-populating the **next phase's config** with a drafted prompt (requires `configure`-tier write) — default is `addContent`/copyable text; an opt-in "apply to next phase" for leads is future.
- Content-free telemetry (nudge shown / acted / dismissed counts) to learn which nudges earn their keep.
- Per-handle dominance for `spectrogram` or other modules that don't yet publish public speaking order.
- A separate `GET /cofac/signals` endpoint (current design folds into the host `/state` poll).
- Surfacing a nudge on a **second lead-only device** distinct from cohost (current design: shared banner, gated toggle).
