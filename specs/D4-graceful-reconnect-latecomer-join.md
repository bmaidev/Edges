# D4 — Graceful reconnect + latecomer join mid-session

> Status: Ready to build. This spec folds in every must-fix from the pressure-test so the spec is already correct. Where the pressure-test changed the original design, the change is called out inline under **[PT-FIX]**.

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** ~6 days total. **MVP cut (PR1) ≈ 2.5 days**; enhancement layer (PR2) ≈ 3.5 days. (Original estimate 7d; reduced by descoping the heartbeat and the `pendingPlacement` field per pressure-test.)
- **Dependencies (item ids):** none hard. Soft adjacency to any item that touches the rotation family (World Café / Stations / 1-2-4-All / 25-10 / Min-Specs) — land D4 PR1 first since it is a live-bug fix those items would otherwise re-introduce. Reuses existing infra only: `usePolledState` (rev-monotonic + `apply`), `navState`/`getFacilitatorState` authoritative-apply, `withLock`, the votes-hash phase-state convention, `ErrorBoundary` resetKey.

---

## Problem & facilitator value

**In the facilitator's voice:**

> Two things make me nervous every single session. One: phones drop or lock, and someone reloads and lands on "Look up at the screen" with no idea what round we're in or which table they're at. Two — and this is the one that actually breaks the room — someone walks in ten minutes late, joins, and *everyone's table reshuffles mid-conversation.* Eight good conversations get yanked apart because one person arrived. I end up either locking the doors or manually re-seating people, neither of which is calm.
>
> What I want: a latecomer slots in quietly without touching anyone already placed — held until the next natural round boundary by default, or dropped into the smallest table as a clearly-labelled extra if I tap a button. And when someone reconnects, the room just catches them up: "Welcome back — you're in Round 3, Table 3 with Ana and Wole," then drops them back in. I'd also love a quiet read on who's actually still connected, so I'm not waiting on three ghosts.

**Why it's broken today:** The deterministic group engine (`lib/modules/groups.ts`) computes membership every 2s as a pure function of `sortedTokens(ctx.participants.map(p => p.token))`. That statelessness is what makes the rotation modules poll-safe — but it means a single `/join` mutates the participant hash, re-sorts the token list, and **reshuffles every seated person**. `stations.server.ts` even says it forms groups "ONCE (round 0)" yet still derives them from the *live* roster, so a join reshuffles them anyway. There is no roster freeze, no presence, no "admit latecomer" affordance, and no rejoin orientation. Reconnect today is just `ReconnectBanner` over the last-good screen.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP — PR1: "Stop the reshuffle" (the only live-dangerous part)
The reshuffle is a correctness bug that hurts **today**, the moment anyone joins mid-rotation. Ship this alone, no new privacy surface, no new endpoints, no UI:

1. **Cohort freeze** in `groups.ts` + the rotation modules, written on a real **control path** that also covers **round 0** (the common latecomer). **[PT-FIX: round-0 gap]** — via a new optional `onEnter(ctx)` module hook called from `setPhase` under `withLock`, plus a re-snapshot inside each module's existing `nextRound`.
2. **Stable submission tags** — tag by group *identity* (host token / frozen group lead token), not array position. **[PT-FIX: tag mis-attribution]** Must land *with* the freeze or recap attribution silently corrupts.
3. **Hold-by-default latecomer**: a token in the live roster but absent from the frozen cohort is **computed** as "awaiting placement" (no new field) and shown the serene holding card via the existing `ungrouped` branch. They auto-fold at the next `nextRound`. **[PT-FIX: no `pendingPlacement` field, no `addParticipant` coupling]**
4. **World Café host protection** — hosts frozen once at round 0 in a dedicated field; never re-derived from a regrown cohort. **[PT-FIX: host displacement]**
5. **25-10 card-set freeze** (not voter-set freeze). **[PT-FIX: wrong variable]**
6. **Stale-token fallback** (client-only, tiny) — but hardened so a single lagged empty-roster read can't evict a live participant. **[PT-FIX: eviction race]**
7. Full Vitest join-invariance coverage.

MVP requires **no privacy sign-off** (no presence, no new observability) and is internally invisible until a latecomer actually joins.

### Full vision — PR2: "The trust moment" (gated on privacy sign-off)
8. **Presence** (facilitator-only, ephemeral): `lastSeen` stamped on already-writing paths only. **[PT-FIX: drop the poll-driven heartbeat entirely]**
9. **WelcomeBack** re-entry card (client-only, orientation-only).
10. **Explicit host controls**: `placeLatecomer` / `holdLatecomer` + roster dots + `latecomerPolicy: 'hold' | 'append'` builder toggle + per-room presence-off setting.

---

## Experience & flows

### Flows
1. **Transient drop (unchanged):** poll fails → `usePolledState.error=true` → `ReconnectBanner` over last-good screen → next good poll clears it. No WelcomeBack for sub-gap blips.
2. **Reload / phone-wake rejoin:** `ParticipantApp` mounts, restores `edges_token`/`edges_handle`, polls `/state`. On first good state after a *fresh mount that already had a token* (primary, deterministic trigger) — or a measured wall-clock gap > ~8s (secondary) — show **WelcomeBack** derived purely from `PublicState` in hand. `/join` is skipped (token exists; `addParticipant` is idempotent).
3. **Latecomer, NON-rotation phase:** `/join` as today; they land on the live module view immediately. WelcomeBack orients them.
4. **Latecomer, ROTATION phase (the hard case):** `/join` records the token, but it is **not** in the frozen cohort, so the engine never reshuffles seated people. They are *computed* as awaiting placement → serene holding card (default `hold`) OR appended to smallest group as a labelled extra (policy `append` or a host `Place now` tap).
5. **Facilitator admits a latecomer (PR2):** Session tab shows the awaiting-placement row; one tap `Place now` (append) or `Hold to next round` (default). On the next `nextRound`, the cohort re-snapshots to include all held joiners atomically — they fold in at a natural boundary.
6. **Facilitator presence read (PR2):** roster dots from server-derived `lastSeen` (poll/action recency). Reassurance only; never shown to participants.

### Screens, states & copy
- **WelcomeBack card** (participant, PR2): branded headline **"Welcome back"**, **"You're in: {config.label}"**, optional **"Round {N} of {M}"**, optional **"Your group: {Table 3} with {Ana, Wole}"** (handles only), a single **Continue** (`StickyAction`). Auto-dismisses after ~4s or on interaction. Built with the render-kit Reveal/shimmer fade. **[PT-FIX]** re-keyed off the latest `PublicState` every render and **force-dismissed on `phaseId` change** so it can never describe a stale phase.
- **ReconnectBanner** (participant, existing): unchanged transient strip for short blips.
- **Holding card** (participant, rotation, PR1): reuses the existing `ungrouped` branch. Copy: **"The room is mid-round — you'll join the conversation at the next round."** Standing prompt visible, soft pulse. Replaced by the normal group view at the next round boundary.
- **Appended-extra state** (participant): normal group view + a small `StatusLine` note: **"You joined this group mid-round."**
- **Facilitator Session/roster** (existing tab, PR2): each row gains a presence dot (connected / quiet / gone) + a `joinedAt`-relative label ("joined 2 min ago"); awaiting-placement rows in an active rotation phase are highlighted with `Place now` / `Hold to next round`; header count "live N · quiet M".
- **Projector:** unaffected. Rotation overview reflects the frozen cohort + any appended extras, so the wall stays stable when someone joins.

---

## Architecture

### Files to ADD
| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/test/reconnect-presence.test.ts` | Vitest (in-memory store): cohort-freeze join-invariance across worldcafe/stations/onetwofour/twentyfive10; host non-displacement; stable-tag durability; hold→fold-on-nextRound; presence classifier thresholds; stale/unknown-token persistence rule. PR1 lands the first group; PR2 adds presence + WelcomeBack-trigger cases. |
| `/Users/jordan/workshop/edges-v2/components/WelcomeBack.tsx` | **(PR2)** Participant re-entry overlay. Pure presentational, fed from `PublicState` + the optional `reentry` block. Auto-dismiss ~4s/on-interaction; re-keyed off latest state; force-dismiss on phase change. |
| `/Users/jordan/workshop/edges-v2/lib/modules/presence.ts` | **(PR2)** `touchPresence(roomId, token)` (stamp `lastSeen` on already-writing paths only) + `presenceOf(participant, now): 'connected'|'quiet'|'gone'` (~20s / ~60s thresholds). **No heartbeat. [PT-FIX]** |

### Files to CHANGE
| Path | Change |
|---|---|
| `lib/modules/groups.ts` | Add **cohort-aware** pure variants that take an EXPLICIT token list: `groupRoundFrom(cohort, size, round)`, `cafeRoundFrom(cohort, numTables, round, hosts)`, and `appendExtras(groups, extras)` (append each extra to the current smallest group; honor `pairRound`'s `__bye__`/odd handling — an appended third makes a triad that round). Existing `groupRound`/`cafeRound` stay and delegate to the new ones with the live list (back-compat). **No Set spreads / no `.entries()`** — index loops + `Array.from`. **[PT-FIX]** `cafeRoundFrom` takes an explicit frozen `hosts` list and never re-derives `g[0]`. |
| `lib/modules/types.ts` | Add **optional** `onEnter?(ctx: ModuleContext): Promise<void> \| void` to `ModuleServerDef`. **[PT-FIX: the one deliberate module-contract addition]** — called from `setPhase` under `withLock` on phase entry; rotation modules implement it to snapshot the cohort + hosts. This is the only clean control-path write that covers round 0. |
| `lib/store.ts` | (1) `setPhase`: after writing the new phase, resolve the active module and, if it defines `onEnter`, call it **inside the same `withLock` advance path** (cohort/host snapshot happens on a control write, never in `computeView`). (2) Add `writeCohort(phaseId, tokens)` / `readCohort(phaseId)` and `writeHosts(phaseId, tokens)` / `readHosts(phaseId)` helpers over the votes hash (mirrors `__round__`). (3) **PR2:** `buildContext`/`getFacilitatorState` include `lastSeen` on participants (read-only; still NO write in `getState`). **[PT-FIX]** `addParticipant` stays a dumb idempotent hash write — NO cohort/pending logic added. |
| `lib/types.ts` | `Participant` gains **optional** `lastSeen?: number` (PR2 only). **[PT-FIX]** NO `pendingPlacement` field — "awaiting placement" is computed (roster minus frozen cohort). `PublicState` gains `tokenKnown: boolean` (PR1) and the module view may carry an optional `reentry?: { roundLabel?: string; roundIndex?: number; roundTotal?: number; groupLabel?: string; groupmates?: string[] }` block (PR2; handles only, never tokens, never presence). |
| `components/usePolledState.ts` | **(PR2)** Add a `lastSuccessAt` ref; expose `gapMs()` and a `freshMount` boolean (true until first successful poll of a given `authKey`). No change to the seq/rev guards. Reuse existing `apply` for placement results. |
| `components/ParticipantApp.tsx` | (PR1) Stale-token fallback: see rule below. (PR2) Mount `WelcomeBack` on fresh-mount-with-token or `gapMs() > ~8000`; keep `ReconnectBanner` for blips. `ErrorBoundary` resetKey already remounts cleanly on phase change. |
| `lib/modules/defs/worldcafe.server.ts` | Implement `onEnter` → snapshot `__cohort__` (sorted live tokens) **and** `__hosts__` (round-0 chunk heads) once. `computeView` reads tables from `cafeRoundFrom(readCohort, numTables, round, readHosts)`; a token not in the cohort → holding card (`hold`) or appended non-host seat (`append`). `nextRound` re-snapshots `__cohort__` only (folding held joiners) — **never** re-snapshots `__hosts__`. **Tag notes by host token**, not table index. **[PT-FIX]** Add `reentry` block (PR2). |
| `lib/modules/defs/stations.server.ts` | `onEnter` → snapshot `__cohort__`. Groups via `groupRoundFrom(readCohort, groupSize, 0)` (this closes the file's own "ONCE" gap). Hold/append + **tag notes by the frozen group's lead (sorted-first) token**, not `g${index}`. **[PT-FIX]** `reentry` block (PR2). |
| `lib/modules/defs/onetwofour.server.ts` | `onEnter` → snapshot `__cohort__`; do the 1-2-4 doubling over the frozen tokens so a mid-progression join can't reshuffle pairs/foursomes. Hold/append + `reentry` (PR2). |
| `lib/modules/defs/twentyfive10.server.ts` | `onEnter` → snapshot the **CARD SET** (submission ids in scope) at the write→score transition (round 0→1), **not** the voter token set. **[PT-FIX]** `assignFor` walks the frozen card list; late writers after the transition are excluded with a **"You joined after scoring opened"** note. |
| `app/api/r/[room]/host/route.ts` | **(PR2)** Add `placeLatecomer { token }` (policy `append` now) and `holdLatecomer { token }`, both in `COMMAND_CAP` as `'advance'` (routine facilitator action — **NOT** admin `'configure'`; avoids the known custom-build gotcha), executed via `dispatchAction`→`withLock` and returning authoritative state via `navState`→`getFacilitatorState`. `moduleAction`/`nextRound` already flows through `dispatchAction`; its cohort re-snapshot is inside the module's existing `withLock`. |
| `components/HostConsole.tsx` | **(PR2)** Session-tab roster rows gain presence dot + `joinedAt`-relative label; awaiting-placement rows in an active rotation phase get `Place now`/`Hold to next round` via existing `cmd()`; header "live N · quiet M". No new tab. |
| `app/api/r/[room]/join/route.ts` | **(PR2)** After `addParticipant`, call `touchPresence(roomId, token)` (already a writing path). Idempotent on existing token (reconnect skips re-join cleanly). |
| `app/api/r/[room]/action/route.ts` | **(PR2)** `touchPresence(roomId, token)` on each genuine participant action (already-writing path). **[PT-FIX]** NO new `heartbeat` action type — dropped. |
| `lib/modules/defs/build/*` (session builder) | **(PR2)** Surface the `latecomerPolicy: 'hold' | 'append'` per-phase config key for rotation modules (zod schema + form). Defaults to `'hold'`. |

### Data model
**No new durable store, no new top-level Redis keys.** Everything reuses room-scoped keys with 24h TTL, wiped by `endSession`.

- **Votes hash** (`room:{id}:votes:hash`), mirroring `votes['__round__']`:
  - `votes['{phaseId}::__round__']` — existing.
  - `votes['{phaseId}::__cohort__']` = sorted `token[]` snapshot, written by `onEnter` (covers round 0) and re-written on each `nextRound`. **The keystone.** Rotation `computeView` reads membership from this frozen list, so a `/join` can never re-sort it.
  - `votes['{phaseId}::__hosts__']` (worldcafe only) = frozen round-0 host token list. Written once by `onEnter`, **never** rewritten. **[PT-FIX]**
  - `votes['{phaseId}::__cards__']` (twentyfive10 only) = frozen submission-id set captured at the write→score transition. **[PT-FIX]**
- **Participant hash** (`room:{id}:participants:hash`, field=token): gains **optional** `lastSeen?: number` (PR2 only; throttled write on `/join` and `/action`; classifier <20s connected, <60s quiet, else gone). Facilitator-only; never returned to participants. **[PT-FIX]** No `pendingPlacement` field — awaiting-placement = (live roster − frozen cohort), computed, can never drift out of sync.
- **PublicState**: `tokenKnown: boolean` (PR1). Optional module-view `reentry` block (PR2) — transient, computed, handles-only, never persisted.
- `Submission.token` already links a rejoiner's prior contributions (reconnect keeps the original token) — no change.

### Rev / authoritative-apply (no KV read-back)
- `setPhase`'s `onEnter` cohort snapshot is part of the **advance control action**, written under `withLock`. The host route already wraps `setPhase` in `navState`→`getFacilitatorState(room, written)` and the client applies via `usePolledState.apply` — the mandated write-then-show flow. The snapshot is included because it's written before `navState` reads it back from `written`/live for the response.
- `nextRound` re-snapshot is inside the module's existing `withLock` (worldcafe already uses `withLock('round:'+phaseId)`). **[PT-FIX: keep the locked section to read-round + the two `hset` writes; do NOT compute groups inside the lock** — `withLock` TTL is 5s and a slow large-room group compute could release the lock early and double-advance.)
- `placeLatecomer`/`holdLatecomer` (PR2) run under `withLock`, return authoritative state via `navState`, applied through `apply`. **Never** a KV read-back. The monotonic rev guard prevents a stale poll from un-placing someone.
- **Note on `moduleAction` today:** the host route's `moduleAction` case currently returns only `{ok, reason}`, so the client relies on `refreshUntil` (rev-bounded re-poll), not `apply`. PR1 keeps that for `nextRound` (the cohort snapshot is durable; the rev-guarded re-poll picks it up). PR2's `placeLatecomer`/`holdLatecomer` use the full `navState` authoritative-apply for instant, flash-free placement.
- **[PT-FIX: cohort-snapshot TOCTOU]** the tokens captured come from `ctx.participants` resolved at `buildContext` time; a join landing between `buildContext` and the cohort write is benign — that joiner simply becomes "held" for the next round.

### Stale-token fallback rule (PR1) — **[PT-FIX: eviction race]**
Never clear `localStorage` on a single `tokenKnown=false` poll. Clear `edges_token`/`edges_handle` and drop to `JoinScreen` **only when** `tokenKnown=false` persists across **N≥3 consecutive successful polls** AND the room is demonstrably alive-but-doesn't-know-me (`participantCount > 0` while `you/me` is absent — i.e. roster non-empty), so an eventually-consistent empty-roster read can't evict a live participant mid-session. `state.ended` short-circuits first (existing behavior) and also clears local keys.

---

## Implementation plan (ordered, checkable)

**PR1 — Cohort freeze (the danger fix)**
- [ ] `groups.ts`: add `groupRoundFrom`, `cafeRoundFrom(cohort, n, round, hosts)`, `appendExtras`; make existing `groupRound`/`cafeRound` delegate. Index loops only, no Set spreads.
- [ ] `lib/modules/types.ts`: add optional `onEnter?(ctx)` to `ModuleServerDef`.
- [ ] `lib/store.ts`: `setPhase` calls the resolved module's `onEnter` inside the advance write path; add `writeCohort/readCohort`, `writeHosts/readHosts` (and `writeCards/readCards`).
- [ ] `worldcafe.server.ts`: `onEnter` snapshots `__cohort__` + `__hosts__`; `computeView` uses `cafeRoundFrom`; `nextRound` re-snapshots `__cohort__` only; tag notes by host token; hold/append branch via existing `ungrouped`.
- [ ] `stations.server.ts`: `onEnter` snapshots `__cohort__`; `groupRoundFrom`; tag notes by frozen group lead token; hold/append.
- [ ] `onetwofour.server.ts`: `onEnter` snapshots `__cohort__`; doubling over frozen tokens; hold/append.
- [ ] `twentyfive10.server.ts`: `onEnter`/transition snapshots `__cards__`; `assignFor` over frozen card list; exclude late writers with note.
- [ ] `lib/types.ts`: add `tokenKnown: boolean` to `PublicState`; populate in `getPublicState`.
- [ ] `ParticipantApp.tsx`: stale-token fallback with the N-poll persistence rule.
- [ ] Vitest: join-invariance, host non-displacement, stable-tag durability, hold→fold, stale-token persistence.
- [ ] `npm run verify` + build green on Node 24.

**PR2 — Presence + WelcomeBack + host controls (privacy-gated)**
- [ ] `lib/types.ts`: `Participant.lastSeen?`, view `reentry?` block.
- [ ] `lib/modules/presence.ts`: `touchPresence` (read-then-skip-if-fresh throttle) + `presenceOf`.
- [ ] `/join` + `/action` routes: call `touchPresence`. **No heartbeat action.**
- [ ] `buildContext`/`getFacilitatorState`: surface `lastSeen` (facilitator payload only; keep OUT of `getPublicState`).
- [ ] `usePolledState.ts`: `lastSuccessAt`, `gapMs()`, `freshMount`.
- [ ] `WelcomeBack.tsx` + wire into `ParticipantApp` (re-keyed off latest state, force-dismiss on phase change).
- [ ] Rotation modules: populate `reentry` (handles only).
- [ ] `host/route.ts`: `placeLatecomer`/`holdLatecomer` (`COMMAND_CAP='advance'`), authoritative-apply.
- [ ] `HostConsole.tsx`: presence dots, joinedAt labels, place/hold controls, "live N · quiet M".
- [ ] Builder: `latecomerPolicy` per-phase toggle (default `hold`) + per-room presence-off setting.
- [ ] Vitest: presence classifier, placement, WelcomeBack triggers. Privacy sign-off recorded. `npm run verify` + build green.

---

## Acceptance criteria (facilitator-outcome framed)

1. **A latecomer never reshuffles the room.** With ≥6 participants in any rotation phase (incl. **round 0**), a new `/join` leaves every already-seated token's table/group/pair/station **byte-identical**. (Vitest invariance; manual: watch the projector wall not move.)
2. **World Café hosts never move.** After any number of latecomer folds, each table's host token is the one chosen at round 0.
3. **Held latecomers fold at a boundary.** A held joiner appears in no group until the next `nextRound`, then joins cleanly with no disruption to others.
4. **Append is honest.** With `append` (or a host `Place now`), the joiner lands in the smallest group as a labelled extra; for pairs an appended third surfaces as a triad, not a reshuffle.
5. **Recap attribution survives joins.** A note submitted before a latecomer joined still resolves to the correct table/group in synthesis/recap (identity-stable tags).
6. **25-10 scoring is stable.** A latecomer joining mid-scoring does not change which card any existing voter is assigned; a late writer is excluded with a clear note.
7. **Reconnect orients, never blocks (PR2).** A reload mid-session shows WelcomeBack with the correct current phase/round/group within one poll, dismissable in one tap, auto-gone in ~4s, and never describes a stale phase.
8. **Wiped-room token recovers.** After End-session, a stale token lands on `JoinScreen` (not an infinite poll), and a live participant is **never** evicted by a single lagged empty-roster read.
9. **Presence is read-only and facilitator-only (PR2).** Roster dots reflect poll/action recency; presence never appears in any participant payload; `getState`/`getPublicState`/`computeView` perform **zero** writes.
10. **No admin gotcha.** Place/hold are routine `'advance'` actions; they work for a plain facilitator (no `'configure'`).

---

## Test plan

### Vitest (`test/reconnect-presence.test.ts`, in-memory store, no KV/AI)
- **Join-invariance:** snapshot every token's group across worldcafe/stations/onetwofour at round 0 and mid-round; add a participant; assert seated tokens unchanged.
- **onEnter covers round 0:** entering a rotation phase writes `__cohort__`; a join immediately after does not alter existing membership.
- **World Café host stability:** hosts after N folds == round-0 hosts; an appended latecomer is never a chunk head.
- **Stable tags:** a note tagged before a join resolves to the same table/group after the join/fold (tag by host/lead token, not index).
- **Hold→fold:** held joiner absent until `nextRound`, present after.
- **Append/odd:** appended third on a pair phase yields a triad; `__bye__` honored.
- **25-10:** freeze card set; existing voters' assignments unchanged after a mid-scoring join; late writer excluded.
- **Stale-token rule:** `tokenKnown=false` for <3 polls does NOT clear; ≥3 consecutive with non-empty roster does.
- **Presence classifier (PR2):** thresholds at ~20s/~60s; `touchPresence` skips a write when `lastSeen` is fresh.
- **No write in hot path:** assert `getPublicState`/`computeView` issue no `hset` (spy the in-memory backend).

### Manual QA
- **Mobile:** reload mid-rotation; lock phone 10s then wake; airplane-mode blip <6s (banner only, no WelcomeBack); WelcomeBack one-tap dismiss + ~4s auto-dismiss; advance phase *during* the WelcomeBack window → card updates/dismisses, no stale phase. iOS Safari + Android Chrome (background-tab timer throttling — confirm gap trigger doesn't over-fire).
- **Latecomer:** with 8 people across tables, join a 9th mid-round → eight conversations undisturbed, 9th sees holding card; advance round → 9th folds in. Toggle `append` → 9th lands in smallest table labelled.
- **Projector:** wall does not move when a latecomer joins; folds in only at round boundary.
- **Host:** presence dots go quiet/gone as phones sleep; `Place now`/`Hold` reflect instantly (authoritative-apply, no 2s lag); works as plain facilitator (no admin code).
- **Wiped room:** End-session, reload a stale phone → JoinScreen, not infinite poll.

---

## Privacy & ethos check (explicit)

- **Off-the-record preserved.** WelcomeBack is **orientation-only** — phase label + round + tablemate *handles* (already visible to that participant in the live view). **No transcript or submission replay.** `groupmates[]` is built from handles only, never tokens, never presence state.
- **Presence is the one new observability surface** and is gated: facilitator-only, derived from poll/action recency, lives on the wiped participant hash (24h TTL, `endSession` clears it), no accounts. **Enforced by keeping `lastSeen` entirely OUT of `getPublicState`** (participant payload) — it appears only in `getFacilitatorState`. Add a **per-room setting to disable presence** for the most sensitive sessions. **Requires explicit privacy sign-off before PR2 GA.**
- **[PT-FIX]** Dropping the poll-driven heartbeat both reduces hot-path write load AND shrinks the privacy footprint (presence becomes "active recently," not real-time tracking) — a double win.
- **Account-less / ephemeral / End-session-wipe / 24h TTL:** all respected; nothing new persists.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk | Resolution (folded into spec) |
|---|---|
| **Round-0 cohort had no write hook** (`setPhase` is module-agnostic; `computeView` can't write) — the common latecomer (joins 2 min into round 0) still reshuffled. | Added optional `onEnter(ctx)` to `ModuleServerDef`, called from `setPhase` inside the advance `withLock`. Rotation modules snapshot `__cohort__` (+`__hosts__`/`__cards__`) on entry. The one deliberate module-contract addition. |
| **`addParticipant` layering violation** — wiring cohort/pending logic into the lowest-level store write couples it to the module registry. | `addParticipant` stays a dumb idempotent hash write. "Awaiting placement" is **computed** (roster − cohort). `pendingPlacement` field dropped entirely — can't drift out of sync. |
| **World Café host displacement** — folding new tokens re-chunks the sorted list and can change `g[0]`. | Hosts frozen once at round 0 in `__hosts__`; `cafeRoundFrom` takes an explicit host list and never recomputes `g[0]`. Latecomers join as travellers/non-host seats only. |
| **Positional submission tags** (`t${idx}`, `g${idx}`) mis-attribute after any append/early join. | Tag by stable group identity: worldcafe by host token, stations by frozen group lead token. Lands with the freeze. |
| **25-10 froze the wrong variable** — voter-set freeze doesn't stop card-index shift. | Freeze the CARD SET at write→score transition; `assignFor` walks the frozen list; late writers excluded with a note. |
| **Stale-token eviction race** — a single lagged empty-roster read could nuke a live participant's token. | Require `tokenKnown=false` across ≥3 consecutive successful polls with a non-empty roster before clearing local keys. |
| **Heartbeat write storm / ineffective lambda-local throttle** in serverless syd1. | Heartbeat dropped. `lastSeen` stamped only on genuine `/action` writes, throttled by reading the record's own `lastSeen` (state in the record, not lambda memory). Silent participants correctly read as "quiet." |
| **WelcomeBack describing a stale phase** during the 4s window if the host advances. | Re-key WelcomeBack content off the latest `PublicState` every render; force-dismiss on `phaseId` change. |
| **`withLock` 5s TTL vs slow group compute.** | Keep the locked section to read-round + two `hset` writes; never compute groups inside the lock. |
| **`gapMs` over-reports after tab-backgrounding** (browser timer coalescing). | Fresh-mount is the primary, deterministic trigger; gap trigger is secondary with a generous ~8–10s threshold; documented as wall-clock. |
| **Backward compatibility** — in-flight rooms with no `__cohort__`. | Rotation modules fall back to live-roster grouping (current behavior) until the next `setPhase`/`nextRound` stamps a cohort, so a running session upgrades cleanly. |

---

## Out of scope / future
- True meet-matrix / Social-Golfer optimiser for group rotation (separate refinement noted in `groups.ts`).
- Latecomer handling for non-rotation closed-window phases beyond a simple "you joined after this closed" note (e.g. a vote already tallied) — scope later if real rooms need it.
- Real-time presence beyond "active recently" (deliberately avoided for the off-the-record promise).
- Participant-visible presence (never — preserves anonymity).
- Cross-room / multi-device identity reconciliation (out of scope; token is per-room localStorage).
