# C6 — Room-felt timer (synced countdown, chime, "2 min left")

> Section: C. Running live · Priority **P1**

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 3 days (full scope incl. pause/resume). The MVP cut below is ~1.5–2 days.
- **Dependencies (item ids):** none — this is a self-contained change to core `SessionState`, the shared `Countdown`, and the host route. It reuses existing primitives only:
  - `components/Countdown.tsx` — the single shared synced clock (the keystone file to extend).
  - `components/usePolledState.ts` — `apply`/`refresh`, the anti-flash rev guard (reused, not changed).
  - `lib/auth.ts` — the `timer` capability already exists (present in `ALL` and `COHOST`); reused, not modified.
  - `lib/modes.ts` / `PhaseConfig.timerSeconds` — source for the `Start M:SS` preset, already surfaced via `getPublicState`.
- **No new npm dependencies. No new auth capability. No migration/flag.**

---

## Problem & facilitator value

### Problem (confirmed in code)

The timer today is a half-built afterthought, not a "room-felt" instrument:

1. **No "2 minutes left" nudge anywhere.** The Intent asks for it; it does not exist.
2. **Chime fires only on the participant phone, and only at zero** (`ParticipantApp.tsx:170-193` / `useChime` `195-222`). The **projector** (`ProjectorApp.tsx:47-51`) and **host console** (`HostConsole.tsx:492`) show a silent number — so the projector, the room's shared focal point usually wired to speakers, never makes a sound.
3. **Host controls are crude and dishonest** (`HostConsole.tsx:498-511`). `+1:00` actually SETS a fresh 60s timer (`timer(60)` → `setTimer{endsAt: now+60s}`), it does NOT add a minute to the running clock (`HostConsole.tsx:464-465`). No pause, no real extend, no manual "time's up."
4. **No pause/resume.** `timerEndsAt` is an absolute epoch (`types.ts:132`); you can't hold a room without losing the clock.
5. **WebAudio can't autoplay before a user gesture;** watch-only participants get a silent expiry. No guaranteed visual fallback for the nudge.
6. **The only audible event is a startle at 0:00** — no warning, no wind-down. Undercuts the calm ethos.

### Facilitator value (in the facilitator's voice)

> "I run by ear and by the clock, and I want the clock to do the social work so I'm not the one nagging. Start a phase timer and I trust that the phones, the projector, and my console all count the *same* number to the second — no per-device drift. Two minutes out, the room gets a gentle shared moment: a soft warning note off the projector speakers and a calm amber '2 minutes left' band, so people self-pace and I don't have to interrupt. At zero it's a soft landing — the two-note chime I already know, 'Time's up', a slow fade — never a kitchen-timer alarm. When someone's mid-thought I tap Pause and the clock holds; Resume and it picks up exactly where it froze. And when I need another minute I tap +1 and it *adds* to the running clock instead of clobbering it. The controls say what they do — Start 8:00 / Pause / +1 / Time's up — never a number that lies. The timer becomes my co-host: it keeps time for the whole room, audibly and visibly, so I can stay with the people."

---

## MVP cut (thinnest shippable) and Full vision

### MVP (ship first, ~1.5–2 days) — fully satisfies the C6 intent

Everything needed for "synced countdown, chime, 2 min left", plus honest controls and real extend:

- **`Countdown`**: add `warnSeconds` + `onWarn` (fires once per `endsAt`, live above→below crossing only) and a `status` (`normal | warning | expired`) for tinting. `onElapsed` untouched.
- **Shared `useChime`** with `warn()` (single warm ~1s low sine ~330Hz) + `done()` (existing 660/880Hz two-note). Lift out of `ParticipantApp`.
- **Projector + phone wiring**: projector gets sound for the first time (warn note, amber "N minutes left" band, two-note + "Time's up" + 6s fade). Phone gets amber tint + inline "N min left" + best-effort warn chime.
- **Honest host controls**: `Start M:SS` / `+1` / `+2` (real `extendTimer`) / `Time's up` (`setTimer{endsAt: now}`) / `Clear`. Delete the lying `+1:00`/`+5:00` buttons.
- **State**: `timerStartedAt`, `timerWarnSeconds` (default 120), surfaced in `PublicState`.
- **Accessibility**: the band text announced via `aria-live="polite"`.

### Full vision (this spec covers all of it; pause/resume can be a fast-follow if cut)

- **Pause / Resume** ("hold the room"): adds `timerPaused` + `timerPausedRemaining`, `pauseTimer`/`resumeTimer` commands, a frozen render mode in `Countdown`. Carries the SSE-signature, cross-phase-leak, and frozen-fire concerns — all resolved in this spec.
- **Fast-follows (explicitly out of v1):** per-room "Warn at 1/2/3 min" control writing `timerWarnSeconds`; admin per-room timer-sound opt-out; projector amber drain bar.

---

## Experience & flows

**Tone:** calm, ambient, room-wide; *felt, not announced*. Nothing flashes, nothing is loud. One warm note = "wrap up"; two notes = "done." Like a singing bowl, not a kitchen timer. Controls read as verbs of intent — never raw numbers that lie.

### Projector (the shared focal point — primary speaker)

Countdown stays top-right, gains states:

- **normal** — accent mono digits (unchanged).
- **warning** (`remainingMs <= warnSeconds*1000`) — a single soft warning note plays through projector speakers; a thin amber band slides in under the header reading **"2 minutes left"** (`"{N} minutes left"`, singular at 1). *Optional* thin amber drain bar **only** in this state (off otherwise — avoids a racing-clock anxiety vibe).
- **expired** — **"Time's up"** in soft red, the existing two-note chime, a slow **6s fade** to neutral.
- **paused** — frozen mm:ss greyed with **"Paused"**, no chimes.

### Phones (sticky status bar, `StatusBar` 168-193)

Keeps current behavior; adds:

- **warning** — amber tint + inline **"{N} min left"** + warn chime *best-effort* (only if `AudioContext` was unlocked by an earlier tap). The amber band/text is the **guaranteed** channel; the chime is a nicety.
- **expired** — existing end-chime / "Time's up" / 6s fade (unchanged).
- **paused** — frozen greyed mm:ss + "Paused".

### Host console (`SessionHeader` 451-515)

- Countdown tints **amber** ≤ warn, **red** past zero, **grey** while paused.
- On the host Countdown's own `onWarn` crossing, show a transient line: **"Warned the room · 2:00 left"** (`{mm:ss} left`).
- Controls (verbs):
  - **`Start M:SS`** — from `state.config.timerSeconds`, shown **only when not running** (no live `timerEndsAt`).
  - **`Pause`** / **`Resume`** — while running.
  - **`+1`** / **`+2`** — extend the *running* clock.
  - **`Time's up`** — hard stop now.
  - **`Clear`** — remove the timer.

### Key flows

1. **Start from preset:** Run tab → `Start 8:00` → host sends `setTimer{endsAt: now+480_000}` → server writes `timerEndsAt` + `timerStartedAt`, clears paused fields → returns authoritative `navState` → client `apply()`. Within one poll/SSE tick (≤2s) projector + every phone show identical synced digits.
2. **2-min-left nudge (headline):** each surface's `Countdown` locally crosses `endsAt - warnSeconds*1000` and fires `onWarn` once per `endsAt`, purely client-side off the synced epoch — no server round-trip, no drift. Lands room-wide in the same ~1s window.
3. **Zero / soft landing:** `onElapsed` fires once. Two-note chime, "Time's up" soft red, 6s fade. **Timer does NOT auto-clear** — `timerEndsAt` stays in the past showing "Time's up" until the next `setTimer`/phase advance. The facilitator decides.
4. **Add time to a running timer:** `+1`/`+2` → `extendTimer{deltaSeconds}` → server `endsAt = max(now, timerEndsAt ?? now) + delta*1000`, clears paused. The new `endsAt` key re-arms warn (a fresh "2 min left" can fire only if the extension pushes remaining back above threshold via a live crossing).
5. **Pause / Resume:** `pauseTimer` → `timerPausedRemaining = max(0, timerEndsAt - now)`, `timerPaused = true` (timerEndsAt held stale). `resumeTimer` → `timerEndsAt = now + timerPausedRemaining`, paused fields cleared. Room resumes from the exact frozen value, still server-synced.
6. **Time's up (manual):** `setTimer{endsAt: Date.now()}` — end chime + "Time's up" fire immediately everywhere.
7. **Clear:** `setTimer{endsAt: null}` — countdown disappears on all surfaces (current behavior preserved).

---

## Architecture

### Approach (five pillars)

1. **Synced nudge in ONE place** — extend the single `Countdown`; every surface derives the warn threshold from the same server `endsAt` + `timerWarnSeconds`, so the nudge is identical room-wide with no per-surface clock.
2. **Shared chime** — one `useChime` returning `{ warn(), done() }`; projector (currently silent) and phones consume it.
3. **State fields** — additive, optional, ephemeral; default cleanly on existing rooms.
4. **Store mutators + authoritative host commands** — every command returns `navState` built from the just-written state; client applies via `usePolledState.apply`. **No KV read-back.**
5. **Honest controls** — verbs of intent; the lying `+1:00`/`+5:00` buttons deleted.

### New files

- **`/Users/jordan/workshop/edges-v2/components/useChime.ts`** — shared WebAudio chime hook lifted from `ParticipantApp.tsx:195-222`. Exports `useChime()` → `{ warn(), done() }`:
  - `done()` = existing 660/880Hz two-note end chime (verbatim).
  - `warn()` = single warm ~1s low sine (~330Hz), gain ramp like the existing chime but lower and ~1s long, so the room learns one-note = wrap up, two notes = done.
  - Best-effort, gesture-unlocked `AudioContext`, **never throws** (keep the `try/catch` "chime is a nicety" contract).
- **`/Users/jordan/workshop/edges-v2/test/timer.test.ts`** — Vitest (in-memory store), see Test plan.

### Changed files

- **`/Users/jordan/workshop/edges-v2/components/Countdown.tsx`** (keystone)
  - Add props: `warnSeconds?: number`, `onWarn?: () => void`, `frozenRemainingMs?: number | null`, and surface a `status` (`"normal" | "warning" | "expired" | "paused"`) — via an `onStatus?: (s) => void` callback **or** a `className`-by-status mechanism (pick one; `onStatus` keeps math in the clock and tint in the surface). Keep hooks **above** the early return (`downlevelIteration` / convention: no Set spreads, no `.entries()`).
  - Add `useWarnFire(endsAt, now, warnSeconds, onWarn, paused)` mirroring `useElapsedFire` (43-61): fires `onWarn` **once per `endsAt`**, only on a **live above→below crossing** of `endsAt - warnSeconds*1000`, guarded by `firedFor === endsAt`. A fresh mount that starts already-below stays silent (guards reload + sub-warn-timers).
  - **Gate both fire effects on `frozenRemainingMs == null`** (early-return inside the effect) — a paused timer holds `timerEndsAt` stale in the past and must fire **nothing**.
  - **Frozen mode:** when `frozenRemainingMs != null`, render that frozen mm:ss, count nothing, fire nothing, status = `paused`.
  - Keep the 500ms interval and the existing `onElapsed` path untouched.

- **`/Users/jordan/workshop/edges-v2/components/ProjectorApp.tsx`** (header 40-52)
  - `const chime = useChime();` Pass `warnSeconds={state.timerWarnSeconds}` and `frozenRemainingMs` (derived from paused state, see below) to `Countdown`.
  - `onWarn` → `chime.warn()` + slide in thin amber **"{N} minutes left"** band under the header (+ optional amber drain bar only in this state).
  - `onElapsed` → `chime.done()` + "Time's up" soft red + 6s fade to neutral (mirror `ParticipantApp` expired state machine). **This surface currently makes no sound — wire audio here.**

- **`/Users/jordan/workshop/edges-v2/components/ParticipantApp.tsx`** (StatusBar 168-193; remove inline `useChime` 195-222)
  - Import `useChime` from the new shared module; `const chime = useChime();`. Replace the bare `chime()` end call with `chime.done()`.
  - Pass `warnSeconds` + `frozenRemainingMs`; add `onWarn` → `chime.warn()` (best-effort) + amber tint + inline **"{N} min left"**.
  - Keep the existing `onElapsed` end-chime / "Time's up" / 6s-fade.

- **`/Users/jordan/workshop/edges-v2/components/HostConsole.tsx`** (`SessionHeader` 451-515; `timer` helper 464-465)
  - Delete the misleading `+1:00`/`+5:00` buttons (they clobber).
  - New controls: `Start M:SS` (`config.timerSeconds`, only when `!running`) via `setTimer`; while running `Pause`/`Resume` (`pauseTimer`/`resumeTimer`), `+1` (`extendTimer{deltaSeconds:60}`), `+2` (`extendTimer{deltaSeconds:120}`), `Time's up` (`setTimer{endsAt: Date.now()}`), `Clear` (`setTimer{endsAt: null}`).
  - Countdown tints amber ≤ warn, red past zero, grey while paused; `onWarn` shows the transient "Warned the room · {mm:ss} left" line.
  - Keep the `Cmd` plumbing; commands apply authoritative state via the existing path (`HostConsole.tsx:103`). **Busy handling — see Risks #1.**

- **`/Users/jordan/workshop/edges-v2/lib/types.ts`**
  - `SessionState` (129-146): add `timerStartedAt?: number | null`, `timerWarnSeconds?: number` (default 120), `timerPaused?: boolean`, `timerPausedRemaining?: number | null`.
  - `PublicState` (beside `timerEndsAt` at 236): mirror `timerWarnSeconds`, `timerPaused`, `timerPausedRemaining` (and optionally `timerStartedAt`). `FacilitatorState` inherits via `extends`.

- **`/Users/jordan/workshop/edges-v2/lib/store.ts`**
  - `DEFAULT_STATE` (179-187): seed `timerWarnSeconds: 120`, null `timerStartedAt`/`timerPausedRemaining`, `timerPaused: false`. (End-session writes `{...DEFAULT_STATE, ended:true}` at 635 — this keeps the wipe correct.)
  - `setTimer` (297-303): also set `timerStartedAt: endsAt !== null ? Date.now() : null` and clear `timerPaused: false` / `timerPausedRemaining: null`.
  - Add **`extendTimer(deltaSeconds, roomId)`**: `endsAt = max(now, state.timerEndsAt ?? now) + deltaSeconds*1000`; clears paused; `writeState`. Wrap the read-modify-write in `withLock` (see Risks #1 for busy semantics).
  - Add **`pauseTimer(roomId)`**: `timerPausedRemaining = max(0, (state.timerEndsAt ?? now) - now)`, `timerPaused = true`; `writeState`. (No `withLock` — last-writer-wins on a fresh `getState` is fine; pause is idempotent enough.)
  - Add **`resumeTimer(roomId)`**: `timerEndsAt = now + (state.timerPausedRemaining ?? 0)`, `timerPaused = false`, `timerPausedRemaining = null`; `writeState`. (No `withLock`.)
  - **Cross-phase reset:** in `setMode` (249), `setPhases` (271), `setPhase` (290) — alongside `timerEndsAt: null` — also set `timerStartedAt: null`, `timerPaused: false`, `timerPausedRemaining: null` (and leave/seed `timerWarnSeconds`). Prevents a frozen "Paused mm:ss" leaking across a phase advance.
  - `getPublicState` (≈807): emit `timerWarnSeconds`, `timerPaused`, `timerPausedRemaining` (and optionally `timerStartedAt`) beside `timerEndsAt`.
  - **`roomSignature` (822-846): add `state.timerPaused` and `state.rev` to the join array.** Pause/Resume hold `timerEndsAt` stale, so without this they write a new rev but an unchanged signature → no SSE tick → room sees "Paused" only on the next 2s poll. Adding `rev` (always changes on write) is the belt-and-suspenders fix.

- **`/Users/jordan/workshop/edges-v2/app/api/r/[room]/host/route.ts`**
  - Import `extendTimer`, `pauseTimer`, `resumeTimer`.
  - `COMMAND_CAP` (54-83): add `extendTimer: "timer"`, `pauseTimer: "timer"`, `resumeTimer: "timer"`.
  - Add three switch cases mirroring `setTimer` (205-208), each returning `navState(room, written, role)`. `extendTimer` reads `a.deltaSeconds` (number, default 60). **Busy path — see Risks #1.** Keep `setTimer`.

### Data model

```ts
// SessionState (additive, all optional → existing persisted states default cleanly)
timerStartedAt?: number | null;       // epoch when current timer began (future progress bar)
timerWarnSeconds?: number;            // default 120; server-driven nudge threshold
timerPaused?: boolean;                // true while held
timerPausedRemaining?: number | null; // frozen ms remaining while paused (endsAt held stale)
```

**Invariants:**
- `paused` ⇒ `Countdown` renders `frozenRemainingMs` and fires nothing; `timerEndsAt` is held stale.
- `resume` ⇒ `timerEndsAt = now + timerPausedRemaining` (re-synced to server epoch).
- `extend` ⇒ `endsAt = max(now, endsAt) + delta` → new `endsAt` key re-arms warn.
- `timerWarnSeconds` absent client-side ⇒ default 120.

No store-key changes, no durable DB — still room-scoped Redis, 24h TTL, in-memory fallback. New fields are ephemeral session-control state.

### API + host commands (capability gating)

| Command | Body | Cap | Server effect | Response |
|---|---|---|---|---|
| `extendTimer` | `{ command, code, deltaSeconds:number }` | `timer` | `endsAt = max(now, timerEndsAt ?? now) + deltaSeconds*1000`, clears paused | authoritative `navState` |
| `pauseTimer` | `{ command, code }` | `timer` | `timerPausedRemaining = max(0, endsAt - now)`, `timerPaused = true` | authoritative `navState` |
| `resumeTimer` | `{ command, code }` | `timer` | `timerEndsAt = now + timerPausedRemaining`, clears paused | authoritative `navState` |
| `setTimer` (unchanged on wire) | `{ command, code, endsAt }` | `timer` | also writes `timerStartedAt`, clears paused | authoritative `navState` |

- `Time's up` = `setTimer{ endsAt: Date.now() }`; `Clear` = `setTimer{ endsAt: null }` (both existing).
- `/state` and host `navState` responses now include `timerWarnSeconds`, `timerPaused`, `timerPausedRemaining`.
- **No new capability.** `timer` already exists in `ALL` (admin/facilitator) and `COHOST` (`lib/auth.ts`). Co-hosts can run the timer; participants/projector cannot. Not a `setPhases` path, so the `configure` admin gotcha is untouched.

### Rev / authoritative-apply pattern (no KV read-back)

Every new command goes through `writeState`, which stamps a strictly-increasing `rev`, then returns `navState(room, written, role)` built from the **just-written** state (`route.ts:39-49` → `getFacilitatorState(room, written)`). `HostConsole` applies it via `apply(d.state)` only when `typeof d.state.rev === "number"` (`HostConsole.tsx:103`). The anti-flash rev guard in `usePolledState` holds because pause/extend/resume are normal rev-bumping writes. **Zero read-backs** — a stale/eventually-consistent KV read can never un-start or un-pause the timer. The `withLock` busy path is the one exception that must still return authoritative state (Risks #1).

---

## Implementation plan (ordered, checkable)

- [ ] **1. `Countdown.tsx`** — add `warnSeconds`/`onWarn`/`frozenRemainingMs`/status; add `useWarnFire`; gate both fire effects on `frozenRemainingMs == null`; frozen render branch. Hooks above the early return. Export any pure helper (e.g. `computeStatus`) for unit testing.
- [ ] **2. `useChime.ts`** — extract from `ParticipantApp`; add `warn()` (single warm ~1s ~330Hz sine) + `done()` (existing two-note). Best-effort, never throws.
- [ ] **3. `lib/types.ts`** — add the four `SessionState` fields; mirror the three public fields into `PublicState`.
- [ ] **4. `lib/store.ts`** — seed `DEFAULT_STATE`; extend `setTimer`; add `extendTimer`/`pauseTimer`/`resumeTimer`; clear new fields in the three resets; emit in `getPublicState`; add `timerPaused` + `rev` to `roomSignature`.
- [ ] **5. `test/timer.test.ts`** — write the Vitest cases (Test plan) and run `npx vitest run test/timer.test.ts`.
- [ ] **6. `app/api/r/[room]/host/route.ts`** — import mutators; add `COMMAND_CAP` entries; add three cases (busy path returns fresh `navState` — Risks #1).
- [ ] **7. `ProjectorApp.tsx`** — wire `useChime`, `warnSeconds`, `frozenRemainingMs`, amber band (aria-live polite), drain bar (warning only), soft landing.
- [ ] **8. `ParticipantApp.tsx`** — swap to shared `useChime`; add warn tint/text/chime; remove inline hook.
- [ ] **9. `HostConsole.tsx`** — replace controls with verbs; tints; "Warned the room" line; busy notice (Risks #1).
- [ ] **10. `npm run verify`** (typecheck + lint + test on Node 24) then build. Then manual smoke (Test plan).

**Convention guardrails:** no Set-spreads / `.entries()` (use index loops / `Array.from()`); hooks above early returns; terse comment-led style; zod/types as source of truth.

---

## Acceptance criteria (facilitator-outcome framed)

1. **Synced start:** After `Start 8:00`, the projector, every phone, and the host console show the *same* mm:ss to within ~1s, counting down off one server epoch (no per-device start).
2. **Shared 2-min nudge:** At `remaining == warnSeconds`, every surface enters the warning state within the same ~1–2s window: projector plays one warm note + shows the amber "2 minutes left" band; phones show amber + "2 min left" (+ chime if audio unlocked); host digits turn amber and "Warned the room · 2:00 left" appears once.
3. **Nudge fires exactly once** per timer, and **not at all** if the timer started already below the warn threshold (e.g. `Start 1:00` with warn 2:00).
4. **Soft landing:** At zero, projector + phones play the two-note chime, show "Time's up" in soft red, fade after 6s. The timer does **not** auto-clear.
5. **Honest extend:** `+1` on a running 3:00 timer makes every surface show ~4:00 (added to the live clock), not a fresh 1:00. `+1`/`+2` on an expired timer resurrect it from now.
6. **Pause holds the room:** `Pause` freezes mm:ss greyed with "Paused" on every surface within one SSE tick; no chime fires while paused even if the frozen value is at/under warn or zero. `Resume` continues from the exact frozen value, still synced.
7. **Manual stops:** `Time's up` triggers the end chime + "Time's up" immediately everywhere; `Clear` removes the countdown everywhere.
8. **Honest controls:** No control sets a number that differs from what its label promises. The old `+1:00`/`+5:00` clobber buttons are gone.
9. **Accessibility:** Screen readers announce "2 minutes left" / "Time's up" / "Paused" (band via `aria-live="polite"`); the ticking digits do **not** spam (`aria-live="off"`).
10. **Resilience:** On a mid-timer projector/phone reload, the countdown resumes synced and an already-passed warn/elapsed does **not** re-fire. No timer command is silently no-op'd under co-host contention (busy returns authoritative state + a notice).

---

## Test plan

### Vitest — `test/timer.test.ts` (in-memory store, no KV/AI)

- `setTimer` sets `timerStartedAt` (when endsAt non-null) and clears `timerPaused`/`timerPausedRemaining`.
- `setTimer(null)` nulls `timerStartedAt`.
- `extendTimer` on a **live** clock: `endsAt = max(now, prevEndsAt) + delta` (extends, doesn't reset).
- `extendTimer` on an **expired** clock: `endsAt ≈ now + delta` (resurrects).
- `extendTimer` clears paused fields.
- `pauseTimer`: stores `timerPausedRemaining = max(0, endsAt - now)`, `timerPaused = true`, leaves `timerEndsAt` unchanged (held stale).
- `resumeTimer`: `timerEndsAt ≈ now + pausedRemaining`, `timerPaused = false`, `timerPausedRemaining = null`.
- **Every mutator bumps `rev`** (`rev_after > rev_before`).
- Back-to-back `extendTimer` (two calls) **stack additively** (`+1` then `+1` ≈ +2 from the original), verifying the `withLock` read-modify-write.
- **Cross-phase leak:** pause, then `setPhase`/`setMode`/`setPhases` → resulting state has `timerEndsAt === null` **and** `timerPaused === false` **and** `timerPausedRemaining === null`.
- `getPublicState` emits `timerWarnSeconds`, `timerPaused`, `timerPausedRemaining`.
- `roomSignature` **changes** between a running state and a paused state (and after extend/resume).
- **Warn re-arm semantics:** `extend` landing remaining **below** warn fires no warn; `extend` landing remaining **above** warn re-arms (assert via the pure `Countdown` helper, not promised in UI on every extend).

### Component / pure-helper (optional but recommended)

- `useWarnFire` / `computeStatus`: fires `onWarn` once on a live above→below crossing; silent on a fresh below-threshold mount; silent while `frozenRemainingMs != null`; the elapsed fire is also gated on paused (assert pause + time-advance fires no chime).

### Manual QA (incl. mobile + projector)

1. Open **projector** (facilitator gesture unlocks audio) + a **phone** + **host** on one room.
2. `Start 8:00` → confirm identical synced digits across all three within ≤2s.
3. At 2:00 → confirm **one warm note** + amber band on projector, amber + "2 min left" on phone, "Warned the room · 2:00 left" on host — all within ~1–2s, exactly once.
4. At 0:00 → two-note chime + "Time's up" soft red + 6s fade on projector and phone.
5. `+1`/`+2` while running → live clock extends; warn re-arms only if pushed back above threshold.
6. `Pause` → frozen greyed "Paused" on all surfaces within one SSE tick, **no chime**; `Resume` → continues from the frozen value.
7. `Time's up` → immediate end chime; `Clear` → countdown disappears everywhere.
8. **Mobile specifics:** before tapping anything on the phone, confirm the amber band + "N min left" still appear at warn (visual guaranteed channel) even though the chime is silent (audio gesture-locked); after a tap, the chime works.
9. **Reload mid-timer** on phone and projector → countdown resumes synced, no re-fired warn/chime.
10. **Co-host contention:** two hosts tap `+1` near-simultaneously → both taps either stack or surface a busy notice + re-sync; neither silently no-ops.

---

## Privacy & ethos check (explicit)

- **No ethos violation.** The four new fields (`timerStartedAt`, `timerWarnSeconds`, `timerPaused`, `timerPausedRemaining`) are ephemeral session-**control** state, not participant data: no new logging, no new persistence beyond the existing room-scoped Redis 24h TTL, no accounts, no submissions touched.
- **End-session wipe stays correct** — `endSession` writes `{...DEFAULT_STATE, ended:true}` (`store.ts:635`); seeding the new fields in `DEFAULT_STATE` keeps the wipe total.
- **No new auth surface** — reuses the existing `timer` capability (present in admin/facilitator/cohost); the `configure` admin gotcha is untouched (not a `setPhases` path).
- **Calm contract honored** — the audible events are a single warm note (warn) and the existing soft two-note (done), with a 6s fade; nothing loud, nothing flashing. The visual nudge is the guaranteed channel; sound is a nicety that degrades gracefully where WebAudio is gesture-locked. Trust story intact.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **`withLock` busy path must not silently no-op (MAJOR — resolved).** `withLock` returns `{ ok:false, busy:true }` on contention; `HostConsole` only applies state when `typeof d.state.rev === "number"` (`:103`), so a busy return with no `state` would silently drop a tapped `+1`/`Pause` — reintroducing the dishonest-controls problem. **Fix:** on busy, the host route **does not** return a bare busy — it returns **fresh authoritative `navState`** (re-read current state via `getFacilitatorState` and return it) so the client always re-syncs; additionally `HostConsole` calls `refresh()` and shows a transient "Busy — try again" notice if `d.state` is absent. Drop `withLock` from `pause`/`resume` (last-writer-wins on a fresh `getState` is fine); keep it only for `extend` (the genuine additive double-tap race), returning fresh state on busy. Keep the lock TTL short.
2. **SSE signature omits pause/resume (MAJOR — resolved).** Pause/Resume hold `timerEndsAt` stale, so the existing `roomSignature` (which keys partly off `timerEndsAt`) would not tick → room sees "Paused" only on the next 2s poll. **Fix:** add `state.timerPaused` **and** `state.rev` to the `roomSignature` join array (`store.ts:822-846`); `rev` always changes on write, guaranteeing a tick for every timer command.
3. **Cross-phase paused-state leak (MINOR — resolved).** `setMode`/`setPhases`/`setPhase` null `timerEndsAt` but not the paused fields → could render "Paused mm:ss" on a timerless phase. **Fix:** clear `timerStartedAt`/`timerPaused`/`timerPausedRemaining` in all three resets and seed them in `DEFAULT_STATE`; covered by a Vitest case.
4. **Fire hooks not gated on paused (MINOR — resolved).** `useWarnFire`/`useElapsedFire` run every 500ms even when paused; a stale past `endsAt` could fire the done chime on a paused timer. **Fix:** early-return inside both fire effects when `frozenRemainingMs != null`; Vitest asserts pause + time-advance fires no chime.
5. **Accessibility of the guaranteed visual channel (MINOR — resolved).** `Countdown` renders `aria-live="off"` (`:35`); silently inserted "2 minutes left"/"Time's up"/"Paused" never reach screen readers. **Fix:** render the state-transition band text in an `aria-live="polite"` region; keep the ticking digits `aria-live="off"` to avoid per-second spam.
6. **Warn re-arm on extend underspecified (MINOR — resolved).** An extend that lands remaining still below warn correctly stays silent (new `endsAt` key starts already-below). **Fix:** document it (the UI never promises a warn on every extend) and cover both branches with Vitest.
7. **Scope creep (MODERATE — managed).** Pause/resume is an opinionated addition beyond the literal C6 intent and carries risks #2–#4. **Mitigation:** the MVP cut above ships the full headline value (synced countdown + warn nudge + shared chime + honest controls + real extend) without pause/resume; pause/resume is cleanly separable as a fast-follow if the 3-day estimate is at risk.
8. **Audio autoplay lock (known, accepted).** Projector is opened by the facilitator (gesture happens); phones only play if the `AudioContext` was unlocked by an earlier tap. The amber band + "N min left" is the guaranteed channel.
9. **Clock skew (known, accepted).** Countdown is local `Date.now()` vs server `endsAt`; a few seconds skew is the status quo. No NTP correction.

---

## Out of scope / future

- **Per-room "Warn at 1/2/3 min"** control writing `timerWarnSeconds` (the field is already server-surfaced; just needs a host control).
- **Admin per-room timer-sound opt-out** in theme/branding (visual nudge always on; sound a toggle).
- **Projector amber drain bar** beyond the warning state (kept minimal in v1 to avoid a racing-clock vibe).
- **`timerStartedAt`-powered progress bar / "started X ago"** affordance.
- **NTP-style clock correction** (explicitly not pursued).
