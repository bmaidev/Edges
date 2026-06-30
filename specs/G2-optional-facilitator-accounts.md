# G2 — Optional facilitator accounts (privacy-preserving)

> Status: ready-to-build executable spec. Every pressure-test must-fix is folded in (persisted non-released single-use consume marker; POST-confirm callback that survives email-scanner prefetch; CSRF origin check on all state-changing studio routes; field-atomic co-owner edges + `setNX`-guarded lazy account creation; `HMAC(STUDIO_SECRET, email)` lookup key; `claimRoom` raised to `configure`; permanent-save warning on Designs; token stripped via redirect + `Referrer-Policy: no-referrer`; build-time `NEXT_PUBLIC_STUDIO_ENABLED` probe gate). Where this spec and the original design disagree, **this spec wins** — deltas are flagged inline. The biggest delta: **v1 ships the Export-JSON MVP (no accounts, no cookies, no email)**; the full account/magic-link/History layer is a clearly-bounded Phase 2 in the same file, also fully specified.

## Priority / effort / dependencies

- **Priority:** P1
- **Section:** G. Differentiators / moonshots
- **Effort:** **11 days total** — MVP (Export-JSON) **2 days**; Full account layer **9 days** (the original 9-day estimate was optimistic; the email-scanner confirm-step, CSRF hardening, and durable-KV concurrency work are now in scope and absorbed within the 9). Ship as two separately-gated phases.
- **Dependency item ids:** none hard (additive on shipped infra). **Reuses (does not depend on):**
  - **B4** (`save-session-as-template`) — if B4's `lib/designs.ts` / `SessionDesign` ships first, G2's Designs reuse it verbatim instead of redefining. G2 degrades gracefully if B4 is absent (defines its own `Design` type). Coordinate at build time.
  - `lib/rooms.ts` — `createRoom` / `getRoom` / `updateRoom` / `RoomTheme` / `RoomArchive` / `getArchive` / `checkSuperAdmin` / `resolveRole` / shared `db` (durable, no-TTL) + `sha256` / `safeEqualHex` (to be exported).
  - `lib/auth.ts` — `requireCapability` (`configure` for claim + apply).
  - `lib/store.ts` — `setNX` (single-use consume + lazy-account guard), `withLock` (per-email rate-limit only).
  - `app/api/r/[room]/host/route.ts` — `setPhases` path (Studio "Use design" replays it; gating reused) + `navState` authoritative-apply.
  - `lib/modules/registry.server.ts` — `getServerModule().schema` (phase validation + Designs-detail labels).
  - `lib/templates.ts` — `PhaseInstance` shape (a Design is a user-authored sibling template).
  - `@vercel/blob` existing logo URLs (Brands reference, no new upload).
  - `app/admin/page.tsx` palette-preview block + AI report renderer (extract to shared components, reuse verbatim).
  - `node:crypto` HMAC for magic-link tokens + session signing.

---

## Problem & facilitator value

**Problem.** Every facilitator artifact in Edges is tied to a ROOM, and rooms are reachable only two ways: the single super-admin env passcode (`ADMIN_PASSCODE`, all-powerful, shared) or the three per-room passcodes shown ONCE at creation. There is no "me." A pro who runs Edges weekly cannot: (1) see "my rooms" without re-entering the shared env code; (2) reuse a `/build` sequence — the builder posts `setPhases` as an ephemeral 24h-TTL write, so a great chain dies with the room; (3) carry branding (`RoomTheme`: palette + logo + headline/tagline) between rooms — they re-pick five hex colours and re-upload the logo every time; (4) keep history — `RoomArchive` + AI `SessionReport` are durable but keyed by slug, findable only if you still hold that slug's admin code; (5) hand off / collaborate — no notion of "this room belongs to Dana." Edges is a brilliant single-session instrument with amnesia between sessions. The `lib/rooms.ts` header already reserves the relational tier for "Phase 6 (analytics/history)" — this is that tier, scoped tight.

**Facilitator value (in their voice).** "I get a real workspace without Edges ever becoming 'an app you log in to so you can be a participant.' One personal magic-link login opens **/studio** — my rooms, my saved designs, my brands, my session history — instead of hunting for slugs and one-time codes in a notes app. I save a polished `/build` sequence as a reusable Design ('Pre-mortem + Min Specs, 45 min, my wording') and spin up next week's room from it in one tap, branding already applied. My visual identity — Black Mountain AI logo, palette, headline voice — lives as a Brand I attach to any new room. Past sessions accrue as a private History wall of AI reports I can revisit, copy, or delete. And the pitch that earns my trust: **Edges remembers my craft, not my participants.** It's optional and additive — the env super-admin still works, anonymous 'create a room and write down the codes' still works, and if I never sign in I lose nothing."

---

## MVP cut (thinnest shippable) and Full vision

The pressure-test verdict is **needs-changes** with **HIGH scope risk**: this is the largest item in the fleet by surface area, introduces the codebase's *first cookie* and *first external email dependency*, and the email-scanner prefetch problem alone forces a callback redesign. So we deliberately split.

### MVP — "Designs & Brands as self-stored export" (2 days, ships first, zero new auth/privacy surface)

Delivers ~80% of the pro value at ~40% of the risk, killing the **#1 cited pain** ("the great sequence dies with the room") immediately, mirroring the existing "copy your passcodes to your notes app" pattern:

1. **Export a Design.** In `BuilderApp`, an **"Export design"** button serializes the current `parsedPhases()` + `name` + `minutes` into a signed base64url envelope (HMAC over the payload with `STUDIO_SECRET` if set, else unsigned) and offers copy-to-clipboard + download `.edgesdesign.json`. No account, no cookie, no email.
2. **Import a Design.** In `BuilderApp`, an **"Import design"** field accepts the blob/file, re-validates every phase via `getServerModule().schema` (same validation as the `setPhases` path), and hydrates the builder. Launch still routes through the unchanged `setPhases` (`configure`) — gating untouched.
3. **Export / Apply a Brand.** In the admin theme panel (`app/admin/page.tsx`), **"Export brand"** serializes the current `RoomTheme`; **"Import brand"** validates and PATCHes the room theme via the *existing* `saveTheme` flow (which already carries the admin code). Logo by Blob URL reference — no media duplication.
4. **Permanent-save warning** (privacy must-fix, applies to both phases): at every export/save, one line — *"Designs are saved permanently and store your wording — don't paste participant quotes into prompts."*

MVP is inert-by-default for the env-passcode user: the buttons appear only when `NEXT_PUBLIC_STUDIO_ENABLED === "1"`.

### Full vision — "Studio" account layer (9 days, Phase 2, separately gated on `STUDIO_SECRET`)

Everything in the design: magic-link login → **/studio** (Rooms / Designs / Brands / History), durable account-scoped storage, `★ Save to Studio` / `★ Save as Brand` / `★ Claim this room` in-context affordances, account settings (export / delete / change email). Ships **dark** (inert unless `STUDIO_SECRET` set AND `NEXT_PUBLIC_STUDIO_ENABLED==="1"`). Detailed in full below.

---

## Experience & flows (screens, states, copy)

**Visual system throughout:** existing refined-editorial (Fraunces/Hanken, gradient-mesh). Studio is a *quiet atelier*, not a SaaS dashboard. A **persistent privacy footer** sits on every Studio screen: *"Your account stores your designs, brands and session reports. It never stores participant identities or live submissions — those still vanish in 24h."*

### Studio screens & states

- **/studio (signed-out).** One-line promise: *"Sign in to save your rooms, designs and brands. Participants never need an account; this is just for you."* + magic-link email field + a link to `/admin` for the classic env-passcode path + privacy footer.
- **/studio (link-sent).** *"Check your email — open the link and confirm to sign in. No password. The link works for 15 minutes."* + resend (rate-limited).
- **Confirm-sign-in page** (rendered by the GET callback, see Architecture). *"Confirm sign-in as {email-masked}"* + a single **Confirm** button that **POSTs** the token. Copy: *"Confirming signs you in for 30 days on this device."* (This page is what defeats email scanners — a GET prefetch only renders the button, never consumes the token.)
- **/studio home (signed-in).** Header *"Your studio · {email}"* + one-tap **Sign out** (copy: *"Signing out leaves your live rooms running, untouched."*). Three cards:
  - **Rooms** — owned rooms with live/draft/archived chips; join/host/build/screen/qr links reused from the admin `RoomCard` link row.
  - **Designs** — saved sequences (phase count + minutes + **Use**).
  - **Brands** — palette swatches + logo thumb + **Apply to a room**.
  - Collapsed **History** drawer.
- **Studio › Designs detail.** Read-only phase list (module labels via `getServerModule`), **Open in builder** (loads into `/build`), **Use → choose room**, rename, delete. Save-time warning line (above).
- **Studio › Brands detail.** Live palette preview (reused `ThemePreview` block) + logo + headline/tagline; **Apply to room…** picker; delete.
- **Studio › History.** `RoomArchive` cards (sessionName, date, participantCount, AI report summary) reusing the extracted `ReportCard`; **copy** + **delete-forever**; empty state *"Archived sessions you own show up here."*
- **Account settings (minimal).** Change email (re-verify via a fresh magic link), **Export my studio** (JSON of designs + brands + owned-room slugs + archive refs), **Delete my account** — loud copy: *"This deletes your saved designs, brands and room links. It does NOT end or wipe any live room, and it does NOT delete session archives — those stay room-scoped. Participants are unaffected."*

### In-context affordances (signed-in only; hidden when the probe says signed-out)

- `★ Save to Studio` in `BuilderApp` (next to Apply/Launch) with the gotcha hint: *"You can save this; launching a custom design still needs the room's ADMIN passcode."*
- `★ Save as Brand` + `Apply saved Brand` in the admin theme panel.
- `★ Claim this room` in the `HostConsole` authed header (shown only when signed-in AND not already an owner), reusing the console's already-entered passcode as proof of control. Copy near it: *"Ownership lets you find this room in your Studio. It does not grant live control — driving the room still needs its passcode."*

### Key flows (Full)

1. **First sign-in.** /studio → email → `POST /api/studio/auth/request` (rate-limited, content-free log) → email link → **GET callback renders Confirm page** → **POST confirm** verifies + single-use-consumes the token, lazily creates the Account (`setNX`-guarded), sets the `edges_fac` cookie → redirect to /studio (token stripped from URL).
2. **Claim/create a room as me.** Studio "New room" calls `createRoom()` then writes the field-atomic ownership edge; passcodes shown once (unchanged). Existing rooms claimed in the host console via `★ Claim this room` (requires holding the **admin** passcode — `configure`).
3. **Save a design.** `/build` `★ Save to Studio` serializes `parsedPhases()` + `sessionName` + `minutes` → `POST /api/studio/designs` (pure storage). Studio › Designs › **Use** → pick/create a room → posts the SAME `setPhases` payload (gating unchanged: launching a custom design still needs `configure`).
4. **Reuse a brand.** Admin theme panel `★ Save as Brand` snapshots `RoomTheme`. **Apply** → `POST /api/studio/apply` which *re-proves room control by passcode* then PATCHes theme.
5. **Revisit history.** Studio › History lists this account's `RoomArchive`s newest-first, read-only, copy + delete-forever (drops the owner edge, never the room-scoped archive).
6. **Opt-out / no-account.** Every flow remains reachable WITHOUT an account exactly as today. Sign-out clears only the cookie.

---

## Architecture

### Files to ADD

| Path | Purpose |
| --- | --- |
| `lib/crypto.ts` | Extracted shared `sha256` / `safeEqualHex` + new `hmac(secret, msg)` (hex) + `safeEqualHex` reused for constant-time. `lib/rooms.ts` re-exports from here to avoid a churn diff. |
| `lib/design-share.ts` | **(MVP)** Pure client/server-safe `encodeDesign(d): string` / `decodeDesign(blob): Design` base64url envelope with optional HMAC signature + `encodeBrand` / `decodeBrand`. No store, no auth — used by the export/import buttons. Re-validates phases via `getServerModule().schema` on decode. |
| `lib/accounts.ts` | **(Full)** Durable account layer on the shared `db` (no-TTL). Types `Account` / `Design` / `Brand` (below). Functions: `getOrCreateAccountByEmail` (`setNX`-guarded), `getAccount`, `saveDesign`/`listDesigns`/`deleteDesign`/`renameDesign`, `saveBrand`/`listBrands`/`deleteBrand`, `addRoomOwnership`/`removeRoomOwnership`/`listOwnedRooms`/`listRoomOwners` (**field-atomic hash edges**, `Array.from` only — no Set spreads/`.entries()`), `deleteAccount` (drops edges+designs+brands, leaves rooms+archives), `exportAccount`. |
| `lib/studio-session.ts` | **(Full)** The ONLY module that touches the facilitator session; never imported under `app/r` except the single `claimRoom` host command. `mintMagicToken(emailHash)` → `{tokenId, token}` single-use 15-min HMAC(`STUDIO_SECRET`); `consumeMagicToken` (**`setNX(consume:{tokenId},1,900)` — never released**, then verify); `setSessionCookie`/`clearSessionCookie`/`readSession(req)` for `edges_fac` (httpOnly, Secure, SameSite=Lax, Path=`/`, 30-day rolling, value = HMAC-signed `accountId`); `sendMagicLink(email, link)` with provider gating — if no `RESEND_API_KEY`, `console.info` the link (content-free) and return `devLink` in non-prod (mirrors `aiAvailable()`); `assertSameOrigin(req)` **CSRF origin/host check** helper. |
| `app/studio/page.tsx` | **(Full)** /studio entry (signed-out / link-sent / signed-in), `Referrer-Policy: no-referrer` header, delegates to `StudioApp`. |
| `components/StudioApp.tsx` | **(Full)** Client Studio shell: header + sign-out, Rooms/Designs/Brands cards (reused `RoomCard` link row), History drawer, Designs/Brands/History detail panels, account settings, persistent privacy footer. |
| `app/api/studio/auth/request/route.ts` | **(Full)** `POST {email}` → rate-limit per `hmac(email)` via `withLock`, mint token, `sendMagicLink`. Always `{ok:true, devLink?}` (no account-existence oracle). |
| `app/api/studio/auth/callback/route.ts` | **(Full)** `GET ?token=` → renders the **Confirm** page (does NOT consume). `POST {token}` (CSRF origin-checked) → `consumeMagicToken` → `getOrCreateAccountByEmail` → set cookie → 303 redirect to `/studio` (token stripped). |
| `app/api/studio/me/route.ts` | **(Full)** `GET` → `{signedIn, email?}`. `POST` sign-out (CSRF-checked, clears cookie). |
| `app/api/studio/rooms/route.ts` | **(Full)** `GET` owned rooms; `POST {name,topic,templateId}` (CSRF-checked) → `createRoom` + `addRoomOwnership`, passcodes returned ONCE. |
| `app/api/studio/designs/route.ts` | **(Full)** `GET` / `POST` / `PATCH` rename / `DELETE` (all mutating verbs CSRF-checked). `POST` validates each phase via `getServerModule().schema`. Pure storage, no room capability. |
| `app/api/studio/brands/route.ts` | **(Full)** `GET` / `POST` / `DELETE` (CSRF-checked). Account-scoped `RoomTheme` snapshot; logo by Blob URL ref. |
| `app/api/studio/apply/route.ts` | **(Full)** `POST {slug, code, brandId|theme}` (CSRF-checked) → `requireCapability(slug, code, "configure")` THEN `updateRoom(slug,{theme})`. Account is NOT a backdoor; passcode still required. |
| `app/api/studio/account/route.ts` | **(Full)** `GET` export JSON; `DELETE` account (CSRF-checked; drops edges+designs+brands, never ends/wipes rooms or deletes archives); `PATCH` change-email → triggers re-verify via `auth/request`. |
| `components/ThemePreview.tsx` | **(refactor)** Palette-preview block extracted from `app/admin/page.tsx`, reused verbatim in admin + Studio Brands. |
| `components/ReportCard.tsx` | **(refactor)** AI-report renderer extracted from `app/admin/page.tsx` (~lines 442–501), reused in admin + Studio History. |
| `test/design-share.test.ts` | **(MVP)** encode→decode round-trip, signature reject on tamper, phase re-validation rejects bad config. |
| `test/accounts.test.ts` | **(Full)** see Test plan. |

### Files to CHANGE

| Path | Change |
| --- | --- |
| `lib/rooms.ts` | Re-export `sha256`/`safeEqualHex` from `lib/crypto.ts` (no behavior change). Update the "Postgres reserved for Phase 6" comment to note the account layer now occupies that tier in KV, with the documented migration trigger (cross-account analytics queries). |
| `app/api/r/[room]/host/route.ts` | Add ONE command `claimRoom` with **`COMMAND_CAP['claimRoom'] = "configure"`** (raised from the design's `advance` per must-fix — durable ownership needs the room's strongest proof-of-control; a transient cohost must not permanently attach a room to a personal account). Handler reads the `edges_fac` session (the ONLY studio-session read under `app/api/r`); if signed-in, `addRoomOwnership(accountId, room)`; returns `{ok:true}` — **no rev change, no `navState`** (ownership is discovery, not live state). |
| `components/BuilderApp.tsx` | **(MVP)** Export/Import design buttons (gated on `NEXT_PUBLIC_STUDIO_ENABLED`). **(Full)** `★ Save to Studio` (signed-in only) → `POST /api/studio/designs`, with the launch-needs-admin hint. No change to the `setPhases` launch flow. |
| `app/admin/page.tsx` | Extract `ThemePreview` + `ReportCard`. **(MVP)** Export/Import brand. **(Full)** `★ Save as Brand` + `Apply saved Brand` (signed-in only; Apply reuses the existing admin-code-carrying `saveTheme` PATCH). |
| `components/HostConsole.tsx` | **(Full)** `★ Claim this room` in the authed header (signed-in AND not-already-owner), POSTs `{command:"claimRoom", code}` reusing the entered passcode. |
| `.env.example` | Document `STUDIO_SECRET` (HMAC for tokens + cookie; feature inert if unset), `RESEND_API_KEY` (absence → dev "link printed to server log" fallback, mirroring `ANTHROPIC_API_KEY`), and `NEXT_PUBLIC_STUDIO_ENABLED` (build-time flag gating all client probes/affordances). |

### Data model (types / zod / store keys / view shapes)

All durable state lives on the **existing no-TTL `db`** in `lib/rooms.ts` — **never** the 24h session store. Ephemeral auth artifacts (consume marker, rate-limit) use `lib/store.ts` `setNX`/`withLock` (24h TTL is fine; they are short-lived).

```ts
// lib/accounts.ts
interface Account { id: string; emailHash: string; createdAt: number; lastSeenAt: number }
// emailHash = HMAC(STUDIO_SECRET, lowercased-trimmed email)  ← NOT bare sha256 (must-fix)

interface Design {
  id: string; name: string; sessionName: string; minutes?: number;
  phases: PhaseInstance[];          // CONFIG ONLY — never submissions
  createdAt: number;
}
interface Brand { id: string; name: string; theme: RoomTheme; createdAt: number } // RoomTheme verbatim

// zod (source of truth, mirrors host setPhases validation):
const DesignSchema = z.object({
  name: z.string().min(1).max(120),
  sessionName: z.string().min(1).max(120),
  minutes: z.number().int().positive().optional(),
  phases: z.array(z.object({ module: z.string(), config: z.unknown() })).min(1),
  // each phase.config re-validated against getServerModule(module).schema at save time
});
const BrandSchema = z.object({ name: z.string().min(1).max(120), theme: RoomThemeSchema });
```

**Store keys (durable, no-TTL):**

- `account:{id}` → `Account`
- `account:byEmail:{HMAC(STUDIO_SECRET,email)}` → `accountId` (lookup; **`setNX`-guarded create**)
- `account:designs:{id}` → `Design[]`
- `account:brands:{id}` → `Brand[]`
- `account:rooms:{id}` → **hash**, field = slug, value = `1` (`hset`; field-atomic; iterate via `hgetall` + `Array.from(Object.keys(...))`)
- `room:owners:{slug}` → **hash**, field = accountId, value = `1` (`hset`; **field-atomic co-owner SET** — must-fix replacing the RMW JSON array)

**Store keys (ephemeral, `lib/store.ts`):**

- consume marker: `setNX("consume:{tokenId}", 1, 900)` — **never deleted within TTL** (single-use; must-fix, NOT routed through `withLock`).
- rate-limit: `withLock("studio-auth", fn, {ttlSeconds: …})` keyed per `hmac(email)` — auto-release is correct here.

**View shapes** (client-facing JSON): `MeView {signedIn:boolean; email?:string}`, `StudioRoomsView {rooms: RoomCardData[]}`, `DesignsView {designs: Design[]}`, `BrandsView {brands: Brand[]}`, `HistoryView {archives: RoomArchive[]}`. No new live `SessionState` view type; the **module contract is untouched** (no module def / view type / registry change).

### API + host commands (+ capability gating)

| Route / command | Auth | CSRF | Notes |
| --- | --- | --- | --- |
| `POST /api/studio/auth/request` | none | n/a (no cookie yet) | rate-limit via `withLock`; single-use 15-min token; no account-existence oracle |
| `GET /api/studio/auth/callback?token=` | none | n/a | renders **Confirm** page only; does NOT consume |
| `POST /api/studio/auth/callback {token}` | none | **origin check** | consume + lazy-create + set cookie + 303 redirect |
| `GET /api/studio/me` | cookie | n/a | `{signedIn,email?}` |
| `POST /api/studio/me` (sign-out) | cookie | **origin check** | clears cookie; rooms untouched |
| `GET/POST /api/studio/rooms` | cookie | **POST: origin** | list / create+own |
| `GET/POST/PATCH/DELETE /api/studio/designs` | cookie | **mutate: origin** | account-scoped; `POST` validates each phase via `getServerModule().schema`; no room capability |
| `GET/POST/DELETE /api/studio/brands` | cookie | **mutate: origin** | account-scoped `RoomTheme` |
| `POST /api/studio/apply` | cookie **+ room passcode** | **origin** | `requireCapability(slug,code,"configure")` THEN `updateRoom` theme — account is not a backdoor |
| `GET/PATCH/DELETE /api/studio/account` | cookie | **mutate: origin** | export / change-email / delete (never wipes rooms/archives) |
| host command `claimRoom` | **room admin passcode** (`configure`) | n/a (passcode in body) | the ONLY host route that reads `edges_fac`; records ownership; `{ok:true}`, **no rev change** |

### Rev / authoritative-apply pattern (no KV read-back)

Studio is **durable-KV CRUD against owned/created rooms — it never touches live `SessionState`**, so the `rev`/anti-flash/authoritative-apply machinery is *unaffected by design*:

- **"Use design"** does NOT introduce a new write-then-show flow. It posts the existing `setPhases` command to `app/api/r/[room]/host/route.ts`, which already returns the AUTHORITATIVE state via `navState(room, await setPhases(...), role)` → `getFacilitatorState(room, written)`, applied client-side through `usePolledState.apply`. **No read-back** is added.
- **"Apply a Brand"** PATCHes `room.theme` (durable room registry, not session state) — theme is read fresh by the next poll cycle; no rev semantics involved.
- **`claimRoom`** returns a trivial `{ok:true}`, triggers no `setX` on the session store, and **must not** call `navState` — ownership is discovery metadata, not live state, so there is intentionally nothing to authoritatively apply and no rev to bump.
- The single host-route read of `edges_fac` is additive and side-effect-free for the live path.

---

## Implementation plan (ordered, checkable steps)

**Phase 0 — shared refactors (0.5d)**
- [ ] Extract `lib/crypto.ts` (`sha256`, `safeEqualHex`, `hmac`); re-export from `lib/rooms.ts`. `npm run verify` green.
- [ ] Extract `components/ThemePreview.tsx` + `components/ReportCard.tsx` from `app/admin/page.tsx`; admin renders identically.

**Phase 1 — MVP Export-JSON (1.5d)**
- [ ] `lib/design-share.ts` encode/decode + signature + phase re-validation.
- [ ] `test/design-share.test.ts` round-trip + tamper-reject + bad-config-reject.
- [ ] `BuilderApp` Export/Import design buttons (gated `NEXT_PUBLIC_STUDIO_ENABLED`) + permanent-save warning line.
- [ ] Admin theme panel Export/Import brand.
- [ ] Manual QA (below). Ship MVP.

**Phase 2a — account backend (3.5d)**
- [ ] `lib/accounts.ts` (field-atomic edges, `setNX`-guarded create, `Array.from` only).
- [ ] `lib/studio-session.ts` (mint/consume single-use non-released, cookie helpers, `sendMagicLink` dev fallback, `assertSameOrigin`).
- [ ] `auth/request` + `auth/callback` (GET confirm page / POST consume) + `me` routes.
- [ ] `test/accounts.test.ts` (all cases below). `npm run verify` green.

**Phase 2b — Studio UI (3d)**
- [ ] `app/studio/page.tsx` (+ `Referrer-Policy: no-referrer`) + `StudioApp` with Rooms/Designs/Brands/History + account settings + privacy footer.
- [ ] `rooms` / `designs` / `brands` / `apply` / `account` routes (all CSRF-checked).

**Phase 2c — in-context affordances + claim (1.5d)**
- [ ] `claimRoom` host command (`configure`) + the single guarded `edges_fac` read.
- [ ] `★ Save to Studio` (BuilderApp), `★ Save as Brand`/`Apply saved Brand` (admin), `★ Claim this room` (HostConsole) — all behind the `NEXT_PUBLIC_STUDIO_ENABLED` probe.
- [ ] `.env.example` updates.

**Phase 2d — go-live (0.5d)**
- [ ] Wire Resend (or SES) for prod email; set `STUDIO_SECRET` + `NEXT_PUBLIC_STUDIO_ENABLED=1` in Vercel; manual smoke; flip on.

---

## Acceptance criteria (testable, facilitator-outcome framed)

**MVP**
1. A facilitator exports a tuned `/build` sequence, closes the room, and re-imports the blob next week into a fresh room — the phases, names, and minutes are identical, and launching still requires the admin passcode.
2. A tampered design blob is rejected with a clear error, not silently loaded.
3. With `NEXT_PUBLIC_STUDIO_ENABLED` unset, an env-passcode facilitator sees **zero** new UI and the build behaves exactly as before.

**Full**
4. A facilitator signs in with one magic link (no password) and lands in /studio; a corporate inbox's link-scanner does NOT consume the token (the human's Confirm click still works).
5. "New room" appears under My Rooms with passcodes shown once; `★ Claim this room` adds an existing room to My Rooms **only when the admin passcode is held**; a cohost cannot claim.
6. A signed-in facilitator who knows their account but NOT a room's passcode still cannot drive that room (account ownership ≠ live control), and cannot apply a Brand without the passcode.
7. "Use design" launches the saved sequence into a chosen room via the unchanged `setPhases` path; the host console reflects it without a flash (authoritative-apply).
8. History lists only this account's archives, read-only; delete-forever removes the owner edge but a co-owner still sees the archive.
9. Delete-account removes designs/brands/owner edges and leaves every live room running and every archive intact (loud copy confirmed).
10. A `KV` dump does not reveal any facilitator's plaintext email (HMAC key) and contains zero participant submissions/handles.

---

## Test plan

### Vitest (in-memory store, no KV/AI)
- **`design-share.test.ts`:** encode→decode round-trip; HMAC signature rejects a flipped byte; decode re-validates phases and rejects a config that fails `getServerModule().schema`.
- **`accounts.test.ts`:**
  - lazy account create is idempotent under two near-simultaneous links (`setNX` guard → one account).
  - `saveDesign` stores config-only — assert no submission/handle keys present.
  - co-owner edge add/list is field-atomic and uses `Array.from` (no `.entries()`/Set spread); two concurrent claims yield two owners, no lost update.
  - `claimRoom` requires a valid **admin** passcode (`configure`); facilitator/cohost/wrong-code all rejected.
  - magic token: single-use (second consume fails), 15-min expiry, constant-time verify; the consume marker is NOT released after the handler returns (replay blocked within TTL).
  - cookie never resolves a room role: a valid `edges_fac` session passed to `resolveRole` yields `null` (passcode-exclusive).
  - `deleteAccount` leaves `getRoom`/`getArchive` intact; only edges/designs/brands gone.
  - email lookup key is `hmac(STUDIO_SECRET, email)`, not bare `sha256` (assert different from `sha256(email)`).
  - CSRF: a state-changing studio route with a mismatched `Origin` header is rejected.

### Manual QA (incl. mobile + projector)
- **Mobile participant (`/r/[room]`):** join a room owned by a signed-in facilitator from a phone — accountless join works, off-the-record copy unchanged, the `edges_fac` cookie is never set or read on participant surfaces (verify in devtools).
- **Mobile facilitator:** request a magic link, open it in iOS Mail's in-app browser, tap Confirm — sign-in succeeds; the Outlook/Safe-Links prefetch case (simulate a bare GET to the callback) shows the Confirm page and does NOT sign anyone in.
- **Projector (`/r/[room]/screen`):** unaffected — confirm no studio cookie, no new requests, branding renders from `room.theme` whether applied via passcode or via Studio Apply.
- **Host console:** `★ Claim this room` appears only signed-in + non-owner; "Use design" launch shows no flash; launching a custom design without the admin code shows the existing capability error + the new hint.
- **Dark-ship:** with `NEXT_PUBLIC_STUDIO_ENABLED` unset, confirm zero `/api/studio/me` requests fire from BuilderApp/admin/HostConsole.

---

## Privacy & ethos check (explicit)

This item **explicitly and intentionally** adds a facilitator-only identity layer (the design says so), and it is built so the participant ethos is **untouched**:

- **Accountless join / off-the-record / 24h TTL / submissions-never-logged / end-session-wipe:** all hold. `resolveRole()` stays 100% passcode-exclusive; `edges_fac` is never imported under `app/r` except the single `claimRoom` read, and that read grants discovery only. The cookie is Path-scoped and origin-checked; no participant surface ever sees it.
- **Accounts store ONLY:** ownership edges, Designs (config-only), Brands (`RoomTheme`), and archive REFERENCES (slugs). **No** participant handles, submissions, or live state. `RoomArchive`/`SessionReport` are already durable and report-level; the account merely indexes them — **zero new participant retention**, 24h participant TTL unchanged.
- **Two hardened boundaries (must-fixes folded in):** (1) Designs persist facilitator-authored config with no TTL, which *could* leak a participant quote if a facilitator hand-pastes one into a prompt — mitigated by the permanent-save warning at every save/export; the data path never round-trips submission text. (2) Email lookup keyed on `HMAC(STUDIO_SECRET, email)`, never bare `sha256`, so a KV dump cannot rainbow-table facilitator emails.
- **Env super-admin** (`checkSuperAdmin`) coexists unchanged as the break-glass operator path, deliberately **not** linked to an account.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (severity) | Resolution in this spec |
| --- | --- |
| **Single-use via `withLock` is replayable** (critical) | Consume is `setNX("consume:{tokenId}",1,900)` **never released**; `withLock` is used ONLY for per-email rate-limiting. |
| **Email scanners consume the GET link** (critical) | Callback `GET` renders a Confirm page that **POSTs** the token; scanners don't POST. Token consumed only on the human's POST. |
| **CSRF on new cookie-authed routes** (critical) | `assertSameOrigin(req)` origin/host check on **every** state-changing `/api/studio/*` route, in addition to SameSite=Lax. |
| **Durable-KV lost-update on co-owner SET / account creation** (major) | Co-owners stored as **hash fields** (`hset`, field-atomic, matching existing per-token pattern); lazy account creation guarded by `setNX` on `account:byEmail`. |
| **Bare-sha256 email key deanonymizes on KV dump** (major) | `HMAC(STUDIO_SECRET, email)` for lookup + stored `emailHash`. |
| **`claimRoom`=`advance` lets a transient cohost own a room** (major) | Raised to **`configure`** (admin passcode); cohost excluded; UI copy "ownership = discovery, not control." |
| **Designs durably store facilitator wording** (major) | Permanent-save warning at every save/export; only facilitator-authored config stored, never submissions. |
| **Token-in-URL referrer leak** (minor) | Token stripped via 303 redirect after consume; `Referrer-Policy: no-referrer` on /studio; 15-min single-use TTL. |
| **Probe flash / extra request when dark** (minor) | All client probes/affordances gated on build-time `NEXT_PUBLIC_STUDIO_ENABLED` — zero extra requests when off. |
| **Scope risk HIGH** (verdict) | Split into the 2-day MVP (no accounts/cookies/email) that kills the #1 pain, and a separately-gated 9-day Full phase that ships dark. |

---

## Out of scope / future

- **Postgres migration** — KV is the v1 substrate; the migration trigger is documented (when cross-account/analytics relational queries arrive).
- **"Sign out everywhere" / trusted-device list** — v1 ships a 30-day rolling cookie; explicit device revocation is a fast-follow.
- **Linking the env super-admin to a personal account** — deliberately kept separate (break-glass operator path).
- **Paid-tier / pricing wedge** — positioning question; does not change the in-product "optional/additive" framing and is not built here.
- **OAuth / passwords / profile photos** — explicitly excluded (magic-link only).
- **Any new participant-data retention** — out of scope by ethos.
- **`/admin` global Studio management for the operator** — future.
