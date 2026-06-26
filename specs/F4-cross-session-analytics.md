# F4 — Cross-session analytics for the facilitator

> **Status:** Executable build spec. Pressure-test must-fixes folded in.
> The single most important correction from design → this spec: there is **no per-facilitator scope** in Edges. `/admin` and every `/api/admin/*` route gate **only** on the instance-wide `ADMIN_PASSCODE` (`checkSuperAdmin`). Per-room `adm-…` codes do **not** open `/admin`. Therefore v1 ships as an **honest instance-level "Method usage" report across all rooms on this deployment** — no "you / your / Practice" first-person framing, no per-facilitator trend arrow. See [Risks](#risks--mitigations).

---

## Priority / effort / dependencies

- **Priority:** P2
- **Effort:** **4 days** (descoped from 7 — the builder/AI close-the-loop and the AI narrative summary are cut from v1, see [Out of scope](#out-of-scope--future)).
- **Dependency items / surfaces (by file, since this codebase has no item-id graph):**
  - `lib/rooms.ts` `archiveRoom()` — the capture point (live `FacilitatorState` + `SessionState` in hand, durable no-TTL `db`, `checkSuperAdmin`).
  - `lib/store.ts` `getState` / `getFacilitatorState` / `setPhase` / `endSession` / `withLock` / `backend.rpush`/`lrange` and `lib/session.ts` `roomKeys` — metrics source, phase-advance log, wipe.
  - `lib/types.ts` `Submission.token`, `SessionState.phases[].config.timerSeconds`, `PhaseInstance` — de-identifiable basis + planned-timer source.
  - `app/admin/page.tsx` + `app/api/admin/rooms/[slug]/route.ts` — auth/fetch-with-code pattern and the Rooms-list shell to extend with a peer tab.

---

## Problem & facilitator value

**Problem.** A master facilitator runs the same methods across dozens of rooms over weeks, but Edges gives them zero memory across sessions. Today each room ends with a single AI `SessionReport` + `RoomArchive` (`lib/rooms.ts`, key `rooms:archive:<slug>`), and `/admin` can open exactly one archive at a time. There is no view answering: *which methods land, where rooms go quiet, how long phases really run vs. plan, which templates get reused vs. abandoned mid-session, is engagement trending up.* The deep tension: Edges is deliberately **account-less and ephemeral** (24h TTL, end-session wipes, submissions never logged, off-the-record). Cross-session analytics is by definition persistent and cross-room — it cuts against the trust story that differentiates the product.

**Facilitator value (honest v1 voice — instance-level, not first-person).**
> "Across the 23 sessions archived on this deployment, **Pre-Mortem** has the highest contribution rate (87% of present participants contributed). Rooms tend to thin out around the third divergent phase. Phases using the **synthesis** module run ~40% over their planned timer. **Blue Sky** and **15% Solutions** get reused; **Six Thinking Hats** was ended before its final phase twice."

It turns gut feeling into de-identified evidence — counts, durations, and the facilitator's own labels only, **never the words anyone said** — so it can be used without breaking the off-the-record promise. It also turns the deliverables story durable: instead of a report that exists only until the next end-session, there's an exportable body of practice evidence the admin owns and can wipe on demand.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (v1 — this spec, ~4 days)

1. **Capture at archive (no UI):** `archiveRoom()` also computes a content-free `SessionMetrics` and appends it to a durable index. Defensive: a metrics failure **never** blocks archive/end-session.
2. **Phase-advance log:** additive, self-swallowing `rpush` on `setPhase`; read once at archive to derive actual elapsed-per-phase; wiped by `endSession`. Unlocks plan-vs-actual **honestly** (renders only when actuals exist).
3. **Read API + dashboard:** `GET`/`DELETE /api/admin/analytics` (super-admin gated) + a **"Method usage"** tab peer to Rooms in `/admin`, with empty / sparse (N<3) / full states, privacy banner, per-insight drill-down, Export (JSON/CSV), confirm-to-Clear.

### Full vision (later — explicitly out of v1 scope)

4. **Builder/AI close-the-loop** — inline timing chip in the builder + "YOUR HISTORY" note in `lib/design.ts`. **Blocked by auth model** (builder authenticates with a room-tier code against `/api/r/[room]/host`, which cannot call the super-admin `/api/admin/analytics`). Requires a new facilitator-capability-gated module-timing endpoint first.
5. **Per-facilitator cohort scoping** via an optional self-supplied "practice key" tagged at room creation — the only honest path to first-person "your sessions" framing.
6. **Optional AI narrative "practice summary"** over the numbers (numbers-first; clearly labeled interpretation).

---

## Experience & flows

**Surface:** `/admin` → new top-level tab **"Method usage"**, peer to **"Rooms"**, behind the same admin-code auth already present. Calm, evidence-first, muted palette, no vanity metrics, no leaderboards.

**Persistent privacy banner (verbatim copy):**
> *Built from de-identified engagement signals across rooms archived on this deployment — counts, timings, and method/label names only. No participant words are stored here. A session only appears after someone Archives it from the host console. This view shows every room visible to this admin passcode, which on a shared deployment may include more than one facilitator's rooms.*

**Screens & states:**

| State | What renders | Copy where it matters |
|---|---|---|
| **Empty** (0 archived) | Banner + empty hint | "No archived sessions yet. Archive a session from the host console to start the usage picture." |
| **Sparse** (1–2 sessions) | Banner + raw session list (room name + archived date + module count); **all aggregates suppressed** | "Need 3+ archived sessions to spot patterns." |
| **Full** (N≥3) | Headline strip → Method engagement table → Phase drop-off → Plan-vs-actual (only if any actuals) → Reuse / ended-early; each block has a "from N sessions" affordance | See below |
| **Drill-down** | Tapping any aggregate expands to the contributing session list (room name + archived date) | "Drawn from: cedar-3f2a (12 Jun), pine-8b10 (14 Jun)…" |
| **AI-off** | Identical — all numbers work with no `ANTHROPIC_API_KEY` (no AI in v1 at all) | — |
| **Clear confirm** | Mirrors end-session wipe affordance | "Clear all usage history? This deletes every stored metric on this deployment and cannot be undone. Archived reports are unaffected." |

**Honesty guards in copy (enforced):**
- Method-engagement rate labeled **"contributors ÷ participants present at archive"** (not "of joiners"), because the denominator is churn-biased (see must-fix #5).
- Sessions that didn't reach their last phase are labeled **"ended before the final phase"**, never "abandoned" or "failed".
- A method run only in tiny rooms (e.g. all runs <4 participants present) is **suppressed** from the ranking with a "too few participants to rank" note.
- A phase with `contributorCount === null` (no tokens captured, e.g. word-cloud-only) is **excluded** from rate aggregates, never reported as 0%.

---

## Architecture

### Files to add

| Path | Purpose |
|---|---|
| `lib/analytics.ts` | Type defs (`SessionMetrics`, `PhaseMetric`, `PracticeRollup`); `buildSessionMetrics()` (de-identifies **at write time**); persistence (`saveMetrics`, `listAllMetrics`, `clearAllMetrics`) on the same durable no-TTL backend pattern as `lib/rooms.ts`; pure aggregation `computePractice()`. **No AI, no participant text.** |
| `app/api/admin/analytics/route.ts` | `GET` → `{ metrics, practice }`; `DELETE` → wipe. `checkSuperAdmin`-gated, `runtime="nodejs"`, `dynamic="force-dynamic"`. |
| `components/admin/MethodUsageView.tsx` | The dashboard component (banner, empty/sparse/full, drill-down, Export JSON/CSV, confirm-Clear). Reuses the `/admin` fetch-with-code pattern. |
| `test/analytics.test.ts` | Vitest (in-memory store): de-id, append-only, N<3 suppression, null-contributor exclusion, plan-vs-actual gating, concurrent-archive race, clear wipe. |

### Files to change

| Path | Change |
|---|---|
| `lib/session.ts` | Add `phaseLog: string` to `RoomKeys` + `roomKeys()` → `` `${base}:phaselog:list` ``. Room-scoped, TTL/wipe-managed like every ephemeral key. |
| `lib/store.ts` | (a) `setPhase()`: **before** computing the new state, append `{ phaseId: <previous active phaseId>, at: Date.now() }` to `phaseLog` via `backend.rpush`, wrapped in `try/catch` that **swallows its own error** (a KV blip must never reject advancing the room). It does **not** alter the returned authoritative `SessionState`. (b) Add `readPhaseLog(roomId)` (`lrange`). (c) `endSession()`: add `KEYS.phaseLog` to the `backend.del(...)` wipe list. |
| `lib/rooms.ts` | In `archiveRoom()`, after building `RoomArchive` (it already holds `fs`): also fetch `state = await getState(slug)` (for `state.phases[].config.timerSeconds`) and `phaseLog = await readPhaseLog(slug)`, call `buildSessionMetrics({ slug, room, fs, state, phaseLog })` → `saveMetrics(...)`, **wrapped in `try/catch`** logged but never thrown (same defensive posture as the AI report — a metrics failure must not block archive). One-way import `rooms → analytics`; `analytics` imports only types + the durable backend helper. |
| `app/admin/page.tsx` | Add a top-level `tab: "rooms" | "usage"` toggle inside `Admin()` (same auth/code flow). `"usage"` mounts `<MethodUsageView code={code} />`. No change to room CRUD / `RoomCard`. |
| `lib/types.ts` | Add `export interface PhaseAdvance { phaseId: string; at: number }`. (Richer `SessionMetrics` types live in `lib/analytics.ts` to keep the type-only module boundary clean.) |

> **`lib/rooms.ts` ↔ `lib/store.ts` import note:** `lib/rooms.ts` already imports `getFacilitatorState` from `./store`; add `getState` and `readPhaseLog` to that same import. `lib/analytics.ts` must **not** import `lib/rooms.ts` (one-way) and must **not** import the store's *session* layer — it receives all live data as plain arguments and only owns the **durable analytics keys** via its own tiny `DurableBackend` (copy the `db` block from `lib/rooms.ts`; in dev it shares the same `globalThis.__edgesRoomsMem` map so KV-vs-memory parity is automatic).

### Data model

**New DURABLE keys (no TTL), via the analytics module's own `DurableBackend` (KV in prod, shared in-mem map in dev):**

```
analytics:index            -> append-only LIST of { slug: string; archivedAt: number }
                              (written with backend.rpush — two concurrent archives
                               never collide; keep-last-200 trim done LAZILY on read,
                               never as a write-time read-modify-write)
analytics:metrics:<slug>:<archivedAt>  -> SessionMetrics   (one immutable event per
                              archive; reusing a slug appends a NEW key, never clobbers)
```

> The index is a **list, not a JSON array**, specifically to dodge the unguarded read-modify-write race the pressure-test flagged (must-fix #4). `rpush` is already exposed and concurrency-safe. The keep-last-200 cap is applied on **read** (and stale `analytics:metrics:*` keys for trimmed entries are `del`'d there, behind a `withLock("analytics","trim")` so two readers don't double-trim).

**`SessionMetrics` (CONTENT-FREE — computed at write time in `archiveRoom`):**

```ts
// lib/analytics.ts
export interface PhaseMetric {
  id: string;
  moduleId: string;
  label: string;                       // facilitator-authored, fine to keep
  plannedTimerSeconds: number | null;  // state.phases[i].config.timerSeconds, defensively read
  actualElapsedSeconds: number | null; // derived from phaseLog; null when underivable
  submissionCount: number;             // counts only
  voteCount: number;
  wordCount: number;
}

export interface SessionMetrics {
  slug: string;
  sessionName: string | null;          // fs.modeName / state.sessionName (facilitator's label)
  templateId: string | null;           // room.templateId
  mode: string | null;                 // ModeId
  archivedAt: number;
  participantCount: number;            // = fs.participantCount = participants PRESENT at archive
  contributorCount: number | null;     // unique Submission.token count; null if zero tokens present
  reachedFinalPhase: boolean;          // false => "ended before the final phase"
  phases: PhaseMetric[];
}
```

**De-identification (the linchpin — corrected per must-fix #3):**
`store.addSubmission` **always** persists `token`, even for `anonymity: "anonymous"` phases (anonymity only governs whether the *handle* is shown to peers; the token powers the private "your contributions" recap and is never shown to others). So `distinctContributors` is **always computable**. `buildSessionMetrics` builds a `Set` of unique tokens (via `Array.from(set).length` — **no Set spread / no `.entries()`**, per the downlevelIteration convention) and **collapses it to a single integer (`contributorCount`) before the object is constructed**. **No token, handle, or participant word ever enters `SessionMetrics`.** `contributorCount` is `null` only when a session genuinely captured zero tokens (e.g. a word-cloud-only session), and such sessions are excluded from contribution-rate aggregates.

**Planned timer read (must-fix #6):**
```ts
const c = phaseInstance.config as Record<string, unknown> | undefined;
const plannedTimerSeconds = typeof c?.timerSeconds === "number" ? c.timerSeconds : null;
```
Plan-vs-actual **skips** any phase where planned **or** actual is `null` (never coerce to 0 — a 0-planned phase would show infinite overrun).

**Actual elapsed (must-fix #6, final-phase caveat):**
`phaseLog` is a sequence of `{ phaseId, at }` advance events. `actualElapsedSeconds` for a logged phase = `nextEvent.at - thisEvent.at`. The **final phase has no closing advance**, so use `archivedAt` as its implicit close **only if** the final phase appears as the last `phaseLog` entry; otherwise the final phase's actual is `null` and it's excluded from plan-vs-actual. Under eventual consistency the `phaseLog` read may miss a just-written advance — treat all actuals as **best-effort**, degrade missing segments to `null` rather than rendering a wrong duration.

**New EPHEMERAL key (room-scoped, 24h TTL, wiped by `endSession`):**
```
room:<roomId>:phaselog:list -> LIST of { phaseId, at }   (advance timestamps)
```

**Aggregation outputs (`PracticeRollup`, in-memory only, computed on read):**
```ts
export interface PracticeRollup {
  sessionCount: number;
  enoughForAggregates: boolean;        // sessionCount >= 3
  headline: { sessions: number; medianContributionRate: number | null; trend: "up" | "flat" | "down" | null };
  methodEngagement: { moduleId: string; runs: number; medianContributionRate: number; suppressed: boolean; sessions: { slug: string; archivedAt: number }[] }[];
  phaseDropoff: { position: number; medianSubmissions: number }[];
  planVsActual: { moduleId: string; runs: number; medianOverrunSeconds: number; sessions: { slug: string; archivedAt: number }[] }[]; // empty when no actuals
  reuse: { templateOrModule: string; runs: number; endedEarlyCount: number; sessions: { slug: string; archivedAt: number }[] }[];
}
```

### API + host commands (+ capability gating)

- **`GET /api/admin/analytics?code=ADMIN`** → `{ metrics: SessionMetrics[]; practice: PracticeRollup }` | `403`. `checkSuperAdmin`-gated (identical to `/api/admin/rooms/[slug]`). `force-dynamic`, `nodejs`. JSON export uses this payload directly; CSV is flattened client-side in `MethodUsageView`.
- **`DELETE /api/admin/analytics?code=ADMIN`** → wipes `analytics:index` + every `analytics:metrics:*` (cross-session equivalent of end-session). `checkSuperAdmin`-gated.
- **Host route (`app/api/r/[room]/host/route.ts`): NO new command, NO `COMMAND_CAP` change.** Capture piggybacks on the **existing `archive` case** (capability `"end"`), which already calls `archiveRoom()` + `endSession()` and returns `{ ok, archive }`.
- **`setPhase` host command:** unchanged at the API surface. Only the underlying `store.setPhase` gains the additive, self-swallowing `rpush`.

### Rev / authoritative-apply pattern (no KV read-back)

- **No read-back is introduced.** Metrics are computed from the **in-hand** `FacilitatorState` + `SessionState` at archive time and written to a separate durable path; the dashboard reads that durable path with **no dependence on read-after-write** of any just-written state.
- The `archive` case already returns `{ ok, archive }` (not `navState`), so the rev / authoritative-apply contract is untouched.
- The only hot-path change — the `setPhase` `phaseLog` `rpush` — is **purely additive**, runs **before** `writeState`, does **not** alter the authoritative `SessionState` returned via `navState`, and its failure is swallowed. The `/state` poll and the strictly-increasing `rev` are unaffected.

---

## Implementation plan (ordered, checkable)

**Stage 1 — Capture + storage (no UI).** Each step independently `npm run verify`-able.
- [ ] Add `PhaseAdvance` to `lib/types.ts`.
- [ ] Create `lib/analytics.ts`: copy the `DurableBackend`/`db` block from `lib/rooms.ts`; define `SessionMetrics`/`PhaseMetric`/`PracticeRollup`; implement `buildSessionMetrics(args)` (de-id at write time, `Array.from(set).length`, defensive `timerSeconds`), `saveMetrics` (`rpush` to `analytics:index` + `set` metric key), `listAllMetrics` (read index, lazy keep-last-200 trim under `withLock`, load each metric), `clearAllMetrics`, and pure `computePractice(metrics)`.
- [ ] Wire into `lib/rooms.ts` `archiveRoom()` (after archive built): `try { saveMetrics(buildSessionMetrics({ slug, room, fs, state: await getState(slug), phaseLog: await readPhaseLog(slug) })) } catch (e) { /* log, never throw */ }`. v1 still yields valid plan-vs-actual only where actuals exist.
- [ ] `test/analytics.test.ts` (see Test plan).

**Stage 2 — Phase-advance log.**
- [ ] Add `phaseLog` to `RoomKeys` + `roomKeys()` (`lib/session.ts`).
- [ ] `setPhase` (`lib/store.ts`): self-swallowing `rpush` of the **outgoing** `phaseId` + `Date.now()` before `writeState`.
- [ ] Add `readPhaseLog(roomId)` (`lrange`).
- [ ] Add `KEYS.phaseLog` to `endSession`'s `del`.
- [ ] Verify the `/state` poll + `rev` are unperturbed (manual: advance phases, confirm screens don't flap).

**Stage 3 — Read API + dashboard.**
- [ ] `app/api/admin/analytics/route.ts` (`GET` + `DELETE`, `checkSuperAdmin`, `force-dynamic`, `nodejs`).
- [ ] `components/admin/MethodUsageView.tsx` (banner, empty/sparse/full, drill-down, Export JSON/CSV, confirm-Clear).
- [ ] Add the `"usage"` tab to `app/admin/page.tsx`.

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. After archiving **3+** sessions, the admin opens `/admin` → **Method usage** and sees a ranked method-engagement table, a phase drop-off list, and (if any advance timestamps were logged) a plan-vs-actual list — **with no participant words anywhere**.
2. With **0** archived sessions the view shows the empty hint; with **1–2** it shows the raw session list and **suppresses all aggregates** behind "Need 3+ archived sessions to spot patterns."
3. A facilitator can tap any insight and see exactly **which archived rooms (name + date)** it's drawn from — never a black box.
4. The admin can **Export** the usage data as JSON and CSV, and **Clear** all usage history behind a confirm dialog; after Clear the view returns to the empty state and archived **reports** are untouched.
5. Archiving a room whose slug was archived before **does not overwrite** the earlier metrics — both events appear.
6. A metrics-computation failure **never** prevents a room from archiving or ending.
7. A KV failure on the `setPhase` phase-log write **never** prevents advancing the room.
8. The banner truthfully states what is/isn't stored and that the scope is "every room visible to this admin passcode" — no first-person "your sessions" framing anywhere.
9. With **no `ANTHROPIC_API_KEY`**, every number renders identically (v1 has no AI).

---

## Test plan

### Vitest (`test/analytics.test.ts`, in-memory store, no KV/AI)

- **De-identification:** build a `FacilitatorState` containing submissions whose `phaseId` config is `anonymity: "anonymous"`, each with a real `token` + `text`. Assert the serialized `SessionMetrics` contains **no** `token`, **no** `handle`, **no** submission `text` (deep-scan the JSON string), and that `contributorCount` equals the unique-token count.
- **Null contributor:** a session with zero tokens → `contributorCount === null` and it's **excluded** from `methodEngagement` rate math (not counted as 0%).
- **Append-only on reused slug:** archive `slug` twice with different `archivedAt` → two `analytics:metrics:<slug>:*` keys, both present in the index, neither clobbered.
- **N<3 suppression:** with 1 and 2 metrics, `computePractice().enoughForAggregates === false` and `methodEngagement`/`phaseDropoff`/`planVsActual` are empty.
- **Plan-vs-actual gating:** metrics with `plannedTimerSeconds` but **no** `actualElapsedSeconds` → `planVsActual === []`. With both present → median overrun computed; a phase with `plannedTimerSeconds === 0` or `null` is skipped (no infinite overrun).
- **Concurrent archive race:** fire two `saveMetrics` "simultaneously" (Promise.all on the in-memory `rpush`) → both events land in the index, neither dropped.
- **Small-N suppression:** a method run only in <4-participant rooms → `suppressed: true` in `methodEngagement`.
- **`clearAllMetrics`:** wipes `analytics:index` and every `analytics:metrics:*`; subsequent `listAllMetrics()` returns `[]`.
- **Keep-last-200:** 205 metrics → `listAllMetrics` returns 200 and trimmed metric keys are gone.

### Manual QA

- **Desktop `/admin`:** auth → toggle Rooms/Method usage; run a session end-to-end, advance through phases (logs timestamps), Archive, confirm it appears; repeat to N≥3 and confirm aggregates + drill-down; Export JSON/CSV opens/parses; Clear confirm wipes and leaves archive reports intact.
- **Mobile (`/admin` on a phone):** the dashboard is read-only admin — verify the tables/lists reflow, the banner is readable, drill-down expands, and Export/Clear buttons are reachable (no horizontal scroll trap).
- **Projector (`/r/[room]/screen`):** **no change expected** — confirm advancing phases during a live session shows no regression / flash (the `setPhase` `rpush` must be invisible to the projector and `/state` pollers).
- **No-AI:** unset `ANTHROPIC_API_KEY` → numbers identical.

---

## Privacy & ethos check (explicit)

This is the **first feature that intentionally persists data past the 24h TTL and across rooms** — a deliberate, called-out exception to the ephemeral / off-the-record contract, made safe by **four enforced constraints, all of which must hold:**

1. **De-identify at WRITE time.** `SessionMetrics` contains zero participant words and zero tokens. We **do** hold a per-submission `token` in the live store even in anonymous phases (it powers the private "your contributions" recap and is never shown to others); `buildSessionMetrics` collapses the unique-token set to a single integer **before** the object is persisted and discards the tokens. Wiped content is **never reconstructable** from analytics.
2. **Capture only on deliberate Archive** — same trigger/consent as today's `SessionReport`. Never on plain end / auto-wipe, never passively.
3. **Honest labeling, no over-claim.** A persistent banner states exactly what is/isn't stored. The view is titled **"Method usage"** and scoped to **"every room visible to this admin passcode"** — **not** "your sessions" — because there are no accounts and the super-admin passcode sees every room in the instance. The pressure-test's cross-tenant concern (one facilitator's session names/signals visible to another under a shared `ADMIN_PASSCODE`) is mitigated by (a) storing only de-identified counts + the facilitators' own labels, and (b) refusing first-person framing so nothing claims one person ran sessions they didn't.
4. **Clear-history wipe.** `DELETE /api/admin/analytics` deletes the index + every metric key — the cross-session equivalent of end-session-wipe — and is confirm-gated like `endSession`.

**Bright line:** **zero participant-authored text, ever** — including short tags (recommended product call: keep the bright line). A Vitest deep-scan asserts no token/handle/text leak.

---

## Risks & mitigations

*(Each pressure-test must-fix is resolved in the spec above; restated here for traceability.)*

| Risk (must-fix) | Resolution baked into this spec |
|---|---|
| **#1 Auth scope / over-claim (critical).** `/admin` is gated **only** by the instance-wide `ADMIN_PASSCODE`; there is no per-facilitator scope, so first-person "Practice / your sessions" framing lies and soft-leaks across facilitators on a shared instance. | **Reframed v1 as an instance-level "Method usage" report.** No "you/your/Practice", no per-facilitator trend. Per-facilitator scoping deferred to the "practice key" cohort-tag feature (out of scope). |
| **#2 Builder/AI close-the-loop broken (critical).** The builder authenticates with a room-tier code against `/api/r/[room]/host` and **cannot** call the super-admin `/api/admin/analytics` (403). | **Cut the chip + `lib/design.ts` history note from v1.** Deferred until a facilitator-capability-gated module-timing endpoint exists on the host route. |
| **#3 De-id model mis-stated (major).** `addSubmission` always stores `token`; the "anonymous → no token" premise was wrong. | Spec rewritten: we hold a token and **deliberately collapse it to an int at write time**; `contributorCount` is `null` only for genuinely token-less sessions. Vitest asserts no token/handle/text leak even for anonymous-config phases. |
| **#4 Unguarded index read-modify-write race (major).** Concurrent archives clobber the index and orphan metric keys. | `analytics:index` is an **append-only `rpush` list**; keep-last-200 trim is **lazy on read** under `withLock("analytics","trim")`. No write-time read-modify-write. |
| **#5 Biased denominator (major).** `joinedCount` doesn't exist; `participantCount` = participants **present at archive** (churn-biased, inflates long sessions). | `joinedCount` dropped from the model. Rate is labeled **"contributors ÷ participants present at archive"**; method ranking suppresses methods run only in tiny rooms; the headline rate is a **median** (less skew than a mean). A true peak/cumulative join counter is a future enhancement, not relied on in v1. |
| **#6 Hot-path safety + final-phase actual (minor).** `setPhase` `rpush` could reject advancing; final phase has no closing timestamp; `0`-planned phase shows infinite overrun. | `rpush` is `try/catch` **self-swallowing** and additive (never rejects `setPhase`). Final-phase actual uses `archivedAt` as close only when valid, else `null`. Plan-vs-actual **skips** any phase with null/0 planned or null actual. |
| **Storage growth.** Durable keys never TTL. | Soft cap **keep-last-200** trimmed lazily on read + visible **Clear** control. |
| **Eventual consistency on phaseLog read.** A just-written advance may be missed at archive time. | Actuals are **best-effort**; missing segments degrade to `null` and are excluded from plan-vs-actual rather than rendering a wrong duration. |

---

## Out of scope / future

- **Builder inline timing chip + `lib/design.ts` "YOUR HISTORY" note** — needs a facilitator-capability-gated module-timing endpoint on `/api/r/[room]/host` (the builder cannot reach the super-admin route). Most-valued "craft feedback", deferred until that endpoint exists.
- **Per-facilitator cohort scoping** via a self-supplied "practice key" tag at room creation — the only honest route to first-person "your sessions" framing in an account-less, super-admin-only world.
- **AI narrative "practice summary"** over the numbers (`lib/ai.ts`, content-free) — numbers-first; ship later, clearly labeled as interpretation, to avoid over-claiming causation.
- **True peak/cumulative join counter** (monotonic on `addParticipant`) to replace the churn-biased "present at archive" denominator for engagement ranking.
- **Postgres** (`lib/rooms.ts` reserves it for "Phase 6 — analytics/history/relational") — intentionally avoided; v1 stays on durable KV aggregates, leaving that door open.
