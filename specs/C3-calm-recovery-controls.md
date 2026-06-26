# C3 — Calm recovery controls (re-poll / reset phase / skip / back / undo)

> Section C — Running live · **P0** · Executable build spec. All pressure-test must-fixes are already folded into the design below; where a recommendation changed the design (notably **undo is nav-only for clears** and **votes are cleared with a new `hdel`, not a read-rebuild**), the change is final and reflected throughout. Build to this document.

---

## Priority / effort / dependencies

- **Priority:** P0 (composure-critical for live, paid facilitation)
- **Effort:** **4.5 days** (achievable only because undo-of-clear is nav-only and votes clear via `hdel` — see Risks). Full conflict-aware data-restore undo would be ~7–8 days and is explicitly out of scope.
- **Dependencies (existing platform pieces, no item blockers):**
  - `lib/store.ts` — `withLock`, `writeState`, `replaceList`, `hgetall`/`hset`, `releaseQueuedContent`, `setPhase`, `endSession` (all existing)
  - `app/api/r/[room]/host/route.ts` — `navState()` authoritative-apply helper (existing)
  - `components/usePolledState.ts` — `apply`/`refresh` (existing)
  - `components/ui.tsx` — `Modal` + `Button` (reused for `ConfirmSheet`)
  - `lib/modules/registry.server.ts` — `capabilities.acceptsActions` for collecting-phase detection (existing)
  - `lib/auth.ts` — `advance` + `curate` capabilities (existing; cohost has both)
- **New runtime deps:** none.

---

## Problem & facilitator value (facilitator's voice)

> "I'm running a board offsite. Someone test-voted before we started and now the poll on the projector is wrong. Or I tapped the wrong step and suddenly everyone's phone jumped. Or the room said 'wait, go back' and I went back — and a slide I'd queued for later just appeared. Right now my only big button is **End session**, which deletes the entire day. So I freeze. I stop improvising. I play it safe, which is the opposite of good facilitation.
>
> What I need is the missing middle: **re-run this poll clean** without losing the rest of the day, **take back** a mis-tap, and move **back / forward / skip** as deliberate labelled acts that tell me what they'll do to the projector *before* they do it. The room should never see me flinch."

**The product is composure.** Today every recovery move is irreversible and invisible to the facilitator but visible to the whole room. Grounded in the code:

1. `setPhase` (`lib/store.ts:279`) does **not** clear the target phase's data but **does** call `releaseQueuedContent()` — so going *backward* silently dumps queued content, and re-entering a poll shows everyone their old answers (votes keyed `${phaseId}::${token}` and submissions carrying `phaseId` both survive).
2. The only data wipe is `endSession` (`lib/store.ts:623`), which nukes the **whole room**. "This poll is contaminated" has no answer short of ending the session.
3. There is **no undo** of any kind. A mis-tapped phase chip is irreversible.
4. Reserved control state shares the votes hash under `${phaseId}::__round__` / `::__ai__` / `::__stage__` / `::__silent__` / `::__constraint__` (confirmed: `registry.server.ts:177`, `promptrelay.server.ts:236`, `spectrogram.server.ts:34`), so re-running a rotation/AI phase needs those reset too — and nobody can.

This item delivers re-open / reset / skip / back / undo — every move **confirm-gated where it clears data**, **authoritative-apply**, and described in plain facilitation language, never DB language.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (thinnest shippable, ship first)

1. **Footgun fix — direction-aware queue release.** Backward / jump-backward moves no longer dump queued content. Direction is **derived server-side** from sequence indices (no client flag). This is correctness-only and ships even if nothing else does.
2. **Reset phase (in place)** + **Re-open here (past chip)** — clears the target phase's collected data via a new atomic `clearPhaseData`, confirm-gated with **live, real participant counts** (reserved pseudo-tokens excluded from the count).
3. **Undo (nav-only, depth-1)** — after any phase move, a calm 12s header toast restores the **previous phase + timer** (and re-queues any content a forward move released). Undo does **not** resurrect cleared answers (see Risks for why).
4. Captions on Back/Advance and the calm `ConfirmSheet`.

### Full vision (later, behind no flag — additive)

- Ghost-data inline note in the Run tab when a re-entered phase already holds answers.
- A "Recovery" subsection in the Session tab for discoverability.
- Per-phase-dismissible ghost note for facilitators who intentionally revisit to *show* prior results.
- (Explicitly **not** pursued: conflict-aware full data-restore undo, depth-N history.)

---

## Experience & flows

**Tone:** calm, plain-language, consequence-first. Nothing flashes red unless it genuinely wipes the **room** (End/Archive). Per-phase clears use **accent**, never danger styling, and never use the words *delete* / *wipe* (reserved for End/Archive). Controls live in the existing sticky header (`HostConsole.tsx:178–179`), not buried in the Session tab.

### Three tiers of weight

- **FREE moves** (Back, Advance, jump, Skip): one-tap, instant, no confirm — they only change which phase is live. Each gains a one-line side-effect caption via `title`/`aria-label`.
- **DATA-CLEARING moves** (Reset phase, Re-open & clear): open the calm `ConfirmSheet` with exact live counts.
- **UNDO:** a quiet, ever-present 12s header toast after any move.

### Flow 1 — Reset phase (re-run in place; the headline move)

Run-tab header shows **"Reset this phase"** on the current phase → `ConfirmSheet`:

> **Re-open this phase?**
> Clears the **14 answers** and **9 votes** collected in "Where do you stand?" and re-opens it as a blank phase.
> *The rest of your session stays exactly as it is.*
> [ **Re-open clean** (accent) ] [ Cancel ]

Tap → `resetPhase` runs `clearPhaseData(current)` then `setPhase(current, { release:false })` → `navState` → `apply()` → projector + phones show the phase blank, re-opened for input → undo toast for 12s.

**Zero-count path:** if real participant count is 0, copy softens — *"This phase has no answers yet — re-opening just resets the timer."* — and the primary becomes a one-tap soft action (no scary framing).

### Flow 2 — Re-open here (past chip; re-run a step you already left)

Tapping a **past** phase chip offers a menu: **"Jump here"** (nav only) vs **"Re-open here (clear)"**. Re-open here = jump back to that phase **and** clear it (same `clearPhaseData`, target = that phase, `release:false`). Confirm-gated identically.

### Flow 3 — Skip forward

**Skip** is the Advance button with a different caption: *"Skips ahead. Queued content will be released."* Mechanically identical to Advance — both send `setPhase(next)`; the server detects `targetIdx === currentIdx + 1` and releases the queue. **No separate `skip` command.** One tap, no confirm, undo toast appears (and re-queues released content on undo).

### Flow 4 — Back

The existing `←` gains caption *"Goes back a phase. Answers already given are kept."* and emits an undo toast. No confirm. The backward move does **not** release queued content (footgun fixed).

### Flow 5 — Undo (nav-only, depth-1)

After any move, header toast: *"↩ Moved to 'Synthesis' · Undo"*, non-blocking, ~12s, flips to *"✓ Restored"* on use. Tap → `undo` command restores the prior `phaseId` / `timerEndsAt` / `readaroundIndex` and re-queues any content the prior forward move released. Depth-1 (last action only). Undo does **not** restore cleared answers.

### Flow 6 — Ghost-data note (Full vision)

On landing in a phase that already holds participant data **and is input-collecting**, a muted Run-tab strip: *"This phase already has 11 answers from earlier. Re-open to start it clean."* with an inline Re-open button; per-phase dismissible.

### Screens & states

- **PhaseStepper** (`HostConsole.tsx:519`): current chip → kebab/long-press menu (**Reset this phase**); past chips → menu (**Jump here** / **Re-open here (clear)**); a quieter **Skip** button beside Advance; captions on Back/Advance/jump via `title`/`aria-label`.
- **ConfirmSheet** (new): reuses `Modal`, accent not danger; live counts client-side from loaded `FacilitatorState`; zero-count soft path; never says delete/wipe.
- **UndoToast** (new): low-profile, slides under the stepper, non-blocking, 12s, flips to "Restored".
- **GhostDataNote** (new, Full vision): inline muted strip, dismissible.
- **SessionControls** (`HostConsole.tsx:949`): add a calm **Recovery** subsection above End/Archive — *"Need to re-run a step? Use Reset on the phase timeline above."* — keeping the truly destructive room-wipe controls verbally/visually separate.
- **Participant phone & projector:** no new UI. A cleared poll shows its normal empty "awaiting responses" state — indistinguishable from the first run (the point: the room shouldn't see the recovery).

---

## Architecture

### Files to add

| Path | Purpose |
|---|---|
| `components/recovery/ConfirmSheet.tsx` | Calm (accent, not danger) confirm sheet wrapping `Modal`. Props: `phaseLabel, answerCount, voteCount, isCollecting, onConfirm, onCancel`. Plain-language consequence + "rest of your session is untouched"; primary "Re-open clean"; zero-count soft path; never shows delete/wipe. |
| `components/recovery/UndoToast.tsx` | Low-profile header toast "↩ Moved to X · Undo" ~12s; flips to "✓ Restored"; non-blocking; calls `cmd('undo')`. |
| `components/recovery/recovery.ts` | Pure helpers: `isCollectingPhase(moduleId)` (allowlist + `capabilities.acceptsActions`), `phaseAnswerCount(state, phaseId)`, `phaseVoteCount(state, phaseId)` — **excludes reserved `__*__` pseudo-tokens** so counts are real participant answers. Derived from already-loaded state; no extra fetch. |
| `test/recovery.test.ts` | Vitest (in-memory store) — see Test plan. |

### Files to change

| Path | Change |
|---|---|
| `lib/store.ts` | (a) `setPhase(phaseId, roomId, opts?: { release?: boolean })` — default `release: true` (backward-compat); recovery/backward paths pass `false`. `releaseQueuedContent` now **returns the ids it flipped**. (b) New `clearPhaseData(phaseId, roomId)` under `withLock(room, 'clear:'+phaseId)` using the new `Backend.hdel` for votes + `replaceList`-filter for submissions/words; returns the removed set's metadata. (c) New `Backend.hdel(key, ...fields)` + reserved key helpers `writeUndo/readUndo/clearUndo`. (d) `undoLastAction(roomId)` (nav-only restore + re-queue released content). (e) Add `undo` key to `endSession`'s `del(...)`. |
| `lib/session.ts` | Add `undo: string` to `RoomKeys` and `roomKeys()` (`${base}:undo`). |
| `app/api/r/[room]/host/route.ts` | Direction-derived release in the `setPhase` case; new `COMMAND_CAP` entries; new switch cases `resetPhase` / `reopenPhase` / `undo`; write undo snapshot for nav moves; map `withLock` busy → 409 with a calm message. |
| `components/HostConsole.tsx` | Wire `UndoToast`; set toast state in `cmd()` success for nav/recovery commands; extend `PhaseStepper` with per-chip menus + Skip + captions; `ConfirmSheet` open/confirm state (reuse `setConfirming` idiom); `GhostDataNote` (Full vision); Recovery subsection in `SessionControls`. |

### Data model

**No durable-DB change** (privacy ethos intact). One **new** reserved room-scoped KV key with the standard 24h TTL: `room:{id}:undo`, holding a single **nav-only** snapshot (depth-1):

```ts
// lib/store.ts
interface UndoSnapshot {
  kind: 'nav' | 'reset' | 'reopen';      // for toast labelling, not behaviour
  prev: {
    phaseId: string | null;
    timerEndsAt: number | null;
    readaroundIndex: number;
  };
  // Ids that the just-performed forward move released (so undo re-queues them).
  releasedContentIds: string[];
  fromLabel: string;                      // "Discovery" — for "Moved to X" copy
  toLabel: string;
  at: number;
}
```

> **Deliberately NOT stored:** cleared submission text / vote values / words. Undo of a clear is **nav-only**. This eliminates (a) the privacy exposure of a transient full-content copy, (b) the lost-write race where a blind re-`hset` clobbers a fresh in-window vote, and (c) the OLD+NEW merge problem on append-only lists. The confirmed clear is final; the **12s grace is for the navigation/jump mistake**, which is the common panic.

**Backend interface** gains one minimal, in-parity method:

```ts
// Delete specific hash fields atomically (Redis HDEL). Memory backend deletes keys.
hdel(key: string, ...fields: string[]): Promise<void>;
```

`clearPhaseData` votes path (atomic, no whole-hash `del`, no lost-write window for other phases):

```ts
const all = await backend.hgetall<unknown>(roomKeys(roomId).votes);
const fields = Object.keys(all).filter((k) => k.startsWith(`${phaseId}::`));
if (fields.length) await backend.hdel(roomKeys(roomId).votes, ...fields);
```

Submissions/words use `replaceList` filtering out the target `phaseId` (no atomic predicate-delete exists for lists — accept the small lost-write window, mitigated by clearing only the **current / just-closed** phase, minimising concurrent writers). The `${phaseId}::` prefix match clears the reserved `__round__` / `__ai__` / `__stage__` / `__silent__` / `__constraint__` tokens **for free**, so a re-opened 1-2-4-All restarts at round 0 and a re-opened AI module shows no stale synthesis.

**`SessionState.rev` unchanged** — every recovery write goes through `writeState`, so a clear/undo gets a **higher rev** and sticks via the monotonic guard. **No `FacilitatorState` shape change** — confirm counts derive client-side from the already-served `submissions[]` + active view.

### API + host commands (+ capability gating)

Confirmed caps (`lib/auth.ts`): facilitator has all except `configure`; **cohost has `advance` + `curate` + `viewRaw`** (not `configure`).

| Command | Body | Effect | **Cap** |
|---|---|---|---|
| `setPhase` (existing) | `{ phaseId, code }` | Move; server derives direction from sequence index — release queue **only** when `targetIdx === currentIdx + 1`. Writes a nav undo snapshot. | `advance` |
| `resetPhase` (new) | `{ code }` | `clearPhaseData(current)` + `setPhase(current, {release:false})`. | **`curate`** |
| `reopenPhase` (new) | `{ phaseId, code }` | Jump back to past phase **and** clear it (`release:false`). | **`curate`** |
| `undo` (new) | `{ code }` | `undoLastAction` — nav-only restore + re-queue released content. | `advance` |

**Capability decision (resolved, not an open question):** nav moves (`setPhase`, `undo`) gate on **`advance`** — explicitly **NOT `configure`**, which is admin-only and would lock out facilitator + cohost (the documented painful gotcha). The **data-clearing** commands (`resetPhase`, `reopenPhase`) gate on **`curate`** — cohost has it, so a trusted co-driver can re-run a poll, but the cap is one notch above bare `advance`, signalling that clearing real participant data is heavier than a plain phase move. Add a code comment in `COMMAND_CAP` stating both decisions. **There is no separate `skip` command** — Skip is the Advance button relabelled.

`withLock` busy → **409** `{ error: "Someone else just changed this phase — check the timeline." }`; client surfaces it via the existing `cmdError`. Never half-apply.

### Rev / authoritative-apply (no KV read-back)

Every new command returns the authoritative state via the existing `navState(room, written, role)` (`route.ts:39–48`), built from the **just-written** state — never a read-back. The client applies it in `cmd()` when `d.state.rev` is a number (`HostConsole.tsx:103`). The rev-monotonic guard guarantees the cleared/re-opened phase (higher rev) sticks and the projector cannot flap backward. SSE `roomSignature` (`store.ts:822`) already includes `phaseId`, `Object.keys(votes).length`, and `subs.length`, so a clear pushes to every screen with no new realtime wiring.

---

## Implementation plan (ordered, checkable)

**Stage 1 — store layer (pure server logic; `npm run verify` green on in-memory store)**
- [ ] Add `hdel(key, ...fields)` to `Backend`; implement for KV (Redis `HDEL`) and memory (delete keys from the in-memory hash). Assert parity.
- [ ] `setPhase` gains `opts?: { release?: boolean }` (default `true`); `releaseQueuedContent` returns the flipped ids.
- [ ] `clearPhaseData(phaseId, roomId)` under `withLock('clear:'+phaseId)`: `hdel` prefixed vote fields; `replaceList` filter submissions + words; return removed metadata.
- [ ] `room:{id}:undo` key in `RoomKeys`/`roomKeys()`; `writeUndo/readUndo/clearUndo`; `undoLastAction(roomId)` (nav-only restore + re-queue `releasedContentIds`).
- [ ] Add `undo` key to `endSession`'s `del(...)`.

**Stage 2 — host commands + capability gating**
- [ ] `COMMAND_CAP`: `resetPhase`/`reopenPhase` = `curate`, `undo` = `advance` (+ comment re: NOT `configure`).
- [ ] `setPhase` case: read current state, compute `currentIdx`/`targetIdx`, set `release = targetIdx === currentIdx + 1`, write a nav undo snapshot, return `navState`.
- [ ] `resetPhase` / `reopenPhase` / `undo` switch cases, each returning authoritative `navState`. `withLock` busy → 409 calm message.
- [ ] Assert: cohost `curate` code can reset/reopen; a code with only `advance` is **rejected** for reset/reopen but accepted for undo.

**Stage 3 — UI (client-only; works without API key)**
- [ ] `components/recovery/recovery.ts` (counts exclude `__*__`; collecting detection).
- [ ] `ConfirmSheet` (accent, zero-count soft path).
- [ ] `UndoToast` wired into sticky header; toast state set in `cmd()` success.
- [ ] `PhaseStepper` menus (Reset / Jump here / Re-open here) + Skip + captions.
- [ ] `GhostDataNote` (Full vision, dismissible) + Recovery subsection in `SessionControls`.

**Stage 4 — docs + deploy**
- [ ] Update `/help` facilitator guide for the controls **and** the one stakeholder-facing behaviour change: *Back no longer releases queued content.*
- [ ] `vercel --prod`. Revert is trivial (route + UI revert; store additions inert if unused).

---

## Acceptance criteria (facilitator-outcome framed)

1. A facilitator can re-run a contaminated poll clean **without ending the session** and without losing any other phase's data; the projector and phones show the phase blank and re-open for input in one synced move.
2. Going **back** (or jumping to an earlier chip) **never** dumps queued content onto the projector.
3. After **any** phase move, a calm 12s "Undo" affordance restores the previous phase + timer in one tap; a mis-tapped chip becomes a shrug.
4. Re-opening a 1-2-4-All restarts at **round 0**; re-opening an AI synthesis phase shows **no stale synthesis**.
5. The confirm sheet's counts are **real participant answers** (reserved `__*__` tokens never inflate them); a zero-answer phase shows the soft "just resets the timer" copy.
6. A **cohost** can reset/re-open (has `curate`); a driver with only `advance` cannot clear but can undo. No recovery move ever requires `configure`.
7. The word *delete*/*wipe* never appears for a per-phase clear; it remains reserved for End/Archive.
8. Two drivers (host + cohost) cannot half-clear a phase; a colliding clear yields a calm "someone else just changed this phase" message, never a partial wipe.

---

## Test plan

### Vitest (`test/recovery.test.ts`, in-memory store)

1. `clearPhaseData('p1')` removes **only** `p1::*` votes; `p2::*` votes untouched.
2. Reserved tokens cleared by prefix: after `clearPhaseData`, a re-opened 1-2-4-All reads `__round__` absent (restarts at round 0); AI module reads `__ai__` absent (no stale synthesis); `__constraint__` / `__stage__` / `__silent__` absent.
3. **Count excludes reserved tokens:** with `p1::tokenA`, `p1::tokenB`, `p1::__ai__` present, `phaseVoteCount(state,'p1') === 2`.
4. Submissions/words: `clearPhaseData('p1')` drops `p1` submissions + words, keeps `p2`'s.
5. **Direction-aware release:** `setPhase(idx+1)` releases queued content; `setPhase(idx-1)`, `setPhase(idx)`, and `setPhase(idx+2)` do **not**.
6. **Undo nav-only:** after a forward move, `undoLastAction` restores prior `phaseId`/`timerEndsAt`/`readaroundIndex` and re-queues the content released by that move; it does **not** re-introduce cleared votes/submissions.
7. **endSession wipes undo:** write a snapshot, `endSession`, assert `readUndo` is null (no orphaned copy).
8. **Lock busy:** simulate held `withLock('clear:p1')` → `clearPhaseData` returns busy without partial mutation.
9. **hdel parity:** memory and (mocked) KV `hdel` both remove exactly the named fields, leave others.
10. **Higher rev:** clear/undo produce `rev` strictly greater than the pre-move state.

### Manual QA (custom session; host console + phone + projector)

- Contaminate a poll with a test vote → **Reset this phase** → projector + all phones show blank/awaiting in one synced move; other phases' data intact.
- Mis-tap a future chip → **Undo** within 12s → returns to prior phase; toast flips to "Restored".
- **Skip** with queued content → content appears → **Undo** → content re-queued (gone from projector).
- **Back** with queued content present → content does **not** appear.
- Re-open a 1-2-4-All mid-rotation → restarts at round 0. Re-open an AI phase → no stale synthesis.
- Zero-answer phase → confirm sheet shows soft "just resets the timer" copy, one-tap.
- **Cohost** code: can Reset/Re-open. A `timer`-only / lower code: Reset/Re-open rejected calmly.
- **Mobile (host on phone):** kebab/long-press menus reachable, ConfirmSheet legible, UndoToast non-blocking and doesn't cover controls.
- **Projector:** never flaps backward during clear/undo; cleared poll indistinguishable from first run.

---

## Privacy & ethos check (explicit)

- **No new durable copy of submission content.** Because undo is **nav-only**, the `room:{id}:undo` snapshot stores only navigation state + released-content ids + labels — **no submission text, vote values, or words**. This removes the pressure-test's flagged exposure entirely; the "submissions never logged / off-the-record" contract is unchanged.
- The new `room:{id}:undo` key carries the standard **24h TTL** and is added to `endSession`'s `del(...)` list (asserted by test) so **End/Archive leaves no orphan**.
- Per-phase clears stay **outside** the delete/wipe vocabulary reserved for End/Archive; copy is consequence-first and never surfaces submission content.
- Account-less, room-scoped, ephemeral model intact. AI never invoked in `computeView` or in any recovery path.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Server can't tell back from forward (critical).** Resolved: direction is **derived server-side** in the `setPhase` route case by comparing current vs target sequence index; release queue **only** when `targetIdx === currentIdx + 1`. No client flag (the current Back/jump/Advance call sites send bare `setPhase`). Multi-step forward jumps deliberately don't auto-release — acceptable and documented. Tested (case 5).
2. **`clearPhaseData` races lock-free participant writes (critical).** Resolved: votes cleared with the **new `Backend.hdel`** of specific `${phaseId}::*` fields — a single op that never touches other phases' fields and has **no whole-hash `del` window**. The read-rebuild is rejected. Submissions/words have no atomic predicate-delete, so a small lost-write window remains; mitigated by clearing only the current/just-closed phase (minimal concurrent writers). Documented.
3. **Undo of clear blindly clobbers fresh in-window answers (critical).** Resolved: undo of a clear is **nav-only** — it never re-writes votes/submissions, so it can't overwrite a fresh post-clear vote or merge OLD+NEW on append-only lists. The confirmed clear is final.
4. **Undo snapshot fat content copy / privacy (major).** Resolved by #3 — the snapshot holds no content. No size risk, no privacy exposure.
5. **`releaseQueuedContent` not reversible (major).** Resolved: `releaseQueuedContent` returns the ids it flipped; the nav undo snapshot stores `releasedContentIds`; `undoLastAction` re-queues them (`visible:false, queued:true`). Undo after a Skip removes prematurely-shown content. Tested (case 6).
6. **Skip vs Advance redundancy (major).** Resolved: **no separate `skip` command/cap/case.** Skip is the Advance button relabelled; toast text derives client-side from old vs new phase label.
7. **Count inflated by reserved tokens (minor).** Resolved: `phaseVoteCount` excludes fields whose token starts with `__`. The clear still removes them (prefix match); only the human-facing count filters them. Tested (case 3).
8. **Cohost clearing client data on bare `advance` (minor).** Resolved: nav stays on `advance`; the **data-clearing** commands gate on **`curate`** (cohost has it, one notch up). Explicit product decision, documented in `COMMAND_CAP`.

---

## Out of scope / future

- Conflict-aware **full data-restore** undo (resurrecting cleared answers) — deliberately cut; nav-only is the shippable, safe promise.
- **Depth-N** undo history — depth-1 covers ~95% of live mistakes; revisit only if usage shows demand.
- Adding `hdel` consumers beyond `clearPhaseData`.
- Confirm-on-forward-jump-into-populated-phase — leaning one-tap with the ghost-data note instead.
- Any participant-phone or projector UI changes — intentionally none; the room must not see the recovery.
