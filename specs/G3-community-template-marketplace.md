# G3 — Community template marketplace

> Status: ready-to-build executable spec. Every pressure-test must-fix is folded in (no phantom server draft — Clone is a **client seed**; **no auto-AI** on clone; **random** authorId, never passcode-derived; **allowlist-strip** reused from B4 + a published-payload re-assert; **super-admin approval** before public listing; concurrency-safe index + atomic clone-count; built-ins rendered **virtually**, never written). Where this spec and the original G3 design disagree, **this spec wins** — deltas are flagged inline.
>
> **This spec assumes B4 (`specs/B4-save-session-as-template.md`) has shipped** and builds directly on its shapes: `SessionDesign` / `lib/designs.ts` / `validatePhases` (the allowlist-strip security control) / `getDb()` / `withLock`-guarded membership map / the builder's `loadTemplate` hydration. **G3 does NOT introduce `RoomTemplate`, `lib/gallery.ts`, or `lib/rooms.ts` `saveTemplate`** — those were the original design's pre-B4 storage guesses, now superseded by B4's `SessionDesign` / `lib/designs.ts`. G3 is the **publish + public gallery + clone** layer on top.

## Priority / effort / dependencies

- **Priority:** P2
- **Effort:** 7 days (the original 11 included B4; B4 is now its own shipped item, so G3 is just publish + gallery + clone + moderation).
- **Section:** G. Differentiators / moonshots
- **Dependency item ids:** **B4** (hard — `lib/designs.ts`, `SessionDesign`, `validatePhases`, `getDb()`, the builder `DesignLibrary`/`loadTemplate` path). **G2 accounts: NOT a dependency** — G3 ships with an interim random `authorId` that migrates cleanly to a G2 user id later.
- **Reuses (not depends on):** `app/help/page.tsx` + `components/DocBody.tsx` (public, passcode-free, server-rendered read pattern); `lib/design.ts` `critiqueSession`/`reviseSession`/`repairDependencies`; `components/BuilderApp.tsx` `loadTemplate` (`:546`) + `runCritique` (`:509`) + `applyFixes` (`:480`); `lib/ai.ts` `aiAvailable`; `lib/rooms.ts` `checkSuperAdmin`; `withLock` (`lib/store.ts`); `render-kit.tsx` `AiGenerating`/`Reveal`/`Bars`.

## Problem & facilitator value

**Problem.** B4 gave a facilitator a *private* library: save a method, relaunch it, hand a colleague a share-code. But the network effect is still locked. There is no way to discover what *other* facilitators have proven works, no public shelf where a master facilitator's "Pre-mortem for AI governance" becomes a one-tap, forkable artifact, and no credit/portfolio for the people who design great methods. The keystone idea — "named methods are configured chains of a few primitives" — is exactly what makes designs portable and remixable, yet that value stays trapped in private libraries and source-hardcoded built-ins. G3 unlocks the one Edges feature with a true compounding network effect: every published design makes the next facilitator's setup faster.

**Facilitator value (in their voice).** "I publish 'Trust-repair after a reorg' to the community gallery under my handle, with my framing — *when to use it, what it's for, how long it really takes, what facilitation moves matter*. That's a portfolio I can point a client to, without ever opening an account. And when I'm prepping a tricky session, I browse the gallery, find a vetted design, tap **Clone into a room**, and it lands in my builder pre-checked — dangling references already repaired, an honest duration shown — ready to tweak, not broken. I'm standing on the shoulders of facilitators I've never met. And I'm never nervous about privacy: I'm sharing the *recipe*, never the meal — there is not one word a participant typed anywhere in what I published."

## MVP cut (thinnest shippable) and Full vision

**MVP (ship first, all in this spec, behind `GALLERY_ENABLED`):**
1. **Publish** a B4 `SessionDesign` to a **moderation queue** (`status: "pending"`) — admin-gated, with required `whenToUse` framing + intent tag + optional org/group size + a **consent line** ("others may adapt this"). Server re-asserts the payload is pure config.
2. **Super-admin approval**: a queue surface where the Edges super-admin approves (`"published"`) / rejects pending designs. **Nothing is publicly listed until approved** (the answer to the open moderation question for an account-less public durable surface).
3. **`/gallery`** — public, passcode-free, server-rendered (mirrors `/help`): filter by intent tag + duration band, group cards by tag, phase-ribbon, **server-computed honest duration**, clone count. Built-ins render as a **virtual "By Edges" section** (no KV write).
4. **`/gallery/[id]`** detail — full phase list, author/org, lineage, read-only participant preview per phase, **Clone into a room**.
5. **Clone = client seed** (NOT a server draft write): route to `/r/[room]/build?seed=<id>`; the builder fetches the scrubbed design, hydrates phases exactly like `loadTemplate`, runs **deterministic** repair + zod re-validation, shows a green/yellow banner; **"Apply AI fixes" is an explicit opt-in button**, hidden when AI is unavailable.
6. **Clone count** (atomic increment) — the only public metric. **No ratings, no stars.**
7. **Report-to-hide** (`reports >= N` ⇒ auto-unlists pending re-review) + super-admin un-feature/feature flag.

**Full vision (future / fast-follow — see Out of scope):**
- **Fork lineage UI**: "adapted from X by Y" inline credit when a clone is re-published (the data field `forkedFrom` ships in MVP; the dedicated lineage browse view is fast-follow).
- "Featured by Edges" curated strip on `/admin` and a `/gallery` hero row.
- Cross-deployment shared gallery (explicit non-goal — see Out of scope).
- Auto-create-room-on-clone (MVP requires an existing draft room you administer; keeps room creation governed).

## Experience & flows (screens, states, copy)

### PUBLISH (admin-gated, from a saved B4 design)
From the builder or the B4 `DesignLibrary` card kebab → **"Publish to community…"** (visible only when an admin-tier code is present). Opens the **Publish sheet** (`components/PublishSheet.tsx`, a bottom-sheet on mobile / inline panel on desktop):
- **Author handle** (required, ≤40 chars; prefilled from last-used handle stored per room).
- **Organisation** (optional, ≤60 chars).
- **Intent tag** — the existing 5-tag union `decide / diverge / reflect / ai / dialogue` (defaults to the design's `tag`).
- **When to use this** (required, ≤280 chars) — the hero copy. Helper: *"One honest line: when does this method shine? This is what other facilitators read first."*
- **Estimated group size** (optional band: 2–6 / 7–15 / 16–40 / 40+).
- **Live computed duration** (read-only, server-truthful estimate — see Architecture; shown as a range/"N timed min + M facilitated phases", never a single false-precise number).
- **Consent line** (required checkbox): *"I'm sharing the method only — no participant data. Others may adapt and re-publish this design with credit to my handle."*
- **Submit** → POST publish. Toast: **"Submitted — it'll appear in the gallery once an Edges editor approves it."** (Sets clear expectation that listing is not instant.) On schema/scrub reject or 403 → inline error.

### MODERATION (super-admin)
`/admin` gains a **"Community queue"** section (only when `checkSuperAdmin(code)`): list of `pending` designs with the phase-ribbon, author note, and **Approve** / **Reject** / (after publish) **Feature** / **Unfeature**. Approve flips `status: "published"` and adds the id to the public index under lock.

### BROWSE — `/gallery` (public, no passcode)
Server-rendered like `/help`. Filter bar: **intent tag pills** + **duration band** (≤20m / 20–45m / 45–90m / 90m+) + optional **group-size** band. Designs grouped by intent tag. Each card: author **"When to use this"** as hero copy, **phase-ribbon** (lobby → capture → readaround → scale → close chips), honest duration, clone count, **Preview** and **Clone into a room**. A leading **"By Edges"** virtual section renders the built-in `TEMPLATES`. Loading: `AiGenerating`/`Reveal` shimmer. Empty (no community designs yet): *"The community gallery is just getting started. Browse the methods by Edges below, or publish the first one from your builder."* Tone: a calm cookbook, not an app store — **no stars, no badges, no leaderboard**.

### DETAIL — `/gallery/[id]`
Full ordered phase list (module label + one-line config summary per phase), author + org, **lineage** ("Adapted from *Trust-repair* by @rosa" when `forkedFrom` is set), the **read-only participant preview** per phase (reuses the builder's existing phase preview), clone count, and **Clone into a room**. A quiet **"Report"** link (hides on N reports). `whenToUse` and all author text are **HTML-escaped** on render (it is public free text).

### CLONE — client seed (the must-fix redesign)
**Clone into a room** opens a **target picker**: the draft rooms the current admin code can configure (fetched with the code), plus *"I'll paste a room admin code"* if not already entered. **MVP requires an existing draft room** (no inline auto-create). On confirm, the client routes to `/r/[room]/build?seed=<designId>&code=<code>`. On arrival the builder:
1. `GET /api/gallery/[id]` → scrubbed design (public, no auth).
2. Hydrates `phases` into local `useState` **exactly like `loadTemplate` (`BuilderApp.tsx:546`)** — no server write, no live `SessionState`, no elevated capability.
3. Runs **deterministic** checks (no AI): `repairDependencies` + per-phase zod re-validate vs current `SERVER_MODULES` + a dangling-`sourcePhaseId` scan.
4. Banner: **green** *"This design checks out — edit and launch when ready."* or **yellow** listing the deterministic issues (e.g. *"'friction' phase reads a capture that isn't earlier — repaired automatically"*, *"phase 'scale-it' uses a config no longer valid — flagged below"*).
5. **"Apply AI fixes"** button (calls the existing `runCritique`→`applyFixes`/`reviseSession` host loop) appears **only when `aiAvailable()`** and is always an explicit tap — never auto-fired.
6. `POST /api/gallery/[id]/clone` fires **once** (fire-and-forget) to atomically increment the clone count. It does **not** gate the seed.

Then the normal B4/builder launch applies: edit → **Launch into room** → `setPhases` (admin `configure`) → `navState()` authoritative-apply.

### FORK / IMPROVE
After cloning + editing, **Save as new design** (B4's existing save) writes a fresh `SessionDesign` carrying `forkedFrom: { designId, handle }`. Optionally **Publish** it → the publish sheet pre-fills "Adapted from @original" and the gallery detail shows the lineage credit. (Lineage *browse* view is fast-follow; the pointer + inline credit ship in MVP.)

### My Library rail (B4 surface, lightly extended)
B4 already renders `DesignLibrary` in the builder + host ModeSelector. G3 adds, per saved-design card, a **"Publish to community"** kebab action (admin-gated) and, where a design was cloned-from-gallery, a small "from gallery" chip. No new library surface is introduced by G3.

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/gallery.ts` | `CommunityDesign`/`CommunityDesignPublic` types; `deriveHandleAuthor` (random authorId mint+persist); `computeDuration`; `publishDesign`/`approveDesign`/`rejectDesign`/`listPublic`/`getPublic`/`incrementClone`/`reportDesign`/`setFeatured`/`listPending`; `scrubForPublish` (reuses B4 `validatePhases` allowlist-strip + a published-shape assert). Built on `getDb()` + `withLock` from B4/store. |
| `app/gallery/page.tsx` | Public server component mirroring `app/help/page.tsx`: reads `searchParams` filters, merges virtual built-ins + `listPublic()`, groups by tag, renders filter pills + ribbon cards. No auth. |
| `app/gallery/[id]/page.tsx` | Public server detail: full phase list, author/org, lineage, read-only preview, Clone CTA. |
| `components/GalleryWall.tsx` | Client island: filter state (pushes `searchParams`), clone target picker, clone-seed routing, fire-and-forget clone POST. Reuses shimmer + `PhaseRibbon`. |
| `components/PhaseRibbon.tsx` | Presentational phase-chip ribbon (label per `moduleId` from `getClientModule().meta.name`), shared by gallery cards + detail + (optionally) B4's `DesignLibrary`. No state. |
| `components/PublishSheet.tsx` | Builder/library bottom-sheet: handle/org/intentTag/whenToUse/groupSize/consent + live server-computed duration; POSTs the `publishDesign` host command. |
| `app/api/gallery/route.ts` | Public `GET` (filtered/paginated **public** list — scrubbed, no authorId) + public `POST` report. No auth. Mirrors `/help` read path. `force-dynamic`, `runtime="nodejs"`. |
| `app/api/gallery/[id]/route.ts` | Public `GET` single scrubbed `CommunityDesignPublic`; `POST /clone` → atomic `incrementClone` only (no auth, no phases returned beyond the public GET). |
| `test/gallery.test.ts` | Round-trip publish→approve→list→get→clone-count; **privacy fixture** (unknown/participant-shaped field is stripped, not just denylisted); duration estimate; schema-drift flag-not-drop; concurrent-publish + concurrent-clone-count atomicity; pending-not-public; report-hides-on-N. |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/design.ts` | **Export `repairDependencies`** (currently private, `:107`) so the clone-seed path runs the exact same deterministic repair before/without AI. Pure refactor, no behaviour change. |
| `app/api/r/[room]/host/route.ts` | Add `publishDesign` to `COMMAND_CAP` (`"configure"`) + switch case (validate via B4 `validatePhases`, `scrubForPublish`, require `whenToUse` + consent, write to `pending` queue). Add `listLibraryHandles`-free — handle storage lives in `gallery.ts`. **No new live-`SessionState` command**; launching a clone still flows through the existing `setPhases`/`navState`. |
| `app/admin/page.tsx` | Add the super-admin **Community queue** (`pending` list with Approve/Reject) + Feature/Unfeature, fetched from a super-admin gallery endpoint (below). Gated on `checkSuperAdmin`. |
| `app/api/admin/gallery/route.ts` (ADD; listed here as it touches the admin surface) | Super-admin `GET listPending`/`listPublic` + `POST { approve | reject | setFeatured }`. `checkSuperAdmin(code)` gate. |
| `components/BuilderApp.tsx` | (1) On mount, if `?seed=<id>`: fetch `/api/gallery/[id]`, hydrate phases like `loadTemplate`, run deterministic `repairDependencies` + zod re-validate, set the clone banner; keep `runCritique`/`applyFixes` opt-in and **hidden when AI unavailable**; fire the clone-count POST once. (2) Render `<PublishSheet>` from the library card / footer (admin-gated). |
| `components/DesignLibrary.tsx` (B4 file) | Add a "Publish to community" kebab action (admin-gated) + an optional "from gallery" chip. |
| `docs/templates.md` | Document the gallery, publishing (queued/approved), clone-and-check, clone-count, and the zero-participant-data guarantee + the consent/adaptation norm. |

### Data model

```ts
// lib/gallery.ts
export const GALLERY_SCHEMA_VERSION = 1;

export type IntentTag = "decide" | "diverge" | "reflect" | "ai" | "dialogue"; // = SessionTemplate["tag"]
export type GalleryStatus = "pending" | "published" | "hidden";

// Full record (durable, no TTL). Carries ONLY method config + author metadata.
export interface CommunityDesign {
  id: string;                      // randomBytes id — primary key, NEVER derived from a secret
  authorId: string;                // randomBytes, persisted per room (see deriveHandleAuthor); migrates to a G2 user id
  handle: string;                  // user-chosen display name — the ONLY user-facing identity
  org?: string;
  name: string;
  description: string;
  intentTag: IntentTag;
  whenToUse: string;               // required, ≤280, HTML-escaped on render
  groupSize?: "2-6" | "7-15" | "16-40" | "40+";
  phases: PhaseInstance[];         // allowlist-rebuilt {id, moduleId, config} per phase (B4 validatePhases)
  durationLabel: string;           // server-computed honest estimate (see computeDuration)
  durationSeconds: number;         // sum of timerSeconds, for the duration-band filter only
  facilitatedPhaseCount: number;   // untimed phases (lobby/close/readaround) — surfaced honestly
  cloneCount: number;
  reports: number;
  featured: boolean;               // super-admin only
  forkedFrom?: { designId: string; handle: string };
  status: GalleryStatus;
  schemaVersion: number;
  publishedAt: number;             // set at submit; listing gated on status==="published"
}

// PUBLIC list/detail shape — NEVER exposes authorId, reports, or status.
export interface CommunityDesignPublic {
  id: string;
  handle: string;
  org?: string;
  name: string;
  description: string;
  intentTag: IntentTag;
  whenToUse: string;
  groupSize?: CommunityDesign["groupSize"];
  phaseRibbon: { moduleId: ModuleKind; label: string }[];
  phases?: PhaseInstance[];        // included ONLY on the single-design GET (for clone seed + detail preview)
  durationLabel: string;
  durationSeconds: number;
  cloneCount: number;
  featured: boolean;
  forkedFrom?: { designId: string; handle: string };
}
```

**Durable keys (no TTL, same `getDb()` as B4/Room/SessionDesign):**

- `rooms:gallery:design:{id}` → `CommunityDesign` (full record).
- `rooms:gallery:pubidx` → `Record<string, CommunityDesignPublicMeta>` — the **published** membership map (object keyed by id, mirrors B4's lost-update-free pattern). Adds/removes are a whole-object replace **under `withLock("lock:gallery:pubidx")`**. The map doubles as the `listPublic` payload source (single `get`, no N-key fan-out).
- `rooms:gallery:pendidx` → `Record<string, ...>` — the **pending** queue map, same lock pattern (`lock:gallery:pendidx`).
- `rooms:gallery:author:{roomSlug}` → `{ authorId: string; handle: string }` — the **per-room author identity**, minted once with `randomBytes` on first publish (see below). **NEVER derived from `passcodeHashes.admin` or `ADMIN_PASSCODE`.**

**Identity (must-fix — no passcode-derived authorId).**
```ts
// lib/gallery.ts
export async function deriveHandleAuthor(roomSlug: string, handle: string) {
  const key = `rooms:gallery:author:${roomSlug}`;
  let rec = await getDb().get<{ authorId: string; handle: string }>(key);
  if (!rec) rec = { authorId: randomBytes(12).toString("hex"), handle };
  rec.handle = handle.trim().slice(0, 40) || rec.handle; // handle is mutable; authorId is stable
  await getDb().set(key, rec);
  return rec;
}
```
The super-admin portal mints **per-room** author records too (keyed by the room being published from), so it never collapses to one constant. When G2 lands, `authorId` is swapped for the user id with no key migration (records are id-keyed, not authorId-keyed). The **handle** is the only thing a reader ever sees.

**Scrub + privacy gate (must-fix — allowlist, not denylist).**
```ts
// lib/gallery.ts — reuse B4's allowlist-strip as the PRIMARY control.
export function scrubForPublish(phases: unknown):
  | { ok: true; phases: PhaseInstance[] }
  | { ok: false; error: string } {
  const v = validatePhases(phases);            // B4: rebuilds each phase from zod parsed.data → {id, moduleId, config}
  if (!v.ok) return v;
  // Secondary belt-and-suspenders assert over the REBUILT objects.
  const BANNED = ["text","handle","token","votes","submissions","passcode","passcodeHashes","logoUrl","theme","participants"];
  for (const p of v.sanitized) {
    for (const k of Object.keys(p.config)) if (BANNED.includes(k)) {
      return { ok: false, error: `Disallowed field '${k}' in phase '${p.id}'` };
    }
  }
  return { ok: true, phases: v.sanitized };
}
```
Because `validatePhases` reconstructs each phase from the module schema's parsed output, **unknown/participant-derived keys are structurally dropped** before the assert ever runs — the denylist is only a secondary tripwire, and the vitest fixture proves an *unknown* extra config key is stripped (not merely that known-bad keys throw).

**Honest duration (must-fix — don't under-count untimed phases).**
```ts
// lib/gallery.ts
export function computeDuration(phases: PhaseInstance[]): {
  durationSeconds: number; durationLabel: string; facilitatedPhaseCount: number;
} {
  let timed = 0, facilitated = 0;
  for (const p of phases) {
    const t = Number((p.config as Record<string, unknown>).timerSeconds);
    if (Number.isFinite(t) && t > 0) timed += t;
    else if (p.moduleId !== "lobby" && p.moduleId !== "close") facilitated += 1; // host-paced
  }
  const min = Math.round(timed / 60);
  const label = facilitated > 0
    ? `~${min} timed min + ${facilitated} facilitated phase${facilitated === 1 ? "" : "s"}`
    : `~${min} min`;
  return { durationSeconds: timed, durationLabel: label, facilitatedPhaseCount: facilitated };
}
```
Duration is **always computed server-side from the phases**, never trusted from an author-typed number. The duration-band filter uses `durationSeconds` (timed) but the displayed label is honest about facilitated phases.

### API + host commands (+ capability gating)

**Host command (mutates only durable KV, no live state):**
- **`publishDesign { designId | phases, name, description, handle, org?, intentTag, whenToUse, groupSize?, consent, forkedFrom?, code }`** → `COMMAND_CAP` = `"configure"` (admin only).
  1. Resolve phases: by `designId` from B4's `getDesign` (preferred) or directly from `phases`. `scrubForPublish(phases)` → 400 on reject.
  2. Require `whenToUse` (≤280, trimmed, non-empty) and `consent === true` → 400 otherwise.
  3. `deriveHandleAuthor(room, handle)`; `computeDuration(phases)`.
  4. Build `CommunityDesign` (`id = randomBytes`, `status: "pending"`, `cloneCount: 0`, `reports: 0`, `featured: false`); write record key; under `withLock("lock:gallery:pendidx")` add to the pending map (soft cap per author + global). Return `{ ok: true, id }`. **No `navState`** (no live state touched).

**Public gallery endpoints (no passcode — mirror `/help` read path):**
- **`GET /api/gallery?tag=&duration=&group=&cursor=`** → `{ designs: CommunityDesignPublicMeta[], nextCursor? }` from `listPublic()` (paginated over the `pubidx` map). **Never** returns `authorId`/`reports`/`status`. Built-ins are merged **virtually** at request time (not stored).
- **`POST /api/gallery { id, reason? }`** → `reportDesign(id)`: atomic-under-lock `reports += 1`; when `reports >= REPORT_HIDE_THRESHOLD` (e.g. 3), flip `status: "hidden"` and remove from `pubidx` (re-queues for super-admin re-review). Lightweight rate sanity only; no accounts.
- **`GET /api/gallery/[id]`** → single `CommunityDesignPublic` **including `phases`** (needed for the clone seed + detail preview) — scrubbed shape, still no `authorId`.
- **`POST /api/gallery/[id]/clone`** → `incrementClone(id)` only: under `withLock("lock:gallery:pubidx")` (or an atomic `incr` on a dedicated counter key) bump `cloneCount`. **No auth, no elevated capability** — cloning is a client seed; the only server effect is the public metric. Returns `{ ok: true, cloneCount }`.

**Super-admin endpoint:**
- **`GET /api/admin/gallery?code=`** (`checkSuperAdmin`) → `{ pending, published }`.
- **`POST /api/admin/gallery { code, action: "approve"|"reject"|"feature"|"unfeature", id }`** (`checkSuperAdmin`): `approve` → `status:"published"`, move id pendidx→pubidx under lock; `reject` → `status:"hidden"`, drop from pendidx; `feature`/`unfeature` → toggle `featured` in record + pubidx.

**Capability boundary (explicit):**
- **Browse + Clone-seed:** no passcode, no capability — they touch only public reads + the client builder's local state + a public clone-count POST.
- **Publish:** room **admin `configure`** (it reads a saved `SessionDesign` and writes a durable artifact).
- **Approve / reject / feature:** **super-admin** (`checkSuperAdmin`) only — never per-room admin (`resolveRole` returns `"admin"` for room admins too; the super-admin check is independent, exactly as B4 gates global designs).
- **Launching a cloned design into a live room:** unchanged — the existing `setPhases` (`configure`) with `navState()` authoritative-apply.

### Rev / authoritative-apply pattern (no KV read-back)

G3 introduces **no new live-`SessionState` writes**. Library/publish/gallery/clone-count all touch the **durable `getDb()`** only — they have no `rev` and need no authoritative-apply. The **single** path that mutates live session state is launching a cloned design, and that is the **already-correct** B4/host `setPhases` flow: `setPhases(...)` returns the just-written `SessionState`, `navState(room, written, role)` packages it, and the client applies it via `usePolledState.apply` (the existing `cmd`/launch handler, gated on `typeof d.state.rev === "number"`). **No flow reads back from the eventually-consistent store.** Clone-seed hydration is pure client `useState` (like `loadTemplate`) and never reads live state. The pending/public membership maps may briefly lag a write under Upstash, but every read-by-id (clone seed, detail, approve) is an **exact-key get**, never index-dependent, and concurrent map mutations are serialised with `withLock` — so no lost update and no stale-flash.

## Implementation plan (ordered, checkable)

1. [ ] `lib/design.ts`: export `repairDependencies` (pure refactor).
2. [ ] `lib/gallery.ts`: types, `GALLERY_SCHEMA_VERSION`, keys, `deriveHandleAuthor` (random id), `computeDuration`, `scrubForPublish` (reuse B4 `validatePhases` + secondary assert), `publishDesign`/`approveDesign`/`rejectDesign`/`listPublic`/`getPublic`/`incrementClone`/`reportDesign`/`setFeatured`/`listPending` over `getDb()` + `withLock` + soft caps. Virtual built-ins helper (no write).
3. [ ] `test/gallery.test.ts`: full case list (below). **`npm run verify` green before any UI.**
4. [ ] `app/api/r/[room]/host/route.ts`: add `publishDesign` (cap `configure`, scrub+assert+require whenToUse+consent, write pending; no `navState`).
5. [ ] `app/api/gallery/route.ts` + `app/api/gallery/[id]/route.ts`: public GET list/detail + report + clone-count POST (no auth).
6. [ ] `app/api/admin/gallery/route.ts`: super-admin list/approve/reject/feature.
7. [ ] `components/PhaseRibbon.tsx`: presentational ribbon.
8. [ ] `app/gallery/page.tsx` + `app/gallery/[id]/page.tsx`: public server-rendered (mirror `/help`), `searchParams` filters, virtual built-ins, read-only preview.
9. [ ] `components/GalleryWall.tsx`: filters, clone target picker, seed routing, clone POST.
10. [ ] `components/PublishSheet.tsx` + wire into `components/DesignLibrary.tsx` / `BuilderApp` footer (admin-gated).
11. [ ] `components/BuilderApp.tsx`: `?seed=` arrival — fetch, hydrate like `loadTemplate`, deterministic repair + zod re-validate banner, opt-in AI fixes hidden when `!aiAvailable()`, one-shot clone POST.
12. [ ] `app/admin/page.tsx`: super-admin Community queue (approve/reject/feature).
13. [ ] `docs/templates.md`: document gallery/publish-queue/clone/consent/privacy.
14. [ ] Manual QA (below); `GALLERY_ENABLED` flag; `npm run verify` + Node 24/syd1 build green.

## Acceptance criteria (facilitator-outcome framed)

- [ ] A facilitator with the room **admin** code can publish a saved design with a required "When to use this" note + consent, and gets clear feedback that it is **queued for review** (not instantly public).
- [ ] A published design is **not visible** on public `/gallery` until an Edges super-admin **approves** it; rejecting it keeps it off the gallery.
- [ ] Anyone (no passcode) can open `/gallery`, filter by intent tag and duration band, and read each design's "When to use this", phase-ribbon, **honest** duration, and clone count — built-in methods show under a "By Edges" section.
- [ ] **Clone into a room** lands the design in the builder of a draft room the user administers, **pre-checked**: dangling `sourcePhaseId` repaired deterministically, any schema-invalid phase **flagged (not dropped)**, with **no AI call unless** the user explicitly taps "Apply AI fixes" (which is hidden when AI is unavailable).
- [ ] Cloning increments the design's **clone count** (the only public metric); the count is correct under concurrent clones.
- [ ] A published design contains **only** `{id, moduleId, config}` per phase plus author metadata — **no** participant submission, vote, pattern, handle-of-participant, passcode, or branding; an unknown extra config key is **stripped**, not merely rejected.
- [ ] No reader ever receives the `authorId`; the displayed identity is the chosen **handle** only, and the same author publishing from two different rooms is **not** collapsed to one constant id derived from a passcode.
- [ ] Re-publishing an edited clone credits the original ("Adapted from @X") via `forkedFrom`.
- [ ] Reporting a design N times **unlists** it pending super-admin re-review.

## Test plan

### Vitest (`test/gallery.test.ts`, in-memory store, no KV/AI)
- [ ] **Privacy fixture (hard CI gate):** publishing phases that include `__evil`, `submissions`, a participant `text` field, and an **unknown** extra config key stores **exactly** `{id, moduleId, config}` with the unknown key **dropped** (proves allowlist-rebuild, not denylist).
- [ ] `publishDesign` writes to **pending**, NOT public; `listPublic()` returns it only **after** `approveDesign`.
- [ ] `getPublic` and `listPublic` payloads **never** contain `authorId`, `reports`, or `status`.
- [ ] **Identity:** `deriveHandleAuthor` mints a **random** id (assert it is not `sha256(passcode)`), persists it, is stable across calls for the same room, **differs** across rooms, and lets `handle` change without changing `authorId`.
- [ ] **Honest duration:** a sequence with two timed phases + lobby + close + a readaround returns `durationSeconds` = sum of timers and a `durationLabel` that surfaces the facilitated (untimed) phase count.
- [ ] **Schema drift:** a published design stamped with an old `schemaVersion` containing a now-invalid config is **flagged** by the clone-time re-validate (deterministic), **never silently dropped** and never a raw `setPhases` 400.
- [ ] **Concurrency:** two interleaved `publishDesign`/`approveDesign` both survive in the pubidx map (lost-update regression); two interleaved `incrementClone` yield `+2` (atomicity regression).
- [ ] **Report-to-hide:** N reports flips `status` to `hidden` and removes it from `listPublic`.
- [ ] **Clone seed is auth-free + AI-free:** the public `GET /api/gallery/[id]` returns phases without any code, and the clone path runs `repairDependencies` + zod re-validate with **no `generateJSON` call** (assert AI service not invoked).
- [ ] **Super-admin gate:** `approve`/`feature` reject a non-super-admin code; per-room admin cannot approve.
- [ ] Built-ins are rendered **virtually** — `listPublic()`/the public index contains **no** built-in ids after a cold read (no write-on-read).

### Manual QA
- [ ] **Desktop publish:** publish from the library, see the "queued for review" toast; design is absent from `/gallery`.
- [ ] **Super-admin approve:** in `/admin` Community queue, approve it; it appears on `/gallery`; reject another and confirm it stays hidden.
- [ ] **Browse + filter:** filter by tag and duration band; built-ins show under "By Edges"; cards readable.
- [ ] **Clone:** from a gallery card, pick a draft room (admin code), land in the builder with the design seeded + a green/yellow banner; confirm **no AI call** until "Apply AI fixes" is tapped; with the AI key unset, the button is **absent**; clone count increments by one.
- [ ] **Launch the clone:** edit then Launch; room goes live via `setPhases`/`navState` with no stale flash.
- [ ] **Mobile (`/r/[room]/build` + `/gallery` on phone):** Publish sheet fields/consent usable at small width; gallery cards and the clone target picker tap-friendly; phase-ribbon legible.
- [ ] **Projector (`/r/[room]/screen`):** launching a cloned design transitions the projector to phase 1 correctly (same `setPhases` path — confirm no regression).
- [ ] **XSS check:** publish a design whose `whenToUse` contains `<script>` and an org with HTML; confirm it renders **escaped** on `/gallery` and the detail page.
- [ ] **Report:** report a design to the threshold; it disappears from `/gallery`.

## Privacy & ethos check (explicit)

- **Sharing the recipe, never the meal.** A `CommunityDesign` is pure config (`{id, moduleId, config}` per phase) + author metadata. The control is **B4's allowlist-rebuild** (each phase reconstructed from the module schema's parsed output, so unknown/participant-derived keys are structurally impossible), with a secondary denylist assert as a tripwire. A failing **vitest fixture** is the hard CI gate. Confirmed in code: `passcodeHashes` is never sent to clients; submissions live in a separate keyspace and are never read by the publish path.
- **First durable, public, no-TTL artifact — called out, not hidden.** The gallery deliberately deviates from the 24h-TTL ephemeral ethos because it holds **zero participant data**. To keep that honest on an account-less public surface: (a) **nothing lists publicly without super-admin approval**; (b) per-author and global **soft caps** on the index; (c) `whenToUse`/`handle`/`org` are **HTML-escaped** on render; (d) **report-to-hide** re-queues abuse for review; (e) a per-deployment **`GALLERY_ENABLED`** flag.
- **Account-less identity preserved.** No accounts, no seats. Identity = a **random** `authorId` persisted per room + a chosen **handle** (the only user-facing identity). It is **never** derived from a passcode hash or `ADMIN_PASSCODE` (which would be brute-forceable / collapse to one bucket). Migrates to a G2 user id by swapping the seed, no key migration.
- **Consent + adaptation norm.** Publishing requires an explicit consent line ("I'm sharing the method only — no participant data. Others may adapt and re-publish with credit"). Forks credit the original inline. This sets professional-sharing expectations up front.
- **Disclosure scope (documented):** a published design's full prompt/timing text is readable by **anyone on the internet** once approved. The publish sheet states this so authors don't paste client-confidential phrasing expecting privacy.

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Phantom "draft" store (critical).** Resolved: there is **no** server-side builder draft, and G3 invents none. **Clone is a client seed** — route to `/r/[room]/build?seed=<id>`, fetch the scrubbed design, hydrate phases into local `useState` exactly like `loadTemplate` (`BuilderApp.tsx:546`). No server write, no live `SessionState`, **no elevated capability** for cloning. The contradictory "clone needs `configure`" claim is voided.
2. **Auto-AI on every clone (critical).** Resolved: clone runs **only deterministic** checks — `repairDependencies` (pure) + zod re-validate vs `SERVER_MODULES` + dangling-ref scan — and drives the banner from those. **"Apply AI fixes" is explicit opt-in, hidden when `!aiAvailable()`.** No public button ever auto-bills an Opus call or serialises behind `withGenerateLock`.
3. **Passcode-derived authorId (critical).** Resolved: `authorId` is **`randomBytes`**, minted once and persisted per room (`rooms:gallery:author:{slug}`), never `sha256(passcode)`/`ADMIN_PASSCODE`. Super-admin publishes are per-room too (no single-bucket collapse). Handle is the only user-facing identity; migrates cleanly to a G2 id.
4. **Denylist privacy gate fails open (major).** Resolved: the **primary** control is B4's allowlist-**rebuild** (`validatePhases` reconstructs each phase from `parsed.data`, dropping unknown keys); the key denylist is a secondary assert. The fixture proves an *unknown* extra field is stripped.
5. **First public/durable/no-TTL/account-less surface = abuse magnet (major).** Resolved: **super-admin approval required before public listing**; per-author + global soft caps; `whenToUse` escaped on render; report-to-hide; `GALLERY_ENABLED` flag. (Open question answered: yes, a review queue is required for an account-less public durable surface.)
6. **Schema drift breaks launch atomically (major).** Resolved: clone-time **re-validate flags** invalid phases in the builder (not dropped, not a raw `setPhases` 400); a flagged phase **blocks launch** until edited or fixed. Test included.
7. **Seeding gallery from built-ins = write-on-read race + drift (minor).** Resolved: built-ins render as a **virtual "By Edges" section** computed from `TEMPLATES` at request time — **never written** to the durable index. Test asserts no built-in ids in the index.
8. **Dishonest "honest duration" (minor).** Resolved: `computeDuration` sums `timerSeconds` **and** surfaces the count of untimed/facilitated phases, presented as a range/composite label, computed **server-side** from the phases (never an author-typed number).
9. **Index lost-update + clone-count under eventually-consistent KV (from B4 carry-over).** Resolved: pending/public membership are single objects replaced **under `withLock`**; `incrementClone`/`reportDesign` are lock-guarded (or atomic `incr` on a counter key). Concurrency tests included.

## Out of scope / future

- **G2 accounts** — interim random `authorId` + handle ships now; real accounts migrate later with no key migration.
- **Cross-deployment shared gallery** — explicit **non-goal**; the gallery is scoped to one deployment's KV. A shared cross-tenant marketplace would need a central service and a different privacy/governance model.
- **Auto-create-room on clone** — MVP requires an existing draft room you administer (keeps room creation governed by admin code).
- **Lineage *browse* view** ("see all forks of this method") — the `forkedFrom` pointer + inline credit ship in MVP; the dedicated lineage explorer is fast-follow.
- **Ratings / "found this useful" / leaderboards** — deliberately omitted; clone count is the only metric (protects the calm, low-ego ethos).
- **"Featured by Edges" curated hero strips** on `/gallery` and `/admin` — the `featured` flag + toggle ship; the curated layout is fast-follow.
- **Rich moderation tooling** (appeals, author dashboards) — beyond approve/reject/feature + report-to-hide for v1.
