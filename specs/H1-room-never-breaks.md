# H1 — "The room never breaks" resilience (offline, reconnect states, status)

> Section H. Trust & reliability · **P0** · Executable build spec. This item does **not** re-build the resilience plumbing shipped this week (rev-monotonic poll guard, authoritative-apply, ErrorBoundary, error/global-error/not-found pages, SSE accelerator with 2s-poll fallback, the ParticipantApp ReconnectBanner). It turns those scattered safety nets into **one coherent, named, user-visible resilience layer**: a tri-state connection indicator on all three surfaces, an offline-tolerant submission path that never loses typed text, graceful-degradation copy, and a facilitator-visible **room health** signal. All pressure-test must-fixes are folded into the design below; where a recommendation changed the design (notably **heartbeat is a piggyback on existing reads/writes, never a new poll**, and **the offline queue is single-flight idempotent**) the change is final and reflected throughout. Build to this document.

---

## Priority / effort / dependencies

- **Priority:** P0 (the trust promise the whole platform is sold on — "the room never breaks" is the named feature; a paid facilitator must never watch a phone go blank and lose a typed answer).
- **Effort:** **5 days** (MVP cut ≈ 3 days; the room-health heartbeat row is the only piece touching the store/data model and lands as the back half — see MVP vs Full).
- **Dependencies (existing platform pieces already shipped this week — reuse, do NOT re-specify):**
  - `components/usePolledState.ts` — the rev-monotonic guard (`lastRevRef`, rejects `rev < lastRev`), in-flight `seqRef`/`appliedRef`, `refresh`/`refreshUntil`/`apply`, the SSE accelerator effect with 2s-poll fallback (`usePolledState.ts:99`), and the `error` boolean it already returns.
  - `app/api/r/[room]/host/route.ts` — `navState(room, written, role)` authoritative-apply helper (`route.ts:39`) built from the just-written `SessionState` via `getFacilitatorState(room, stateOverride)` — never a KV read-back.
  - `lib/store.ts` — `getFacilitatorState(roomId, stateOverride?)` (`store.ts:863`), `getPublicState` (`store.ts:734`), `addParticipant`/`listParticipants` (`store.ts:318`/`:334`), `roomSignature` (`store.ts:822`), `endSession` `del(...)` list (`store.ts:627`), the `Backend` interface + `hset`/`hget`/`hgetall` (TTL-bumped to 24h on every write).
  - `components/ErrorBoundary.tsx` — wraps every renderer mount (resets on `resetKey` = `${phaseId}:${rev}`).
  - `app/error.tsx` + `app/global-error.tsx` + `app/not-found.tsx` — the route-level safety nets (untouched here).
  - `app/api/r/[room]/stream/route.ts` — SSE tick on `roomSignature` change, ~25s lifetime, EventSource auto-reconnect (`stream/route.ts`).
  - `components/ParticipantApp.tsx` — the existing `ReconnectBanner` (`ParticipantApp.tsx:90`, currently a single "Reconnecting…" strip shown whenever `error` is true) and `useAct` (`:299`, retry-once POST to `/action`).
  - `lib/modules/render-kit.tsx` — `useSend`/`SendStatus`/`StatusLine` (`render-kit.tsx:42`–`82`), `StickyAction` — the shared participant submit feedback path the offline queue hooks into.
  - `lib/auth.ts` — `requireCapability`, the `Capability` union (cohost has `viewRaw` but not `configure`/`end`).
  - `lib/session.ts` — `roomKeys()` factory + `RoomKeys` interface + `TTL_SECONDS = 86_400`.
- **Related backlog items (soft, not blockers):** plays alongside **C2 live signals** and **C5 presence** which also read participant counts/`lastSeen`; H1 defines the `lastSeen` field and the health math those can later reuse. H1 ships independently. The connection pill shares the calm-pill design language of **H2 pre-flight** (`PreflightPill`) but is a distinct, runtime signal (H2 is pre-launch readiness; H1 is live connection health).
- **New runtime deps:** none.

---

## Problem & facilitator value (facilitator's voice)

> "Halfway through a paid offsite the venue Wi-Fi hiccupped. Three people's phones went to a blank 'Connecting…' screen and stayed there. One of them had just typed a paragraph into the capture box — it vanished when the page reloaded, and she didn't type it again. I had no idea any of this was happening: I was looking at my console, everything looked fine to me, and meanwhile a quarter of the room had quietly fallen off and I was advancing phases past people who couldn't see them. Then the projector laptop slept and I was presenting to a dead screen behind me without knowing.
>
> I don't need five nines. I need three honest things. **Tell each person on their own phone whether they're connected** — and if they're not, hold their screen and their typed words so nothing is lost. **Tell me, the facilitator, how many of the room are actually with me right now** — so I don't advance into a void. And do all of it calmly, in words, never a red klaxon in front of the room. 'The room never breaks' is the thing I'm actually paying for."

**Value:** converts the platform's already-solid-but-invisible resilience plumbing into a *named, legible* promise. It (a) makes the connection state of every screen self-evident to the person looking at it; (b) guarantees a participant's **typed text is never lost** to a transient drop and their in-progress submission is **queued and sent on reconnect**; (c) gives the facilitator a single "room health" glance — *N of M connected, anyone stuck offline* — so advancing is an informed act, not a leap of faith. It does this with **zero new PII, zero new poll loop, and zero KV read-back**, riding entirely on signals the room already exchanges.

This is the trust story made tangible. The most corrosive live failure is not a crash (the ErrorBoundary catches those) — it's the **silent** one: a phone frozen on "Connecting…", a paragraph lost, a facilitator advancing past people who fell off. H1 closes exactly that gap.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (thinnest shippable, ship first — client-only, no store/data-model change)

1. **`useConnection` hook + tri-state model** (`online` / `reconnecting` / `offline`) derived purely client-side from: `navigator.onLine`, the `error` flag `usePolledState` already returns, and the **age of the last successfully-applied rev** (a stale-but-no-error poll still counts as degraded). No new network calls.
2. **Connection status indicator** on all three surfaces (participant strip, projector header chip, host header chip), replacing the binary `error`-only `ReconnectBanner` / "Reconnecting…" text with the calm tri-state.
3. **Offline-tolerant participant submission** — typed text persisted to the existing per-room `localStorage` namespace on every keystroke (debounced) so a reload never loses it; an `act()` that fails while offline is **queued in-memory** and flushed on reconnect, single-flight and idempotent.
4. **Graceful-degradation copy** — the participant holding screen and submit bar speak the connection state ("You're offline — your answer is saved and will send when you're back").

The MVP delivers the participant-facing half of the promise (never lose text; clear connection state) with **no new storage, no new auth surface, no data-model change**.

### Full vision (back half — the only piece touching the store)

- **Participant `lastSeen` heartbeat** — a single `lastSeen: number` field added to the existing `Participant` hash record, written as a **piggyback** on reads/writes the participant already makes (their 2s `/state?token=` poll and any `/action`), never a new request. No new key, no new PII.
- **Facilitator "room health" signal** — a health chip + expandable sheet in the host header: *"12 of 15 with you · 3 dropped off"*, computed purely from `lastSeen` ages already in `participants[]` (no content, no identity beyond the existing handle). Surfaces "who's stuck offline" so the facilitator can pause before advancing.
- **Projector "connection lost" awareness** — reuse H2's projector heartbeat if present; otherwise the projector's own connection chip already covers the self-view.

---

## Experience & flows

**Tone:** calm, monochrome with the single accent, words not klaxons. Nothing flashes red in front of the room. The participant indicator is reassuring ("saved, will send"); the facilitator health signal is informational, never alarmist; the projector chip is for the operator, not the audience.

### The tri-state, everywhere

| State | Meaning (derived, see Architecture) | Participant strip | Projector chip | Host chip |
|---|---|---|---|---|
| **online** | last apply fresh (`< STALE_MS`), no error, `navigator.onLine` | (no strip — calm default) | small green dot · "Live" | green dot · "Live" |
| **reconnecting** | one or more failed polls **or** last apply aged past `STALE_MS`, but `navigator.onLine` true | amber strip · "Reconnecting… your screen is held" | amber dot · "Reconnecting…" | amber dot · "Reconnecting…" |
| **offline** | `navigator.onLine` false (device-level) | red-ish strip · "You're offline — saved, will send when you're back" | red dot · "Offline" | red dot · "Offline — check Wi-Fi" |

The indicator is **per-surface and per-device**: it describes *this* screen's link to the server, never another device's. The host's own chip is the host's own connection; the **room-health** chip (below) is the separate, aggregate signal about *participants*.

### Participant flows

1. **Brief drop mid-typing (the headline case).** Participant is typing into a capture box. Wi-Fi blips. (a) Their text is already mirrored to `localStorage` (debounced) — a reload would restore it. (b) The strip flips to amber "Reconnecting… your screen is held"; the last-good phase view stays fully visible underneath (we never blank to "Connecting…" once joined). (c) They tap **Send** while still offline → the submit bar shows "Saved — will send when you're back" (not a fake "Sent."), the action is queued. (d) Wi-Fi returns → `navigator.onLine` fires `online`, the queue flushes once, the server accepts the submission, the strip clears, the bar flips to the honest "Saved." The participant never re-typed and never saw a blank screen.
2. **Hard reload while offline.** Page reloads, `/state` can't reach the server → instead of the bare "Connecting…" spinner forever, after a short grace it shows a calm **offline holding card**: "You're offline — we'll reconnect you the moment you're back. Nothing you typed is lost." On reconnect it restores the joined session (token from `localStorage`) and any draft text.
3. **Stuck offline at phase change.** Facilitator advances while a participant is offline. The participant's screen holds the *old* phase under the amber/red strip (it can't see the new one). On reconnect, the rev-monotonic guard jumps them straight to the current phase — no flash through intermediate phases. Their queued submission (if any) is sent **against the phase it was authored in** (the action carries no phase id of its own — it lands wherever the room is; documented as accepted, see Risks).

### Projector flow

4. **Projector laptop sleeps / tab loses focus.** The header chip goes amber then (on `offline`) red "Offline". The last-good slide stays on screen (no blank). This is for the operator standing near the laptop; the audience sees the held content, not the chip. On wake, EventSource + poll resume and the chip returns to green within ~2s.

### Host flows

5. **Room-health glance (Full).** Host header carries a second small chip beside the connection chip: a heart/pulse glyph + "12 of 15 with you". Tap → a calm sheet: a list grouped *With you (12)* / *Dropped off (3)* by handle, each with a relative "last seen 40s ago". Copy is informational: "3 people haven't been seen for a minute — they may be reconnecting, or have closed the tab. You can wait, or carry on." No klaxon, no auto-action.
6. **Advance-into-a-void guard (Full, soft).** If the health signal shows a meaningful fraction dropped (e.g. ≥ 25% and ≥ 2 people), the Advance affordance gains a one-line caption ("3 people look disconnected") — informational only, **never blocks** the advance. The facilitator keeps authority.

### Copy that matters

| Surface / state | Copy |
|---|---|
| Participant reconnecting | **"Reconnecting… your screen is held."** (last-good view stays underneath) |
| Participant offline | **"You're offline — anything you've typed is saved and will send when you're back."** |
| Participant offline holding card (post-reload) | **"You're offline. We'll reconnect you the moment you're back — nothing you typed is lost."** |
| Submit while offline | bar: **"Saved — will send when you're back"** (not "Sent.") |
| Submit flushed on reconnect | bar: **"Saved."** (the honest existing `sentLabel`) |
| Projector reconnecting / offline | chip: **"Reconnecting…"** / **"Offline"** |
| Host connection chip | **"Live"** / **"Reconnecting…"** / **"Offline — check Wi-Fi"** |
| Host room-health chip | **"12 of 15 with you"** / (all present) **"All 15 with you"** / (early) **"Waiting for the room"** |
| Health sheet, dropped group | **"3 haven't been seen for a minute — they may be reconnecting. You can wait, or carry on."** |

### Screens & states

- **Participant:** the existing `ReconnectBanner` becomes a tri-state `ConnectionStrip` (online = nothing; reconnecting = amber; offline = red-ish). The pre-join "Connecting…" spinner gains an offline grace → offline holding card. Submit bars show the offline "saved, will send" copy.
- **Projector:** the existing `error && "Reconnecting…"` text (`ProjectorApp.tsx:46`) becomes the tri-state chip.
- **Host:** the header (`SessionHeader`, `HostConsole.tsx:451`) gains a connection chip (this device) and, in Full, a room-health chip + sheet. No change to the command path.

---

## Architecture

### Approach

Resilience is a **client-derived, content-free presentation layer** over signals that already exist, plus **one optional content-free field** (`lastSeen`) piggybacked on existing participant traffic. No new poll loop, no new KV read-back, no durable submission storage, no AI, no new request from any surface for the MVP. It rides the rev-monotonic guard and the `navState` authoritative-apply path the platform already trusts.

The three signals:
1. **Connection state** — derived in a new `useConnection` hook from `navigator.onLine` + the `error` boolean `usePolledState` already returns + the age of the last applied rev. **Pure client, zero network.**
2. **Offline submission queue** — client-side: a draft-text mirror in the existing per-room `localStorage` namespace + an in-memory action queue flushed on `online`. **No server change.**
3. **Room health** — `lastSeen` on the participant record, written by piggyback, read for free inside `getFacilitatorState` (participants are already fetched there), surfaced in `FacilitatorState`. **One field, no new key, no new request.**

### Files to add

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/components/useConnection.ts` | Pure hook. Input: `{ error: boolean; lastAppliedAt: number; now?: number }` (now injectable for tests). Reads `navigator.onLine` + subscribes to `online`/`offline` events. Returns `{ status: 'online'\|'reconnecting'\|'offline'; sinceMs: number }`. The single source of truth for the tri-state. No fetch, no timers beyond a 1s tick to age `lastAppliedAt`. |
| `/Users/jordan/workshop/edges-v2/components/ConnectionStrip.tsx` | The three surface widgets off one `status` prop: `ConnectionStrip` (participant, full-width strip — replaces `ReconnectBanner`), `ConnectionChip` (compact dot+label for projector + host header). Calm tri-state styling; online renders nothing for the participant strip, a quiet green dot for the chips. |
| `/Users/jordan/workshop/edges-v2/components/useOfflineQueue.ts` | Client offline-submission layer. (a) `useDraft(storageKey)` — debounced mirror of in-progress text to `localStorage` + restore on mount. (b) `useActionQueue(act, status)` — wraps the participant `act`; on a failed/offline send, enqueues the action **in-memory** (single pending entry per `(type)` key — last-write-wins, so re-tapping Send doesn't double-queue) and flushes once on `online` / next successful poll. Idempotent, single-flight. |
| `/Users/jordan/workshop/edges-v2/components/RoomHealth.tsx` | (Full) Host `RoomHealthChip` + `RoomHealthSheet`. Pure render off `FacilitatorState.participants[].lastSeen` + injected `now`. Groups *with you* / *dropped off* by `lastSeen` age; no content. |
| `/Users/jordan/workshop/edges-v2/lib/health.ts` | Pure helper: `computeRoomHealth(participants, now, opts?)` → `{ total, present, dropped, droppedHandles, since }`. Content-free; identity is the already-public handle only. Shared by `RoomHealth.tsx` and tests. |
| `/Users/jordan/workshop/edges-v2/test/connection.test.ts` | Vitest over `useConnection` logic (pure) + `computeRoomHealth` + the `lastSeen` write/expiry on the in-memory store. |

### Files to change

| Path | Change |
|---|---|
| `components/usePolledState.ts` | Expose **`lastAppliedAt`** (a `useRef`/state stamped `Date.now()` whenever `apply()`/poll success sets state) alongside the existing `error`. One field added to the return object; existing consumers ignore it. **No behaviour change** to the guards. |
| `components/ParticipantApp.tsx` | Replace `ReconnectBanner` with `<ConnectionStrip status={…} />` driven by `useConnection({ error, lastAppliedAt })`. Pre-join spinner gains an offline grace → offline holding card. Thread the draft-mirror `storageKey` (reuse the existing `edges_*:${apiBase}` namespace, `ParticipantApp.tsx:25`) and the action queue into the renderer's `act`/draft surface. |
| `components/ProjectorApp.tsx` | Replace the `error && "Reconnecting…"` text (`:46`) with `<ConnectionChip status={…} />` driven by `useConnection`. |
| `components/HostConsole.tsx` | In `SessionHeader` (`:451`) render `<ConnectionChip status={…} />` (this device) from `useConnection({ error: pollError, lastAppliedAt })` — requires surfacing `error`/`lastAppliedAt` from the `usePolledState` call at `:62`. In Full, render `<RoomHealthChip state={s} />` beside it and the sheet below the header. No command-path change. |
| `lib/types.ts` | Add optional **`lastSeen?: number`** to `Participant` (`types.ts:148`). Optional → no breaking change to existing writers/readers. |
| `lib/store.ts` | (a) New `recordParticipantSeen(token, roomId)` — `hget` the record, set `lastSeen = Date.now()`, `hset` it back (TTL-bumps to 24h). **Throttled at the call site** (skip if `lastSeen` < `SEEN_THROTTLE_MS` old) to cap write amplification. (b) `addParticipant` stamps `lastSeen: Date.now()` on create. No new key — rides the existing `participants` hash, so `endSession`'s `del(participants)` already wipes it. |
| `app/api/r/[room]/state/route.ts` | In the **participant** branch (`route.ts:52`, the `token`-bearing read): fire `recordParticipantSeen(token, room)` as a **void, error-swallowed, throttled** side effect — the participant's own 2s poll *is* the heartbeat (no new request). Skip entirely if no `token`. Response shape unchanged. |
| `app/api/r/[room]/action/route.ts` | After a successful `dispatchAction`, fire `recordParticipantSeen(body.token, room)` (void, throttled) so an active submitter refreshes their liveness even between polls. |

### Data model (types / store keys / view shapes)

**No new store key. One optional, content-free field.**

```ts
// lib/types.ts — Participant gains:
lastSeen?: number; // unix ms; last time this token polled/acted. Liveness only —
                   // never content, never a new identifier (the token + handle
                   // already exist). Lives in the existing participants hash, so
                   // the 24h TTL + endSession del() already cover it.
```

```ts
// lib/health.ts
export interface RoomHealth {
  total: number;            // participants who ever joined (= participants.length)
  present: number;          // lastSeen within PRESENT_MS
  dropped: number;          // total - present (excludes never-seen? no — see below)
  droppedHandles: string[]; // handles only (already public to the host), for the sheet
  worstDroppedSince: number | null; // ms since the longest-dropped was last seen
}

export function computeRoomHealth(
  participants: { handle: string; lastSeen?: number; joinedAt: number }[],
  now: number,
  opts?: { presentMs?: number }, // default PRESENT_MS = 30_000
): RoomHealth;
```

```ts
// components/useConnection.ts
export type ConnectionStatus = 'online' | 'reconnecting' | 'offline';
// offline      := navigator.onLine === false
// reconnecting := online at device level BUT (error === true OR now - lastAppliedAt > STALE_MS)
// online       := device online AND no error AND fresh apply
// Constants: STALE_MS = 6_000 (3 missed 2s polls), checked on a 1s tick.
```

`FacilitatorState` shape is **unchanged** for room health — `participants: Participant[]` already carries everything; `lastSeen` rides along on each record. `computeRoomHealth` runs **client-side** in `RoomHealth.tsx` off the already-served `participants[]`, so there is **no new server field and no extra serial KV read** (participants are already in `getFacilitatorState`'s `Promise.all`, `store.ts:867`).

### API / host commands (+ capability gating)

- **No new host command.** Resilience is read-only at the protocol level. The only server-side additions are the two **fire-and-forget `recordParticipantSeen` side effects** on the participant's existing `/state?token=` and `/action` calls — both already authenticated as "a participant holding this token", which is exactly the liveness claim. Spoofable only by replaying a token you already hold; it flips a soft count, never a gate. No capability change.
- **Room health is facilitator-read-only.** It reads `FacilitatorState.participants`, which already requires a facilitator/cohost/admin code (`state/route.ts:40`). Cohost sees it (reassuring, `viewRaw`-aligned); there is no action behind it to gate. No 403 surface.
- **No new participant request.** The heartbeat is a piggyback. There is no `/heartbeat` endpoint (deliberately — see Risks: write amplification).

### Rev / authoritative-apply pattern (no KV read-back)

- **Connection state never touches the server** — it's derived from the client's own poll outcomes. It cannot regress the rev guard and needs no realtime wiring.
- **`lastSeen` does NOT bump `state.rev`** — it writes to the `participants` hash, not via `writeState`. This is correct and intended: room health, like H2's readiness, rides the **2s poll and applies on equal rev** (the guard rejects only strictly-*lower* rev, `usePolledState.ts:78`). A participant dropping off / rejoining updates `participants[]` and `participantCount`, and the facilitator's next poll re-renders health within ~2s. **SSE will not accelerate health** unless `lastSeen` is added to `roomSignature` — it is **not** (it would tick the stream every few seconds for every participant, defeating the keepalive). ~2s health latency is accepted and correct.
- **The offline queue flush uses the existing `act` path** — each flushed action is a normal `/action` POST returning through `dispatchAction`; the participant's next poll (or the action's own success) applies the resulting state through the same rev guard. No read-back; a stale read in between is ignored by the monotonic guard.
- **Authoritative-apply is untouched** — host commands still return `navState(room, written, role)` from the just-written state. H1 adds nothing to that path; it only *reads* the participants already in that payload.

### Offline submission queue — exact mechanics (client-side)

1. **Never lose typed text.** Capture/qna/builder renderers mirror their in-progress textarea value to `localStorage` under a phase-scoped key derived from the existing namespace: `edges_draft:${apiBase}:${phaseId}`. Debounced (~400ms) so it's cheap. On mount/`useSyncedState` re-key, restore the draft. Cleared on a confirmed (server-accepted) send. **A reload, crash, or ErrorBoundary trip never loses the words.**
2. **Queue a send made while offline.** `useActionQueue` wraps `act`. On `act` returning `false`/throwing while `status !== 'online'`, it stores the action **in memory** keyed by `action.type` (single pending entry per type — last value wins, so spamming Send replaces rather than stacks). The submit bar shows the honest "Saved — will send when you're back".
3. **Flush once, idempotently, on reconnect.** On the `online` event (or the first successful poll after `reconnecting`), flush the pending entry exactly once under a single-flight guard (`flushingRef`). Success → clear the entry + draft, bar flips to "Saved." Failure → keep the entry, stay in the queued state (next reconnect retries). The queue is **bounded to the in-memory pending map** (not localStorage) so a queued *action* never resurrects across a full reload — only the *draft text* persists across reload (the safe, lossless half). This deliberately avoids replaying a stale write into a moved-on room after a long-closed reload (see Risks).

### Connection-state detection — exact mechanics

`useConnection({ error, lastAppliedAt })`:
- Subscribes to `window` `online`/`offline` events (sets a `deviceOnline` state).
- Runs a 1s `setInterval` purely to recompute `now - lastAppliedAt` against `STALE_MS` (so "reconnecting" appears even when a poll is silently stalling without throwing — e.g. a captive portal returning 200s of nothing useful is caught by the rev not advancing; a hard failure is caught by `error`).
- Resolution order: `!deviceOnline` → **offline**; else `error || (now - lastAppliedAt > STALE_MS)` → **reconnecting**; else **online**.
- Returns `{ status, sinceMs }` (sinceMs = how long in the current non-online state, for "Reconnecting… (12s)" if desired — copy keeps it simple by default).

### Room-health signal — exact mechanics (no content, no new PII)

- `lastSeen` is stamped by `recordParticipantSeen` on the participant's existing `/state?token=` poll (every ~2s, throttled to one write per `SEEN_THROTTLE_MS = 4_000`) and on each `/action`. No participant makes a new request; the heartbeat is the traffic they already generate.
- `computeRoomHealth(participants, now)`: `present` = count with `now - lastSeen < PRESENT_MS (30s)`; `dropped` = joined participants whose `lastSeen` is older (or, for records pre-dating this feature with no `lastSeen`, treated as present until they next poll — graceful: an old record never falsely shows "dropped"). `droppedHandles` uses the existing public handle only.
- The signal is **aggregate + handle-level**, never content. It reveals "this handle hasn't polled in 40s" — strictly weaker than the participant list the facilitator already sees. No location, no device, no IP, no new identifier.

---

## Implementation plan (ordered, checkable)

**Stage 1 — connection state (pure client; `npm run verify` green, works with no API key)**
- [ ] `components/useConnection.ts` — tri-state from `navigator.onLine` + `error` + `lastAppliedAt`; `now` injectable; `STALE_MS` constant. Unit-test the pure resolver.
- [ ] `components/usePolledState.ts` — expose `lastAppliedAt` (stamp on every successful `setState`, in both the poll path and `apply()`). No guard change.
- [ ] `components/ConnectionStrip.tsx` — `ConnectionStrip` (participant) + `ConnectionChip` (projector/host), calm tri-state.
- [ ] Wire into `ParticipantApp` (replace `ReconnectBanner`), `ProjectorApp` (replace the `error` text), `HostConsole` `SessionHeader` (this-device chip). Pre-join offline holding card.

**Stage 2 — offline-tolerant submission (pure client)**
- [ ] `components/useOfflineQueue.ts` — `useDraft(storageKey)` (debounced localStorage mirror + restore + clear-on-send) and `useActionQueue(act, status)` (single-flight, single-entry-per-type, flush on `online`/first good poll).
- [ ] Thread `useDraft` into the text renderers via render-kit (`useSyncedState` already re-keys on phase change — pair the draft key with it). Thread `useActionQueue` so `act` returns the "queued" outcome; `StatusLine`/`StickyAction` show "Saved — will send when you're back".
- [ ] Manual airplane-mode QA (below) before moving on.

**Stage 3 — room health (store + Full)**
- [ ] `lib/types.ts` — `lastSeen?: number` on `Participant`.
- [ ] `lib/store.ts` — `addParticipant` stamps `lastSeen`; add `recordParticipantSeen(token, roomId)` (hget→set→hset, TTL-bump). Confirm `endSession` already wipes it (it's in the `participants` hash — assert by test).
- [ ] `app/api/r/[room]/state/route.ts` + `action/route.ts` — fire `recordParticipantSeen` (void, throttled, error-swallowed) on the participant read/act.
- [ ] `lib/health.ts` — `computeRoomHealth` (pure, injected `now`).
- [ ] `components/RoomHealth.tsx` — chip + sheet off `FacilitatorState.participants`; advance-into-void caption (soft, never blocks).

**Stage 4 — docs + deploy**
- [ ] `/help` facilitator guide: a short "The room never breaks" section — what the connection states mean, that typed text is never lost, and how to read room health.
- [ ] `npm run verify` (typecheck+lint+test, in-memory store) → build on Node 24 → `vercel --prod`. Revert is trivial (UI + the inert `lastSeen` field + two void side effects).

---

## Acceptance criteria (facilitator-outcome framed)

1. A participant whose Wi-Fi drops mid-typing **never loses their text**: a reload restores the draft, and a Send tapped while offline is **queued and delivered once** on reconnect — confirmed by an honest "Saved." (never a fake "Sent." while offline).
2. Every screen shows **its own** connection state in plain words: a held participant sees "Reconnecting… your screen is held" (last-good view still visible underneath, never a blank "Connecting…" once joined); on full device-offline they see "saved, will send when you're back".
3. The **projector** shows a calm tri-state chip; a slept/woken laptop returns to "Live" within ~2s with the last slide held throughout (audience never sees a blank screen or a klaxon).
4. The **facilitator** can glance at a single chip and see how many of the room are actually connected ("12 of 15 with you"), and open a sheet listing who's dropped off by handle and how long — computed **without any submission content** and **without any new identifier**.
5. The connection indicator is **purely client-derived** — it adds **no new network request** from any surface (the heartbeat is a piggyback on the participant's existing 2s poll / action).
6. Room health rides the **2s poll** and renders correctly on **equal rev** (it does not depend on a `rev` bump and is not accelerated by SSE); a participant dropping off updates the facilitator's count within ~2s.
7. The resilience layer introduces **no new PII and no new store key**: `lastSeen` lives in the existing participants hash, carries the 24h TTL, and is wiped by End-session (asserted by test).
8. Connection-state flap does **not** thrash the UI: a single missed poll inside `STALE_MS` does not flip the participant to "Reconnecting"; the state is debounced/aged, calm, and never red-in-front-of-the-room.

## Test plan

### Vitest (`test/connection.test.ts`, in-memory store; `Array.from`/index loops, no Set spreads or `.entries()`)

1. **Tri-state resolver** — `useConnection` logic as a pure function: `navigator.onLine=false` → `offline` regardless of error/age; `online + error=true` → `reconnecting`; `online + no error + age > STALE_MS` → `reconnecting`; `online + no error + fresh` → `online`.
2. **Stale-rev → reconnecting** — with `error=false` but `lastAppliedAt` aged past `STALE_MS` (injected `now`), status is `reconnecting` (catches the silent-stall case the `error`-only banner missed).
3. **Flap suppression** — `lastAppliedAt` aged only 3s (< `STALE_MS=6s`), `error=false` → still `online` (a single missed 2s poll never flips the strip).
4. **Offline queue single-flight + single-entry** — simulate `act` failing while offline, queue twice (re-tapped Send) → exactly **one** pending entry (last value wins); on `online`, flush calls `act` **once**; success clears the entry + draft.
5. **Queue does not double-submit** — after a successful flush, a second `online` event does **not** re-send (entry cleared); a stale reload does **not** resurrect the in-memory action (only the draft text persists).
6. **Draft persistence** — `useDraft` writes to the phase-scoped localStorage key on change and restores on mount; a confirmed send clears it; a phase change re-keys (old draft not shown in the new phase).
7. **`recordParticipantSeen` stamps lastSeen** — after a participant `/state?token=` read, `listParticipants()` shows a `lastSeen` within the test clock; a second call inside `SEEN_THROTTLE_MS` does **not** rewrite (throttle honored).
8. **`computeRoomHealth`** — 15 joined, 12 with `lastSeen` within `PRESENT_MS`, 3 older → `present=12, dropped=3, droppedHandles` has the 3; a record with **no** `lastSeen` (pre-feature) counts as present (graceful), not dropped.
9. **endSession wipes lastSeen** — write `lastSeen` via heartbeat, `endSession`, assert `listParticipants()` empty (no orphaned liveness; it's in the wiped `participants` hash).
10. **No rev bump from heartbeat** — `recordParticipantSeen` does not change `getState().rev`; a facilitator state fetched after it has the same `rev` but updated `participants[].lastSeen` (asserts equal-rev application is what carries health).

### Manual QA (custom session; host console + phone + projector)

- **Airplane-mode mobile (the headline test):** join on a phone, start typing a capture answer, **enable airplane mode** → strip flips to red "offline", text stays on screen → tap Send → bar reads "Saved — will send when you're back" → **disable airplane mode** → within a second the queue flushes, bar reads "Saved.", the submission appears in the host's raw view. Verify the text was **never re-typed** and **never lost**.
- **Hard reload offline:** with airplane mode on, reload the phone → after the grace, the **offline holding card** shows (not an endless "Connecting…") → disable airplane mode → rejoins to the live phase with draft restored.
- **Brief flap:** toggle Wi-Fi off ~3s then on → strip should **not** flash "Reconnecting" for a single missed poll (flap suppression); a longer drop → amber then auto-clear.
- **Projector sleep/wake:** open `/r/[room]/screen`, sleep the laptop → chip goes amber/red, slide held → wake → chip back to "Live" within ~2s, no blank.
- **Room health:** with 3 phones joined, close one tab → within ~30s the host chip reads "2 of 3 with you" and the sheet lists the dropped handle with "last seen ~Ns ago"; re-open → returns to "All 3 with you". Confirm the sheet shows **no submission content**, only handles.
- **Advance-into-void caption:** drop ≥25% of phones → the Advance affordance shows the soft "N look disconnected" caption but **still advances** when tapped (facilitator authority preserved).
- **Cohost:** authenticate as cohost → sees the connection chip + room-health chip (no action gated behind health, so nothing 403s).

## Privacy & ethos check (explicit)

Honors the ethos and strengthens the named trust promise.
- **No new PII.** `lastSeen` is a single unix-ms timestamp added to the **existing** participant record (which already holds `token` + `handle` + `joinedAt`). It is **identity-free beyond what already exists**, count/aggregate at the facilitator surface, and **content-free**. No IP, no device fingerprint, no geolocation, no new identifier.
- **No new store key.** `lastSeen` rides the existing `participants` hash → it inherits the **24h TTL** (TTL-bumped on every `hset`) and is wiped by `endSession`'s `del(KEYS.participants)` (`store.ts:628`) — asserted by test. End/Archive leaves no liveness residue.
- **Submissions never logged, off-the-record intact.** The offline queue and draft mirror live **only in the participant's own browser** (in-memory action queue + `localStorage` draft) — the participant's own device, their own words, never sent anywhere until they choose to submit. The draft text never reaches the server until a normal `/action` POST. The connection layer and room health **never inspect or transmit submission content**.
- **Account-less, room-scoped, ephemeral model intact.** No AI anywhere in the resilience path. The heartbeat is a piggyback on existing authenticated traffic — no new unauth surface, no new endpoint.
- **Net positive for trust:** the most corrosive failure (silent drop + lost typed text + facilitator advancing into a void) is exactly what H1 closes, and it does so without weakening the privacy contract one bit.

## Risks & mitigations (adversarially derived, resolved)

1. **Offline queue double-submits on reconnect (critical).** *Resolved:* the queue holds at most **one pending entry per action type** (last-write-wins, so re-tapping Send replaces, never stacks) and flushes under a **single-flight `flushingRef`**; the entry is cleared on confirmed success before any second `online` event can re-fire. The in-memory queue is **not** persisted to localStorage, so a stale reload can never resurrect and replay an old write. Tested (cases 4, 5).
2. **Stale-rev confusion — a queued submission lands in a moved-on phase (major).** *Resolved/accepted:* a participant action carries no phase id of its own; on reconnect it lands wherever the room currently is, which is the correct, existing behaviour for any live submit. To avoid a *surprising* late landing, the queue **only persists the action in-memory** (cleared on a full reload), so a long-closed-then-reopened phone never silently fires an hour-old answer — only the **draft text** survives a reload, and the participant must consciously re-tap Send. The lossless half (text) persists; the surprising half (auto-fire) does not.
3. **Connection-flap thrashing (major).** *Resolved:* "reconnecting" requires `error` **or** `lastAppliedAt` aged past `STALE_MS = 6s` (≥3 missed 2s polls), recomputed on a 1s tick — a single missed poll never flips the strip. Device-`offline` is the only instant transition (it's authoritative). Calm by construction, no red-in-front-of-the-room. Tested (case 3).
4. **Heartbeat write amplification on KV (major).** *Resolved:* `recordParticipantSeen` is **throttled** to one write per `SEEN_THROTTLE_MS = 4_000` per token (skip if `lastSeen` younger), so a 30-person room writes ~7–8 `hset`/s steady-state, not 15/poll. It is a **piggyback** on the existing `/state?token=` poll + `/action` (no new request) and is **void/error-swallowed** so a write failure never affects the read. It is **not** added to `roomSignature`, so it never amplifies the SSE stream. Steady-state cost is bounded and small.
4b. **Heartbeat read-modify-write race (minor).** *Resolved/accepted:* `recordParticipantSeen` does `hget`→mutate→`hset` of one token's own field; two concurrent writers for the **same** token can only clobber each other's `lastSeen` (a no-op — both are "now"). It never touches another token's field (per-field hash op), so it cannot corrupt allocation/handle data. Accepted.
5. **Silent stall not caught by the `error` flag (major).** *Resolved:* the original `ReconnectBanner` only reacted to `error`; a poll that succeeds-HTTP-but-never-advances-rev (captive portal, stale CDN) would have shown "online". H1's `reconnecting` also triggers on **`lastAppliedAt` age**, catching the stall the error-only banner missed. Tested (case 2).
6. **Pre-feature participant records have no `lastSeen` → false "dropped" (minor).** *Resolved:* `computeRoomHealth` treats a missing `lastSeen` as **present** (graceful), so an in-flight upgrade never shows the whole room as dropped; the record self-corrects on its next poll. Tested (case 8).
7. **Room-health leaking content or new identity (minor).** *Resolved:* health is aggregate + the already-public handle; it carries **no submission content and no new identifier** — strictly weaker than the participant list the facilitator already sees. The `lastSeen` field is the only addition and is a bare timestamp.
8. **Health signal pressuring the facilitator to wait (minor, ethos).** *Resolved:* the signal is **informational and never blocks** — the advance-into-void cue is a one-line caption, not a gate; the facilitator keeps full authority. No klaxon, no auto-pause.

## Out of scope / future

- **Durable (cross-reload) offline action replay.** Deliberately cut — only draft *text* persists across reload; a queued *action* is in-memory only, to avoid stale auto-fires (Risk 2). A persisted outbox with explicit "you have an unsent answer — send it?" on rejoin is a possible future, behind a confirm.
- **Per-device connection detail in room health** (which phone, OS, signal strength) — out of scope; only "seen / not seen" by handle.
- **Faster-than-2s health via SSE.** Adding `lastSeen` (bucketed) to `roomSignature` is a documented future nicety, explicitly not v1 (it would amplify the stream).
- **A hard "wait for the room" gate before advancing** — out of scope; the signal is advisory, the facilitator decides.
- **Cross-tab draft sync** (BroadcastChannel) and **service-worker offline shell** — larger resilience investments; H1's localStorage draft + tri-state is the thinnest lossless cut.
- **Projector-specific heartbeat row** — reuse H2's projector heartbeat if/when it lands; H1's projector chip already covers the operator's self-view.
