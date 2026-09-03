# E1 — Stunning "join" lobby screen (QR, room name, live count, logo)

> Section E. Front-of-room (projector) · Priority **P0**
>
> Final executable build spec. The design, architecture, and pressure-test have been synthesized below, and **every must-fix from the pressure-test has been folded into this spec** — build it exactly as written.

---

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** **2.5 days** for the MVP cut (down from the architecture's 3.5d — the expensive, error-prone authored-cue plumbing is deferred to a fast-follow; see _Full vision_). Budget **+1.5 days** if the authored `lobbyCue` fast-follow ships in the same PR (4.0d total).
- **Dependencies (item ids):** none blocking. Reuses existing infrastructure only:
  - `components/Countdown.tsx` + existing chime (armed-start countdown)
  - `qrcode.react` `QRCodeSVG` (already a dependency)
  - `PublicState.participantCount`, `PublicState.branding`, `PublicState.timerEndsAt` (all already on the public payload)
  - room-palette CSS vars injected by `app/r/[room]/layout.tsx`
  - existing `setTimer` host command (cap `"timer"`) for the optional countdown
  - `components/usePolledState.ts` rev guard + SSE accelerator
- **New npm deps:** none.

---

## Problem & facilitator value

### Problem
The front-of-room join screen is the single most-seen artifact of an Edges workshop — projected for 5–15 minutes while people trickle in, and the platform's first impression on every participant before the facilitator speaks. Today it's an afterthought: it lives as the **fallback branch** of `components/ProjectorApp.tsx` (lines 70–101) that renders only when no module view is active — a centered vertical column of logo + headline + a fixed-240px QR + "Scan to join" + URL + tagline + a dead "We'll begin shortly." string. It's functional but plain: the QR competes with text on the same center axis, the **live count is absent on the projector entirely** (`state.participantCount` is in hand but never surfaced), there's no sense of life, the client's logo is a thumbnail rather than a celebrated hero, and the begin cue is a static string with no countdown. `app/r/[room]/qr/page.tsx` is a near-duplicate with the same limitations and **does not poll** (one-shot fetch).

### Facilitator value (in the facilitator's voice)
> "I walk into a corporate room, open the projector, and **the client sees their own logo on the big screen** — large, centered, treated like it matters. It tells them this is a serious, well-run, branded space before I've said a word, and that detail wins me repeat bookings.
>
> As people scan in, **the number ticks up** — latecomers feel the room filling and hurry, early arrivers get a quiet 'you're first' instead of staring at a dead card, and I get a passive at-a-glance read of 'are we ready to start?' without flipping to my host console.
>
> Instead of a beige 'We'll begin shortly', I can arm a **2-minute countdown** with a chime, and the screen sets the room's tempo for me. The whole thing is automatically on-brand because I configured branding once in /admin. The lobby stops being the weakest screen in the product and becomes something I'm proud to demo."

---

## MVP cut (thinnest shippable) and Full vision

### MVP cut — ships in this spec (2.5d)
The cheap, high-value 80%, with **zero new state, zero new commands, zero module-contract changes**:

1. **`components/LobbyScreen.tsx`** — a new pure presentational component: asymmetric two-zone hero layout (logo + room name left, big white QR card right, living count between, status ribbon bottom), calm motion, palette-aware, fixed-dark hero scrim for contrast safety.
2. **`ProjectorApp.tsx` fallback branch** swapped to render `<LobbyScreen variant="wide" />`, fed from the **top-level `PublicState`** it already polls (`branding`, `participantCount`, `timerEndsAt`). This is the only data path — see Architecture.
3. **Live count** sourced from existing `participantCount`, animated **only on a count increase** (prevCount ref), downticks silent.
4. **Countdown** in the ribbon reuses the **existing `setTimer`** command + `Countdown` + chime. The host already has timer buttons in `SessionHeader` — no new control needed for MVP.
5. **`lib/modules/lobby-copy.ts`** shared `countCopy(present)` helper, used by both the projector `LobbyScreen` and the phone `LobbyRenderer` so the two never drift.
6. **`app/r/[room]/qr/page.tsx`** refactored to render `<LobbyScreen variant="portrait" />` in a **static** configuration (logo + name + QR + default ribbon, **no live count** — documented as projector-only). No polling change required.

### Full vision — fast-follow (deferred; +1.5d)
The facilitator-authored begin cue and the count-visibility privacy toggle:

- New optional state fields `lobbyCue` + `lobbyCountVisible` on `SessionState`, mirrored onto `PublicState`.
- New host command `setLobbyCue` (cap `"timer"`, see gating rationale below), authoritative-apply via `navState`.
- `lobbyCue`/`lobbyCountVisible` added to `roomSignature` so a cue edit pushes an SSE tick to other projectors.
- A **Lobby controls block placed in `ModeSelector`** (the pre-session surface — NOT gated behind an active lobby phase): cue text input, "Arm start countdown" (reusing `setTimer`), and a "Show joiner count" toggle.

> **Why deferred:** the cue plumbing is the error-prone 20% and carries the facilitator-confusion trap (the lobby is the _no-phase_ state, so any control gated on `moduleId === 'lobby'` would never render). Shipping the MVP first de-risks the visual win; the fast-follow then adds authoring without touching the projector render path.

---

## Experience & flows

### Layout (variant `"wide"` — projector)
Asymmetric two-zone, full-bleed canvas. **Not** the current centered column.

- **LEFT / HERO ZONE (~55% width)** rendered on a **fixed dark scrim/panel** (guarantees hero-text contrast regardless of client `--c-bg`):
  - Client logo, large: `object-contain`, `max-h-[40vh]`, `max-w-[48vw]`, `alt=""`. Clamped so a tall/wide logo can never push the QR off-screen.
  - Room name in display type beneath: `clamp(3rem, 6vw, 5.5rem)`, `min-w-0` + line-clamp so long/non-Latin names don't reflow the layout.
  - Headline/tagline as a quiet supporting line under the name.
- **RIGHT / ACTION ZONE (~45% width):**
  - Eyebrow: "Scan to join — no app, no passcode".
  - **Fixed white rounded QR card** (always white regardless of palette → scannability guaranteed), generous padding preserving the quiet zone. QR size `clamp(280px, 32vw, 460px)`.
  - Human-readable join URL in mono below (non-camera fallback).
- **LIVING COUNT** (between zones / pinned center-bottom): large friendly figure + soft pulsing presence dot (`animate-pulseSoft`). Copy from `countCopy()`. On a count **increase**, one gentle `animate-fadeInUp` micro-pulse (debounced to ≤1 per render).
- **STATUS RIBBON** (bottom): the begin cue. MVP default `"We'll begin shortly."`; when `timerEndsAt` is set, shows a live `mm:ss` `Countdown` (+ chime at zero). Long cue clamped to 2 lines.

### Variant `"portrait"` — /qr door page & narrow screens
Zones stack vertically: logo + name → QR → (count) → ribbon. On `/qr` the count is **omitted** (static variant); on a narrow projector the count collapses into the ribbon.

### States (copy where it matters)
| State | Trigger | What shows |
|---|---|---|
| Connecting | first `/state` not yet resolved | calm `Connecting…` (existing) |
| Empty / first arriver | `present <= 1` | hero + QR; count: **"You're first — others are arriving"**; ribbon: "We'll begin shortly." |
| Filling | `present >= 2` | count: **"N in the room"**; soft join micro-pulse on each increment |
| Countdown armed | `timerEndsAt` set & future | ribbon: cue + live `mm:ss` Countdown; chime at zero |
| Countdown already past | `timerEndsAt` in the past on late connect | ribbon: **"We're starting now"** (never a negative timer) |
| No branding | no logo/headline | room name (`state.topic`) becomes hero; default tagline "No app, no passcode — just pick a name, or stay anonymous."; default dark palette |
| Session begins | `state.moduleId` + `state.view` become non-null | ProjectorApp swaps to the active module's projector renderer (existing, unchanged) |
| Reconnecting | poll error | last good lobby stays on screen (anti-flash rev guard); top-bar "Reconnecting…" preserved |
| Session closed | `state.ended` | "Session closed." (existing) |

### Key flows
1. **First impression:** facilitator opens `/r/[room]/screen` → `ProjectorApp` polls `/state` → no active module view → renders `LobbyScreen` (wide) from top-level `PublicState`.
2. **Room fills:** participant scans QR → `POST /api/r/[room]/join` adds a participant → `roomSignature` (already includes `parts.length`) ticks → SSE pushes → projector re-fetches → `participantCount` rises → count ticks up with the soft micro-pulse.
3. **Tempo (MVP):** facilitator uses existing `SessionHeader` timer buttons (`setTimer`) → `navState` returns authoritative state → `usePolledState.apply` → ribbon shows the live Countdown; chime fires at zero.
4. **Tempo (fast-follow):** facilitator authors a cue / toggles count in `ModeSelector` → `setLobbyCue` → `navState` authoritative-apply → ribbon cross-fades; other projectors pick it up via the SSE tick (signature includes the cue).
5. **Session begins:** facilitator advances to the first real phase → `state.moduleId`/`view` non-null → ProjectorApp swaps to the module renderer.
6. **Door reuse:** facilitator opens `/r/[room]/qr` on an entrance tablet → same `LobbyScreen` in portrait/static variant, no passcode.

---

## Architecture

### Decision (pressure-test must-fix #1, applied)
**Do NOT promote the lobby module to own the projector lobby.** The `Renderer` contract (`RendererProps` in `render-kit.tsx:15–30`) gives a renderer only `{ view, token, handle, phaseId, act, pulse, upload }` — it has **no access to top-level `PublicState`** fields. `branding` is attached at the route layer (not in `getPublicState`/`computeView`), and `participantCount`/`timerEndsAt` are top-level — so a module renderer literally cannot source them, and `ModuleContext` has no `branding`.

Instead: **`LobbyScreen` is a pure presentational component fed by top-level `PublicState` from the `ProjectorApp` fallback branch**, which already has everything in hand. The phone `LobbyRenderer` stays a module renderer and shares only the `countCopy()` helper (the real drift risk). This unifies copy without forcing the projector lobby through the module-view bottleneck.

### Files to ADD
| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/components/LobbyScreen.tsx` | Pure presentational lobby. Props (plain, not `RendererProps`): `{ branding, joinUrl, present, countVisible?, cue?, timerEndsAt, variant: "wide" \| "portrait" }`. Owns two-zone layout, fixed-dark hero scrim, fixed-white QR card, `countCopy()` count with prevCount-gated `fadeInUp` micro-pulse + `pulseSoft` dot, ribbon with `Countdown`+chime. Imports only types + `Countdown` + `qrcode.react` — **no server code**. |
| `/Users/jordan/workshop/edges-v2/lib/modules/lobby-copy.ts` | `countCopy(present: number): string` — `present <= 1` → `"You're first — others are arriving"`, else `"${present} in the room"`. Pure, no imports, safe on client + server. |
| `/Users/jordan/workshop/edges-v2/test/lobby.test.ts` | Vitest: `countCopy` boundaries; (fast-follow) `setLobbyCue` store fn + `getPublicState` surfacing. In-memory store, no KV/AI. |

### Files to CHANGE (MVP)
| Path | Change |
|---|---|
| `components/ProjectorApp.tsx` | Replace the `Centered` fallback branch (lines 70–101) with `<LobbyScreen variant="wide" branding={state.branding} joinUrl={joinUrl} present={state.participantCount} timerEndsAt={state.timerEndsAt} cue={state.lobbyCue} countVisible={state.lobbyCountVisible} />`. (`cue`/`countVisible` are `undefined` in MVP → defaults; they're wired now so the fast-follow needs no further ProjectorApp edit.) Keep the top-bar "Reconnecting…" indicator and the `Renderer` branch unchanged. |
| `app/r/[room]/qr/page.tsx` | Refactor to render `<LobbyScreen variant="portrait" branding={branding} joinUrl={joinUrl} present={0} countVisible={false} timerEndsAt={null} />` from the public branding payload it already fetches. **Static variant — no live count** (documented projector-only; avoids converting this one-shot-fetch page to polling). Removes the duplicated bespoke layout. |
| `lib/modules/registry.client.tsx` | `LobbyRenderer` (phone): replace the inline ternary (`registry.client.tsx:72–75`) with `countCopy(present)` from `lobby-copy.ts`. Behaviorally unchanged; kills phone/projector copy drift. |

### Files to CHANGE (fast-follow — authored cue)
| Path | Change |
|---|---|
| `lib/types.ts` | `SessionState`: add `lobbyCue?: string` and `lobbyCountVisible?: boolean`. `PublicState`: add `lobbyCue?: string` and `lobbyCountVisible?: boolean`. |
| `lib/store.ts` | Add `setLobbyCue(cue: string \| null, countVisible: boolean \| undefined, roomId)` — read-modify-write via `writeState` (rev bump + 24h TTL) like `setTimer` (store.ts:297). In `getPublicState`'s return object add `lobbyCue: state.lobbyCue` and `lobbyCountVisible: state.lobbyCountVisible`. Add `state.lobbyCue` + `state.lobbyCountVisible` to the `roomSignature` join array (store.ts:834–845) so a cue edit pushes an SSE tick. **No new Redis key.** |
| `app/api/r/[room]/host/route.ts` | Add `COMMAND_CAP.setLobbyCue = "timer"` (see gating). Add `case "setLobbyCue":` → `{ ok: true, state: await navState(room, await setLobbyCue(a.cue ?? null, a.countVisible, room), role ?? "facilitator") }`. |
| `components/HostConsole.tsx` | In **`ModeSelector`** (line 402, near "Participants see the lobby until you pick one" copy at ~line 409) add a small Lobby controls block: cue text input → `cmd("setLobbyCue", { cue })`; "Arm start countdown" reusing existing `setTimer` buttons; "Show joiner count" toggle → `cmd("setLobbyCue", { countVisible })`. Uses existing `cmd()`/`apply` path. **NOT gated on `moduleId === 'lobby'`.** |

### Data model
Reuse-first. **No new Redis keys, no durable DB** (privacy ethos intact).

- **Live count** = existing `PublicState.participantCount` (= `participants.length`, store.ts:808). Zero new plumbing. Note it is a **"joined-ever" count** (participants never expire within the 24h TTL) — framed honestly as "in the room" / "joined", never a live-presence claim.
- **Countdown** = existing `SessionState.timerEndsAt` + existing chime, set via existing `setTimer`.
- **Fast-follow only:** two new **optional** fields on the existing per-room `SessionState` record: `lobbyCue?: string` (empty/undefined → default `"We'll begin shortly."`) and `lobbyCountVisible?: boolean` (default `true`; `false` suppresses the count for anonymity-sensitive rooms). Mirrored onto `PublicState`. Written via `writeState`'s normal rev-bump + 24h TTL — **no migration** (optional fields, old records read as `undefined` → defaults).

**View shapes:** `LobbyView` is **not** changed (the must-fix removes the need to pack branding/count/timer into it). `LobbyScreen`'s prop shape is the only new "view":
```ts
interface LobbyScreenProps {
  branding?: RoomBranding | null;
  joinUrl: string;
  present: number;
  countVisible?: boolean;   // default true; false hides the count (fast-follow toggle)
  cue?: string;             // facilitator-authored ribbon line; default applied when empty (fast-follow)
  timerEndsAt: number | null;
  variant: "wide" | "portrait";
}
```

### API + host commands (+ capability gating)
- **MVP:** no new endpoints. The Countdown reuses the existing `setTimer` command (cap `"timer"`).
- **Fast-follow:** `POST /api/r/[room]/host { command: "setLobbyCue", cue?, countVisible? }`.
  - **Capability: `"timer"`** (pressure-test must-fix #5, applied). Rationale: arming the lobby countdown reuses `setTimer` which already requires `"timer"` (host/route.ts:65). Sharing one tier means a cohost who can arm the countdown can also author the cue — no split-permission surprise. It is a runtime facilitator cue (like `setTimer`), so it correctly **avoids the documented `'configure'` admin-only gotcha**. _(Spec note: the architecture's claim that `setTimer` uses `'advance'` was wrong — it uses `'timer'`; this spec uses `'timer'` deliberately.)_
- `GET /api/r/[room]/state` (all role branches) additively returns `lobbyCue`/`lobbyCountVisible` (fast-follow). Additive/optional — existing consumers unaffected.

### Rev / authoritative-apply pattern (no KV read-back)
- Every write (`setTimer` MVP; `setLobbyCue` fast-follow) goes through `writeState` → **rev bump**, and the host command returns `state: await navState(room, written, role)` — the **authoritative state computed from the just-written state** (host/route.ts:39 `navState` → `getFacilitatorState(room, stateOverride)`). The client applies it via `usePolledState.apply`. **No KV read-back.** This mirrors `setTimer`/`setPhase` exactly.
- **Count animation predicate (pressure-test must-fix #3, applied):** gate the "someone just joined" micro-pulse on **`present` STRICTLY INCREASING** via a `prevCount` ref — **NOT** on rev increase. A rev-increasing write can carry a stale-low `participants.length` read on Upstash, so rev-increase is the wrong predicate. Apply downticks **silently** (`displayed = Math.max(prev, next)` or simply never animate on decrease). Confirmed: a join bumps `parts.length` in `roomSignature` (store.ts:841) so the SSE ticks; and `usePolledState` accepts equal-or-higher rev (the `<` guard), so the count still updates on equal-rev polls if a join doesn't bump session rev. Debounce to ≤1 pulse per render so a burst of joins can't strobe.

---

## Implementation plan (ordered, checkable steps)

**MVP**
1. [ ] Add `lib/modules/lobby-copy.ts` with `countCopy(present)`; add its unit cases to `test/lobby.test.ts`. Run `npm run verify` → green.
2. [ ] Update `registry.client.tsx` `LobbyRenderer` to use `countCopy(present)` (phone). Verify phone lobby still reads "You're first" / "N in the room".
3. [ ] Build `components/LobbyScreen.tsx`: props shape above; wide + portrait variants; fixed-dark hero scrim; fixed-white QR card; `countCopy()` count with `prevCount` ref → `fadeInUp` micro-pulse on strict increase, silent downticks; `pulseSoft` dot; ribbon with default cue, `Countdown` for `timerEndsAt` (future), "We're starting now" when past; logo `object-contain max-h-[40vh] max-w-[48vw] alt=""`; room-name `clamp()` + `min-w-0` line-clamp; honor `--c-bg/--c-accent` for accents only.
4. [ ] Swap `ProjectorApp.tsx` fallback branch → `<LobbyScreen variant="wide" .../>` fed from top-level `PublicState`. Keep top-bar "Reconnecting…" and the `Renderer` branch untouched.
5. [ ] Refactor `app/r/[room]/qr/page.tsx` → `<LobbyScreen variant="portrait" countVisible={false} .../>` (static).
6. [ ] `npm run verify` (typecheck + lint + test) + `npm run build` on Node 24. Manual QA (below).

**Fast-follow (optional in-PR, +1.5d)**
7. [ ] Add `lobbyCue`/`lobbyCountVisible` to `SessionState` + `PublicState` (`lib/types.ts`).
8. [ ] Add `setLobbyCue` to `lib/store.ts`; surface fields in `getPublicState`; add both to `roomSignature`.
9. [ ] Add `setLobbyCue` command + `COMMAND_CAP.setLobbyCue = "timer"` to `host/route.ts` (authoritative `navState`).
10. [ ] Add Lobby controls block to `ModeSelector` in `HostConsole.tsx` (cue input, arm-countdown via `setTimer`, count toggle). **Not** gated on an active lobby phase.
11. [ ] Extend `test/lobby.test.ts`: `setLobbyCue` rev-bump + persistence + default-cue fallback + `getPublicState` surfacing. `npm run verify` + build.

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. **Logo is a hero:** in a branded room, projecting `/screen` shows the client logo large (`>= 30vh` tall for a typical landscape logo), object-contained, never pushing the QR off-screen; the room name is display-type alongside it.
2. **QR scans from the back:** the QR is a fixed white card, sized via `clamp(280px, 32vw, 460px)`, with quiet-zone padding preserved, and remains white even when the room `--c-bg` is light.
3. **Count rewards arrivals:** with 0–1 participants the count reads "You're first — others are arriving"; from 2+ it reads "N in the room" and plays a single calm micro-pulse on each increment.
4. **Count never lies/strobes:** the count never animates on a decrease; a burst of joins in one poll yields at most one pulse; a 3-digit count ("120 in the room") does not reflow the QR.
5. **Countdown sets tempo (MVP):** arming a timer from the existing `SessionHeader` buttons makes the ribbon show a live `mm:ss` Countdown; the chime fires at zero; a projector connecting after the timer expired shows "We're starting now", not a negative timer.
6. **On-brand for free:** a room with branding recolors automatically via the layout CSS vars with zero extra facilitator effort; a room with **no** branding still looks intentional (room name as hero, default tagline, default dark palette).
7. **No drift:** phone lobby and projector lobby produce identical count copy (both via `countCopy()`).
8. **Door reuse:** `/r/[room]/qr` renders the same `LobbyScreen` (portrait, static) with logo + name + QR + URL + default ribbon.
9. **Robust under poll error:** a dropped poll keeps the last good lobby on screen (no flash to "Connecting"); only the subtle "Reconnecting…" indicator appears.
10. **Session swap intact:** advancing to the first real phase replaces the lobby with the active module's projector renderer (existing behavior unchanged).
11. **Fast-follow:** authoring a cue / toggling the count in `ModeSelector` (while no mode is picked, `state.moduleId === null`) updates the projector ribbon/count and propagates to other projectors via SSE within one tick.

---

## Test plan

### Vitest (`test/lobby.test.ts`, in-memory store)
- `countCopy(0)` and `countCopy(1)` → "You're first — others are arriving".
- `countCopy(2)` → "2 in the room"; `countCopy(120)` → "120 in the room".
- **(fast-follow)** `setLobbyCue("Doors open", true, room)` bumps `rev` and persists `lobbyCue`/`lobbyCountVisible`.
- **(fast-follow)** `getPublicState` returns `lobbyCue`/`lobbyCountVisible`; empty cue → consumer applies default (assert the field is `undefined`/empty so the component default applies).
- **(fast-follow)** `roomSignature` changes when `lobbyCue` changes.

### Manual QA
**Projector (`/screen`, large display):**
- Branded room: logo is hero-sized, QR scannable from the back of the room, name legible.
- No-branding room: room name as hero, default tagline, dark palette, intentional look.
- Light-`--c-bg` room: hero text stays legible (fixed-dark scrim), QR card stays white.
- Long / non-Latin room name: clamps, no reflow of the QR.

**Mobile (3 phones):**
- Scan QR from each → join → projector count ticks 0→1→2→3 with a calm pulse each step; never downticks visibly; "You're first" gives way to "N in the room".
- Reload a projector mid-fill → count restores to current value, no spurious pulse on initial load.

**Countdown:**
- Arm a 2:00 timer → ribbon shows live Countdown; chime at zero.
- Open a fresh projector after the timer expired → ribbon reads "We're starting now".

**Resilience:**
- Kill network briefly → last good lobby stays, "Reconnecting…" shows, recovers on reconnect.
- Advance to first real phase → lobby replaced by module renderer.

**Door page (`/r/[room]/qr`, tablet/portrait):**
- Renders portrait `LobbyScreen`, logo + name + QR + URL + default ribbon, no live count.

---

## Privacy & ethos check (explicit)

- **No new persistence of participant identity.** Live count = existing `participants.length`; no new key, no durable DB.
- **Honest count framing:** participants never decrement within the 24h TTL, so the count is "joined-ever," not live presence. Copy uses **"in the room" / "joined"** framing and makes **no false live-presence claim**.
- **Suppression toggle ships (not cut):** `lobbyCountVisible=false` lets a facilitator hide the count for anonymity-sensitive rooms (fast-follow). When the MVP ships without it, the count is always shown — acceptable for the MVP, but the toggle **must** land in the fast-follow before any privacy-sensitive customer relies on it.
- **Cue text is facilitator-authored display copy**, not participant data — no off-the-record concern; never logged with content.
- **Ephemeral, account-less, 24h TTL** all unchanged. End-session wipe unchanged. No AI in `computeView` (none added).

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| # | Risk (pressure-test) | Resolution in this spec |
|---|---|---|
| 1 | Promoting lobby to a module breaks the `Renderer` contract — a module renderer can't see top-level `branding`/`count`/`timer`. | **Abandoned.** `LobbyScreen` is a pure presentational component fed by top-level `PublicState` from the `ProjectorApp` fallback. Phone `LobbyRenderer` stays a module renderer sharing only `countCopy()`. `LobbyView` unchanged. |
| 2 | Run-tab cue control gated on `moduleId === 'lobby'` never renders — the lobby is the no-phase (`moduleId === null`) state. | Cue control placed in **`ModeSelector`** (the pre-session surface, HostConsole.tsx ~line 409), reachable while `moduleId` is null. (Fast-follow.) |
| 3 | "Animate on rev increase" is wrong — a rev bump can carry a stale-low count on Upstash. | Animation gated on **`present` strictly increasing** via a `prevCount` ref; downticks applied silently. Confirmed join bumps `parts.length` in `roomSignature` and equal-rev polls still update the count. |
| 4 | `/qr` page fetches once, never polls → a "live" count would freeze. | `/qr` ships the **static** `LobbyScreen` variant (no live count); documented projector-only. No polling conversion needed. |
| 5 | `setLobbyCue` cap justification cited wrong precedent (`setTimer` is `'timer'`, not `'advance'`). | Use cap **`"timer"`** so cue + countdown share one permission tier; explicitly avoids the `'configure'` admin gotcha. (Fast-follow.) |
| 5b | Single fixed hero-text token fails on the opposite background. | Hero zone renders on a **fixed dark scrim** (mirrors the always-white QR card) → white hero text always legible regardless of client `--c-bg`. |
| — | Cue change wouldn't push to other projectors via SSE. | Add `lobbyCue`/`lobbyCountVisible` to `roomSignature`. (Fast-follow.) |
| — | Oversized logo pushes QR off-screen. | Logo `object-contain` in a clamped box (`max-h-[40vh] max-w-[48vw]`), `alt=""`, broken URL fails gracefully. |

---

## Out of scope / future

- **Authored `lobbyCue` + count toggle** — scoped as the fast-follow in this same spec; may ship in a later PR.
- Promoting the lobby to a true module-owned projector phase (explicitly rejected — see must-fix #1).
- Per-table / pre-named / passcode-bearing QR links — the public `/r/<room>` link is assumed sufficient for E1.
- Presence/heartbeat-based "currently present" count (today's count is joined-ever; a real presence model is a separate item).
- "Someone just joined" easing/duration is a one-line tuning in `LobbyScreen.tsx` — confirm taste with the master facilitator before merge (calm/premium, not gamified).
- Admin UI for a per-room **default** begin cue (the runtime cue covers the need; default-copy authoring is a nice-to-have).
