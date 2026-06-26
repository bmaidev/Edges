# C5 — Real co-facilitation (presence + who-is-driving)

> Section C. Running live. Final executable build spec. All pressure-test must-fixes are folded in below and marked **[PT-fix]**.

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 4.5 days (assumes the rev-bump reframing in Architecture is accepted up front; trying to make the baton work on derived equal-rev fields will burn days chasing a flapping baton — see Risks R1).
- **Depends on (existing infrastructure, not other roadmap items):**
  - `lib/store.ts` `withLock` (SET NX EX, 5s auto-expiry) — single-winner baton claims.
  - `lib/store.ts` `participants:hash` pattern (`addParticipant`/`listParticipants`) — copied verbatim for `facilitatorPresence`.
  - `lib/store.ts` `writeState` (monotonic `rev = Math.max(Date.now(), prev.rev+1)`) — the anchor for the authoritative-apply guard. **Load-bearing: baton writes go through this.**
  - `app/api/r/[room]/host/route.ts` `navState()` → `getFacilitatorState(room, stateOverride)` — authoritative-apply rail.
  - `components/usePolledState.ts` `apply()` + monotonic rev guard + SSE tick.
  - `lib/auth.ts` `CAPABILITIES` / `requireCapability` + the `COHOST` `advance` set — gating claim/handoff/takeover.
  - `lib/rooms.ts` `resolveRole` — the same resolution that gates whether a poll writes presence.
  - `components/ui.tsx` Modal/InlineEdit (name prompt) + the `HostConsole` `cmdError` toast slot (presence-event toasts).
- **Roadmap dependencies:** none. Additive, self-gated (dark until a second console connects).

---

## Problem & facilitator value

### Problem (confirmed against the code)

Two facilitators can already share a room — `cohost` exists in `lib/auth.ts` with a reduced capability set, and `withLock` makes *some* control writes race-safe. But the console has **zero awareness of the other human**, and four concrete gaps follow:

1. **No presence.** The console shows `{n} joined` (participants) but never "your co-host is here." If the co-host's phone dies mid-session, the lead has no idea they're now solo.
2. **No identity.** `resolveRole()` resolves a passcode to a **role**, never a **person**. Both leads share one facilitator passcode; the system cannot tell two facilitators apart. "Who is driving" is literally unanswerable — there is no "who."
3. **Silent collisions.** `withLock` prevents corrupt double-advance *for the commands it wraps* — but **`setPhase` is NOT wrapped in `withLock`** (confirmed: `lib/store.ts:279` is a plain read-modify-write). The loser's tap does nothing, or the room jumps a phase nobody expected. Each facilitator thinks the room is misbehaving.
4. **No etiquette layer.** No soft signal of intent, so the pair defaults to both-driving (collisions) or neither-driving (dead air the participants read as a stall).

### Facilitator value (in their voice)

> *"I'm not alone."* A small presence strip in my header tells me my partner is connected, what they go by, and softly where their attention is. When they drop, it fades to "Sam left 40s ago" so I instantly know the room is mine alone.

> *"We won't fight the controls."* A soft, claimable **driving baton** means at most one of us is the visible driver. The other sees an honest "Sam is driving" on the nav controls — still able to take over in one extra tap, just nudged not to reflexively double-drive.

> *"Graceful handoffs on purpose."* I can deliberately pass driving ("you take the breakout debrief") and my partner gets a soft heads-up. The baton is advisory, never a lock — anyone can grab it, and it auto-releases if the driver goes silent, so a dead battery never wedges the room.

Crucially it **costs a solo facilitator nothing**: presence only surfaces a partner when a second console is actually connected.

---

## MVP cut (thinnest shippable) and Full vision

### MVP — "presence strip, read-only" (ship first)
- `facilitatorPresence` hash + heartbeat-on-privileged-poll (deduped, **[PT-fix #6]**).
- `getFacilitatorState` attaches a derived `presence` roster (entries within ~30s).
- `FacilitatorPresenceStrip` in the header: soft initial dots, "you" ring, idle dimming, hover detail, "Sam joined"/"Sam left" calm toasts.
- **No baton, no new host commands, no rev changes.** Read-only roster validates the heartbeat write-on-poll cost live before adding mutation.
- Solo suppression: roster ≤ 1 → strip renders nothing.

### Full vision (this spec, all of it)
Everything in MVP **plus** the driving baton:
- `claimDriver` / `handoffDriver` host commands + take-over via a `takeOver` flag on `setPhase`/`setTimer`.
- `DriverChip` chrome on PhaseStepper + timer controls (3 states).
- **Baton writes bump session rev** so the existing monotonic guard protects them and the SSE tick fires for the partner **[PT-fix #1, #2]**.
- Auto-release on stale driver; never-lock guarantee.

---

## Experience & flows

> **Calm and soft is the whole point.** Nothing blocks, nobody gets locked out, a solo console is visually unchanged, and the **projector/participant surfaces never change** (facilitator churn must never reach the front of the room — preserves the off-the-record contract).

### One-time name prompt
On first authed console load, a lightweight inline prompt (reuse `components/ui.tsx` Modal/InlineEdit):

> **"What should your co-facilitator call you?"**
> placeholder: e.g. *"Jordan"* or *"Sam (slides)"* — default *"Facilitator 2"* — buttons **[Save]** **[Skip]**

Persists to `localStorage` keyed `edges:facilitatorName:<room>`, with cross-room fallback read of `edges:facilitatorName` (auto-fill for convenience; still account-less). Shown once per room until a name or a skip is recorded. Name is cosmetic — it never gates a capability.

### Presence strip (header, beside "{n} joined")
A row of soft initial-dot avatars, one per live facilitator console:
- **Yours** is subtly ringed ("you"). Same person on two tabs → two ringed dots (honest, not a phantom co-host).
- Solid when last-seen < 8s; dims to a hollow ring at 8–25s ("idle"); slides out with a quiet **"Sam left"** toast past ~30s.
- Hover/tap a dot → `Sam · co-host · phase 4 (Cluster) · here`. **Coarse view only** — phase + a "curating / configuring" hint, never the exact tab (less surveillance-y; open-question call resolved to coarse).
- A tiny **•driving** dot rides the current driver's avatar.
- **Solo (roster ≤ 1): the strip renders nothing.** No "1 facilitator" noise.
- Cap the visible dots at ~4; collapse the rest to a "+N" dot to prevent a header explosion with multiple cohosts **[scope guard]**.

### Driving baton — three honest states (PhaseStepper + timer controls)
- **You're driving:** controls normal + quiet text pill **"You're driving"** + low-key **"Hand to Sam ▸"**.
- **Sam's driving:** controls **still fully live** but visually relaxed, with a **"Sam is driving"** text pill over Advance. Tapping Advance first shows an inline, dismissable nudge:
  > **"Sam is driving this phase. Take over?"** **[Take the wheel]** **[Cancel]**
  One more tap always works. This is the soft guard, **not a lock**.
- **Nobody's driving** (cold start or driver idle): **"No one's driving — [I'll drive ▸]"** so the room never sits in an ambiguous gap.

**[PT-fix #8 accessibility]:** every state has a **text pill** (not color/opacity alone), relaxed/muted controls still meet WCAG contrast and stay operable, and presence/baton toasts go through an `aria-live="polite"` region so a screen-reader facilitator hears "Sam is driving" / "Jordan took the wheel."

### Collision grace
If two taps still race, the loser sees a calm **"Sam just advanced to phase 5"** confirmation (framed as partnership), never a dead no-op or error — the action they wanted already happened.

### Key flows
1. **Heartbeat:** every privileged `/state` poll (2s) and every host command carries `presenceId + name + view{phaseId, tab-hint}`. The state route upserts the presence hash entry (`field = presenceId`, `lastSeen = now`) **only when `resolveRole` returns a non-participant/non-projector role**, deduped to writes where `now - storedLastSeen > 1500ms` **[PT-fix #6]**. `getFacilitatorState` attaches the derived roster + driver summary.
2. **Solo:** one `presenceId` heartbeats → roster length 1 → strip + baton dormant. Zero behavior change.
3. **Co-host joins:** their first poll adds a second entry; within ~2s the lead's strip grows a dot + one-time **"Sam joined as co-host"** toast. Symmetric.
4. **Claim baton:** tap "I'll drive" (or auto-claim for the first/only *facilitator*-tier driver at session start). `claimDriver` writes `__driver__` under `withLock(room,'driver')` **and bumps rev via `writeState`**, returning authoritative state via `navState` → both consoles `apply()` instantly; SSE tick fires for the partner **[PT-fix #1, #2]**.
5. **Soft override / take-over:** non-driver taps Advance while another drives → inline nudge → confirm sends `setPhase` **with `takeOver:true` + `presenceId`**; the baton reassign and the phase write are **co-located in one `withLock(room,'driver')` that wraps the read-modify-write of state** so they cannot interleave, and they share one rev **[PT-fix #5]**. Sam's console softly shows "Jordan took the wheel & advanced to phase 5."
6. **Deliberate handoff:** driver taps "Hand to Sam" → `handoffDriver{toPresenceId,toName}` sets `__driver__`, bumps rev, no phase change. Sam gets "Jordan handed you the wheel" and their controls un-relax.
7. **Driver goes silent:** if the driver's presence `lastSeen` exceeds `DRIVER_STALE_MS`, the **derived** driver is reported `null`/stale → consoles show "No one's driving" and anyone can claim. Dead battery never wedges the room.
8. **Driver leaves entirely:** entry ages out, driver cleared, remaining facilitator sees "You're now solo — you're driving."

---

## Architecture

### How it uses the rev / authoritative-apply pattern (no KV read-back)

**This is the load-bearing correctness decision [PT-fix #1].** The anti-flash guard in `usePolledState` is rev-keyed: it drops `rev < lastRevRef` and *applies* equal-rev responses. Presence/driver are **derived** fields and do **not** appear in `roomSignature`. So if a baton change did *not* bump rev, the next in-flight 2s heartbeat poll — which under Upstash lag can read the **pre-claim** `facilitatorPresence` hash — comes back at the **same** rev, is **not** rejected, and `setState()` silently **reverts** the just-grabbed baton. The "navState authoritative-apply rail" does **not** protect this by itself, because that rail's protection *is* the monotonic rev increment.

**Resolution:** `claimDriver`, `handoffDriver`, and the take-over path **bump the session rev** by routing the `__driver__` mutation through `writeState` (the existing monotonic `rev = Math.max(Date.now(), prev.rev+1)`). Consequences, all desirable:
- The baton change becomes a real monotonic event the guard protects → no flapping.
- `roomSignature` moves (because state.rev changes the underlying state) → the **SSE tick fires for the partner** → "Jordan took the wheel" reflects within the SSE cadence, not a 2s lag → collision-grace story holds **[PT-fix #2]**.
- Baton moves are cheap and infrequent, so the extra `writeState` is negligible.

> **Presence join/leave (the roster) deliberately does NOT bump rev and is NOT added to `roomSignature` [PT-fix #2].** Adding presence to `roomSignature` would make every facilitator heartbeat tick the whole room every 2s — a tick storm. Join/leave is **poll-cadence** (≤2s, calm). **Baton moves are rev-bumped and SSE-accelerated.** Document this split.

### New files

| Path | Purpose |
|---|---|
| `lib/presence.ts` | Pure helpers + thresholds (no store import, avoids cycle): `deriveDriver(roster, driverRec)` → `{driverId,driverName}\|null` (null when driver entry missing **or** its `lastSeen` exceeds `DRIVER_STALE_MS` = auto-release); `isIdle(lastSeen)`; constants `PRESENCE_IDLE_MS=8000`, `DRIVER_STALE_MS=75000` **[PT-fix #4 — raised above the background-tab throttle floor, see R4]**, `PRESENCE_TTL_MS=30000`; the `FacilitatorPresence` / `DriverSummary` types re-exported from `lib/types.ts`. |
| `components/FacilitatorPresenceStrip.tsx` | Header strip: initial-dot avatars, "you" ring (matches this device's `presenceId`, both dots ringed for same-person-two-tabs), solid <8s / hollow 8–25s, hover detail, `•driving` dot, "+N" overflow past 4. Renders `null` when `roster.length <= 1`. |
| `components/usePresence.ts` | Client hook: per-tab `presenceId` from **`sessionStorage`** (`edges:presenceId` — survives refresh, distinct per tab) **[PT-fix #7]**, NOT a useRef; read/write the room display name in `localStorage`; expose `name/setName`; diff successive rosters to fire calm `joined`/`left`/`took the wheel`/`handed you the wheel` events; supply `presenceId+name+view` to `usePolledState`. Also fires an immediate heartbeat (a `refresh()`) on `visibilitychange`→visible and `focus` so a returning tab re-asserts presence promptly **[PT-fix #4]**. |
| `components/DriverChip.tsx` | Driver-aware chrome wrapping PhaseStepper + timer controls. Three states (above). Take-over confirm → `cmd` with `takeOver:true`; "I'll drive" → `claimDriver`; "Hand to" → `handoffDriver`. Text pill per state + relaxed (still operable, WCAG-contrast-safe) styling. Never blocks. |
| `components/NamePrompt.tsx` | One-time inline name prompt (reuse `components/ui.tsx` Modal/InlineEdit). Persists to localStorage; shown once per room. |
| `test/presence.test.ts` | Vitest on the in-memory store (no KV/AI). Cases enumerated in Test plan. No `Set` spreads / `.entries()`. |

### Changed files

| Path | Change |
|---|---|
| `lib/session.ts` | Add `facilitatorPresence: \`${base}:facilitatorPresence:hash\`` to `RoomKeys` + `roomKeys()`. One key, same convention as `participants:hash`. |
| `lib/types.ts` | Add `FacilitatorPresence` + `DriverSummary` (shapes below). Extend `FacilitatorState` with `presence: FacilitatorPresence[]` and `driver: DriverSummary`. |
| `lib/store.ts` | Add `heartbeatFacilitator` / `listFacilitatorPresence` / `readDriver` / `claimDriver` / `handoffDriver`. **`claimDriver`/`handoffDriver` run inside `withLock(roomId,'driver')` and persist the baton onto state via `writeState` so rev bumps.** In `getFacilitatorState`, fetch roster + driver and attach `{...pub, presence, driver}` (derived via `lib/presence.ts`). `setPhase`/`setTimer` gain an optional `driverId` param: on a take-over the handler writes `__driver__` = actor **inside the same `withLock(room,'driver')` as the state read-modify-write** so the baton and phase land in one rev and cannot interleave. **Add `KEYS.facilitatorPresence` to `endSession`'s `backend.del(...)` list [PT-fix #3].** List with `Object.values` + index sort like `listParticipants` (no `Set`/`.entries()`). Exclude `__driver__` field from the roster. |
| `app/api/r/[room]/state/route.ts` | Read `presenceId`/`name`/`view` query params. In the existing `if (code)` privileged branch (role admin/facilitator/cohost), call `heartbeatFacilitator` **before** `getFacilitatorState`, deduped (`now - storedLastSeen > 1500ms`). **Construct the heartbeat record with the SERVER-resolved `role` variable — ignore any client-sent role [PT-fix #raw role]**; only `name`+`presenceId`+`view` are client-supplied. Participant/projector polls never write. |
| `app/api/r/[room]/host/route.ts` | Add `COMMAND_CAP` `claimDriver:'advance'`, `handoffDriver:'advance'`. Cases: `claimDriver` → withLock+writeState then `navState(room, written, role)`; `handoffDriver` → same with `driverId=target`. Extend `setPhase`/`setTimer` to read `a.takeOver`/`a.presenceId` and move the baton in the **same** authoritative write. Actor's `presenceId` comes from the request body. |
| `components/usePolledState.ts` | Accept optional `presenceId/name/view` in opts; append as query params in `poll()` only when present; include them in `authKey` so a name change re-polls. No new loop — rides the existing 2s poll + SSE tick. |
| `components/HostConsole.tsx` | Wire `usePresence` (`presenceId+name+view={phaseId, tab-hint}`) into `usePolledState` opts; include `presenceId` in every `cmd()` body for actor attribution. Mount `FacilitatorPresenceStrip` in `SessionHeader` beside `{n} joined`. Wrap PhaseStepper Back/Advance/jump (~L519) + timer buttons (~L496) with `DriverChip`. Add `NamePrompt` on first authed load. Route presence/baton events into the existing `cmdError` toast slot (~L197) in a calm neutral variant + `aria-live`. Extend the cohost banner (~L207) to mention the shared wheel. **No projector/participant changes.** |
| `components/ui.tsx` | Optional: add a `tone` (calm/neutral) variant to the toast/banner styling for presence events; otherwise reuse Modal/InlineEdit as-is. |
| `docs/facilitator-guide` + `docs/ai-and-privacy` | Note the cosmetic, ephemeral, never-logged, never-archived co-facilitator name and the soft baton. |

### Data model

**New Redis hash per room:** `room:<slug>:facilitatorPresence:hash` (mirrors `participants:hash` exactly — atomic per-field `hset`, no whole-set read-modify-write, auto-24h TTL via `backend.hset`'s `expire(TTL_SECONDS)`).

- **Roster field:** `field = presenceId` (per-tab `crypto.randomUUID` in `sessionStorage`); `value =`
  ```ts
  { presenceId: string; name: string; role: Role;
    view: { phaseId: string | null; tab: "run" | "curating" | "configuring" };
    lastSeen: number }
  ```
- **Baton (reserved field):** `field = "__driver__"`; `value = { driverId: string; driverName: string; claimedAt: number }`. `listFacilitatorPresence` excludes `__driver__` from the roster.

**Types (`lib/types.ts`):**
```ts
export interface FacilitatorPresence {
  presenceId: string;
  name: string;
  role: Role;
  view?: { phaseId?: string | null; tab?: "run" | "curating" | "configuring" };
  lastSeen: number;
  isIdle?: boolean;   // derived: 8s–25s
  isDriver?: boolean; // derived
}
export type DriverSummary = { driverId: string; driverName: string } | null;
// FacilitatorState gains:  presence: FacilitatorPresence[];  driver: DriverSummary;
```

**Derived, not stored:** roster filters `lastSeen` within `PRESENCE_TTL_MS` (30s); `driver` is reported `null` when the driver's presence `lastSeen` exceeds `DRIVER_STALE_MS` (auto-release). Driver claims/handoffs guarded by `withLock(roomId,'driver')`. **Nothing persisted to the archive; never logged.**

> No zod runtime schema is required (presence is not a module config and not client-trusted state). `name`/`view` are validated/clamped defensively in `heartbeatFacilitator` (trim name to ~40 chars, coerce `tab` to the enum); `role` is server-derived.

### API + host commands (+ capability gating)

- **GET `/api/r/[room]/state`** — now accepts `presenceId`, `name`, `view` query params. On a privileged (admin/facilitator/cohost) read it upserts the caller's heartbeat (`lastSeen=now`, deduped). Response gains `presence: FacilitatorPresence[]` and `driver: DriverSummary`. **Participant/projector responses unchanged.** GET is now non-idempotent on the privileged path — deduped to bound write cost (see R6).
- **POST `/api/r/[room]/host` — new commands:**
  - `claimDriver { presenceId, name }` — cap `'advance'` (cohosts allowed). withLock + writeState; returns authoritative `{state}` via `navState`.
  - `handoffDriver { toPresenceId, toName }` — cap `'advance'`. Same; no phase change.
- **POST `/api/r/[room]/host` — extended:** `setPhase`/`setTimer` accept optional `takeOver:boolean` + `presenceId`; a take-over advances the phase **and** reassigns the driver in one withLock'd write sharing one rev. Existing callers omitting them are unaffected.
- **All driver writes return state through `navState()` → `getFacilitatorState` with the just-written state (no KV read-back), and carry a bumped rev** so the rev guard protects them.
- **Capability boundary unchanged:** a cohost claiming/driving still cannot end/reconfigure/reassign. Driving is etiquette over the existing `COHOST` `advance` set — it never grants a new capability. The name never gates anything.

---

## Implementation plan (ordered, checkable)

- [ ] **1. Keys & types.** Add `facilitatorPresence` to `lib/session.ts` `RoomKeys`/`roomKeys()`. Add `FacilitatorPresence`/`DriverSummary` to `lib/types.ts`; extend `FacilitatorState`.
- [ ] **2. Pure helpers.** Create `lib/presence.ts` with thresholds (`PRESENCE_IDLE_MS=8000`, `DRIVER_STALE_MS=75000`, `PRESENCE_TTL_MS=30000`), `deriveDriver`, `isIdle`. No store import.
- [ ] **3. Store: presence reads/writes.** `heartbeatFacilitator(presenceId, name, role, view)` (dedup `now-storedLastSeen>1500ms`, clamp name/view, server role only), `listFacilitatorPresence` (Object.values, exclude `__driver__`, drop stale > 30s), `readDriver`.
- [ ] **4. Store: attach to view.** In `getFacilitatorState`, fetch roster + driver, run `deriveDriver`, attach `{...pub, presence, driver}`.
- [ ] **5. Store: endSession wipe [PT-fix #3].** Add `KEYS.facilitatorPresence` to `endSession`'s `del(...)`.
- [ ] **6. Store: baton mutations.** `claimDriver`/`handoffDriver` inside `withLock(room,'driver')`, persisting baton via `writeState` (rev bump). Extend `setPhase`/`setTimer` to optionally take `driverId` and write the baton **inside the same withLock as the state read-modify-write**, sharing one rev **[PT-fix #1, #5]**.
- [ ] **7. State route.** Parse `presenceId/name/view`; in the privileged `if (code)` branch call `heartbeatFacilitator` with the **server-resolved role**, then `getFacilitatorState`.
- [ ] **8. Host route.** Add `claimDriver`/`handoffDriver` to `COMMAND_CAP` (`'advance'`) + cases returning `navState`. Extend `setPhase`/`setTimer` cases to pass `a.takeOver`/`a.presenceId`.
- [ ] **9. usePolledState.** Thread optional `presenceId/name/view` into `poll()` query params + `authKey`.
- [ ] **10. usePresence hook.** sessionStorage `presenceId`, localStorage name (per-room + cross-room fallback), roster-diff events, visibilitychange/focus re-heartbeat.
- [ ] **11. UI components.** `FacilitatorPresenceStrip`, `DriverChip`, `NamePrompt` with text pills + `aria-live` + WCAG-safe relaxed styling + "+N" overflow.
- [ ] **12. HostConsole wiring.** Mount strip in SessionHeader; wrap PhaseStepper + timer with DriverChip; mount NamePrompt; route events to calm toast slot; extend cohost banner; include `presenceId` in every `cmd()`.
- [ ] **13. Tests.** `test/presence.test.ts` (cases below).
- [ ] **14. Docs.** Update `docs/facilitator-guide` + `docs/ai-and-privacy`.
- [ ] **15. `npm run verify` + build (Node 24).** Then a live two-laptop dry run to tune thresholds and validate the never-lock path.

> **Ship order for de-risking:** land steps 1–5, 7, 9–11 (presence strip, read-only, no commands) as the MVP branch; add steps 6, 8, 12 (baton) in a follow-up once the heartbeat write cost is validated live.

---

## Acceptance criteria (facilitator-outcome framed, testable)

1. **Solo is unchanged.** With one console connected, the header shows no strip, no baton UI, no name noise; the only new server effect is a single deduped presence write per poll. *(Roster length 1 → strip + baton render nothing.)*
2. **"I'm not alone."** When a second console connects, within ≤2s each facilitator sees a second dot and a one-time "Sam joined as co-host" toast.
3. **"I know when I'm solo again."** When the co-host's device dies, within ≤30s the partner's dot slides out with a "Sam left" toast and the lead sees "you're now solo — you're driving."
4. **"We won't fight the controls."** While Sam drives, Jordan's Advance shows a "Sam is driving" pill; a single Advance tap shows the take-over nudge, never an immediate phase jump. A second tap ("Take the wheel") always advances **and** moves the baton.
5. **Take-over is atomic.** After a take-over, the new phase and the new driver appear together on both consoles in one update; the baton never ends up on a different person than the phase the winner advanced to. *(Verified via the single-withLock single-rev write.)*
6. **No flapping baton [PT-fix #1].** After a claim/handoff/take-over, no subsequent poll within the next 2 polls reverts the baton, even under a simulated stale read.
7. **Never wedged.** If the driver's tab is backgrounded/throttled or their device dies, the baton auto-releases to "no one's driving" within `DRIVER_STALE_MS`, and any facilitator can claim freely. A background-tab driver who returns within the window keeps the baton (no false release at 25s).
8. **Take-over always works in ≤2 taps.** The nudge is dismissable but can never become an unconditional block (master-facilitator-grabs-the-wheel guarantee).
9. **Privacy: End-session burns names [PT-fix #3].** After `endSession`, the `facilitatorPresence` hash is empty; no name survives the explicit wipe.
10. **Capabilities unchanged.** A cohost can drive (claim/handoff/take-over) but still cannot end/reconfigure/reassign; the display name never unlocks any action.
11. **Front-of-room pristine.** Projector and participant views show zero presence/driver/facilitator-churn signals.
12. **Accessible [PT-fix #8].** Each baton state has a text pill; presence/baton events are announced via `aria-live="polite"`; relaxed controls meet contrast minimums and stay operable.

---

## Test plan

### Vitest (`test/presence.test.ts`, in-memory store, no KV/AI; no `Set` spreads / `.entries()`)
1. **Heartbeat upsert + lastSeen:** `heartbeatFacilitator` creates an entry; a later heartbeat updates `lastSeen`; dedup skips a write when `now-storedLastSeen <= 1500ms`.
2. **Server role only:** a client-supplied `role` is ignored; the stored role is the one passed by the (server-resolved) caller.
3. **Roster ages out:** an entry older than `PRESENCE_TTL_MS` is excluded from `listFacilitatorPresence` / the derived roster.
4. **Solo:** one presenceId → roster length 1.
5. **Two presenceIds → two entries** (same name allowed; both honest).
6. **`__driver__` excluded from roster.**
7. **Concurrent `claimDriver` under withLock → exactly one winner;** the loser's read shows the winner as driver, not an error.
8. **Rev bumps on claim/handoff/take-over:** the `FacilitatorState.rev` after each baton write is strictly greater than before **[PT-fix #1 guard]**.
9. **Driver auto-release:** when the driver's `lastSeen` exceeds `DRIVER_STALE_MS`, `deriveDriver` / `getFacilitatorState.driver` returns `null`.
10. **Take-over atomic:** `setPhase` with `takeOver:true,presenceId` reassigns `__driver__` **and** changes `phaseId` in the same written state (one rev).
11. **endSession wipe [PT-fix #3]:** after `endSession`, the presence hash is empty.
12. **Archive does not slurp presence:** confirm `archiveRoom` (if present) reads no presence fields into the archive payload.

### Manual QA
- **Two laptops:** join lead + cohost; confirm dots/toasts appear ≤2s; hover detail shows phase + coarse hint (not exact tab).
- **Background-tab throttle [PT-fix #4]:** lead claims baton, switches to another tab for ~40s, returns — baton must still be theirs (no false "no one's driving" at 25s). Confirm `visibilitychange` re-heartbeat fires.
- **Refresh [PT-fix #7]:** the driver refreshes the page — no ghost idle dot trail, baton survives (sessionStorage presenceId reused).
- **Never-lock:** kill the driver's console mid-drive; confirm baton frees within `DRIVER_STALE_MS` and the survivor can drive.
- **Collision grace:** both tap Advance near-simultaneously; loser sees "Sam just advanced to phase 5", not an error/dead tap.
- **Mobile (`/r/[room]/host` on a phone):** strip dots, hover→tap detail, nudge buttons all reachable and legible; toasts don't obscure controls.
- **Projector (`/r/[room]/screen`):** confirm **no** presence/driver leakage at any point during a baton handoff.
- **Screen reader:** baton state pill and "Jordan took the wheel" are announced.

---

## Privacy & ethos check (explicit)

- **Self-asserted display name is NOT an account:** per-device `localStorage` + ephemeral presence hash; role still comes from the hashed passcode via `resolveRole`; the name **never gates a capability**.
- **24h TTL:** presence inherits `backend.hset`'s `expire(TTL_SECONDS)` like every other key.
- **End-session burns it [PT-fix #3]:** `facilitatorPresence` added to `endSession`'s `del(...)`; asserted by test. End-session is the user's "burn now" control — a name surviving it would violate the strongest privacy promise.
- **Never archived:** confirm `archiveRoom` does not read the presence hash; nothing presence-related enters the archive.
- **Never logged:** consistent with submissions-never-logged. No presence name/lastSeen in any log line.
- **Coarse view only:** the partner sees phase + a "curating/configuring" hint, never the exact tab (less surveillance-y); and **only facilitator-to-facilitator** — never participants/projector.
- **Front-of-room untouched:** projector/participant surfaces show nothing.
- **Hold the line on scope creep:** the name stays cosmetic and facilitator-private; it must never migrate onto submissions, participant, projector, or archive surfaces.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| # | Risk | Resolution (folded into spec) |
|---|---|---|
| **R1 [critical]** | Baton on derived equal-rev fields → a stale heartbeat poll reverts the just-claimed baton (read-back reversion). | **Baton writes bump session rev via `writeState`.** The monotonic rev guard now protects them; no flapping. (Impl step 6; acceptance #6; test #8.) |
| **R2 [critical]** | SSE never ticks for presence/baton (roomSignature excludes them) → partner waits 2s for "took the wheel." | Rev-bumped baton moves change the underlying state → `roomSignature` moves → **SSE tick fires for the partner.** Presence join/leave is deliberately **poll-cadence only** (not in roomSignature) to avoid a per-heartbeat tick storm. Documented split. |
| **R3 [critical]** | `endSession` hardcodes 6 keys; names survive an explicit wipe. | **Add `facilitatorPresence` to `endSession`'s `del(...)`** + a hard test. (Step 5; acceptance #9; test #11.) |
| **R4 [major]** | Background-tab `setInterval` throttling (~60s) makes a present driver go "stale" at 25s → phantom handoff. | **`DRIVER_STALE_MS=75000`** (above the throttle floor) + **immediate re-heartbeat on `visibilitychange`/`focus`** + the SSE EventSource as a secondary liveness source. (Manual QA covers it.) |
| **R5 [major]** | Take-over does two writes (baton + phase) that can interleave; and `setPhase` is **not** withLock-guarded (confirmed `lib/store.ts:279`). | **Co-locate the baton write and the state read-modify-write inside one `withLock(room,'driver')`, one rev.** This also closes the pre-existing unguarded-`setPhase` double-advance gap for the take-over path. *(Note: plain `setPhase` double-advance remains race-y outside C5 — flagged for a follow-up; C5 does not make it worse and hardens the take-over path.)* |
| **R6 [major]** | GET `/state` gains a write side-effect; EventSource reconnects / StrictMode double-mounts / tick-triggered polls storm KV writes. | **Dedup: write only when `now - storedLastSeen > 1500ms`** (one `hget` you already do). Acceptable steady-state (~1 write/2s/facilitator). |
| **R7 [minor]** | Per-tab `presenceId` in a `useRef` dies on remount/refresh → ghost dots + baton auto-release after every refresh. | **`presenceId` in `sessionStorage`** (per-tab, survives refresh). Name in `localStorage`. |
| **R8 [minor]** | Self-reported role could be spoofed via the heartbeat. | Heartbeat record uses the **server-resolved `role`**; only `name`/`presenceId`/`view` are client-supplied. |
| **R9 [minor]** | State communicated by color/opacity alone → fails WCAG + invisible to screen readers. | **Text pill per state + `aria-live="polite"`** for toasts; relaxed controls meet contrast and stay operable. |
| **R10 [scope]** | Display name is the camel's nose toward an identity system; multi-cohost header explosion. | Name stays cosmetic/facilitator-private (privacy section). Strip is N-safe (just a roster) but **caps visible dots at ~4 with a "+N"** overflow; **no** driving-history or seniority. |

---

## Out of scope / future

- **Hard ownership / locks** — explicitly rejected; violates "master facilitator can always grab the wheel."
- **Driving history / audit trail / seniority** — a different feature; would also pull against off-the-record.
- **Name on participant/projector/submission/archive surfaces** — never; held by the privacy line.
- **Exact-tab presence** — deliberately coarse (phase + curating/configuring hint only).
- **Per-person typing/cursor presence inside curate views** — out of scope.
- **Hardening plain `setPhase` double-advance with `withLock`** outside the take-over path — a worthwhile pre-existing-bug follow-up surfaced by this work, but tracked separately so C5 stays additive.
- **Cross-device "same person" consolidation** — two tabs/devices honestly show two ringed dots; no attempt to merge.
