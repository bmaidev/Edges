# A4 — Memorable, editable room names & URLs

> Status: **READY TO BUILD** — final executable spec. Pressure-test must-fixes folded in (the original design's central safety premise was false and is corrected below; Slice 2 is descoped).

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** **2 days** for the shippable MVP (Slice 1 only). Full vision (Slice 2 rename) is a separate, later **2.5d** once a real quiesce signal exists — see *Out of scope*.
- **Section:** A. First-run & access
- **Depends on / touches (item ids are file-level dependencies, no other roadmap items block this):**
  - `lib/rooms.ts` — `createRoom` / `updateRoom` / `listRooms` / `getRoom` / `roomKey` / `ROOM_INDEX_KEY` / `checkSuperAdmin` / the durable `DurableBackend` (`get/set/del` only — **no setNX today**, we add one).
  - `lib/session.ts` — `roomKeys()` factory (the 8 live keys: state, participants, submissions, content, patterns, **passcodes**, votes, words).
  - `lib/auth.ts` — `checkSuperAdmin` gate (admin routes do NOT use `requireCapability`).
  - `app/api/admin/rooms/route.ts` (POST create) and `app/admin/page.tsx` (CreateRoom + RoomCard UI).
  - No new npm dependencies. No module-contract changes.

---

## Problem & facilitator value

**Problem.** Room slugs are random (`grove-40ed`). The slug *is* the storage key, so it cannot be chosen or corrected without recreating the whole room (which rotates the passcodes). On a printed QR or projector, `grove-40ed` is unmemorable and unspeakable.

**Facilitator value (in their voice):**
> "I want to name the room something I can say out loud into a phone — `/r/strategy-offsite` — and print on the handout. If I fat-finger it, I want to fix the typo in two seconds, not rebuild the room and re-share three new passcodes."

The thin, high-value win is **choosing a memorable address at create time**. That alone delivers "say it into a phone" and "print it" — ~80% of the value — and touches only the create path, so it is near-zero risk.

---

## MVP cut (thinnest shippable) vs Full vision

### MVP — Slice 1 ONLY (this spec builds this)
1. A **chosen, normalised, validated, atomically-reserved** slug at create time (replaces the weak 5-try `randomSlug` loop).
2. A **live availability check** (`free` / `taken` / `invalid` / `reserved`, with a free-slug suggestion).
3. **CreateRoom** gains a *Room address* field that auto-fills from the name and previews the full URL.
4. **Name-only inline edit** on each room card — pure wiring; `updateRoom` already `Pick`s `name`.
5. Vitest coverage incl. TOCTOU (two concurrent creates on the same slug → one wins, other gets a fresh suggestion).

Existing rooms are untouched. No middleware, no re-keying, no redirects — none of that is needed for Slice 1.

### Full vision — Slice 2 (DEFERRED, documented in *Out of scope*)
Inline **rename** of an existing room: re-key every slug-derived key under a lock, leave a durable `slug→slug` redirect so printed QRs keep resolving, 308 old browser navigations to new. **Gated on `status === "archived"` and `participantCount === 0` only** (see Risks — "draft" does NOT mean quiesced in this codebase). Shipped only when a real "renaming"/quiesce writer-block exists.

---

## Experience & flows

### Screen: CreateRoom (in `app/admin/page.tsx`)
New **"Room address"** input directly under the name field.

- **Auto-fill:** as the facilitator types the name, the address field mirrors a normalised slug (`Strategy Offsite` → `strategy-offsite`) **until they manually edit the address field**, after which it stops tracking the name (a `slugDirty` flag).
- **Live URL preview** under the input: `{origin}/r/strategy-offsite` (uses `window.location.origin`).
- **Debounced availability** (350ms after last keystroke) calling the availability route. States and copy:
  - `free` → green check, "Available."
  - `taken` → amber, "Taken — try **strategy-offsite-2**?" (suggestion is a clickable chip that fills the field).
  - `invalid` → red, "Use lowercase letters, numbers and hyphens (3–32 chars)."
  - `reserved` → red, "That address is reserved. Pick another."
  - empty → neutral, "We'll generate one for you." (server falls back to `randomSlug` shape).
- **Create** is allowed when state is `free` OR the address is empty (server fills a random slug). On `taken`/`invalid`/`reserved`, the Create button is disabled with the inline message.
- On success the passcode card prints the **human slug** (already wired via `created.slug`).

### Screen: RoomCard — name-only inline edit
- The room **name** becomes click-to-edit (pencil affordance). Enter / blur → `PATCH {name}` via existing `updateRoom`. Optimistic local update; on 4xx revert and toast "Couldn't rename."
- The slug line stays **read-only** in the MVP (no rename pencil yet). It renders `/{slug}` with a copy button for the full URL.

### TOCTOU flow (create)
Two facilitators reserve `team-sync` at once. The first `setNX` claim wins; the second create returns **409 `{ error: "taken", suggestion: "team-sync-2" }`**. The admin UI surfaces the suggestion chip; one click + Create succeeds. No silent overwrite, no recreated room.

---

## Architecture

### Files to ADD

**`/Users/jordan/workshop/edges-v2/lib/slug.ts`** — pure, dependency-free, reused by API + tests.
```ts
// Lowercase, hyphenate, strip to [a-z0-9-], collapse/trim hyphens, clamp 3–32.
export function normalizeSlug(input: string): string;

// Top-level path segments that must NEVER be a room slug, because they are real
// Next routes / static assets at the ROOT and would collide with a future
// middleware matcher. (NOTE: /r/{slug}/host etc. are SUB-paths and do NOT
// collide — see Risks. This set is the *real* collision class + a small UX
// blocklist.) Held as a readonly array; membership via .includes (NO Set spread,
// NO .entries() — downlevelIteration is off).
export const RESERVED_SLUGS: readonly string[]; // ['admin','api','help','r','new','_next','favicon.ico','robots.txt','sitemap.xml','state','stream','action','join','host','screen','build','qr','upload']

export function isReservedSlug(slug: string): boolean;

// 'empty' | 'invalid' (didn't survive normalize / <3 / >32) | 'reserved'
export function validateSlug(normalized: string):
  | { ok: true }
  | { ok: false; reason: "empty" | "invalid" | "reserved" };

// normalizeSlug(name); if it fails validation, return a randomSlug()-shaped value.
export function slugFromName(name: string): string;
```
- `normalizeSlug`: lowercase → replace any run of non-`[a-z0-9]` with `-` → trim leading/trailing `-` → `slice(0,32)` → trim trailing `-` again. Min length 3 enforced by `validateSlug` (returns `invalid` if `< 3`).
- `slugFromName` keeps `randomSlug`'s shape (`word-xxxx`) as the empty/invalid fallback so existing behaviour is preserved when no address is given. `randomSlug` stays in `rooms.ts`; export a thin `randomSlug()` from rooms or duplicate the word list — prefer importing the existing one into `rooms.ts` create path and keeping `slug.ts` dependency-free (slug.ts only needs the *shape* via a passed-in fallback). **Decision:** `slugFromName` lives where `randomSlug` lives (`rooms.ts`), and `slug.ts` exports only the pure normalise/validate/reserved helpers. This keeps `slug.ts` zero-dependency and testable.

**`/Users/jordan/workshop/edges-v2/app/api/admin/rooms/availability/route.ts`** — NEW.
```
GET /api/admin/rooms/availability?code=ADMIN&slug=foo
  → 200 { state: 'free'|'taken'|'invalid'|'reserved', normalized: string, suggestion?: string }
  → 403 on bad code
```
`checkSuperAdmin`-gated. Calls `slugAvailable(slug)` (below). `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

**`/Users/jordan/workshop/edges-v2/test/rooms-slug.test.ts`** — Vitest, in-memory store (no KV/AI).

### Files to CHANGE

**`/Users/jordan/workshop/edges-v2/lib/rooms.ts`**
1. **Add a durable `setNX` to `DurableBackend`** (it currently has only `get/set/del`; the `store.ts` `setNX` is a *different*, TTL'd backend — it cannot be reused). Signature: `setNX<T>(key: string, value: T): Promise<boolean>` — **no TTL** (rooms are durable).
   - KV impl: `await client.set(key, value, { nx: true })` and return truthy (`@vercel/kv` returns `"OK"` on set, `null` when NX fails). `return res === "OK"`.
   - Memory impl: `if (mem.has(key)) return false; mem.set(key, value); return true;`
2. **Rewrite `createRoom(name, topic, templateId, desiredSlug?)`:**
   - `const wanted = desiredSlug?.trim() ? normalizeSlug(desiredSlug) : slugFromName(name);`
   - If a `desiredSlug` was explicitly provided, `validateSlug(wanted)` → on `reason` throw a typed `SlugError` (a small class/tagged error with `.reason`) that the route maps to **400**. (When the field was empty we used `slugFromName`, which already returns a valid shape — no throw.)
   - **Atomic claim:** build the full room record, then `const claimed = await db.setNX(roomKey(wanted), room)`. If `!claimed`, compute `suggestNextFreeSlug(wanted)` and throw `SlugTakenError(suggestion)` → route maps to **409 `{ error: 'taken', suggestion }`**. No more 5-try loop, no read-then-write race.
   - Index push unchanged (still de-duped).
   - `suggestNextFreeSlug(base)`: try `base-2`, `base-3`, … up to ~`-9` checking `db.get(roomKey(...))` for a free one; if all taken, fall back to `randomSlug()`. (This is a *suggestion only*, not a claim — the retry create re-runs the atomic `setNX`.)
3. **Add `slugAvailable(input: string): Promise<{ state; normalized; suggestion? }>`:**
   - `normalized = normalizeSlug(input)`; if input empty → `{ state:'free', normalized:'' }` (server will generate).
   - `validateSlug` → `invalid`/`reserved` short-circuit.
   - `await getRoom(normalized)` exists → `{ state:'taken', normalized, suggestion: suggestNextFreeSlug(normalized) }`, else `{ state:'free', normalized }`.
4. `updateRoom` **unchanged** (already `Pick`s `name`).
5. **Do NOT** add `renameRoom`, redirect helpers, or `migrateRoomKeys` in this slice (Slice 2).

**`/Users/jordan/workshop/edges-v2/app/api/admin/rooms/route.ts`** (POST)
- Accept optional `body.slug`. Pass as `desiredSlug` to `createRoom`.
- Wrap in try/catch: `SlugError` → 400 `{ error: reason }`; `SlugTakenError` → 409 `{ error:'taken', suggestion }`. Response otherwise unchanged: `{ slug, name, passcodes }`. Still `checkSuperAdmin`-gated.

**`/Users/jordan/workshop/edges-v2/app/admin/page.tsx`**
- **CreateRoom:** add the *Room address* input (auto-fill + `slugDirty` flag), URL preview, debounced availability fetch, disable Create on non-free, send `slug` in the POST body, surface 409 suggestion chips.
- **RoomCard:** make the **name** click-to-edit → `PATCH {name}`; optimistic update with revert-on-error. Slug stays read-only.

### Data model

- **No new durable entity.** `Room` interface unchanged (`slug` stays the primary key and the `roomId` passed to the session store). `createdAt` and `passcodeHashes` are untouched by anything in this slice.
- **New durable backend method:** `setNX` (no TTL) on `DurableBackend`. The reservation reuses `roomKey(slug) = "rooms:room:{slug}"` as the claim token — no separate reservation key.
- **No new KV keys, no redirect records, no view-shape changes** in the MVP. (Slice 2 would add `rooms:redirect:{old}` → `newSlug`.)
- Reserved/validation logic is pure (`lib/slug.ts`) and carries no PII.

### API + capability gating

| Endpoint | Change | Gate |
|---|---|---|
| `POST /api/admin/rooms` | optional `body.slug`; 400 invalid/reserved, 409 `{error:'taken',suggestion}` | `checkSuperAdmin` |
| `GET /api/admin/rooms/availability` | **NEW**; `{state,normalized,suggestion?}` | `checkSuperAdmin` |
| `PATCH /api/admin/rooms/[slug]` | name-only edit already supported via `updateRoom`; **no rename body added in MVP** | `checkSuperAdmin` |

**Capability note.** Admin routes gate on `checkSuperAdmin`, not `requireCapability`. Choosing a slug at create time is admin-only — consistent with the documented "config-class changes are admin-only" gotcha. **If a future rename is ever surfaced through a host route it MUST gate on the admin `configure` capability, never `advance`.** No new capability is required for this MVP.

### rev / authoritative-apply pattern (no KV read-back)

- Create returns the **authoritative `{ slug, name, passcodes }`** computed from the just-written record; the admin client navigates/links from that response directly. **No read-back** of KV is used to confirm the slug.
- This slice writes **no `SessionState`**, so it neither bumps nor depends on `state.rev`. The anti-flash polling guard and host `navState`/`getFacilitatorState` authoritative-apply path are **untouched**. (Slice 2's rename *would* bump `rev` on the new key via `writeState`; out of scope here.)

---

## Implementation plan (ordered, checkable)

1. [ ] **`lib/slug.ts`** — `normalizeSlug`, `RESERVED_SLUGS` (readonly array), `isReservedSlug`, `validateSlug`. No Set spreads / `.entries()`.
2. [ ] **`lib/rooms.ts`** — add typed `SlugError` (`.reason`) + `SlugTakenError` (`.suggestion`); add durable `setNX` to both backend impls; add `slugFromName`, `suggestNextFreeSlug`, `slugAvailable`.
3. [ ] **`lib/rooms.ts`** — rewrite `createRoom` to accept `desiredSlug?`, normalise+validate, atomic `setNX` claim, throw on collision. Remove the 5-try loop.
4. [ ] **`app/api/admin/rooms/route.ts`** — POST passes `body.slug`; map `SlugError`→400, `SlugTakenError`→409.
5. [ ] **`app/api/admin/rooms/availability/route.ts`** — NEW gated GET → `slugAvailable`.
6. [ ] **`app/admin/page.tsx`** — CreateRoom address input (auto-fill, `slugDirty`, URL preview, debounced availability, suggestion chips, send `slug`).
7. [ ] **`app/admin/page.tsx`** — RoomCard name click-to-edit → `PATCH {name}`, optimistic + revert.
8. [ ] **`test/rooms-slug.test.ts`** — cases below.
9. [ ] `npm run verify` (typecheck + lint + test) green; build green. Manual QA below.

---

## Acceptance criteria (facilitator-outcome framed)

1. A facilitator can type "Strategy Offsite", see the address auto-fill to `strategy-offsite` and the live URL `/r/strategy-offsite`, and create the room at that exact address.
2. Typing a taken address shows "Taken" with a one-click suggestion that, when chosen, creates successfully.
3. Typing `Help` or `admin` or `ab` (too short) or `!!!` shows a clear reserved/invalid message and the Create button is disabled — the facilitator cannot create a room that shadows a real route or a broken URL.
4. Leaving the address blank still creates a room (server generates a `word-xxxx` slug) — no regression for facilitators who don't care.
5. Two facilitators racing the same address: exactly one room is created at that slug; the other is offered the next free address, never a silent overwrite.
6. A facilitator can fix a typo in the **room name** inline on the card and see it persist on refresh — without recreating the room or rotating passcodes.
7. Created room's passcode card prints the human slug; the printed/spoken URL works on a phone.
8. `npm run verify` is green; no module-contract, rev, or privacy regression.

---

## Test plan

### Vitest (`test/rooms-slug.test.ts`, in-memory store)
- `normalizeSlug`: "Strategy Offsite!" → `strategy-offsite`; collapses/​trims hyphens; clamps to 32; strips unicode/punctuation.
- `validateSlug`: `""`→empty; `ab`→invalid; 33-char→invalid (after clamp it's ≤32, so assert clamp + a too-short case); `admin`/`api`/`help`/`r`/`favicon.ico`→reserved.
- `createRoom` with `desiredSlug:"team-sync"` → room.slug === `team-sync`, passcodes returned once.
- `createRoom` with reserved/invalid `desiredSlug` → throws `SlugError` with the right `.reason`.
- **TOCTOU:** `await Promise.all([createRoom(..,'dup'), createRoom(..,'dup')])` with one wrapped to catch — exactly one resolves, the other throws `SlugTakenError` whose `.suggestion` is `dup-2`; only one `rooms:room:dup` exists and the index has no dup.
- `createRoom` with empty desiredSlug → slug matches `word-xxxx` shape (`/^[a-z]+-[0-9a-f]{4}$/`).
- `slugAvailable`: free / taken (+suggestion) / invalid / reserved branches.
- `updateRoom('slug',{name})` → name changes, `passcodeHashes` and `createdAt` unchanged.

### Manual QA
- **Desktop admin:** create with a chosen address; observe free/taken/invalid/reserved states and suggestion chip; create blank → random slug; inline-rename a room name and refresh.
- **TOCTOU smoke:** two browser tabs, same address, click Create near-simultaneously → one succeeds, one gets the suggestion.
- **Mobile (phone):** open `/r/strategy-offsite` typed by hand into mobile Safari/Chrome → loads the participant join screen (proves "say it into a phone").
- **Projector:** open `/r/strategy-offsite/screen` → the human slug shows on the projector/QR card; scan the QR from a phone → joins.

---

## Privacy & ethos check (explicit)

- **No PII added.** Slug + reserved-word logic is pure routing/UX metadata.
- **No new logging.** Availability check logs nothing about submissions or participants.
- **Account-less, off-the-record, 24h TTL, End-session wipe** — all unchanged. This slice writes only the durable room record (already durable, no TTL) at create; it does not touch session data.
- **Passcodes are never rotated** by anything here; name edits and slug choice leave `passcodeHashes` intact.
- Reserved-word list is a structural/UX blocklist only — **no profanity/impersonation filtering** is implied or added (open question, out of scope).

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **CRITICAL — "draft means quiesced" is FALSE → rename is unsafe.** `status:"live"` is **never assigned** anywhere in `app/` or `lib/` (confirmed: only `"draft"` at create and `"archived"` at end). A room runs its entire 40-person live session as `"draft"`, with concurrent `RPUSH`/`hset` participant writes. A copy-swap re-key gated on `"draft"` would race those writes on eventually-consistent Upstash and silently drop/orphan submissions. **Resolution: rename (Slice 2) is CUT from this build.** The MVP touches only the create path — zero concurrency hazard. When rename ships it must gate on `status === "archived"` **and** `participantCount === 0` (the only truly writer-free state), or introduce a real "renaming"/quiesce flag that `addSubmission`/`castVote` honour.
2. **MAJOR — scope creep (middleware + per-route `resolveRoomSlug` + redirect-chain collapse).** All of that plumbing exists only to keep *live* clients connected across a rename — which contradicts the safety claim that rename happens when no one is connected. **Resolution: none of it is built.** No `middleware.ts`, no redirect records, no `resolveRoomSlug` wiring in this slice.
3. **MAJOR — `endSession` must NOT wipe redirects.** (Pre-empted for Slice 2.) Redirect records are pure `slug→slug` routing with no PII; wiping them on End-session would kill the printed-QR durability that justifies the feature. **Resolution: when Slice 2 lands, `endSession` will NOT clear redirects; they ride the durable room lifecycle and clear only on explicit room delete / slug reclaim.** No change to `endSession` in the MVP.
4. **MAJOR — key-enumeration drift.** `roomKeys()` returns **8** keys incl. `passcodes:hash`; any hand-written migrate list will silently drop a key. **Resolution (for Slice 2):** any future `migrateRoomKeys` MUST iterate `Object.entries(roomKeys(old))` vs `roomKeys(new)` programmatically (copy by underlying op type), with a test asserting every `roomKeys()` key is covered. Not applicable to the MVP (no migration).
5. **MINOR — reserved-word collision class.** `/r/{slug}/host` etc. are *sub-paths* and do not actually collide with `/r/{slug}`. The real collision class is top-level segments (`admin`, `api`, `_next`, `favicon.ico`, `robots.txt`, `help`, `r`, `new`). **Resolution:** `RESERVED_SLUGS` includes the real top-level segments plus a small UX blocklist of confusing host-ish words; documented in `slug.ts`.
6. **MINOR — durable `setNX` with no TTL burns slugs permanently / a crashed half-create looks like a real room.** Acceptable at current scale. **Resolution:** documented; slug reclaim for archived rooms is an *Out of scope* open question. The atomic claim writes the **full room record** (not a bare token), so there is no separate orphan-able reservation key.
7. **MINOR — `@vercel/kv` `set(...,{nx:true})` return shape.** Returns `"OK"` on success, `null` on NX-fail. **Resolution:** durable `setNX` returns `res === "OK"`; covered by the in-memory test path and verified against the KV client contract.

---

## Out of scope / future (open questions to resolve before Slice 2)

- **Inline rename (Slice 2, ~2.5d):** `renameRoom` copy-swap via programmatic `migrateRoomKeys` under `withLock(old,'rename')`, durable `slug→slug` redirect (default ON), `middleware.ts` 308 for browser navigations only (matcher MUST exclude `/api`, `/admin`, `/_next`, static assets so in-flight POST/SSE are never redirected), and a redirect-chain follow bounded to ~3 hops. **Gated `status==='archived' && participantCount===0` until a real live-quiesce exists.**
- **Live rename:** needs a "renaming" writer-block (`/action` 503s while held) before it's safe.
- **Redirect lifetime:** durable vs a 24h cap; reverse index `rooms:redirect:rev:{new}` for O(1) chain collapse.
- **Reclaim archived slugs** for recurring monthly events.
- **Global vs org-prefixed slug namespace** ahead of shared SaaS.
- **Profanity / impersonation filtering** — currently only a structural reserved-word blocklist.
