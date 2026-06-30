# A3 — 5-minute interactive tutorial + a pre-loaded sample workshop room

> Status: **Final executable build spec.** All pressure-test must-fixes are folded in. Build directly from this; no further design needed.

---

## Priority / effort / dependencies

- **Priority:** P0 (Section A — First-run & access)
- **Effort:** ~6.5 dev-days total, split across two independently shippable PRs:
  - PR1 (Sample-room seeder + admin SampleCard + reset): ~3.5 days
  - PR2 (TourCoach rail + anchors + ribbon + docs): ~3.0 days
- **Dependencies (item ids):** none hard. Soft/related: this is the natural landing surface for **A1/A2** (admin auth & first-run) if those exist; the completed coach deep-links into **/help** docs (relates to any "in-app docs" item). No other A-item is a build blocker.

---

## Problem & facilitator value (facilitator's voice)

> "I've been handed an admin passcode and a URL. I log in and see an empty Rooms list and a 'Create room' form. I make a room and get a one-shot panel of passcodes and four raw URLs — then nothing happens. To feel a single moment of the thing I was promised — a calm room where people type, a read-around reveals, a scale votes — I apparently need to open a second device, re-enter a *different* passcode, pick a 'mode', and recruit eight colleagues. I'm evaluating whether to trust this with a real cohort, and right now I can't even *see* it work. I bounce."

What A3 delivers, in their words:

> "Within five minutes, on one screen, I get it. A short coach points at the real buttons and tells me the one idea that makes everything click — a named method is just a chain of a few primitives, advanced phase by phase across three surfaces. And there's already a demo room that looks like a workshop mid-flight: seven people 'here', real messy submissions, a read-around half-revealed, clusters in Patterns. I press Advance and watch it move. I inject a slide. I press End session and watch it all vanish — *that's* the off-the-record promise, and now I've felt it. Nothing I did could break anything real. Now I'll make my own room."

Time-to-first-"oh, I get it" drops from ~15 minutes of cross-device fumbling to **under 5 minutes on a single screen**, and the privacy ethos becomes a felt experience (the End-session wipe) rather than a footnote.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP (PR1 alone — ship this first)
**The sample room delivers most of the "consequence-free dress rehearsal" value without any coach.**

- `POST /api/admin/sample` (super-admin gated) seeds-or-resets a reserved `sample-demo` room to a believable mid-session snapshot via existing store writers.
- **Single whole-object state write** for the session-state portion (no get-modify-write chain — see Architecture/Risks).
- **Randomly generated** sample passcodes per seed, returned from the POST (never committed to source).
- Admin Rooms list pins a distinct **Sample card** at the top: `DEMO` badge, dashed accent border, "7 fake participants — safe to break", actions **[open host] [open screen] [reset sample]**.
- Open-host action carries the freshly-returned facilitator code so the admin lands in a live-looking console with zero extra setup.
- Fully covered by Vitest on the in-memory store.

This alone lets a facilitator poke Run / Advance / Patterns / Content / End against fake data they can't damage.

### Full vision (PR2 — adds the narrated tour)
- `TourCoach` rail on `/admin`, `/r/[room]/host`, `/r/[room]/screen`: a slim, non-blocking, dismissible bottom-right coach that spotlights one real element at a time and advances off the **authoritative state the console already holds** (never a `/state` read-back).
- First-run banner on `/admin` ("Take the 5-minute tour"), persistent "Replay tour" pill, durable per-admin "seen" flag.
- Projector "this is your big screen" ribbon.
- End-session beat → "Gone. No trace — that's the off-the-record contract." → "Create your first real room".
- Docs note in `docs/admin-guide.md`.

**Deferred out of v1** (low value / complexity): AI-off "would write a report" narration branch, graceful no-sample live-UI fallback narration, participant-phone tour. (See Out of scope.)

---

## Experience & flows

### Voice
Terse, warm, opinionated — matches template descriptions, not generic SaaS onboarding cheer. Inherits the dark-indigo palette, `render-kit` Reveal/shimmer styling, and `StickyAction` footer so it reads as native Edges.

### Screens & states

**1. `/admin` — first-run (zero real rooms).** Calm hero banner above `CreateRoom`:
> **New here?** Take the 5-minute tour — we'll spin up a safe demo room you can't break.
> [ Start tour ] · [ Skip, I'll explore ]

"Zero real rooms" = `rooms.filter(r => !r.isSample).length === 0`. Banner **auto-offers but never auto-starts** (calm ethos).

**2. `/admin` — Rooms list with pinned Sample card.** Always at the top, visually distinct:
> `DEMO`  **Sample workshop** · dashed accent border
> 7 fake participants — safe to break
> [ open host ] [ open screen ] [ reset sample ] [ replay tour ]

Real rooms render unchanged below. After a real room exists, the hero banner collapses to a slim **"Replay tour"** pill in the header next to the existing "Guides" link.

**3. TourCoach rail (shared, mounts on admin/host/screen).** ~320px bottom-right card:
- Step counter (`2 / 8`), one-line title, ≤2-line body, **[Back] [Next]**, persistent **"Skip tour"** link.
- Spotlight: a non-interactive accent ring (`pointer-events:none`) positioned over the element matched by `data-tour-id`. Reuses Reveal/shimmer classes. Never intercepts clicks — the real UI stays pokeable between steps.
- On mobile host: **docks above** the `StickyAction` footer and shrinks so it never covers the phase stepper or sticky action.
- `aria-live="polite"` region announces title+body on each step change; the rail has `role="complementary"` + accessible label; Skip is reachable in tab order (a11y fix folded in).

**4. `/r/[room]/host?tour=1` — guided console.** Identical to today's console; coach active. `SessionHeader` live count reads the seeded "7 here" with a real running countdown so it feels alive. Steps successively spotlight Advance → "What they see" tab → Patterns tab → Content panel → End.

**5. `/r/[room]/screen?tour=1` — projector framing.** A one-time thin top ribbon: *"This is what the room sees on the big screen."* Auto-hides after a few seconds or on the next host phase advance (driven by the existing polled `phaseId` change).

**6. End-session beat.** When the facilitator ends the sample, the coach confirms:
> **Gone. No trace — that's the off-the-record contract.**
> [ Create your first real room ] · [ Reset the demo and poke more ]
Primary scrolls to / focuses `CreateRoom`.

**7. Completion state.** Coach collapses to a quiet floating **"?"** linking `/help?doc=facilitator-guide`; admin banner replaced by the "Replay tour" pill.

### Key flows

**First-success spine (~8 steps):**
1. Admin authes at `/admin` → first-run banner offers tour.
2. Tap → `POST /api/admin/sample` seeds/resets the demo → returns `{ slug, facilitatorCode }`.
3. Coach narrates the keystone idea in ~2 sentences.
4. "Open the host console" deep-links to `/r/<slug>/host?tour=1&code=<facilitatorCode>` (code carried so the second gate is skipped; **host page strips `?code` via `history.replaceState` on read**).
5. Spotlight Advance: "Press Advance." Coach waits for `phaseId` to change (off the authoritative apply), then: "That's the whole job — one method, advanced phase by phase."
6. Spotlight "What they see" → optionally open `/r/<slug>/screen?tour=1` in a new tab ("this is your projector").
7. Spotlight Patterns (pre-clustered) → spotlight Content panel → facilitator injects the **first** content item.
8. "End session wipes it all — try it." Coach waits for `ended === true`, confirms the wipe, offers "Create your first real room".

**Re-entry / steerability:** Sample card pins to top always; "Reset sample" re-POSTs; "Replay tour" relaunches. Completion persists per-browser (`localStorage edges_tour_done`) and per-admin (durable `rooms:tour:<sha256(adminCode)>`). Tour pill always allows explicit replay.

**Skip / resume:** Any step has "Skip tour" (collapses to "?"). Last step saved in `localStorage edges_tour_step`; refresh resumes rather than restarts. Skipping never deletes the sample. Clearing the flag restores the plain console (no dangling highlight).

**Graceful no-sample fallback:** if seeding fails (KV hiccup), the banner shows a calm error and the admin can retry; the tour never dead-ends on a spinner. (Live-UI narration fallback deferred to future.)

---

## Architecture

> Two cooperating, independently shippable pieces. Everything is seeded through **existing** store writers (no new SessionState shape) and detected via the **existing authoritative-apply path** (never KV read-back).

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/sample.ts` | Pure, AI-free seeder. Exports `SAMPLE_SLUG = "sample-demo"`, `HANDLES` (~7), `FIXTURE_SUBMISSIONS` (~12 messy human strings for phase `bluesky-ideas`), `PATTERN_FIXTURES` (2–3 clusters by submission **index**), `seedSample()`, `isSampleStale(slug)`. **No hardcoded passcodes.** |
| `/Users/jordan/workshop/edges-v2/app/api/admin/sample/route.ts` | `POST`/`GET` route, super-admin gated. |
| `/Users/jordan/workshop/edges-v2/lib/tour.ts` | Static, type-only tour script (`TourSurface`, `TourStep`, `TOUR_STEPS`, selectors). No React, no server imports. |
| `/Users/jordan/workshop/edges-v2/components/TourCoach.tsx` | Client coach rail + spotlight. |
| `/Users/jordan/workshop/edges-v2/test/sample.test.ts` | Vitest coverage of the seeder. |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/rooms.ts` | Add `isSample?: boolean` to `Room`. Add `createRoomWithSlug(slug, name, topic, opts)` (writes a `Room` at a fixed slug + registers it in `rooms:index`). Add `getTourSeen(adminCode)` / `setTourSeen(adminCode)` / `clearTourSeen(adminCode)` keyed `rooms:tour:<sha256(adminCode)>` via the existing durable `db`. |
| `lib/store.ts` | Add `replaceState(state, roomId)` — a **single whole-object** state write (still stamps a fresh monotonic `rev` via the existing `writeState` internal). This is the crux fix; see below. |
| `app/api/admin/rooms/route.ts` | In `GET`, include `isSample` in each mapped room row (one field). |
| `app/admin/page.tsx` | Add `RoomRow.isSample`; compute `realRooms`; first-run banner; "Replay tour" pill; pinned `SampleCard`; `data-tour-id` on the `CreateRoom` section; mount `<TourCoach surface="admin" />`. |
| `components/HostConsole.tsx` | Add `data-tour-id` to: PhaseStepper Advance (`advance`), tab buttons (`tab-preview`, `tab-content`, `tab-patterns`), SessionControls End (`end-session`). Read `?tour=1`; when set, mount `<TourCoach surface="host" roomState={s} />` **inside** HostConsole passing the rev-guarded `s` directly. No change to `cmd()`/apply. |
| `app/r/[room]/host/page.tsx` | Read `?tour=1` + `?code`; pass initial code into HostConsole; immediately `history.replaceState` to strip `?code`. Pass tour flag down. |
| `components/ProjectorApp.tsx` | When `?tour=1`, render a one-time auto-hiding top ribbon driven by polled `phaseId` change; mount `<TourCoach surface="screen" />` guarded by `?tour=1`. |
| `docs/admin-guide.md` | Add "Sample room & the 5-minute tour" section (what it is, safe to break, reset/replay, the End-session wipe demo). |

### Data model

**No new SessionState shape.** The sample reuses the entire live model (participants hash, submissions list, patterns, content, timer, `readaroundIndex`). Only two small **durable** additions:

1. `Room.isSample?: boolean` on the existing durable `Room` record (no TTL). Drives badge/pinning + exclusion from the "zero real rooms" first-run check. (Note: the design's "exclude from analytics" rationale is **forward-looking only** — there is no analytics today.)
2. Durable key `rooms:tour:<sha256(adminCode)>` → boolean. The one durable non-PII onboarding flag. **Documented in admin/privacy docs and removable** (`clearTourSeen`) so deleting the sample fully removes the feature.

**Sample passcodes:** generated **randomly per seed** (reuse `randomPasscode`), stored only as their existing sha256 hashes in `passcodeHashes`, and returned in plaintext from the super-admin-gated `POST` response. Rotated on every re-seed. Never a source constant.

**Reserved slug:** `sample-demo` is uncollidable — `randomSlug()` emits `<singleword>-<4hex>` and `"sample"` is not in `SLUG_WORDS` (asserted in test).

**Client-only ephemeral:** `localStorage edges_tour_done` (bool), `edges_tour_step` (number).

**`tour.ts` types (type-only, no runtime deps):**
```ts
export type TourSurface = "admin" | "host" | "screen";
export type TourAwait = "phaseChanged" | "sessionEnded" | "patternsPresent";
export interface TourStep {
  id: string;
  surface: TourSurface;
  anchor: string | null;          // data-tour-id value to spotlight
  title: string;
  body: string;                   // ≤2 lines, load-bearing keystone copy
  cta?: { label: string; href?: string };
  await?: TourAwait;              // gate "Next" on an authoritative state change
}
export const TOUR_STEPS: TourStep[];
export function stepsForSurface(s: TourSurface): TourStep[];
```

### API + host commands (+ capability gating)

**NEW `POST /api/admin/sample`** — super-admin gated via `checkSuperAdmin(code)` (verbatim from `app/api/admin/rooms/route.ts`). Calls `seedSample()`. Returns `{ slug, facilitatorCode }`. `403` if not super-admin. `runtime = "nodejs"`, `dynamic = "force-dynamic"`, **`maxDuration = 30`** (seeding does ~25 sequential KV writes). Idempotent re-POST = full reset.

**NEW `GET /api/admin/sample?code=`** — returns `{ exists, stale }` so `/admin` can choose open-vs-reseed without a blind write.

**CHANGED `GET /api/admin/rooms`** — each row also returns `isSample`. No breaking change.

**NO new host commands, NO capability-map changes.** The sample is driven by the SAME host route + `COMMAND_CAP` table. The deep-linked sample **facilitator** passcode resolves to the `facilitator` role, which already holds `advance` / `inject` / `curate` / `end`:
- Tour Advance → `setPhase` (`COMMAND_CAP.setPhase = "advance"`) ✓
- Tour Inject → `addContent` (`"inject"`) ✓
- Tour End → end (`"end"`) ✓
- Patterns are **pre-seeded server-side** in the seeder, not driven by a tour command.

Crucially the tour uses the **pre-seeded** Blue Sky phases via `setPhases` *inside the seeder* (server-side, not a host command from the facilitator), so the guided session **never invokes `setPhases` as a host command** and therefore **never needs the admin `configure` cap** — sidestepping the documented `configure` gotcha (`COMMAND_CAP.setPhases = "configure"`, confirmed in host route).

### Rev / authoritative-apply (no KV read-back)

**Seeder writes (the must-fix):** `setPhase` / `setReadaroundIndex` / `setTimer` each internally `getState()` then spread `{...state}` — a read-modify-write **chain** on the single state key. On Upstash replica lag a stale read mid-chain returns `DEFAULT_STATE` and silently drops `phases`/`sessionName`, producing a torn demo. CI cannot catch this (in-memory is strongly consistent). **Fix:** the seeder computes the full target `SessionState` **once** and writes it with **one** call to the new `store.replaceState(state, roomId)`:

```ts
// In seedSample(), after the atomic list/hash writes (participants, submissions,
// patterns, content) — compute the whole state object once, then one write:
const phases = bluesky.phases.map(toPhaseInstance);
await replaceState({
  mode: null,
  sessionName: "Blue Sky",
  phases,
  phaseId: "bluesky-read",        // land mid read-around
  readaroundIndex: 2,
  timerEndsAt: Date.now() + 5 * 60_000,
  topic: "...",
  ended: false,
  // rev stamped by writeState internally
}, slug);
```
No `getState` is called between seed writes. `replaceState` reuses the existing `writeState` so `rev` stays monotonic.

**Tour progress detection:** `TourCoach` mounts **inside** `HostConsole` and receives the rev-guarded `s: FacilitatorState` that `usePolledState` already applies from each `cmd()`'s `navState` response. It **never** calls `refresh()` or fetches `/state`. Predicate logic captures a baseline at the moment a step is shown and fires once:
```ts
// when a step with await:"phaseChanged" is shown:
const baselinePhase = s.phaseId, baselineRev = s.rev;
// fire when:  s.phaseId !== baselinePhase && s.rev > baselineRev
```
`sessionEnded` → `s.ended === true`; `patternsPresent` → `(s.patterns?.length ?? 0) > 0`. Because the coach reads the same anti-flash, rev-guarded object the console renders, it is correct under eventual consistency by construction.

---

## Implementation plan (ordered, checkable)

### PR1 — Sample room (shippable alone)
1. [ ] `lib/store.ts`: add `replaceState(state, roomId)` (single whole-object write through `writeState`). Export it.
2. [ ] `lib/rooms.ts`: add `Room.isSample?: boolean`; add `createRoomWithSlug(slug, name, topic, { isSample, passcodeHashes })` that writes the record + registers the slug in `rooms:index`; add `getTourSeen` / `setTourSeen` / `clearTourSeen`.
3. [ ] `lib/sample.ts`: constants (`SAMPLE_SLUG`, `HANDLES`, `FIXTURE_SUBMISSIONS`, `PATTERN_FIXTURES`); `seedSample()`:
   - Generate fresh random passcodes; ensure room via `createRoomWithSlug` (reuse if present, **rotate hashes on re-seed**).
   - `withLock(slug, "sample-seed", fn, { ttlSeconds: 30 })` (explicit TTL > worst-case seed time).
   - Inside the lock: `endSession(slug)` (full wipe) → `addParticipant` ×7 → `addSubmission` ×12 (phase `bluesky-ideas`, capturing returned ids) → `createPattern` ×2–3 mapping `PATTERN_FIXTURES` **indices** to the captured submission ids (use index loops / `Array.from`, **no `.entries()` / Set spreads**) → `addContent` for the queued item as **`"hold"`** (see content-collision fix) → **single** `replaceState(...)` landing on `bluesky-read`, `readaroundIndex:2`, `timerEndsAt: now+5min`.
   - Return `{ slug, facilitatorCode, reset }`.
   - `isSampleStale(slug)`: `true` when state `ended` or no submissions.
   - **Do NOT modify `lib/templates.ts`** — seed on unmodified Blue Sky (read-around from submissions); seeded patterns alone satisfy the Patterns tab.
4. [ ] `app/api/admin/sample/route.ts`: `POST` (super-admin gated, `maxDuration=30`, `force-dynamic`) → `seedSample()`; `GET` → `{ exists, stale }`.
5. [ ] `app/api/admin/rooms/route.ts`: add `isSample` to the GET row mapping.
6. [ ] `app/admin/page.tsx`: `RoomRow.isSample`; `realRooms` filter; first-run banner; pinned `SampleCard` (DEMO badge, dashed border, open host/screen, reset). Open-host uses the freshly-returned `facilitatorCode`.
7. [ ] `test/sample.test.ts` (see Test plan).
8. [ ] `npm run verify` + manual seed on staging KV.

### PR2 — Tour coach
9. [ ] `lib/tour.ts`: `TOUR_STEPS` spine + selectors (load-bearing copy reviewed by product).
10. [ ] `components/TourCoach.tsx`: rail, spotlight (`pointer-events:none`, reflow on resize/scroll + **throttled** MutationObserver), localStorage persistence, `aria-live`/focus a11y, mobile dock above `StickyAction`, completion "?".
11. [ ] `components/HostConsole.tsx`: `data-tour-id` anchors; mount `<TourCoach roomState={s} />` when `?tour=1`.
12. [ ] `app/r/[room]/host/page.tsx`: read `?tour=1`/`?code`, pass code in, `history.replaceState` strip.
13. [ ] `app/admin/page.tsx`: wire "Start tour"/"Replay tour" → POST sample → deep-link; mount `<TourCoach surface="admin" />`; durable `getTourSeen`/`setTourSeen`.
14. [ ] `components/ProjectorApp.tsx`: `?tour=1` ribbon + `<TourCoach surface="screen" />`.
15. [ ] `docs/admin-guide.md`: section.
16. [ ] `npm run verify` + manual cross-surface QA (incl. mobile + projector).

---

## Acceptance criteria (facilitator-outcome framed)

1. A brand-new admin lands on `/admin`, taps "Start tour", and within one screen reaches a **live-looking host console** (7 participants, running timer, mid read-around) **with zero additional passcode entry or device**.
2. Pressing **Advance** in the sample visibly moves the phase, and the coach celebrates **once**, keyed off the authoritative applied state (not a `/state` re-fetch).
3. The **Patterns** tab is present and populated in the sample (2–3 clusters) **without any change to the Blue Sky template**.
4. The facilitator can **inject one content item** and see it appear; no pre-released queued item muddies that beat.
5. Pressing **End session** wipes the sample (participants/submissions/patterns/content gone) and the coach confirms the off-the-record contract; offering to create a real room.
6. **Re-seed is idempotent:** `POST /api/admin/sample` twice yields exactly 7 participants / 12 submissions (no stacking), and rotates the sample passcodes.
7. The sample passcodes are **never** present in the source tree; they appear only in the authenticated POST response.
8. `/api/admin/sample` returns `403` to a non-super-admin code.
9. After a real room exists, the first-run banner is gone and a "Replay tour" pill is available; tour-completion does **not** re-nag on the same browser (and best-effort not across devices via the durable flag).
10. A day later (session TTL lapsed), launching the tour **auto-reseeds** a stale/empty sample cleanly.

---

## Test plan

### Vitest (`test/sample.test.ts`, in-memory store, `ANTHROPIC_API_KEY` unset)
- `seedSample()` creates the reserved `SAMPLE_SLUG`; `getRoom("sample-demo").isSample === true`.
- Seeded `getFacilitatorState`: `phaseId === "bluesky-read"`, `readaroundIndex === 2`, `participantCount === 7`, submissions count `=== 12`, `patterns.length >= 2`, one **non-visible/held** content item, `timerEndsAt` non-null and in the future, `ended === false`.
- **Patterns-tab assertion via `patterns.length >= 2`** (not a template edit); confirm `showPatterns` condition `(usesPatterns || patterns.length>0)` holds.
- Pattern `submissionIds` reference **real** seeded submission ids (mapping by index is correct).
- **Idempotent re-seed:** call twice → counts stable (7 / 12, no duplicates); passcode hash **changes** between seeds (rotation).
- **State integrity:** after seed, `phases` is non-empty and `sessionName === "Blue Sky"` (guards the single-write fix — would fail if a chain dropped phases).
- `isSampleStale()` is `false` after seed, `true` after `endSession`.
- Slug safety: assert `"sample"` ∉ `SLUG_WORDS` so `randomSlug()` can never emit `sample-demo`.
- No-AI: whole suite passes with `ANTHROPIC_API_KEY` unset.
- `clearTourSeen` removes the durable flag (rollback completeness).

### Manual QA
- **Desktop happy path:** admin → tour → host advance → projector tab → patterns → inject → end → "create real room". Verify coach celebrates Advance exactly once.
- **Eventual-consistency proxy:** confirm on staging KV that the seeded room renders a complete console (phase stepper + read-around) across repeated re-seeds — the single-write fix in prod, where Vitest can't reach.
- **Double-click reset:** spam "Reset sample" — second call returns `busy` or serializes; no duplicate participants (30s lock holds).
- **Mobile host (small screen):** coach docks **above** the `StickyAction` footer and never covers the phase stepper; Skip reachable; `aria-live` announces steps.
- **Projector:** `?tour=1` ribbon shows once and auto-hides on next advance.
- **Privacy:** open host via tour, confirm `?code` is stripped from the address bar immediately (`history.replaceState`); confirm grepping the repo finds **no** sample passcode plaintext.
- **Skip/refresh:** skip mid-tour → console returns to plain (no dangling highlight); refresh resumes from saved step.
- **Day-later:** let the sample session TTL lapse (or simulate), relaunch tour → auto-reseed yields a fresh live demo.

---

## Privacy & ethos check (explicit)

- **Sample passcodes generated randomly per seed**, returned only via the super-admin-gated POST response — **never committed constants** (fixes the public-repo world-controllable-demo hole). Re-seed rotates them.
- **Passcode-in-deep-link:** only ever the disposable sample facilitator code; host page strips `?code` via `history.replaceState` on first read. Acceptable given the code is random, low-value, and wipeable. (Alternative, if product rejects: pre-store the code in localStorage and link without `?code=`.)
- **End-session wipe** uses the real `endSession` (deletes participants/submissions/content/patterns/votes/words + writes `ended:true`) — the demo *is* the privacy proof, on-ethos.
- **No participant submissions logged; account-less preserved.** Sample fixtures are hardcoded strings, not real-person data.
- **Two new durable keys** (`Room.isSample`, `rooms:tour:<hash>`) are non-PII metadata; the tour flag is documented in admin/privacy docs and **removable** via `clearTourSeen`, so "delete sample-demo + the two keys fully removes the feature" actually holds.
- Sample join URL works but is **not advertised**; flagged `isSample` so End-session on it is framed as expected/safe.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution (folded into spec) |
|---|---|
| **Read-modify-write chain on the state key** corrupts the seeded room under Upstash lag; CI can't catch it (in-memory is consistent). | Seeder computes the full `SessionState` once and writes via **one** `store.replaceState` call — **no `getState` between seed writes**. Atomic list/hash writers are kept as-is. Manual staging-KV check covers the class Vitest can't. |
| **Fixed sample passcodes committed to a public repo** → world-controllable live demo. | Passcodes **generated randomly per seed**, returned from the authenticated POST, rotated on re-seed. Never in source. |
| **`withLock` 5s default TTL** < ~25 sequential KV writes → lock expires mid-seed, double-click interleaves. | Pass **`ttlSeconds: 30`** explicitly; `endSession` first makes any interleave converge rather than stack; route can also reject concurrent POSTs as `busy`. |
| **Editing Blue Sky read-around to source from patterns** mutates a shared real template (live blast radius) and is unnecessary. | **Do NOT touch `lib/templates.ts`.** Seed 2–3 patterns directly; `showPatterns = usesPatterns || patterns.length>0` is satisfied. Asserted via `patterns.length` in tests. |
| **Queued content auto-releases on Advance** before the inject step (releaseQueuedContent fires on `setPhase`), muddying the demo. | Seed the pre-existing item as **`"hold"`** (not `"queue"`) so Advance doesn't release it; the tour's inject step is the first *visible* content the facilitator adds. Tour ordered so Advance precedes any content expectation. |
| **TourCoach detecting progress via read-back** would violate the no-read-back rule / fire early/late. | Coach mounts **inside** HostConsole and reads the rev-guarded `s` the console already applies; predicate = `s.phaseId !== baseline && s.rev > baselineRev`. Never fetches `/state`. |
| **Durable `rooms:tour:<hash>` persists indefinitely** with no cleanup; "exclude from analytics" rationale is speculative. | Drop the analytics justification (forward-looking only). Document the flag as the one durable non-PII onboarding key and provide `clearTourSeen` for removal. |
| **Spotlight a11y:** visual-only ring, no SR/keyboard equivalent; MutationObserver thrash. | `aria-live="polite"` announces each step; move focus to / `aria-describedby` the spotlighted control; throttle the reflow observer; rail labelled and Skip in tab order. |
| **TTL drift** leaves a stale empty sample a day later. | `isSampleStale()` → tour launch auto-reseeds when state is empty/ended. No cron. |

---

## Out of scope / future

- AI-off "with a key, this would also write a report" narration branch (defer; low v1 value).
- Graceful live-UI narration when the sample can't seed (v1 shows a calm retry instead).
- Participant-phone (`/r/[room]`) tour — host/admin/projector only for v1.
- Regenerating sample patterns/submissions via the real AI cluster path (fixtures always for determinism; optional "regenerate with AI" nicety later).
- Per-admin (vs single shared) sample room — documented as shared `sample-demo` for now; revisit only if multi-admin demos collide.
- Any analytics exclusion logic (no analytics exists today).
