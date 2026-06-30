# C2 — Live participation signals on every gather phase

> Section C — Running live · **Priority P0** · Executable build spec (design + architecture + pressure-test folded in; every must-fix applied).

---

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** **3.5 dev-days** for the MVP (Slices 1–2, read-only signal), **+1.5 days** for the nudge + builder toggles (Slice 3) and projector polish (Slice 4) = **5.0 days full vision**. (Revised up from 4.5 because the pressure-test established the nudge re-pulse is a per-renderer touch, not a contract-layer freebie.)
- **Dependency item ids:** none external — this item is self-contained. It *generalises* prior art that already exists in the repo (it does not depend on another roadmap item):
  - Lobby module `present` count (`lib/modules/registry.client.tsx` LobbyRenderer) — the count to generalise.
  - `PublicState.participantCount` (`lib/types.ts:237`) — the room-wide count to extend.
  - Authoritative-apply nav pattern (`app/api/r/[room]/host/route.ts` `navState`) — the transport for the nudge.
- **Internal ordering (do in this order):** `lib/types.ts` + `lib/modules/types.ts` (foundational) → `lib/store.ts` (heartbeat + signal fold) → `lib/modules/registry.server.ts` (helper + capability sweep) → render-kit + HostConsole → host route nudge → ParticipantApp re-pulse → ProjectorApp → BuilderApp toggles.

---

## Problem & facilitator value

**The problem, in the facilitator's voice:**

> "I'm running a Capture phase across a remote room of 18. People are typing into their phones and I can see… nothing. Has everyone answered? Are 11 in and 7 still thinking, or have 7 wandered off? I can't tell, so I do the thing that breaks the calm — I talk over the room: *'Everyone in? A few more?'* On a projector in front of strangers that's awkward, and it nags the people who already answered. And the only number I *do* have — '18 here' — is a lie, because it counts three people who closed their phone ten minutes ago. I want to read the room the way I do in person: glance up, see most hands are down, give it another beat, then move on — without saying a word."

**The value this delivers:**

Restores the single most human facilitation instinct — *reading the room* — to a remote/multi-room session, calmly. On the **Run** tab of *every* gather phase the facilitator gets a glanceable **"11 of 18 responded · 3 gone quiet"** with a thin fill bar, so they advance **on evidence** instead of guessing or talking over the room. A **"Nudge the room"** affordance gently re-surfaces the prompt on *only* the phones that haven't answered yet — replacing the verbal "a few more please" — and stays calm for everyone who's already in.

Because the signal is **content-free** and presence rides the **existing 2 s poll heartbeat**, it costs nothing to privacy and needs no new transport. It generalises the one-off Lobby count into a reusable signal that **every current and future gather module gets for free** at the contract layer — exactly the keystone "configured chains of primitives" ethos: solve presence once, not per module.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (Slices 1–2 — ship this first, ~3.5 days)

**Read-only participation signal, no nudge, no projector count.**

- `lastSeen` heartbeat captured on the participant `/state` poll (separate heartbeat hash — see Architecture).
- `gatherSource` capability declared on every module.
- `computeParticipationSignal` helper + role-scoped `PublicState.participation`.
- `<ParticipationSignal>` primitive rendered on the **Run** tab under the phase header: **"N of M responded"** + fill bar + **"K gone quiet"** sub-line. Numbers only climb within a phase (rev guard).
- `typing` is **always 0** in MVP (deferred — see Out of scope).

This delivers ~80% of the facilitator value at ~30% of the risk, with **zero new participant-side surface** (the participant phone is untouched). It is the lowest-risk, highest-value cut and should ship and be observed before the nudge is built.

### Full vision (adds Slices 3–4, ~+1.5 days)

- **Nudge the room** host command: re-pulses (and optionally chimes) only the not-yet-responded phones; 15 s cooldown; "Nudged 7 phones" toast.
- **Builder toggles:** `showLiveCount` (projector social proof, default **off**) and `nudgeable` (default **on**) per gather phase.
- **Projector** quiet social-proof count ("11 of 18"), gated on `showLiveCount` **and** a privacy floor of `present >= 3`.
- (Fast-follow, not in this spec) a real **typing** breakdown from a focus/draft heartbeat.

---

## Experience & flows

Governing principle: **calm, ambient, never alarmist** — a conductor glancing up at the room, not a metrics dashboard. Numbers only climb within a phase; "quiet" is **greyed, never red**; no surface ever attributes a response to a person.

### Run tab (host) — states

| State | Render |
|---|---|
| Gather phase, mid-flight | Phase header, then `<ParticipationSignal>`: **"11 of 18 responded"** + thin fill bar (Bars fill aesthetic) + sub-line **"3 gone quiet"** + **"Nudge the room"** button. |
| All responded | Bar full · **"All 18 responded"** · Nudge button **disabled**, caption *"everyone's in"*. |
| Tiny room (`present <= 1`) | Collapse to **"waiting for the room"** — no "0 of 1" awkwardness. |
| Non-gather phase (content / coordinator / lobby / media / readaround / close) | `participation === null` → signal **not rendered** (no empty shell). |
| Anonymous-config phase | Show **present + responded only** — *no* quiet breakdown (see Privacy). |

Copy: numbers, not percentages. "gone quiet" not "inactive". "Nudge the room" not "Remind everyone".

### Participant phone (Full vision only)

| State | Behaviour |
|---|---|
| Gather phase, **not yet responded**, on nudge | Prompt card **soft-pulses** (`animate-pulseSoft` / `useContentPulse`), optional gentle chime (`useChime`). No text accusation. |
| **Already responded** (CaptureDone state), on nudge | **Nothing happens** — phone stays calm. |

### Projector (Full vision only)

| State | Render |
|---|---|
| `showLiveCount` on **and** `present >= 3` | Bare **"11 of 18"** in lobby-count type. No bars, no names, no breakdown. |
| `showLiveCount` off (default) **or** `present < 3` | Nothing. |

### Build form (Full vision only)

Two calm toggles in the gather-phase editor:

- **"Show live count on screen"** — default **off** — *helper:* "A quiet '11 of 18' on the projector. Off for sensitive rooms."
- **"Allow nudge"** — default **on** — *helper:* "Lets you gently re-surface the prompt on phones that haven't answered."

### Host toast (Full vision only)

- Success: **"Nudged 7 phones"** (count of not-yet-responded *present* participants), auto-dismiss ~3 s.
- Within cooldown: **"Already nudged — give it a moment"**, auto-dismiss.

---

## Architecture

> Solve presence **once at the contract layer**, never per-module. Five pieces below. Every pressure-test must-fix is folded in (called out inline as **[FIX]**).

### 1) Heartbeat (hot path) — separate single-field hash, no read-modify-write **[FIX: critical]**

**Do NOT fold `lastSeen` into the `Participant` record.** `addParticipant` / `allocate` / `reassign` all do `hget`-then-`hset` of the *whole* Participant object under one token field (`store.ts:318–380`). Writing `lastSeen` into that same field forces a read-modify-write that **races** a concurrent allocation on the same token → lost lens or lost `lastSeen`.

Instead, store liveness in a **dedicated heartbeat hash**, one field per token, value `= Date.now()` — a genuine single-field `hset` that can never collide with the participant record:

```
key:   room:{roomId}:seen        (new RoomKeys entry: `seen`)
field: <token>
value: <epoch-ms number>
```

New store fn:

```ts
// lib/store.ts — single-field hset, NO read-modify-write, throttled.
export async function touchParticipant(
  token: string,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<void> {
  // Throttle: setNX a per-token key; if we lost the race we wrote recently, skip.
  const ok = await backend.setNX(
    `${roomKeys(roomId).prefix}:touch:${token}`, // prefix-scoped, no cross-room collision
    1,
    TOUCH_THROTTLE_SECONDS, // 15s — see KV-budget fix below
  );
  if (!ok) return; // wrote within the window already
  await backend.hset<number>(roomKeys(roomId).seen, token, Date.now());
}

export async function readHeartbeats(
  roomId: string = DEFAULT_ROOM_ID,
): Promise<Record<string, number>> {
  return backend.hgetall<number>(roomKeys(roomId).seen);
}
```

Hook it in the **participant branch only** of the `/state` route (the `?token=` path, `app/api/r/[room]/state/route.ts:53`), **fire-and-forget** so it never adds latency or fails the poll:

```ts
// participant branch — fire and forget, do not await into the response path
void touchParticipant(token, room).catch(() => {});
const state = await getPublicState(token, room, "participant");
```

**Crucially:** `seen` does **NOT** go into `roomSignature` (`store.ts:822–846`) — `lastSeen` churn must never trigger an SSE re-fetch storm. Presence freshness rides the 2 s poll. It writes the `seen` hash, not `SessionState`, so **no rev bump, no anti-flash interference**.

**KV write budget [FIX: minor]:** the `setNX` throttle is itself a billable write, and an in-process `Map` throttle is per-lambda-instance under serverless fan-out (does not help across the many instances serving 50 pollers). So size the **throttle TTL to 15 s** (`TOUCH_THROTTLE_SECONDS = 15`, also doubles as the cushion under the 25 s quiet threshold). Net at 50 participants: each poll issues one `setNX` (~25/s) and ~one `hset` per token per 15 s (~3.3/s) — document this real command count; do **not** claim "costs nothing". In-memory dev/test backend: both are free, so CI is unaffected. (Future optimisation, out of scope: piggyback `lastSeen` onto existing allocate/submit writes for active participants and only heartbeat idle pollers.)

### 2) Signal compute (contract layer)

Add to `ModuleCapabilities` (`lib/modules/types.ts:93–98`) a **required** field:

```ts
gatherSource: "none" | "submissions" | "votes";
```

Making it **required** forces a new module author to consciously declare where responders live. This is a one-line edit per existing module (~26) plus a `npm run verify` typecheck sweep.

- `"submissions"` → capture, brainwrite, lightning, promptrelay, onetwofour, twentyfive10, qna, minspecs, persona, emptychair, issuemap, and any other `addSubmission` gather module.
- `"votes"` → poll, dotvote, rank, scale, matrix, wordcloud.
- `"none"` → lobby, content, media, coordinator, allocate, readaround, close, builder, display-only.

Shared helper next to `vis` / `visibleByTypes` in `registry.server.ts`:

```ts
// Named constants, commented — the two thresholds differ on purpose. [FIX: minor]
const QUIET_MS = 25_000;        // ~12–13 missed 2s polls. Config-tunable.
const TINY_ROOM = 1;            // host collapses at <=1 (host has raw access)
const PROJECTOR_FLOOR = 3;      // projector hides at <3 (public surface)

export interface ParticipationSignal {
  present: number;
  responded: number;
  typing: number;   // always 0 in MVP
  quiet: number;    // 0 when suppressed (anonymous phase / projector)
  nudgedAt?: number; // ONE central field — drives participant re-pulse (Full vision)
}

export function computeParticipationSignal(
  ctx: ModuleContext,
  gatherSource: ModuleCapabilities["gatherSource"],
  heartbeats: Record<string, number>,
  now = Date.now(),
): ParticipationSignal | null {
  if (gatherSource === "none") return null; // display-only no-ops cleanly

  const present = ctx.participants.length;
  const tokens = new Set(ctx.participants.map((p) => p.token));

  // responded = DISTINCT participant tokens with a response for THIS phase.
  // [FIX: major] exclude any token starting with "__" (markers: __nudge__,
  // __constraint__) and "__host__", AND require the token to be a real
  // participant. Then clamp <= present so we can never show "19 of 18".
  let responded = 0;
  if (gatherSource === "submissions") {
    const r = new Set(
      ctx.submissions
        .filter((s) => s.phaseId === ctx.phase.id && s.token)
        .map((s) => s.token as string)
        .filter((t) => !t.startsWith("__") && tokens.has(t)),
    );
    responded = r.size; // multiSubmit-safe: distinct tokens, not submission count
  } else {
    const votes = await ctx.store.readVotes(ctx.phase.id);
    responded = Object.keys(votes).filter(
      (t) => !t.startsWith("__") && tokens.has(t),
    ).length;
  }
  responded = Math.min(responded, present); // hard clamp — invariant guard

  // quiet = present participants whose heartbeat EXISTS and is stale.
  // Missing heartbeat = present/liveness-unknown (old sessions degrade
  // gracefully) — NEVER counted as quiet.
  let quiet = 0;
  for (const p of ctx.participants) {
    const seen = heartbeats[p.token];
    if (typeof seen === "number" && now - seen > QUIET_MS) quiet++;
  }

  return { present, responded, typing: 0, quiet };
}
```

> `computeParticipationSignal` reads votes via `ctx.store.readVotes`, so it is `async` for the votes path — make the helper `async` and `await` it in `getPublicState`.

### 3) Fold into state (role-scoped)

`PublicState` (`lib/types.ts:213`) gains a top-level field:

```ts
participation: ParticipationSignal | null;
```

In `getPublicState` (`store.ts:734–818`), after `computeView`, read heartbeats once and compute role-scoped participation:

```ts
const gatherSource = mod ? mod.capabilities.gatherSource : "none";
const heartbeats = gatherSource === "none" ? {} : await readHeartbeats(roomId);
const raw = ctx ? await computeParticipationSignal(ctx, gatherSource, heartbeats) : null;

let participation: ParticipationSignal | null = null;
if (raw) {
  // Anonymous-config phase: suppress the per-person-derivable quiet breakdown
  // to the FACILITATOR too, so they can't pair "the quiet one" with "the
  // missing answer". [FIX: major — privacy]
  const anonymous = (cfg as { anonymity?: string })?.anonymity === "anonymous";
  if (role === "participant") {
    participation = null; // participant never sees breakdowns
  } else if (role === "projector") {
    // bare present+responded, ONLY when opted in AND above the privacy floor
    const show = Boolean((cfg as { showLiveCount?: boolean })?.showLiveCount);
    participation =
      show && raw.present >= PROJECTOR_FLOOR
        ? { present: raw.present, responded: raw.responded, typing: 0, quiet: 0 }
        : null;
  } else {
    // facilitator / cohost / admin: full numbers, but no quiet on anonymous phases
    participation = anonymous
      ? { ...raw, typing: 0, quiet: 0 }
      : raw;
  }
}
```

Add `participation` to the returned object. Every gather module benefits with **zero changes to its `computeView`**.

> Note: `buildContext` always loads full `submissions` (the `[]`-for-participant scoping happens only when ctx is handed to `handleAction`), so the responded count is computable for all roles inside `getPublicState`. Participants still receive `participation: null` by the role scoping above — no leak.

### 4) Run-tab surface

Add `<ParticipationSignal>` to `lib/modules/render-kit.tsx` (reuse `Bars` fill gradient + `StatusLine` type):

```tsx
export function ParticipationSignal({
  s, onNudge, nudgeDisabled, nudgeable,
}: {
  s: { present: number; responded: number; typing: number; quiet: number };
  onNudge?: () => void;
  nudgeDisabled?: boolean;
  nudgeable?: boolean;
}) {
  if (s.present <= 1) return <StatusLine>waiting for the room</StatusLine>;
  const all = s.responded >= s.present;
  // line: "All 18 responded" | "11 of 18 responded"
  // thin fill bar: responded / present
  // sub-line (only if !anonymous, i.e. quiet present in payload): "3 gone quiet" — greyed, never red
  // Nudge button: shown when nudgeable; disabled + "everyone's in" caption when all
}
```

Render it in `HostConsole` Run tab under the phase header (`components/HostConsole.tsx` ~line 179+, near the existing `participantCount` line at 481) whenever `state.participation != null`. The `usePolledState` rev guard guarantees the count only climbs within a phase.

### 5) Nudge flow — dedicated host command, authoritative-apply, no read-back (Full vision)

The nudge is **NOT** routed through the generic `moduleAction` command — that returns only `{ ok, reason }` (`host/route.ts:269–285`): no authoritative state, no count. Add a **dedicated `nudgeRoom` command**.

Capability gating: add to `COMMAND_CAP` (`host/route.ts:54`) with **`advance`** (facilitator tier) — **deliberately NOT the admin `configure` cap** (the painful gotcha noted in memory; verified: `facilitator = ALL minus "configure"`, `auth.ts:45`).

```ts
// host/route.ts — new case
case "nudgeRoom": {
  const phaseId = String(a.phaseId ?? "");
  const written = await getState(room); // active state for navState
  const phase = resolveActiveById(written, phaseId);
  if (!phase || (phase.config as { nudgeable?: boolean }).nudgeable === false)
    return NextResponse.json({ ok: false, reason: "not nudgeable" });

  // 15s cooldown via setNX — within cooldown, calm no-op, no re-pulse.
  const fresh = await setNudgeCooldown(room, phaseId); // setNX room:{id}:nudgecd:{phaseId} 15s
  if (!fresh)
    return NextResponse.json({ ok: true, alreadyNudged: true });

  await withLock(room, "nudge:" + phaseId, async () => {
    // content-free marker — exact __constraint__ precedent (registry.server.ts:174)
    await castVote(phaseId, "__nudge__", Date.now(), room);
  });

  // not-yet-responded present count for the toast
  const nudged = await countNotResponded(room, phaseId);

  // authoritative state via the existing write-then-getFacilitatorState pattern
  const state = await navState(room, written, role ?? "facilitator");
  return NextResponse.json({ ok: true, nudged, state });
}
```

- `castVote(phaseId, "__nudge__", Date.now())` writes the marker into the **votes hash** (same namespace/precedent as `__constraint__`). Because `__nudge__` is a *new* vote field, `roomSignature`'s `Object.keys(votes).length` bumps → SSE ticks → re-pulse propagates. A second nudge within cooldown is blocked anyway, so the no-op-on-overwrite SSE behaviour is irrelevant.
- The response carries `state` (authoritative `FacilitatorState` from `navState`) so the client `apply()`s it with no KV read-back (`HostConsole.tsx:103` already does `if (d?.state) apply(d.state)`), plus `nudged` for the toast.

**Participant re-pulse — per-renderer, NOT a contract freebie [FIX: major, re-scoped]:**

The nudge must re-pulse *only* phones that have not responded. The view payload carries no `youResponded` flag, and done-state is tracked **client-side** per renderer. So:

- Surface the marker as **ONE central field**: thread `__nudge__`'s timestamp into the participant's `participation` payload as `nudgedAt` (or, since participant gets `participation: null`, surface it on the gather **view payload** — pick whichever is simpler; the central field is cleaner). Either way it is read in **one** place.
- Gate the re-pulse in **`ParticipantApp`** on its **existing client-side done state**: when `nudgedAt` is newer than the last one seen AND the local renderer is *not* in its done/CaptureDone state, soft-pulse the prompt (`useContentPulse` / `animate-pulseSoft`, ~line 326–337) and optionally chime (`useChime`, 196–222).
- This is a touch on **`ParticipantApp` + the handful of gather renderers that own a distinct done UI** (e.g. CaptureDone). It is **not** zero-change. The effort and contract docs above reflect this.

### 6) Builder config (Full vision)

Add to the gather modules' zod schemas (additive, optional — existing saved configs validate unchanged):

```ts
showLiveCount: z.boolean().optional(), // default false (privacy-first)
nudgeable: z.boolean().optional(),     // default true
```

Surface as the two calm toggles in `BuilderApp`'s gather-phase editor.

### Files to add / change

| Path | Change |
|---|---|
| `lib/types.ts` | Add `participation: ParticipationSignal \| null` to `PublicState`. Export `ParticipationSignal` interface. **No** `lastSeen` on `Participant` (heartbeat is a separate hash). |
| `lib/modules/types.ts` | Add required `gatherSource: "none" \| "submissions" \| "votes"` to `ModuleCapabilities`. |
| `lib/store.ts` | New `RoomKeys.seen`; `touchParticipant` (single-field hset + 15 s `setNX` throttle); `readHeartbeats`; fold role-scoped `participation` into `getPublicState`; **exclude `seen` from `roomSignature`**; helper(s) `setNudgeCooldown`, `countNotResponded` (or inline in host route). |
| `lib/modules/registry.server.ts` | Add `computeParticipationSignal` + `QUIET_MS`/`TINY_ROOM`/`PROJECTOR_FLOOR` constants; set `gatherSource` on **every** module's `capabilities` (sweep). |
| `app/api/r/[room]/state/route.ts` | Fire `touchParticipant(token, room)` fire-and-forget in the participant `?token=` branch only. |
| `app/api/r/[room]/host/route.ts` | Add `nudgeRoom` command + `COMMAND_CAP.nudgeRoom = "advance"`; cooldown/lock/castVote/`navState` authoritative-apply + `nudged` count. |
| `lib/modules/render-kit.tsx` | Add `<ParticipationSignal>` primitive (reuse `Bars` + `StatusLine`). |
| `components/HostConsole.tsx` | Render `<ParticipationSignal>` on Run tab under phase header; wire Nudge → `cmd("nudgeRoom",{phaseId})`; transient toast from response. |
| `components/ParticipantApp.tsx` | On gather phase, re-pulse prompt on new `nudgedAt` only when not in local done-state; optional chime. |
| `components/ProjectorApp.tsx` | Render bare "N of M" when `state.participation != null` (projector only gets it at `showLiveCount && present>=3`). |
| `components/BuilderApp.tsx` | Two toggles: `showLiveCount` (default off), `nudgeable` (default on). |
| `test/participation.test.ts` (new) | Vitest coverage (see Test plan). |

### Data model summary

- **Heartbeat:** `room:{id}:seen` hash, field `<token>` → epoch-ms. Written only by `touchParticipant` (single-field hset). Throttle key `room:{id}:touch:{token}` (`setNX`, 15 s TTL). **Never in `roomSignature`.**
- **`PublicState.participation`:** `ParticipationSignal | null`, role-scoped, derived (never stored).
- **Responders:** derived from `Submission.token` (distinct, multiSubmit-safe) or vote-field keys — both already persisted. Filtered: no `__`-prefixed tokens, must be a real participant, clamped `<= present`.
- **Nudge marker:** `__nudge__` field in the existing votes hash, value `Date.now()` (content-free, `__constraint__` precedent).
- **Nudge cooldown:** `room:{id}:nudgecd:{phaseId}` (`setNX`, 15 s TTL).
- All keys room-prefixed (`roomKeys` convention) → no cross-room collision. All inherit 24 h TTL + End-session wipe. **No durable-DB change.**

### Rev / authoritative-apply use (no KV read-back)

- Heartbeat writes the `seen` hash, **not** `SessionState` → **no rev bump**, no anti-flash interference; presence rides the 2 s poll.
- `nudgeRoom` returns authoritative `navState(room, written, role)` (write-then-`getFacilitatorState`, `host/route.ts:39–48`) — **no read-back**; client `apply()`s it.
- "Numbers only climb within a phase" holds **because** responded is clamped `<= present` and markers are excluded (without this, responded could exceed present and the rev guard would not protect the within-rev count).

---

## Implementation plan (ordered, checkable)

**Slice 1 — presence plumbing (~1.5d)**
1. [ ] `lib/types.ts`: add `ParticipationSignal` interface + `PublicState.participation`.
2. [ ] `lib/modules/types.ts`: add required `gatherSource` to `ModuleCapabilities`.
3. [ ] `lib/store.ts`: add `RoomKeys.seen`; `touchParticipant` (single-field hset + 15 s `setNX` throttle); `readHeartbeats`.
4. [ ] `app/api/r/[room]/state/route.ts`: fire-and-forget `touchParticipant` in the `?token=` branch.
5. [ ] `lib/modules/registry.server.ts`: add `computeParticipationSignal` + constants; set `gatherSource` on **every** module (sweep).
6. [ ] `lib/store.ts` `getPublicState`: fold role-scoped `participation`; ensure `roomSignature` excludes `seen`.
7. [ ] Vitest: distinct-token counting, marker exclusion, clamp, backfill, role scoping, projector floor, anonymous suppression. `npm run verify`.

**Slice 2 — Run-tab read-only signal (~1d)**
8. [ ] `render-kit.tsx`: `<ParticipationSignal>` primitive (Bars + StatusLine; tiny-room + all-responded collapse states).
9. [ ] `HostConsole.tsx`: render under phase header when `state.participation != null`. No nudge yet. `npm run verify` + build. **Ship MVP.**

**Slice 3 — nudge + builder toggles (~1.5d)**
10. [ ] `host/route.ts`: `nudgeRoom` command + `COMMAND_CAP` (`advance`); cooldown/lock/castVote/`navState`/`nudged`.
11. [ ] gather schemas: `showLiveCount`/`nudgeable` optional fields; `BuilderApp` toggles.
12. [ ] `ParticipantApp.tsx`: surface central `nudgedAt`; re-pulse only when not in local done-state; optional chime.
13. [ ] `HostConsole.tsx`: wire Nudge button + toast; disable when all responded / not nudgeable.
14. [ ] Vitest: cooldown, capability gating, `nudged` count, not-nudgeable rejection.

**Slice 4 — projector + polish (~0.5d)**
15. [ ] `ProjectorApp.tsx`: bare "N of M" when participation present.
16. [ ] `npm run verify` (typecheck + lint + test) + build on Node 24.

---

## Acceptance criteria (facilitator-outcome framed, testable)

1. **Reads the room without speaking:** On any gather phase the Run tab shows "N of M responded" + fill bar; N is the distinct count of participants who responded for *that* phase and **never exceeds M**.
2. **Climbs only:** Within a single phase the responded count never decreases on screen (rev guard + clamp), even under eventually-consistent reads.
3. **Honest presence:** A participant who closed their phone >25 s ago is reflected in "gone quiet"; a participant whose heartbeat is unknown (old session) is counted **present, not quiet**.
4. **No empty shell:** On non-gather phases (content/coordinator/lobby/media/readaround/close) the signal is absent, not a "0 of N" box.
5. **Tiny room is calm:** With `present <= 1` the host sees "waiting for the room", not "0 of 1".
6. **Nudge hits only the right phones (Full vision):** Tapping "Nudge the room" re-pulses only phones that have **not** responded; already-answered phones do nothing; toast reports the correct not-responded count.
7. **No nudge spam:** A second tap within 15 s returns "already nudged" and re-pulses nothing.
8. **Privacy floor holds:** The projector shows a count only when `showLiveCount` is on **and** `present >= 3`; never below.
9. **Anonymous phases protected:** On an `anonymity: "anonymous"` phase the facilitator sees present + responded but **no per-person quiet** breakdown.
10. **No content, ever:** No surface (host/projector/participant) exposes any submission text or attributes any response to a named person.
11. **Capability:** Nudge works for a **facilitator**-tier passcode and does **not** require the admin `configure` cap.

---

## Test plan

### Vitest (`test/participation.test.ts` — in-memory store, no KV/AI)

- **Distinct-token responded (submissions):** 18 participants, one submits 3× (multiSubmit) → responded counts that token **once**.
- **Marker exclusion (votes):** votes hash contains `__constraint__`, `__nudge__`, `__host__` + 4 real participant tokens → responded === 4.
- **Clamp `responded <= present`:** seed a stray vote/submission whose token is not a participant → excluded; responded never exceeds present (no "19 of 18").
- **Backfill / missing heartbeat:** participants with no `seen` entry → counted present, `quiet === 0`.
- **Quiet threshold:** heartbeat `now - 26_000` → quiet; `now - 10_000` → not quiet.
- **Role scoping:** participant → `participation === null`; facilitator → full; projector with `showLiveCount` true & present>=3 → `{present,responded}` only (quiet 0); projector with present<3 → null; projector with `showLiveCount` false → null.
- **Anonymous suppression:** facilitator on anonymous phase → quiet === 0 (present+responded only).
- **gatherSource "none":** display-only module → `participation === null`.
- **Nudge cooldown:** first `nudgeRoom` succeeds (`nudged` correct); immediate second → `alreadyNudged: true`, no new marker write semantics that re-pulse.
- **Nudge capability:** facilitator code succeeds; cohost per `COMMAND_CAP` (`advance`) succeeds; a code lacking `advance` is rejected. Confirm `configure` is **not** required.
- **Not nudgeable:** phase with `nudgeable: false` → `{ ok: false }`.
- **`roomSignature` stability:** writing a heartbeat does **not** change `roomSignature`; casting `__nudge__` **does** (new vote field).

### Manual QA

- **Desktop host:** Run a Capture phase with 3 phones. Watch the count climb 1→2→3, bar fill, "All 3 responded", nudge disabled "everyone's in".
- **Mobile (participant):** Don't answer on one phone; confirm "gone quiet" appears on host after ~25 s. Tap Nudge → that phone soft-pulses + chimes; the two answered phones do nothing. Mid-typing-but-unsubmitted phone: confirm the pulse is gentle and non-disruptive.
- **Projector:** With `showLiveCount` on and 3+ present, confirm bare "N of M", no bars/names. With 2 present, confirm nothing shows. With toggle off, nothing shows.
- **Backgrounded tab:** Background a participant tab for ~20 s then foreground — confirm it does **not** flap to "quiet" and back falsely within the threshold cushion.
- **Capability:** Log in as facilitator (not admin) and confirm nudge works (no `configure` block).
- **Eventually-consistent sanity:** Advance phases rapidly; confirm responded never shows a number from the previous phase (clamp + rev guard).

---

## Privacy & ethos check (explicit)

This item **generalises** the existing Lobby present-count; it does **not** change the privacy ethos. Concretely:

- **Content-free:** every signal is an integer count or a `Date.now()` marker — no submission text anywhere.
- **No attribution:** no surface maps a response to a named person.
- **Role-scoped:** participants get `participation: null`; projector gets bare present+responded only when opted in **and** `present >= 3`; facilitator gets full numbers (they already see raw anonymous submissions).
- **Anonymous phases hardened [must-fix applied]:** on `anonymity: "anonymous"` phases the facilitator's **quiet** (and future typing) breakdown is suppressed — present + responded only — so they cannot pair "the quiet one" with "the missing answer". The projector floor alone is *not* relied upon for this.
- **Ephemeral:** heartbeat hash, nudge marker, throttle/cooldown keys all live under the room's 24 h TTL and are wiped by End-session. No durable DB, account-less, off-the-record contract intact.
- **No leak via SSE:** `seen` excluded from `roomSignature` → liveness never forces a re-fetch storm or leaks timing.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution in this spec |
|---|---|
| **[critical] Lost-update race** folding `lastSeen` into the Participant record (read-modify-write collides with allocate). | **Separate single-field heartbeat hash** `room:{id}:seen`; genuine single-field `hset`, no read-modify-write. `Participant` type unchanged. |
| **[major] Marker miscount** — `__nudge__`/`__constraint__`/`__host__` inflate responded; "19 of 18". | Hard, **tested** filter: exclude `__`-prefixed tokens **and** non-participant tokens, then **clamp `responded <= present`**. |
| **[major] Deanonymisation in small rooms** via facilitator quiet breakdown on anonymous phases. | On `anonymity:"anonymous"`, suppress quiet to the facilitator too (present+responded only). |
| **[major] Nudge re-pulse is not a contract freebie** (per-renderer done-state). | Surface `nudgedAt` as **one central field**; gate re-pulse on `ParticipantApp`'s existing client-side done-state — a per-renderer touch, acknowledged in effort/contract. Ship read-only signal (Slices 1–2) first; nudge is a separate scoped slice. |
| **[minor] KV write budget** optimistic; throttle is itself a write, in-memory throttle per-instance. | Size `setNX` TTL to **15 s**; document the real ~25 setNX/s + ~3 hset/s at 50 participants; do not claim "costs nothing". CI unaffected (in-memory free). |
| **[minor] Threshold drift** (tiny-room 1 vs projector floor 3). | Named constants `TINY_ROOM=1`, `PROJECTOR_FLOOR=3`, `QUIET_MS=25_000` with comments explaining why they differ (host has raw access; projector is public). |
| **Capability trap** (admin-only `configure`). | `nudgeRoom` gated at **`advance`** (facilitator tier) — verified against `auth.ts:45`. |
| **SSE storm** from heartbeat churn. | `seen` excluded from `roomSignature`; presence rides the 2 s poll. |

---

## Out of scope / future

- **`typing` breakdown** (the "4 typing" sub-line): requires a participant focus/draft heartbeat (a new focus flag on the poll or a tiny ping). Deferred to a fast-follow; MVP renders `typing: 0`. Decide P0-vs-later separately.
- **Advance-gating:** using responded to gate the host's Next button ("still 5 to go"). Leaning **informational-only** to protect calm — explicitly out of scope.
- **Lobby showing responded:** the Lobby renderer keeps its `present` count; folding responded into it is out of scope.
- **KV write optimisation:** piggybacking `lastSeen` onto existing allocate/submit writes and heartbeating only idle pollers — a future cost optimisation, not needed for correctness.
- **Skip-nudge-if-drafting:** skipping the re-pulse on phones with an active textarea draft ties to the deferred typing/focus signal; revisit with that work.
