# G1 — Hybrid/remote first-class (video presence + breakouts)

> Executable build spec. This spec has folded in every must-fix from the pressure-test; where the original design over-promised (rev-guard "instant" re-form, presence computed in `getPublicState`, roster-freeze in modules, client-side anonymity) the corrected approach is the one written below. Build what is written here, not the original design JSON.

## Priority / effort / dependencies

- **Priority:** P1 (Section G — Differentiators / moonshots)
- **Effort:** **18 days** (revised up from the design's optimistic 14; the +4 covers the round-into-`SessionState` refactor, route-layer presence computation, server-side anonymity enforcement, and Daily room lifecycle/lock/cost-cap work the original under-scoped).
- **Dependency items:**
  - **B7** (AI design partner) — the AI designer seeds presence defaults; soft dependency, presence ships without it.
  - **C5** (co-facilitation presence/driving) — shares the host-command + capability surface; no hard ordering, but align the Run-tab control layout.
  - **C1** (Facilitate-mode cockpit) — the Run tab is where the Presence card lives; build on top of it.
  - No blocking dependency. G1 is gated behind `DAILY_API_KEY` + per-room `hybrid` flag and is byte-identical to today when both are absent.

## Problem & facilitator value

**Problem.** Edges is implicitly co-located: the projector is the shared stage, the phone is the private input device, and breakout grouping (`worldcafe`/`stations`/`onetwofour`/`consult` via `lib/modules/groups.ts`) only tells people *who* their table is — it assumes they physically turn to that table to talk. For a remote or hybrid room that breaks: remote participants have no projector to look at, no way to see/hear their assigned breakout, and no presence. They are reduced to silent form-fillers. The deterministic, method-driven grouping that is Edges' keystone is exactly what a video tool can't do; the video presence is exactly what Edges lacks. Today a master facilitator glues the two together by hand — running Edges alongside a separate Zoom/Meet, manually creating breakout rooms there, announcing "table 3, go to Zoom room C" out loud.

**Facilitator value (in their voice).**

> "I run a distributed leadership cohort. With this, I get **one console** that runs the method *and* the video — I never touch a Zoom breakout panel again. When I tap **Next round** in World Café, the same reshuffle I already trust also re-forms the video calls: my table hosts stay put, the travellers' faces move to their new tables. When I advance a plenary poll into 1-2-4-All, everyone is pulled from the main call into pairs, then fours, then back together for the share-out — automatically, because the method *is* the control. My remote people stop being second-class: they see each other during the same conversation a co-located table is having, and on the projector their live tiles appear in the room so the in-person folks can see who's remote. And I can tell my clients the truth: **the video is live and off-the-record — Edges never records it, the rooms vanish, and anyone who wants to stay anonymous keeps their camera off and their name hidden.**"

## MVP cut (thinnest shippable) and Full vision

### MVP cut (this spec builds the MVP, with seams for the full vision)

1. **Presence mode is derived automatically** from `moduleId + room.hybrid` — **no per-phase toggle, no new `configure`-gated config** in v1 (dodges the admin-vs-facilitator capability trap entirely). Breakout for `worldcafe`/`stations`/`onetwofour`/`consult`/`fishbowl`; plenary for everything else (lobby/poll/synthesis/etc.).
2. **Presence block computed in the ROUTE layer** (`state/route.ts` + host `navState`), where `getRoom` is already fetched and branding is already attached — **never inside `getPublicState`** (which takes no room record and runs every 2s).
3. **Round moves into `SessionState`** (`state.phaseRound: Record<phaseId, number>`) so round-advance bumps `state.rev` and rides the authoritative `navState` path. This makes breakout re-form **authoritative off the host command** (no KV read-back) and **rev-guarded** against flapping. This is the real fix for the design's two false central claims.
4. **Daily rooms pre-created once, server-side, inside the locked round-advance command** — participant `/presence` GET only *mints a token* against an already-existing room (no high-fanout create race; treat Daily 409 as success).
5. **Anonymity is a server-enforced hard invariant:** Anonymous participants get a non-owner, non-listed token and their tile is server-excluded from the projector grid; camera is hard-gated for them.
6. **Projector is observer-only** (camera off, no publish).
7. **Per-room concurrent-token cap** enforced at mint time; over cap → graceful audio-off/no-token degrade.
8. **Privacy copy is explicit:** video is live peer-to-peer and is **NOT** covered by the off-the-record/no-logging text-submission guarantee.

### Full vision (future, seams left in place)

- Per-phase presence override (gated like other phase config, surfaced with the same "needs admin" loud-fail hint as the `configure` gotcha).
- Projector-as-publisher (a real in-room camera tile so remote folks see the physical room).
- "Visit table" audio routing to room speakers with an on-air indicator.
- Provider abstraction proven by swapping in a LiveKit adapter behind the same `lib/presence/provider.ts` interface.
- Per-room participant-minute billing cap + paid-tier gating (product-shape, needs billing which Edges lacks today).

## Experience & flows

### Screens & states

**Participant phone `/r/[room]`** — unchanged method renderer on top; a new **collapsible bottom "Presence drawer"**, *closed by default*. Header copy: `Your table — 4 here · 1 remote`. Inside: a small tile strip, `Camera`, `Mic`, `Leave` controls. Camera/mic **OFF by default**. The method renderer is always the primary surface; the drawer never takes over. Video dropping shows a quiet `Reconnecting video…` line and **never blocks the method**.

- Anonymous participant: camera control is disabled with copy `Camera is off while you're anonymous. Switch to a name to appear on video.` (hard, not a warning.)
- Late joiner mid-breakout: drawer shows `Your table is forming — you'll join the next round.` and they sit in plenary until the next round snapshot includes them.
- Solo cohort (size-1 / café host alone / byed pair): folded to plenary with `Your table is forming…` — never a lonely 1-person room.

**Projector `/r/[room]/screen`** — existing big-screen method view + a new **right-rail live tile grid** (plenary observer) or a single **spotlighted breakout** call. Falls back to today's QR/title card when presence is disabled. Tiles are name-labelled (`Anonymous` participants are **excluded**, not shown blank). Camera-off shows a calm initial chip.

**Host console `/r/[room]/host`, Run tab** — a compact **Presence card**: live count `On video: 6 · In room: 12`, a **Recall to plenary** button (this is just `nextRound`/`advance`), and a **Visit table** picker (spotlight). All controls **disabled with a hint** (`Add a Daily key to enable video presence`) when `state.presence` is `null`. No per-phase toggle in v1.

**Admin `/admin`** — a **"Hybrid room (video presence)"** switch on the room theme panel (durable, like branding). OFF by default → zero behavioural change for all 24+ co-located templates. Inline note: `Requires a Daily API key to be configured on the deployment.`

### Key flows

1. **Remote participant join.** Frictionless `/r/[room]` join (handle or Anonymous, no passcode). If the room is `hybrid` and a Daily key exists, `PublicState.presence.enabled` is true; `PresenceLayer` calls `GET /api/r/[room]/presence?token=…`, receives `{provider:'daily', cohortId, roomUrl, meetingToken, mode}`, mounts the Daily `callObject`, joins the plenary call, shows the calm drawer. Camera/mic start OFF.
2. **Method-driven breakout re-form (the moonshot).** Facilitator taps **Next round** → host route runs `nextRound` **as a first-class host command** (see Architecture) inside `withLock`, increments `state.phaseRound[phaseId]`, snapshots the roster, and returns `navState(...)` → the authoritative state with the new round and new per-participant `presence.cohortId`. Client applies via `usePolledState.apply` (rev-gated). `PresenceLayer` diffs `cohortId` (debounced, latest-wins) and `setRoom()`s into the new table's pre-created call. Travellers move; the persistent host stays.
3. **Plenary ↔ breakout on advance.** Advancing from a plenary poll into a breakout 1-2-4-All flips every `cohortId` from `plenary` to `otf:<phaseId>:r0:gK`; the layer pulls everyone into their pair calls. Advancing into the `All` round (`oneTwoFourSize → Infinity`) collapses every cohort to a single `plenary` cohortId so Daily merges everyone back for the share-out.
4. **Projector as room-mirror.** `ProjectorApp`'s `PresenceLayer` joins the plenary call as an observer (camera off) and renders the remote tile grid. During breakouts it can spotlight one call (facilitator "Visit table").
5. **Facilitator controls.** **Recall to plenary** = an early `nextRound`/`advance` (cap `advance`). **Visit table N** = `presenceSpotlight` (cap `presence`), writes `state.spotlightCohort`, read into `PublicState.presence` for the projector. Both return `navState(...)`.

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/presence/provider.ts` | Provider interface (the swap seam): `presenceAvailable(): boolean`, `ensureRoom(name, {exp})`, `mintToken({room, userName, isOwner, listed, canSend})`. Lets LiveKit replace Daily later with no caller changes. |
| `/Users/jordan/workshop/edges-v2/lib/presence/daily.ts` | Daily REST adapter implementing `provider.ts`. `presenceAvailable()` gated on `DAILY_API_KEY` (mirrors `aiAvailable()`). `ensureRoom` idempotent create with `enable_recording:'off'` and `exp` (~phase length, default 2h cap); **treats Daily 409 as success**. `mintMeetingToken` returns a short-lived JWT scoped to one room; `isOwner`/`listed`/`canSend` (mic) flags honoured. Only file that talks to Daily. Returns `null`/throws-graceful when no key. |
| `/Users/jordan/workshop/edges-v2/lib/modules/presence.ts` | **Pure cohort resolver — the keystone, route-layer only.** `cohortForToken(moduleId, phase, roster, round, token): string` switches on `moduleId` and reuses the exact `groups.ts` call the module uses (`cafeRound`/`groupRound`/`pairRound`/`oneTwoFourSize`) to return a stable cohort string e.g. `wc:<phaseId>:r3:t2` / `otf:<phaseId>:r1:g0` / `plenary`. `presenceMode(moduleId, hybrid): 'off'|'plenary'|'breakout'` (off when `!hybrid`; breakout for `worldcafe`/`stations`/`onetwofour`/`consult`/`fishbowl`; else plenary). `foldSolo(cohort, size)` maps size-1 → `plenary`. **No IO** — takes plain args (phase, roster array, round number); fully unit-testable without KV/Daily. |
| `/Users/jordan/workshop/edges-v2/app/api/r/[room]/presence/route.ts` | `GET /api/r/[room]/presence?token=…` (participant) or `?code=…&role=projector`. Resolves caller's current `cohortId` via the same route-layer resolver, enforces the per-room concurrent-token cap, mints a token against the **already-existing** Daily room (rooms are pre-created in the round-advance command; if missing, lazily `ensureRoom` but never as the hot path). Returns `{provider:'daily', cohortId, roomUrl, meetingToken, mode}` or `204`/`null` when no `DAILY_API_KEY`. Projector → observer/non-owner, no mic. Anonymous participant → `listed:false`, `canSend:false` (camera-gated client-side too). Rate-limited. |
| `/Users/jordan/workshop/edges-v2/components/PresenceLayer.tsx` | Client primitive mounted **once per surface, sibling to (not inside) the Renderer**. Lazy-`import('@daily-co/daily-js')` only when `presence.enabled`. Reads `PublicState.presence.cohortId`, diffs it (debounced, gated on monotonic `presence.presenceRev`), fetches `/presence`, joins/`setRoom()`s. Camera/mic OFF default; collapsible drawer (phone) / right-rail grid (projector). Independent reconnection; wrapped in its own try/`ErrorBoundary` so it can never crash the phase. |
| `/Users/jordan/workshop/edges-v2/test/presence.test.ts` | Vitest (in-memory, no Daily/KV). See Test plan. |

### Files to CHANGE

| Path | Change |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/types.ts` | Add to `SessionState`: `phaseRound?: Record<string, number>` (round per phase, written via `writeState` so it bumps `rev`), `spotlightCohort?: string \| null`, `roster?: Record<string, string[]>` (frozen token snapshot per `phaseId:round` key). Add to `PublicState`: `presence?: { enabled: boolean; provider: 'daily'; mode: 'plenary'\|'breakout'\|'off'; cohortId: string \| null; presenceRev: number } \| null`. `FacilitatorState extends PublicState` already → inherits it; add optional `onVideoCount?: number` for the Run-tab count. |
| `/Users/jordan/workshop/edges-v2/lib/store.ts` | Add `nextPhaseRound(phaseId, roomId)`: inside `withLock(`round:${phaseId}`)`, read state, snapshot current participant tokens into `state.roster[`${phaseId}:${round+1}`]`, increment `state.phaseRound[phaseId]`, `writeState` (bumps rev), return the written `SessionState`. **Do NOT add presence computation to `getPublicState`** (it takes no room record and runs every poll). Round helpers `readRound`/round-write in the modules migrate to read `state.phaseRound[phaseId]` (fallback to legacy `votes['__round__']` for one release, then drop). |
| `/Users/jordan/workshop/edges-v2/lib/rooms.ts` | Add durable `hybrid?: boolean` to `RoomTheme` (master switch, off by default). `updateRoom` already accepts a theme patch → admin toggle flows through unchanged. Doc that enabling requires `DAILY_API_KEY`. |
| `/Users/jordan/workshop/edges-v2/app/api/r/[room]/state/route.ts` | After building `PublicState`, attach the `presence` block in the **route layer** (where the room is/should be fetched, same place branding is attached). Compute `mode = presenceMode(moduleId, room.theme?.hybrid)`; if `breakout`, `cohortId = foldSolo(cohortForToken(moduleId, phase, rosterForRound(state, phaseId), state.phaseRound[phaseId]??0, token), size)`; if `plenary`, `cohortId='plenary'`. `presenceRev = state.rev`. Set `enabled = mode!=='off' && presenceAvailable()`. |
| `/Users/jordan/workshop/edges-v2/app/api/r/[room]/host/route.ts` | (1) Promote round-advance to a **first-class command** `nextRound` → `navState(room, await nextPhaseRound(a.phaseId, room), role)` so it returns authoritative state with the new round (the current `moduleAction` case returns only `{ok}` and **must not** be the path for round-advance in breakout rooms). (2) Add `COMMAND_CAP` entries: `'nextRound':'advance'`, `'presenceRecall':'advance'`, `'presenceSpotlight':'presence'`. `presenceSpotlight` writes `state.spotlightCohort` via `writeState` and returns `navState(...)`. (3) `navState` already fetches `getRoom` and attaches branding → also attach the `presence` block here (shared helper with `state/route.ts`) so host commands carry authoritative presence. |
| `/Users/jordan/workshop/edges-v2/lib/modules/defs/worldcafe.server.ts` | `nextRound` `handleAction` keeps working for non-hybrid co-located rooms, but reads/writes round via `state.phaseRound[phaseId]`. `computeView` reads round from `state.phaseRound` (fallback legacy). **`computeView` is NOT given the room record and does NOT freeze its roster** — it keeps using live `ctx.participants` so co-located text grouping is byte-identical. (Roster-freeze lives only in the presence resolver; see Risks.) Apply the same round-source migration to `onetwofour`/`stations`/`consult` `.server.ts`. |
| `/Users/jordan/workshop/edges-v2/lib/auth.ts` | Add optional `'presence'` capability to the `Capability` union and to admin + facilitator sets (NOT cohost, NOT participant/projector). Recall-to-plenary stays under `'advance'` (cohosts can run it). One new cap, spotlight-only. |
| `/Users/jordan/workshop/edges-v2/components/ParticipantApp.tsx` | Mount `<PresenceLayer surface='participant' …>` as a sibling **below** the `ErrorBoundary`-wrapped Renderer (never inside), only when `state.presence?.enabled`. |
| `/Users/jordan/workshop/edges-v2/components/ProjectorApp.tsx` | Mount `<PresenceLayer surface='projector' …>` as right-rail grid / spotlight; observer-only join (camera off, no publish) in v1; fall back to QR/title when disabled. |
| `/Users/jordan/workshop/edges-v2/components/HostConsole.tsx` | Run tab: add the **Presence card** (on-video vs in-room count, Recall to plenary → `presenceRecall`, Visit table → `presenceSpotlight`). Disabled with a hint when `state.presence` is `null`. **No per-phase toggle in v1.** |
| `/Users/jordan/workshop/edges-v2/lib/design.ts` | One-line note in the schema-derived catalogue that presence mode is auto-derived from module + room hybrid, so the AI designer's prose can mention it ("breakouts will follow your method's groups") without writing config. |
| `/Users/jordan/workshop/edges-v2/app/admin/*` | Add the "Hybrid room (video presence)" switch writing `RoomTheme.hybrid` via the existing `updateRoom` theme patch. Off by default; note the Daily key requirement. |
| `/Users/jordan/workshop/edges-v2/.env.example` | Add `DAILY_API_KEY` (+ optional `DAILY_DOMAIN`) with the graceful-degradation comment mirroring `ANTHROPIC_API_KEY`/`BLOB_READ_WRITE_TOKEN`. |
| `/Users/jordan/workshop/edges-v2/app/help/*` + privacy copy | Document the hybrid/presence model and **explicitly state video is live peer-to-peer and NOT covered by the off-the-record/no-logging contract** (other participants' devices can capture). Assert Daily rooms are recording-off and auto-expire. |

### Data model

No durable DB; account-less and ephemeral preserved. Touchpoints:

1. **Durable room field** — `RoomTheme.hybrid: boolean` (durable KV, no TTL, like branding).
2. **Per-round state** — moved INTO `SessionState` (24h TTL, written via `writeState` so it **bumps `rev`**): `phaseRound: Record<phaseId, number>`, `roster: Record<`${phaseId}:${round}`, string[]>` (frozen snapshot for breakout stability), `spotlightCohort: string|null`. This is the load-bearing change that makes presence rev-guarded and authoritative.
3. **`cohortId` is NOT persisted** — a pure function of `(moduleId, frozen roster, round, token)`, recomputed in the route layer every poll; cannot drift from the method because it calls the same `groups.ts` functions.
4. **Daily rooms/tokens** — external, short-lived (`exp` on creation), never referenced by a stored Edges key. End-session/24h-TTL wipes Edges state; Daily rooms auto-expire. **Media never stored or proxied by Edges.**

### View shapes (zod)

```ts
// PublicState.presence (nullable, backwards-compatible)
{
  enabled: boolean;            // mode !== 'off' && presenceAvailable()
  provider: 'daily';
  mode: 'plenary' | 'breakout' | 'off';
  cohortId: string | null;     // per-participant in breakout; 'plenary' otherwise
  presenceRev: number;         // === state.rev; PresenceLayer gates setRoom on monotonic increase
}
// /presence response
{ provider:'daily'; cohortId:string; roomUrl:string; meetingToken:string; mode:'plenary'|'breakout' }
```

### API + host commands (+ capability gating)

- **NEW** `GET /api/r/[room]/presence?token=…|?code=…&role=projector` → token bundle or `204`/`null` (no key). Room-scoped, token/code-checked (same gate shape as `/upload`). Concurrent-token cap enforced at mint. Projector → observer/read-only. Anonymous → non-listed, mic off.
- **`GET /api/r/[room]/state`** now returns the `presence` block (nullable; back-compat).
- **Host `POST /api/r/[room]/host` new commands:**
  - `nextRound` (cap `advance`) — first-class, calls `nextPhaseRound`, returns `navState(...)`. **This replaces routing round-advance through `moduleAction` for breakout rooms.**
  - `presenceRecall` (cap `advance`) — recall to plenary; in practice an early `nextRound`/`advance`; returns `navState(...)`.
  - `presenceSpotlight` (cap `presence`) — writes `state.spotlightCohort`; returns `navState(...)`.
- **No change** to participant `POST /api/r/[room]/action` or the `handleAction` module contract.

### How it uses the rev / authoritative-apply pattern (NO KV read-back)

This is the corrected core (the original design's "inherits the rev guard / rides navState" claim was false against the code: `castVote`/`addParticipant` don't call `writeState`, and `moduleAction` returns only `{ok}`).

1. **Round lives in `SessionState`**, so `nextPhaseRound` → `writeState` **stamps a strictly-increasing `rev`** (`store.ts` `writeState`).
2. **Round-advance is a first-class host command** that returns `navState(room, writtenState, role)` → `getFacilitatorState(room, stateOverride)` with the **just-written** state. The client applies it via `usePolledState.apply` — **never a read-back** on eventually-consistent KV.
3. **`presence.presenceRev = state.rev`**, carried inside `PublicState`. `PresenceLayer` rejects any `cohortId` from a `presenceRev` ≤ the last applied one, so two serverless reads at different revs can't flap a participant between Daily calls (`setRoom` thrash / camera re-prompt prevented).
4. **Participant joins do NOT reshuffle live breakouts:** breakout membership uses the **frozen roster** snapshotted at round-advance (`state.roster[`${phaseId}:${round}`]`), so an arrival mid-round can't yank existing people. Late joiners hold in plenary until the next snapshot.
5. **Daily rooms are pre-created once** in the locked `nextPhaseRound` command (single caller), so the high-fanout participant GET only mints tokens — no thundering-herd create race; Daily 409 treated as success.

## Implementation plan (ordered, checkable steps)

- [ ] **1. Data model.** Add `phaseRound`/`roster`/`spotlightCohort` to `SessionState` and `presence` to `PublicState` in `lib/types.ts`. Add `RoomTheme.hybrid` in `lib/rooms.ts`. No behavioural change yet.
- [ ] **2. Round into state.** Add `nextPhaseRound` to `lib/store.ts` (locked, snapshots roster, bumps rev). Migrate `worldcafe`/`onetwofour`/`stations`/`consult` to read round from `state.phaseRound` (legacy `votes['__round__']` fallback). Verify co-located rounds still advance identically (existing module tests pass).
- [ ] **3. Cohort resolver.** Add `lib/modules/presence.ts` (`presenceMode`, `cohortForToken`, `foldSolo`, `rosterForRound`). Pure, no IO. Write `test/presence.test.ts` first (TDD) — assert cohort strings match each module's own grouping across rounds.
- [ ] **4. Route-layer presence block.** Attach `presence` in `state/route.ts` and in host `navState` (shared helper). `enabled=false` until a room sets `hybrid` AND `presenceAvailable()`. Still no Daily.
- [ ] **5. Provider + Daily adapter.** Add `lib/presence/provider.ts` + `lib/presence/daily.ts` (gated on `DAILY_API_KEY`, recording off, `exp`, 409-as-success). Add env to `.env.example`.
- [ ] **6. Presence route.** Add `app/api/r/[room]/presence/route.ts` — token mint against existing rooms, concurrent-token cap, projector/anonymous flags, `204` without key.
- [ ] **7. Pre-create rooms on round-advance.** In `nextPhaseRound` (or a thin host-command wrapper), `ensureRoom` for each computed cohort once, server-side, inside the lock.
- [ ] **8. Host commands.** Add `nextRound`/`presenceRecall`/`presenceSpotlight` to host route + `COMMAND_CAP`; add `'presence'` cap to `lib/auth.ts`.
- [ ] **9. Client layer.** Add `components/PresenceLayer.tsx` (lazy Daily import, `presenceRev`-gated diff, drawer/grid, ErrorBoundary). Mount in `ParticipantApp` + `ProjectorApp`. Enforce anonymous camera-gate client-side (server already non-lists).
- [ ] **10. Host UI.** Presence card in `HostConsole` Run tab (count + Recall + Visit table; disabled-with-hint when null).
- [ ] **11. Admin + AI + docs.** Hybrid switch in `/admin`; one-line `design.ts` note; `/help` + privacy copy (explicit video-not-off-the-record statement).
- [ ] **12. Pilot.** Provision `DAILY_API_KEY` on a staging room; run one hybrid World Café (verify re-form on Next round) + one 1-2-4-All (verify fan-out/fan-in). Then enable per-room.

## Acceptance criteria (testable, facilitator-outcome framed)

1. **Zero change when off.** With `DAILY_API_KEY` absent OR `room.theme.hybrid` false, `PublicState.presence` is `null`, `PresenceLayer` renders nothing, and all 24+ co-located templates behave byte-identically. `npm run verify` and CI never touch Daily.
2. **Method drives video.** In a hybrid World Café, tapping **Next round** moves each traveller's video tile to their new table within one state apply, and the table host's call stays put — with no facilitator video action.
3. **Fan-out / fan-in.** Advancing a plenary poll into 1-2-4-All puts everyone into pair calls, then fours, then merges everyone back to one call on the `All` round.
4. **No flap.** A participant joining mid-round does NOT move any existing participant between calls; the new participant holds in plenary with "your table is forming" until the next round.
5. **Authoritative, not read-back.** Breakout re-form is driven by the host-command `navState` response and rejects any stale `presenceRev` — verified by a forced eventual-consistency stale read in test.
6. **Anonymity holds.** An Anonymous participant cannot turn on their camera and never appears on the projector grid (enforced server-side at token mint).
7. **Privacy copy present.** `/help` and the privacy panel state plainly that video is live and not covered by the off-the-record guarantee; Daily rooms are recording-off and auto-expire.
8. **No create race / cost runaway.** Round-advance pre-creates rooms once; participant GET only mints; per-room concurrent-token cap refuses tokens past the limit and degrades to audio-off gracefully.
9. **Calm by default.** Drawer closed, camera/mic off on join; the method renderer stays responsive; video crashing never crashes the phase (ErrorBoundary).

## Test plan

### Vitest (`test/presence.test.ts`, in-memory, no Daily/KV)

- `cohortForToken` matches the module's own grouping for `worldcafe` (table assignment incl. persistent host), `onetwofour` (sizes 1/2/4/∞ by round), `stations`, `consult` — across rounds 0..3.
- **Roster-freeze:** with a frozen roster at round N, adding a token does not change any existing token's cohort; the late token resolves to `plenary`.
- **Size-1 fold:** a solo/bye cohort maps to `plenary`, never a 1-person room id.
- **Anonymity rule:** the token-mint argument builder returns `listed:false, canSend:false` for an anonymous participant.
- `presenceMode` returns `off` when `hybrid` false; `breakout` for the five breakout modules; `plenary` otherwise.
- **Rev gate:** a `presence` block with a lower `presenceRev` is rejected by the diff helper (unit-test the gate function).
- `nextPhaseRound` bumps `state.rev` and snapshots the roster (store test on in-memory backend).

### Manual QA

- **Mobile (mid-range Android + iOS Safari):** join hybrid room; drawer closed by default; open drawer, turn camera on/off, leave; confirm method renderer stays responsive while a call runs; background the tab → video pauses, method unaffected; reconnect banner on network drop never blocks input.
- **Projector:** observer grid shows remote tiles, excludes Anonymous; spotlight a breakout; falls back to QR when hybrid off.
- **Facilitator:** Run-tab count accurate; Recall to plenary merges calls; Visit table spotlights; controls disabled-with-hint when no key.
- **Method-driven:** World Café Next round re-forms tables; 1-2-4-All advance fans out/in; rapid double-tap does not double-advance (lock) and does not flap (rev gate).
- **Anonymity:** Anonymous user cannot enable camera; never on projector.

## Privacy & ethos check (explicit)

This item **explicitly touches the privacy ethos** — video is the surface where "off-the-record, nothing logged" is most fragile. Resolved as hard invariants:

- **Edges never records or proxies media** — it only computes who is in which call and hands signed, ephemeral cohort tokens to an embedded SDK.
- **Recording forced off:** Daily rooms created with `enable_recording:'off'`, asserted at create.
- **Auto-vanish:** Daily rooms carry an `exp`; End-session/24h-TTL wipes all Edges state independently.
- **Anonymity is server-enforced, not a warning:** Anonymous → non-listed, non-owner, mic-off token; tile excluded from the projector grid; camera hard-gated. A participant can be fully in-session with video entirely off.
- **No new accounts.** Token-checked, room-scoped, capability-gated.
- **Honest copy:** `/help` + privacy panel state plainly that **live video is peer-to-peer and NOT covered by the off-the-record/no-logging text-submission guarantee** (other participants' devices may capture). We under-promise here rather than imply video inherits the submission contract.

Net: the ethos is **preserved** for everything Edges controls, and **honestly scoped** for the one thing it does not (third-party device capture of live faces).

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution in this spec |
|---|---|
| **Rev-guard claim was false** — `castVote`/`addParticipant` don't bump `rev`; round lived in the votes hash. | **Round moved into `SessionState`**; `nextPhaseRound` → `writeState` bumps `rev`; `presence.presenceRev = state.rev`; `PresenceLayer` gates `setRoom` on monotonic `presenceRev`. Participant-count changes are non-authoritative for breakout membership (frozen roster). |
| **Authoritative-apply path was false** — `moduleAction` returns only `{ok}`. | **Round-advance promoted to a first-class host command** returning `navState(...)`. Breakout re-form rides the authoritative just-written state, never a KV read-back. |
| **`getPublicState` has no room record** — computing presence there adds per-poll `getRoom` IO and breaks store/room separation. | **Presence computed in the ROUTE layer** (`state/route.ts` + host `navState`) where `getRoom` is already fetched and branding is already attached. `getPublicState` stays room-agnostic; zero new per-poll KV reads. |
| **Roster-freeze would change live co-located grouping** if pushed into module `computeView` (which has no room record). | **Roster-freeze lives only in the presence resolver** (route layer). Modules keep using live tokens → co-located text grouping byte-identical. Video grouping for a late joiner may briefly differ for one round; surfaced as "your table is forming" on the video drawer only. |
| **Anonymity silently breakable** by one camera tap on a shared projector. | **Server-enforced invariant** at token mint (non-listed, mic-off, tile excluded) + client camera hard-gate. Not a warning. |
| **Daily room create race** — N concurrent creates per cohort per round from a high-fanout GET. | **Pre-create rooms once in the locked `nextPhaseRound` command**; participant GET only mints tokens; Daily 409 treated as success; GET never creates under load. |
| **Capability trap** — per-phase toggle would route through `configure`-gated `setPhases` and fail silently for facilitators. | **No per-phase toggle in v1.** Presence mode auto-derived from `moduleId + room.hybrid`. One new `presence` cap, spotlight-only; recall folds under `advance`. |
| **Billable tokens from a shareable low-entropy room URL, no billing.** | **Per-room concurrent-token cap** enforced at mint; over cap → graceful audio-off/no-token. Tokens scoped tight (single cohort, `exp` ~ phase length). Live usage surfaced to facilitator. Paid-tier gating deferred (no billing today). |
| **Main-thread / a11y budget** — poll + SSE + live call on a mid-range phone. | Drawer collapsed + video paused by default; cap rendered tiles; drop to audio-only when backgrounded or method needs focus; lazy-dynamic-import Daily only when `presence.enabled`; tiles labelled; Leave/Camera keyboard-reachable, not below the fold; reduced-motion honoured. |
| **Cohort of size 1** (odd counts, lone café host, byed pair). | `foldSolo` maps size-1 → `plenary` with "your table is forming"; never a lonely 1-person room. |

## Out of scope / future

- Per-phase presence override (gated like `configure`, loud-fail hint).
- Projector-as-publisher (in-room camera tile for remote viewers).
- "Visit table" audio routed to room speakers + on-air indicator.
- LiveKit adapter (privacy-purist, self-hostable) behind `provider.ts`.
- Per-room participant-minute billing cap + paid-tier gating (needs a billing system Edges does not have).
- Large-call/broadcast mode for very large plenaries.
