# H2 — Pre-flight check before going live

> Section H. Trust & reliability · Status: ready to build

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 4 days (MVP cut ≈ 2.5 days; see MVP vs Full below)
- **Depends on item ids:** none hard. Plays well alongside **B2** (room preview in builder) and **B5** (rehearsal/dry-run) which share the "is this session sound?" framing, and reuses the builder's validation that **B6** (plain-language module cards) also touches — but H2 ships independently.
- **Code dependencies (reuse, do not reinvent):**
  - `useKv` boolean — `lib/store.ts:40` (KV/Upstash persistence detection)
  - `clusterAssistAvailable()` — `lib/session.ts:11` (the real env check); re-exported as `aiAvailable` from `lib/ai.ts:11` (import from there, but the source of truth is session.ts)
  - `BLOB_READ_WRITE_TOKEN` guard pattern — `app/api/admin/upload/route.ts:15`, `app/api/r/[room]/upload/route.ts:31`
  - `validateConfig` + `LONG_TEXT` regex — `components/BuilderApp.tsx:143` / `:94`
  - `sourceNeed` dependency logic — `lib/design.ts:22` (currently private; export a thin helper)
  - `getFacilitatorState` / `getPublicState` / `resolvePhases` — `lib/store.ts:734`–`874`
  - `navState` authoritative path — `app/api/r/[room]/host/route.ts:39`
  - `usePolledState.apply/refresh` + rev guard — `components/usePolledState.ts:78`
  - `Panel` / `StickyAction` render-kit, `SessionHeader` / `setTab` — `lib/modules/render-kit.tsx`, `components/HostConsole.tsx:451`/`:184`

## Problem & facilitator value (facilitator's voice)

> "My worst moment is finding a fault *after* the room has arrived. The AI key wasn't set, so my synthesis phase died mid-session in front of thirty people. The store had quietly fallen back to in-memory, so everyone's submissions vanished on the next cold start — and the off-the-record promise I made them was suddenly a lie. The slide phase pointed at an image I never uploaded. The projector behind me was dark and I didn't know. My capture phase shipped an empty `""` prompt to thirty phones.
>
> Every one of those was knowable *before* we started — but it was scattered across server logs I can't see, and a builder check that's lost the moment I launch from a template. I'm not technical. I don't know what `BLOB_READ_WRITE_TOKEN` is. I want one calm glance, while the room is still empty, that tells me **am I safe to go live** — in words I understand: *'Your slide phase needs an image — none uploaded yet'*, *'The projector hasn't connected — open the screen link.'* And I only want to see what *this* session actually needs — don't scare me with infra rows for AI when I'm running three plain discussions."

**Value:** converts five "find out the hard way, mid-session" failures into one quiet pre-flight glance done while the room is empty. It protects the trust story by catching the in-memory-fallback case that would silently break persistence + the 24h-TTL promise. It speaks only to what *this* session needs — a no-AI/no-media/all-discussion session shows all-green with zero infra noise; a synthesis+media+persona session shows exactly the three dependencies it relies on.

## MVP cut (thinnest shippable) and Full vision

**MVP (highest value, no new storage, no new auth surface):**
1. `lib/preflight.ts` pure engine + the lifted `validatePhaseConfig`/`LONG_TEXT` helper.
2. Infra checks: **KV persistence blocker** (the in-memory-fallback case) + AI-phase **warning** + media/blob **warning**.
3. Per-phase **missing-input blocker** (empty required prompt) + **dependency blocker** (`sourcePhaseId` points at a missing/later phase).
4. `readiness` payload layered onto `FacilitatorState`; pill + sheet in `SessionHeader`.
5. Neutral "0 joined / N joined" row.

The MVP catches the two highest-stakes blockers (silent persistence loss; empty prompt shipped to phones) with **zero new storage and zero new auth surface**. It is the thinnest cut that delivers the core "am I safe?" answer.

**Full vision (fast-follow, the only piece needing new storage):**
- Projector heartbeat (`projector:lastSeen` meta field) → the live "Projector not connected / connected / connection lost" row. This is the only piece introducing a new room key + a new write path + new (un)auth reasoning, so it lands second once the pure-engine path is proven.
- `usesAi` made a **declarative** `ModuleCapabilities` field (vs. an inferred id-set) + the guard test.
- Deep-link remedies ("Fix in builder", "Open screen link", "Go to Content") with cohost capability-gating.

## Experience & flows

### The pill (in `SessionHeader`, visible on every host tab)
A small status pill next to the phase stepper:
- **Green dot · "Ready"** — all checks pass.
- **Amber dot · "1 to check"** (plural "N to check") — only soft warnings exist.
- **Red dot · "2 to fix"** (plural "N to fix") — at least one blocker.

Calm, monochrome with the single accent. No percentage scores, no klaxons. The pill re-computes every 2s off `state.readiness`, so an amber/red dot draws the eye while the room is still empty.

### The sheet (tap the pill)
A **panel**, not a trapping modal — built from the existing `Panel` / `StickyAction` kit. A single scrollable list of check rows in two groups:
- **"This session needs"** — dependency checks derived from the actual phases (AI, media/blob, per-phase input, dependency).
- **"Room & connection"** — infra (storage) + projector + the neutral "joined" row.

Rows sort **blocker → warning → pass**. Passes collapse to a quiet "All clear here" summary that expands on tap. Each row is one line: icon (check / warning-triangle / x) + plain-language title + optional one-tap remedy + optional **"What this means"** expander.

Footer `StickyAction`: a **"Re-check"** manual refresh (calls `refresh()`) + a status summary line.

### Copy that matters
| State | Title | Detail / "What this means" |
|---|---|---|
| Storage blocker (prod) | **"Storage isn't saving (using temporary memory)"** | "Submissions will be lost on the next restart and the off-the-record / 24-hour promise won't hold. An admin needs to set the storage keys in the host settings and redeploy." |
| AI warning | **"AI phases will fall back to manual"** | "This session has an AI step, but no AI key is set. The step still runs — you'll guide it yourself instead of the AI drafting it." |
| Blob warning | **"Uploads are off — set the image before this phase"** | "Your media phase has no image yet and uploads are disabled. Add the asset before you reach this phase." |
| Empty input blocker | **"Phase 3 'Capture' has no prompt"** | "An empty prompt would be sent to everyone's phones. Add the prompt." Remedy: **Fix in builder**. |
| Dependency blocker | **"Phase 4 'Synthesis' reads a step that isn't there yet"** | "It points at an earlier phase that's missing or comes later." Remedy: **Fix in builder**. |
| Projector not connected | **"Projector hasn't connected"** | "Open the screen link on the projector laptop." Remedy: **Open screen link**. |
| Projector connected | **"Projector connected"** | (pass, collapses) |
| Projector lost | **"Projector connection lost"** | "It connected earlier but hasn't been seen for a while — the laptop may have slept." |
| Neutral joined | **"Waiting for the room — 0 joined"** / **"3 joined"** | (info, never a warning) |
| All clear | **"You're clear to go live."** | Sheet echoes the room's join + screen links for a last sanity check. |
| Empty session | **"No phases yet — build or pick a template first"** | Remedy: link to the Run tab's mode/template picker (reuses `ModeSelector`). |

### Key flows
1. **Open** — facilitator opens `/r/[room]/host` before participants arrive → pill computed from current state → amber/red draws the eye.
2. **Review** — tap pill → sheet lists only checks relevant to *this* session's phases (AI row appears only because a synthesis phase exists) + universal infra rows → blockers on top.
3. **Remedy a missing input** — `Phase 3 "Capture" has no prompt` → tap **Fix in builder** → deep-links to the build surface / phase config → type the prompt → return → row clears on next 2s poll.
4. **Remedy projector** — `Projector not connected` (amber) → tap **Open screen link** (copies/opens `/r/[room]/screen`) → projector loads, its first poll records the heartbeat → within ~2s the row flips green.
5. **Remedy infra** — `Storage isn't saving` (red) → expand **What this means** → admin sets KV/Upstash env in Vercel + redeploys; until then the blocker stays red so it can't be mistaken for safe.
6. **Go live confident** — all rows green → pill reads "Ready" → footer "You're clear — start when the room's in" → advance the first phase from the Run tab as normal.

### Screens & states
- Pill: green/amber/red, visible to facilitator + admin + cohost. Cohost sees it (reassuring) but `configure`-gated remedies render **disabled** with an "Ask the facilitator/admin" hint.
- Sheet — populated (two groups, sorted, collapsible passes, footer Re-check).
- Sheet — all-clear (single calm green panel + echoed links).
- Check row — three states (pass/warning/blocker) + optional expander + optional remedy.
- Empty-session — single "No phases yet" row.
- Projector live transitions: not-connected (amber) → connected (green) → connection-lost (amber).

## Architecture

### Approach
Pre-flight is a **pure, synchronous, content-free** readiness computation layered onto the existing facilitator state path and surfaced as a pill+sheet. No new polling loop, no KV read-back, no durable submission storage, no AI. It rides the **2s poll backstop** and the **`navState` authoritative-apply** path that already exist.

### Files to add
| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/preflight.ts` | Pure engine. Exports `Severity`, `ReadinessCheck`, `Readiness` types; `validatePhaseConfig(moduleId, config)` (zod safeParse **+** the `LONG_TEXT` empty-text heuristic, lifted from BuilderApp); and `computeReadiness(input)` taking **only** already-fetched inputs and returning the ordered check list. No store/AI/env reads inside. |
| `/Users/jordan/workshop/edges-v2/components/PreflightPanel.tsx` | Client UI: `PreflightPill` (reads `state.readiness`) and `PreflightSheet` (grouped rows, Panel+StickyAction kit, blocker→warning→pass sort, collapsible passes, "What this means" expander, remedy buttons calling `setTab`/copy-link, cohost-gated disabled `configure` remedies). Pure render off `FacilitatorState`; no new fetch. |
| `/Users/jordan/workshop/edges-v2/test/preflight.test.ts` | Vitest over the in-memory store + a direct unit of `computeReadiness` with an injected clock. |

### Files to change
| Path | Change |
|---|---|
| `lib/types.ts` | Add `Severity`, `ReadinessCheck`, `Readiness` (see Data model). Add `readiness: Readiness` to `FacilitatorState` (after `allContent:259`). Keep it **facilitator-only** — do not add to `PublicState`. |
| `lib/modules/types.ts` | Add **`usesAi?: boolean`** (optional, default-false) to `ModuleCapabilities:93`. Optional avoids a 26-file breaking change; a guard test (below) closes the silent-regression gap. |
| `lib/modules/defs/{needs,promptrelay,emptychair,persona,devil,synthesis,builder,issuemap,friction}.server.ts` | Set `usesAi: true` in the `capabilities` block of the **9** modules that call `aiAvailable`/`clusterAssist`. Others omit it (defaults false). |
| `lib/design.ts` | Export a small pure helper `phaseSourceNeed(moduleId)` wrapping the existing private `sourceNeed:22` so preflight shares the exact dependency definition (no drift). |
| `lib/session.ts` | Add a `meta` key to `RoomKeys`/`roomKeys` (`room:{id}:meta:hash`) for the projector lastSeen field. One line in the factory + interface. |
| `lib/store.ts` | Add `recordProjectorSeen(roomId)` (single `backend.hset` of `lastSeen` into the meta hash, TTL-bumped) and `getProjectorLastSeen(roomId)`. In `getFacilitatorState:863`: **fold** the `projectorLastSeen` read into the existing `Promise.all` (no serial round-trip); build env booleans (`useKv`, `aiAvailable()`, `Boolean(BLOB token)`); call `computeReadiness({ phases: resolvePhases(written ?? state), env, participantCount: participants.length, projectorLastSeen, now: Date.now(), isProd: process.env.NODE_ENV === 'production' })`; return `{ ...pub, submissions, participants, allContent, readiness }`. |
| `app/api/r/[room]/state/route.ts` | In the `wantProjector` branch (`:47`): fire `recordProjectorSeen(room)` (void, error-swallowed) **only when the resolved session has at least one `projectable` phase** (skip the hset+expire otherwise), with a ~5s write-throttle (skip if `lastSeen` younger than 5s). No change to participant/facilitator branches. |
| `components/HostConsole.tsx` | Lift sheet-open `useState` into `HostConsole`; in `SessionHeader:451` render `<PreflightPill state={s} role={role} onOpen={…} />` next to the phase label, and render `<PreflightSheet … onRemedy={(tab) => setTab(tab)} />` below the header across all tabs. No host-command changes for the read path. |
| `components/BuilderApp.tsx` | Replace inline `validateConfig` (`:143`) + `LONG_TEXT` (`:94`) with imports from `lib/preflight.ts` so builder and preflight share one definition of "missing input". Behavior-preserving (parity test required). |

### Data model (types / zod / store keys / view shapes)
No new durable submission storage and no privacy regression. **One** new content-free signal.

```ts
// lib/types.ts
export type Severity = 'blocker' | 'warning' | 'pass' | 'info';

export interface ReadinessCheck {
  id: string;                       // stable, e.g. 'infra.kv', 'phase.<id>.input'
  group: 'session' | 'connection';  // -> the two sheet groups
  severity: Severity;
  title: string;                    // plain-language one-liner
  detail?: string;                  // "What this means" expander body
  remedy?: {
    kind: 'tab' | 'link' | 'copy';
    tab?: Tab;                      // deep-link target tab (e.g. 'content','run')
    href?: string;                  // e.g. /r/[room]/screen
    needsConfigure?: boolean;       // true => cohost sees it disabled
  };
}

export interface Readiness {
  overall: Severity;                // worst of: blocker > warning > pass
  blockers: number;
  warnings: number;
  checks: ReadinessCheck[];         // pre-sorted blocker -> warning -> pass/info
}

// FacilitatorState gains (after allContent): readiness: Readiness;
```

```ts
// lib/modules/types.ts — ModuleCapabilities
usesAi?: boolean; // optional, default false; declarative AI dependency
```

**Store keys:** one new room meta hash `room:{roomId}:meta:hash` with a single field `lastSeen` (unix ms). Written via `backend.hset` which TTL-bumps to 24h, so it auto-wipes with the room and via End-session. No identity, no count, content-free.

**`computeReadiness` signature (pure — every input passed in):**
```ts
function computeReadiness(input: {
  phases: PhaseInstance[];
  env: { useKv: boolean; aiAvailable: boolean; blobToken: boolean };
  participantCount: number;
  projectorLastSeen: number | null;
  now: number;        // injected — keeps the fn pure & the 'lost' age testable
  isProd: boolean;    // NODE_ENV === 'production'
}): Readiness
```

**Check rules:**
- **Infra / KV:** `env.useKv === false` → **blocker** in prod (`isProd`); when `!isProd` → quiet **info** row ("Using temporary memory — expected in local dev"). Never cry wolf in dev.
- **AI:** only if any phase's module has `capabilities.usesAi`. If present and `!env.aiAvailable` → **warning** ("AI phases fall back to manual"). Never a blocker.
- **Media/blob:** only if a media phase exists. **pass** if its deck/asset id/url is already set (hosted, even with no token); **warning** if asset missing **and** `!env.blobToken`.
- **Per-phase input:** re-run `validatePhaseConfig` (zod safeParse **+** `LONG_TEXT` empty-text heuristic — load-bearing because prompt fields are `z.string()` with no `.min(1)`) per `PhaseInstance`. Empty required text → **blocker**.
- **Dependency:** use `phaseSourceNeed`. A phase that needs a source whose `sourcePhaseId` is missing, points at a non-existent phase, or points at a *later* phase → **blocker**.
- **Projector:** only if any phase is `projectable`. `projectorLastSeen` null/unseen → **warning** ("not connected"); `now - lastSeen < 15_000` → **pass** ("connected"); `> 30_000` → **warning** ("connection lost"). Never a blocker (screen-free sessions are legitimate).
- **Neutral:** "Waiting for the room — 0 joined" / "N joined" → **info** (never a warning).

### API + host commands (+ capability gating)
- `GET /api/r/[room]/state?role=projector` — now **also** writes the projector heartbeat as a side effect (gated to projectable sessions + 5s throttle). Response shape unchanged. Fire-and-forget; never blocks or fails the read. **Spoofable** by design (the projector read is unauth) — accepted: "connected" means "something polled as projector recently," never escalated to a blocker.
- `GET /api/r/[room]/state` (facilitator/cohost/admin, code-authed) — response (`FacilitatorState`) now carries `readiness`. Purely additive; existing consumers ignore it.
- `POST /api/r/[room]/host` — the `navState` authoritative response (every host command: setPhase/setTemplate/setPhases/setTimer/addContent/…) now includes recomputed `readiness` automatically via `getFacilitatorState(room, written)`. **No new command, no new capability.**
- **No new host command** — pre-flight is read-only. Remedies reuse existing routes (`setTab` navigation, the blob upload routes, the builder `setPhases` path). The "Fix in builder" remedy is **gated client-side** by role: for `role === 'cohost'` it renders disabled with the "Ask the facilitator/admin" hint, mirroring `COMMAND_CAP.setPhases = 'configure'` (`host/route.ts:56`) so no dangling 403.

### Rev / authoritative-apply pattern (no KV read-back)
Readiness is computed **inside** `getFacilitatorState`, so it flows through both delivery paths the platform already trusts:
1. **`navState` authoritative path** — `navState` calls `getFacilitatorState(room, written)`; fixing a phase config via a host command recomputes readiness from the just-written state and returns it in the **same** response the client applies via `usePolledState.apply`. Never a read-after-write of the just-written value.
2. **2s poll backstop** — the `/state` poll recomputes readiness too, so uploading an image / opening the projector / a participant joining self-heals the row within one poll.

**Self-heal model — stated honestly (pressure-test must-fix):** most readiness changes (projector connecting, image upload, participant joining) do **not** bump `state.rev` — `rev` is stamped only by `setState`, while participants/content/submissions write to separate hashes/lists. The poll still applies the updated readiness because `usePolledState`'s guard rejects only **strictly-lower** rev (`components/usePolledState.ts:78` is `rev < lastRevRef.current`, so **equal-rev passes**). Therefore: readiness rides the **2s poll and applies on equal rev** — it is **not** "gated by the rev anti-flash guard," and **SSE will not accelerate it** because `roomSignature` (`lib/store.ts:822`) excludes `projectorLastSeen`. Accept up to ~2s latency (fine). *Optional* faster projector flip: add a 5s-bucketed `projectorLastSeen` to `roomSignature` — not required for v1.

## Implementation plan (ordered, checkable)

1. **[ ] `usesAi` capability** — add `usesAi?: boolean` to `ModuleCapabilities`; set `usesAi: true` on the 9 AI modules. Add the **guard test** (every def whose server file references `aiAvailable`/`clusterAssist` must set `usesAi: true`). `npm run verify` green.
2. **[ ] Export `phaseSourceNeed`** from `lib/design.ts` (thin wrapper over private `sourceNeed`).
3. **[ ] `lib/preflight.ts`** — types + `validatePhaseConfig` (lift zod safeParse + `LONG_TEXT` from BuilderApp) + pure `computeReadiness(input)` with injected `now`/`isProd`. No store/AI/env reads inside.
4. **[ ] Re-point BuilderApp** — import `validateConfig`/`LONG_TEXT` from `lib/preflight.ts`; delete the inline copies. Add the **parity test** (preflight's `validatePhaseConfig` agrees with old BuilderApp behavior on a fixture set).
5. **[ ] `test/preflight.test.ts`** — the cases below. `npm run verify`.
6. **[ ] Projector heartbeat** — add `meta` key to `roomKeys`/`RoomKeys` (`lib/session.ts`); add `recordProjectorSeen`/`getProjectorLastSeen` to `lib/store.ts`; wire `recordProjectorSeen` into the `wantProjector` branch (projectable-gated + 5s throttle, void/error-swallowed).
7. **[ ] Wire readiness into state** — in `getFacilitatorState`, fold `projectorLastSeen` into the existing `Promise.all`, build env booleans, call `computeReadiness`, attach `readiness`. Add `readiness` to `FacilitatorState` type.
8. **[ ] `components/PreflightPanel.tsx`** — `PreflightPill` + `PreflightSheet` off `state.readiness`; cohost-gated remedies; remedy → `setTab`/copy-link.
9. **[ ] Mount in HostConsole** — pill in `SessionHeader`, sheet below header, sheet-open state lifted, remedies wired to `setTab`.
10. **[ ] `npm run verify`** (typecheck+lint+test, in-memory store) then **build on Node 24**. Manual smoke (below).

## Acceptance criteria (facilitator-outcome framed)

1. A facilitator opening a **no-AI, no-media, all-discussion** session sees a **green "Ready" pill** and a sheet with **zero infra/AI/media rows** — only the neutral "joined" line and (if projectable) the projector row.
2. A session with an **empty required prompt** shows a **red pill** and a blocker row naming the phase ("Phase 3 'Capture' has no prompt"), regardless of whether the session came from the **builder, a template, or AI design**.
3. A **synthesis phase with no AI key** shows an **amber warning** ("AI phases fall back to manual") — **never a blocker**; the facilitator can still launch and run it manually.
4. A **media phase whose image is already hosted** shows **pass** even with no blob token; a media phase **missing its asset with no token** shows an **amber warning**.
5. On a **production deploy with the store in in-memory fallback** (`useKv === false`), the facilitator sees a **red blocker** ("Storage isn't saving") that **cannot be dismissed as safe**; in **local dev** the same condition shows only a quiet **info** row.
6. Opening `/r/[room]/screen` flips the **projector row from amber to green within ~2s** with no manual refresh; a projectable-free session shows **no projector row**.
7. Fixing a flagged input via a host command **clears its row in the same response** (authoritative apply), and fixing via upload/projector **clears within one 2s poll**.
8. A **cohost** sees the pill + sheet (reassuring) but every **"Fix in builder"** remedy is **disabled** with "Ask the facilitator/admin" — no action that 403s.
9. The check computation adds **no AI call and no extra serial KV round-trip** to the 2s poll (the `projectorLastSeen` read is folded into the existing `Promise.all`).

## Test plan

### Vitest (`test/preflight.test.ts`, in-memory store; `Array.from`/index loops, no Set spreads)
1. **All-green** — no-AI/no-media all-discussion session → `overall === 'pass'`, zero infra/AI/media checks.
2. **Empty prompt blocker** — a capture phase with `prompt: ''` → a `blocker` row for that phase (verifies the `LONG_TEXT` heuristic is load-bearing: assert zod-alone `safeParse('')` passes, so the heuristic is what catches it).
3. **Dependency blocker** — a synthesis/devil phase whose `sourcePhaseId` points at a **later** phase (and at a **missing** id) → `blocker` in both cases.
4. **AI warning not blocker** — synthesis phase + `env.aiAvailable === false` → exactly one `warning`, `overall !== 'blocker'` (assuming no other blocker).
5. **Media pass vs warning** — media phase with hosted deck + no blob token → `pass`; media phase with missing asset + no token → `warning`.
6. **KV blocker in prod, suppressed in dev** — `useKv === false`, `isProd === true` → `blocker`; `isProd === false` → `info` (no blocker, no warning).
7. **Projector states (injected `now`)** — projectable phase, `projectorLastSeen === null` → `warning` "not connected"; `now - lastSeen = 5s` → `pass`; `now - lastSeen = 45s` → `warning` "lost". No projectable phase → **no** projector row at all.
8. **Sort + overall** — a session with one blocker + one warning + several passes → `checks` ordered blocker→warning→pass, `overall === 'blocker'`, `blockers === 1`, `warnings === 1`.
9. **Equal-rev application** — a host command that changes a non-`setState` signal (e.g. addContent) returns `readiness` with the **same** `rev`; assert `usePolledState` would apply it (equal rev passes the `< lastRev` guard).
10. **Parity test** — `validatePhaseConfig` (preflight) agrees with the pre-refactor BuilderApp behavior across a fixture set (empty prompt = invalid; valid prompt = ok; valid full config = ok).
11. **`usesAi` guard test** — for every server def file referencing `aiAvailable`/`clusterAssist`, `capabilities.usesAi === true` (closes the silent-regression gap on the optional field).

### Manual QA
- **Desktop host console:** launch a synthesis+media+persona session with an empty capture prompt and no keys → expect **1 blocker** (empty prompt) + **2 warnings** (AI key, blob). Fill the prompt via Fix-in-builder → blocker clears on return.
- **Projector:** open `/r/[room]/screen` on a second screen → projector row flips green within ~2s. Put the projector laptop to sleep / close the tab → after ~30s the row reads "connection lost."
- **Mobile (facilitator on phone):** the pill is tappable at touch size; the sheet scrolls; the `StickyAction` footer "Re-check" is reachable above the keyboard/safe-area; rows wrap cleanly at narrow width.
- **Cohost:** authenticate as cohost → pill + sheet visible; "Fix in builder" disabled with the ask-the-facilitator hint; "Open screen link" / "Re-check" still work.
- **Dev vs prod parity:** confirm in local dev (no KV) the storage row is a quiet info line, not a red blocker.
- **All-clear:** a sound all-discussion session → green pill, sheet shows "You're clear to go live." with join + screen links echoed.

## Privacy & ethos check (explicit)

Honors the ethos and strengthens it.
- **One new signal**, explicitly flagged: `room:{id}:meta:hash` field `lastSeen` — a single unix-ms timestamp. **Identity-free, count-free, content-free**, written via `backend.hset` which TTL-bumps to 24h, so it auto-wipes with the room and via **End-session**. No per-client tracking — only "seen / not seen."
- **Readiness is computed, never stored** — the `Readiness` object lives only on the in-flight `FacilitatorState` response and carries only ids/severities/plain-language strings/remedy hints derived from **config validity + env booleans + the timestamp**. It **never** includes submission text or participant identity — content-free logging and the off-the-record contract intact.
- **No new durable storage, no submission inspection, account-less model intact.** No AI in the poll path.
- **Residual (accepted):** the heartbeat write fires on an unauthenticated projector GET, so it's spoofable — but it leaks nothing (only flips a soft warning) and is **never** a blocker.
- **Net positive:** catches the in-memory-fallback case that would silently break the persistence / 24h-TTL promise — the failure most corrosive to the trust story.

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Mis-stated self-heal model (major).** *Resolved:* spec now states readiness rides the **2s poll** and applies on **equal rev** (guard rejects only strictly-lower rev); it is **not** "gated by the rev guard," and **SSE will not accelerate it** (`roomSignature` excludes the heartbeat/content/participant changes). ~2s latency accepted; optional bucketed `projectorLastSeen` in `roomSignature` documented as a non-v1 nicety. Test case 9 asserts equal-rev application.
2. **`computeReadiness` purity vs. projector age (minor→must-fix).** *Resolved:* `now: number` and `isProd: boolean` are explicit arguments; the caller supplies `Date.now()`/`NODE_ENV`. Tests inject a fixed clock (case 7). The function is genuinely pure over its arguments.
3. **`usesAi` breaking 26-file contract change (minor→must-fix).** *Resolved:* `usesAi?` is **optional** (default false) — no breaking change, no 26-file churn — **plus** the guard test (case 11) closes the silent-regression gap for new modules.
4. **Extra serial KV round-trip + write-on-GET cost (minor→must-fix).** *Resolved:* `projectorLastSeen` is **folded into the existing `Promise.all`** (no serial read). The heartbeat write is **gated to projectable sessions** (skipped entirely otherwise) and **5s-throttled** (skip if `lastSeen` < 5s old), cutting steady-state writes ~60%.
5. **validateConfig/`LONG_TEXT` lift drift (minor→must-fix).** *Resolved:* the **parity test** (case 10) asserts preflight's `validatePhaseConfig` matches the pre-refactor BuilderApp behavior; verified that prompt fields are `z.string()` with no `.min(1)`, so the empty-text heuristic is load-bearing and must not weaken.
6. **`aiAvailable` citation indirection (minor).** *Resolved:* import from `lib/ai.ts` (works), but spec notes the real env check is `clusterAssistAvailable()` in `lib/session.ts:11`.
7. **Projector heartbeat spoofable (minor).** *Resolved/accepted:* "connected" means "something polled as projector recently," documented; never escalated to a blocker.
8. **Scope risk — projector heartbeat is the only new infra.** *Mitigation:* it's the **MVP-deferrable** piece. Ship infra + per-phase-input checks first (the two highest-stakes blockers), add the heartbeat as fast-follow once the pure-engine path is proven.

## Out of scope / future

- **Hard launch gate.** Per open-question resolution, "storage not persisting" is **advisory-but-loud** (red pill) — it never physically blocks the Run-tab advance, preserving facilitator authority. A confirm-gate on first advance is explicitly out of scope.
- **A dedicated "Go live" tab.** Designed as pill+sheet (visible from every tab, no sixth tab). A literal go-live step is out of scope.
- **Projector identity / multi-projector counts.** Only "seen / not seen" — no count, no identity. Out of scope.
- **Faster-than-2s projector flip via SSE.** Bucketed `projectorLastSeen` in `roomSignature` is a documented future nicety, not v1.
- **Deeper content validation** (e.g. checking that a media URL actually resolves, or that an AI prompt is non-trivial beyond non-empty) — out of scope; pre-flight checks config *validity*, not content quality.
