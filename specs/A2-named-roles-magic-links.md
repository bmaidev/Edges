# A2 — Named roles + magic links to replace raw passcodes

> Status: ready to build. This spec folds in every must-fix from the pressure-test, so it is already correct — implement it as written, no further design needed.

## Priority / effort / dependencies

- **Priority:** P0
- **Section:** A. First-run & access
- **Effort:** 4 dev-days total, shipped as **two PRs** (PR1 ≈ 1.5d, PR2 ≈ 2.5d). PR1 alone is independently valuable (kills the builder 403, adds the projector credential) and safe for legacy rooms.
- **Dependencies:** none hard. Reuses existing primitives only: `lib/rooms.ts` (createRoom/randomPasscode/sha256/safeEqualHex/resolveRole), `lib/auth.ts` (CAPABILITIES/requireCapability), `components/usePolledState.ts` (`code` → `?code=` transport + authoritative `apply`), `qrcode.react` (already a dep), the admin `openTheme/openReport` panel pattern. No new npm deps. No KV schema migration.

---

## Problem & facilitator value

### Problem (today)
A room is created with three opaque passcodes (`adm-1a2b3c4d` / `fac-…` / `co-…`), shown **once** and never recoverable — `lib/rooms.ts` stores only sha256 hashes. A non-technical facilitator must (a) decode which cryptic string is which, (b) hand-type a code into the host console **and** re-type it into the builder, (c) never lose them or the room is locked out forever, and (d) navigate a genuinely confusing rule: launching a **custom build** (`setPhases`) needs the ADMIN tier, but launching a **built-in template** (`setTemplate`) needs only facilitator — surfacing as a baffling 403 at `components/BuilderApp.tsx:588`. There is no Big-screen credential at all (`/screen` is unauthenticated public read), and no host/co-host QR — only the participant join QR exists. The model leaks implementation (hashes, tiers, hand-typed secrets) instead of expressing intent.

### Facilitator value (in the facilitator's voice)
> "When I make a room I get four clearly-labelled links — Facilitator, Co-host, Big-screen, Join — and each link just *is* the key. I tap my Facilitator link and I'm straight into the live console with my name on it; no password box, no choosing between three hex strings. I can launch a built-in template **or** my own custom build without ever hitting that 'you need the ADMIN code' wall. If I lose a link I open the admin portal any day and re-copy it, or regenerate it to lock the old one out. It feels like sending a calendar invite, not handing out nuclear launch codes — and my off-the-record promise to the room is untouched."

---

## MVP cut (thinnest shippable) and Full vision

### MVP = PR1 (auth correctness + projector credential)
Ships the load-bearing behaviour change with no new UI surface area:
1. Move `configure` onto the **facilitator** role in `lib/auth.ts` → kills the builder 403, lets the Facilitator link launch templates **and** custom builds.
2. Add the **projector** passcode tier to rooms (a real read-only bearer credential; `CAPABILITIES.projector` is already an empty set — it can never write).
3. `regenerateRoleCode(slug, tier)` — atomic, single-tier rotation (returns plaintext once).
4. Admin endpoints: create returns 4 codes; new `regenerate` action; GET returns per-tier existence booleans.
5. Tests (`test/magic-link.test.ts`).

After PR1: old verbal passcodes still work (resolveRole unchanged path), the builder 403 is gone, and a projector credential exists. No URL-fragment risk shipped yet.

### Full vision = PR2 (the calm UI)
6. `components/RoomAccessCard.tsx` + `lib/magicLink.ts` (link-build + read-and-scrub helper).
7. Replace the CreateRoom "save or lose forever" success block with the Room access card.
8. Add an **Access** panel to `RoomCard` (sibling to theme/report) with per-role Copy / Copy-message / QR / Show-code / Regenerate.
9. Client magic-link boot in `HostConsole`, `BuilderApp`, `ProjectorApp` (read `#k=`, scrub, sessionStorage). Delete the builder passcode input + "needs ADMIN" helper.

---

## Experience & flows

### Tone & stance
Calm, zero-jargon, sender-friendly. The link is the **primary** credential; the raw hex code is the demoted **fallback** (verbal sharing only), hidden behind a "Show code" disclosure. Reassurance, not security theatre: "Anyone with this link can run the room. Regenerate it to lock the old one out." No "shown once / cannot be recovered" panic copy anywhere.

### Flows

1. **CREATE → SHARE.** Admin creates a room. The success card is the **Room access** card: four role rows (Facilitator / Co-host / Big-screen / Join). Each row: role name, one-line purpose, **Copy link** (primary), **Copy message** (ghost, pre-written blurb), small **QR** toggle, **Show code** disclosure. Footer reassurance line. A single **Copy all** for the organiser's own records.

2. **FACILITATOR JOINS.** Taps the link → `/r/<slug>/host#k=<token>`. HostConsole reads `location.hash` on mount, `setCode(token)`, `history.replaceState` to scrub the fragment, stashes the token in `sessionStorage`. Boots already-authed via `state.role` — no password box. Can immediately run templates **and** open `/build` to launch a custom session (no 403).

3. **CO-HOST JOINS.** Identical, token resolves to `cohost`; HostConsole already hides lead-only controls by role. No extra work.

4. **BIG-SCREEN.** `/r/<slug>/screen#k=<token>` opens authed as a `projector` bearer token (read-only). A **bare** `/screen` URL with no token still renders the public read-only projector view (no lockout for a bookmarked projector laptop). An invalid/rejected token shows a calm hint, not a hard error.

5. **PARTICIPANT JOIN.** Unchanged path (`/r/<slug>` + QR). The Join row surfaces the same QR `/qr` shows plus a copyable join URL.

6. **RETRIEVE / REGENERATE.** Admin re-opens the portal, expands a room's **Access** panel (mirrors openTheme/openReport), sees all four rows. For a NEW room created in-session the freshly-minted codes are shown; for a LEGACY room (no retrievable plaintext) each row shows a **"Regenerate to get a shareable link"** state. Regenerate rotates **only** that role's secret (old link 403s; the others are untouched), then shows the new link.

### Screens & states (copy where it matters)

- **CreateRoom success → Room access card.** Four rows, per-row Copy/Copy-message/QR/Show-code, footer: *"Anyone with a link can do its job. Regenerate any link to lock the old one out."* No "save these now" warning.
- **RoomCard → Access panel.** Same four rows, persistent/retrievable. Per-row **Regenerate** with inline confirm: *"This breaks the current Facilitator link, including anyone currently using it. Continue?"*
- **Host console — silent-authed boot.** When `#k=` present: skip the password screen entirely (null → checking → authed). Keep the manual passcode input as the verbal-code fallback.
- **Host console — reset/expired link.** `wrongCode` copy softens to: *"This link was reset — ask the organiser for a new one."* (not "Wrong passcode").
- **Big-screen.** Renders projector view. Token provided-but-rejected → calm: *"Ask the host to open the Big-screen link."* Bare URL (no token) → today's public read-only behaviour, unchanged.
- **Builder.** The admin-passcode `<input type=password>` and the "custom builds need ADMIN" helper text (lines ~628–639) are **deleted**. Token inherited from `#k=`/sessionStorage. The 403-specific branch (~588) is removed (unreachable for facilitators); a generic failure message remains.
- **QR door page (`/qr`).** Unchanged, still public.

---

## Architecture

### Files to ADD
| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/magicLink.ts` | Shared helpers. `surfaceFor(role): 'host'\|'screen'\|''` (Join uses bare `/r/<slug>`); `buildLink(origin, slug, role, code): string` → `origin + /r/<slug>/<surface>#k=<code>`; `readAndScrubToken(): string \| null` — client-safe: read `location.hash` for `#k=`, `history.replaceState` to strip it, return the token. One home for the read+scrub logic. |
| `/Users/jordan/workshop/edges-v2/components/RoomAccessCard.tsx` | Client component rendering the 4 role rows. Props: `{ slug, name, codes: { facilitator?, cohost?, projector? }, onRegenerate?(role) }`. Each code is **optional**: a missing code renders the "Regenerate to get a shareable link" state (so a fully-legacy room renders without crashing). Includes Copy-all. Reused by CreateRoom success + RoomCard Access panel. |
| `/Users/jordan/workshop/edges-v2/test/magic-link.test.ts` | Vitest (in-memory store, no KV/AI). |

### Files to CHANGE
| Path | Change |
|---|---|
| `lib/auth.ts` | `facilitator: new Set(ALL.filter(...))` → `facilitator: new Set(ALL)` (gains `configure`). **Do NOT** touch `CAPABILITIES.projector` — it is **already** `new Set<Capability>()` (line 47). Use `new Set(ALL)`, never a spread, to respect the no-Set-spread rule. |
| `lib/types.ts` | **No change.** `Role` (line 56) **already** includes `'projector'`. Do not redefine it. |
| `lib/rooms.ts` | (1) `PasscodeTier` (line 63) `+= 'projector'`. (2) `createRoom` mints a 4th code `randomPasscode('scr')` → `passcodeHashes.projector`; `RoomCreated.passcodes` gains `projector`. (3) `resolveRole`: after the cohost check, `if (room.passcodeHashes.projector && safeEqualHex(h, room.passcodeHashes.projector)) return 'projector';` (guard the field for legacy rooms). (4) Widen `updateRoom`'s `Pick` to include `'passcodeHashes'`. (5) **Add `regenerateRoleCode(slug, tier)`** — atomic single-field rotation (see Atomicity below); returns `{ code }` plaintext once, `null` if room missing; mints `projector` hash on demand for legacy rooms. |
| `app/api/admin/rooms/route.ts` | POST create response: `passcodes` now contains 4 tiers (already returns `passcodes` verbatim — just flows through). |
| `app/api/admin/rooms/[slug]/route.ts` | Add a POST action `regenerate` (super-admin gated): body `{ code, role: 'facilitator'\|'cohost'\|'projector' }` → `regenerateRoleCode` → `{ ok, code }` (plaintext once). Extend GET to return per-tier **existence booleans** (e.g. `tiers: { facilitator: boolean, cohost: boolean, projector: boolean }`) — never hashes, never plaintext — so the Access panel knows whether a legacy room needs a regenerate first. Reject `role === 'admin'` (admin tier is not a shareable link; see Out of scope). |
| `app/admin/page.tsx` | `created` state type: `passcodes` gains `projector`. Replace the success block (lines ~183–229) with `<RoomAccessCard slug name codes={created.passcodes} />`. RoomCard: panel union `'theme'\|'report'\|'access'\|null`; add an `access` button; render `<RoomAccessCard slug name codes={tierCodes} onRegenerate={…} />` in the panel, mirroring openTheme/openReport (fetch tier existence from GET; call the regenerate endpoint per role; splice the returned fresh code into local state to render the new link — **authoritative-apply, no read-back**). |
| `components/HostConsole.tsx` | Mount effect before the password screen: `const t = readAndScrubToken() ?? sessionStorage.getItem('edges:k:<slug>'); if (t) { setCode(t); sessionStorage.setItem('edges:k:<slug>', t); }`. Soften `wrongCode` copy. Keep manual passcode input as fallback. |
| `components/BuilderApp.tsx` | Delete the admin-passcode `<input>` + "needs ADMIN" helper (lines ~628–639). Mount: inherit token via `readAndScrubToken()`/sessionStorage into `code`. Remove the 403 branch (~588); keep a generic failure message. AI-design buttons use the inherited code. |
| `components/ProjectorApp.tsx` | Mount effect: `const t = readAndScrubToken();` if present, poll with `code=t` (still read-only — projector has zero caps); if absent, keep today's unauthenticated `role:'projector'` public read. Calm invalid-token hint only when a token was provided but rejected. |

### Data model
```ts
// lib/rooms.ts
export type PasscodeTier = "admin" | "facilitator" | "cohost" | "projector"; // +projector

export interface Room {
  // …
  passcodeHashes: Record<PasscodeTier, string>; // now 4 keys for NEW rooms;
                                                 // legacy rooms LACK .projector → every read guards it
}
export interface RoomCreated {
  room: Room;
  passcodes: Record<PasscodeTier, string>; // 4 plaintext codes returned ONCE at create
}
```
- **No new Redis keys.** Room records stay durable / no-TTL. The 24h session keys are untouched.
- **No migration job.** Legacy rooms simply lack `passcodeHashes.projector`; `resolveRole` guards `room.passcodeHashes.projector &&`, and the Access panel renders "Regenerate to get a shareable link" for any absent tier.
- **Tokens ARE the tier codes** (bearer secrets). Nothing new is persisted in plaintext — only sha256 hashes, exactly as today.
- **View shapes / module contract:** **unchanged.** No module def, view type, registry, or render-kit change. This is an auth/room/admin-UI change only.

### API + host commands (+ capability gating)
- `lib/auth.ts CAPABILITIES.facilitator` gains `configure` → the **single** gating change. `COMMAND_CAP` in `app/api/r/[room]/host/route.ts` already maps `setPhases → configure` and `setTemplate → advance`, so **no route change**: the facilitator now passes the `configure` gate purely via the table. Cohost still lacks `configure` (can't launch custom builds); projector has zero caps.
- **Intended capability expansion (state it in the PR):** after this, `facilitator` is capability-identical to `admin`, so a Facilitator-link holder can `setPhases` on the **live** host route, not just in the builder. That is the point (the Facilitator link runs the whole room), but it must be called out — the per-room `admin` tier becomes effectively vestigial (decision: keep it minted but un-surfaced; do **not** build an Owner portal in this slice).
- `POST /api/admin/rooms` (create): `passcodes` now 4 tiers. Super-admin gated as today.
- `POST /api/admin/rooms/[slug]` (NEW `regenerate`): `{ code (super-admin), role }` → `{ ok, code }`. Rotates only that tier's hash.
- `GET /api/admin/rooms/[slug]`: also returns per-tier existence booleans (never hashes).
- `/api/r/[room]/state`: no change beyond `resolveRole` now returning `'projector'` for a projector code — the existing guard (`role !== 'participant' && role !== 'projector'`) already routes a projector code to the read-only public projector view. `/api/r/[room]/stream` needs no auth change.

### rev / authoritative-apply usage (no KV read-back)
- Magic-link tokens ride the **existing** `usePolledState` `code → ?code=` channel into `/state` and `/stream`, and into host commands as the `code` body field. The rev / monotonic anti-flash guard and `navState` authoritative-apply path are **preserved verbatim** — nothing new depends on a KV read-back on the live path.
- **Regenerate uses authoritative-apply too:** the admin UI splices the **returned** plaintext code straight into local state to render the new link. It never re-reads the room to "confirm" the rotation (an eventually-consistent read could still serve the old existence booleans — harmless, but we don't depend on it).

### Atomicity of regenerate (pressure-test must-fix)
`updateRoom` is an **unlocked** get-then-set over the whole `Room` (lib/rooms.ts:193–202). Two regenerates in flight (or regenerate racing a theme PATCH) would clobber each other under last-writer-wins and could resurrect a "revoked" link. `regenerateRoleCode` MUST be atomic. The room `DurableBackend` (lib/rooms.ts) has only get/set/del — no lock primitive — so:

- **Chosen approach:** guard the read-modify-write with a short-lived lock using `store.ts`'s `setNX` backend (the same `withLock` mechanism used for control actions): acquire `SET NX EX` on a room-scoped lock key (`rooms:lock:<slug>`), do get→mint→set, release. This serialises **all** room mutations through the lock; therefore `updateRoom` (theme/status PATCH) MUST also acquire the same lock so a concurrent theme save can't clobber a fresh hash. Keep the lock hold tiny (single get+set).
- The minting itself uses `randomPasscode(prefix)` + `sha256`, writing only the single targeted `passcodeHashes[tier]` key onto the freshly-read room object inside the lock.
- A test rotates two different tiers "concurrently" and asserts **both** new hashes survive (and each new code resolves, each old code 403s).

---

## Implementation plan (ordered, checkable)

### PR1 — auth + projector tier + atomic regenerate (safe for legacy rooms)
- [ ] `lib/auth.ts`: `facilitator: new Set(ALL)`. Confirm `CAPABILITIES.projector` stays `new Set()`. No Set spreads.
- [ ] `lib/rooms.ts`: widen `PasscodeTier` (+`projector`); `createRoom` mints `randomPasscode('scr')` → `passcodeHashes.projector` + `passcodes.projector`; `resolveRole` projector branch (field-guarded); widen `updateRoom` `Pick` (+`passcodeHashes`).
- [ ] `lib/rooms.ts`: add `regenerateRoleCode(slug, tier)` — lock-guarded get→mint→set of the single tier hash; returns `{ code }` once; mints projector on demand for legacy rooms. Route `updateRoom`'s write through the same lock.
- [ ] `app/api/admin/rooms/[slug]/route.ts`: POST `regenerate` action (super-admin gated, rejects `role==='admin'`); GET returns per-tier existence booleans.
- [ ] `app/api/admin/rooms/route.ts`: confirm create response carries 4-tier `passcodes` (flows through unchanged).
- [ ] `test/magic-link.test.ts`: all cases below. `npm run verify` (typecheck catches the widened `PasscodeTier`/`Pick`; lint catches Set-spread) + build.

### PR2 — Room access card + magic-link client boot
- [ ] `lib/magicLink.ts`: `surfaceFor`, `buildLink`, `readAndScrubToken`.
- [ ] `components/RoomAccessCard.tsx`: 4 rows, every code optional, Copy/Copy-message/QR toggle/Show-code/Copy-all; per-row Regenerate via `onRegenerate`; legacy "Regenerate to get a shareable link" state.
- [ ] `app/admin/page.tsx`: replace CreateRoom success block; add `access` panel to RoomCard wired to GET (existence) + regenerate endpoint; `created.passcodes` type gains `projector`.
- [ ] `components/HostConsole.tsx`: mount read-and-scrub + sessionStorage; soften `wrongCode` copy; keep manual fallback.
- [ ] `components/BuilderApp.tsx`: delete passcode input + helper + 403 branch; inherit token on mount.
- [ ] `components/ProjectorApp.tsx`: optional `#k=` token boot; tolerant of no token; invalid-token hint.
- [ ] `npm run verify` + build; manual QA (below).

---

## Acceptance criteria (facilitator-outcome framed)

1. **No more 403 wall.** A facilitator who taps the Facilitator link can launch a built-in template **and** a custom build from `/build` without entering any second code and without ever seeing a "needs ADMIN" error.
2. **One tap to host.** Tapping the Facilitator/Co-host link opens the host console already authenticated, with no password box; the `#k=` token is scrubbed from the address bar within the first render.
3. **Re-copyable, never lost.** From the admin portal a facilitator can re-open any room and copy the Facilitator/Co-host/Big-screen/Join links again. The "shown once / cannot be recovered" warning is gone.
4. **Surgical regenerate.** Regenerating the Facilitator link 403s the old Facilitator link but leaves Co-host, Big-screen, and Join working; the new link works immediately.
5. **Real Big-screen credential.** The Big-screen link opens a read-only projector that can never issue a host command; a bare `/screen` URL still renders read-only (no lockout).
6. **Calm reset copy.** A reset/expired link shows "This link was reset — ask the organiser for a new one," never "Wrong passcode."
7. **Legacy rooms don't break.** Old rooms (no stored plaintext, no projector hash) still authenticate with their original verbal codes, and the Access panel offers "Regenerate to get a shareable link" per row without crashing.
8. **Privacy intact.** No plaintext is persisted; only sha256 hashes. The off-the-record / 24h-TTL / no-accounts / End-wipes contract is unchanged.

---

## Test plan

### Vitest (`test/magic-link.test.ts`, in-memory store)
1. `createRoom` mints **4** tiers including `projector`; `passcodeHashes` has 4 keys; `RoomCreated.passcodes` has 4 plaintext codes.
2. `resolveRole` maps a projector code → `'projector'`; admin/facilitator/cohost still resolve correctly.
3. `regenerateRoleCode(slug, 'facilitator')` rotates **only** facilitator: cohost/projector/admin hashes unchanged; old facilitator code → `null` (403); new code → `'facilitator'`.
4. **Concurrency (must-fix):** `Promise.all([regenerateRoleCode(slug,'facilitator'), regenerateRoleCode(slug,'cohost')])` → both new hashes survive (both new codes resolve, both old codes 403). Asserts the lock/atomic write.
5. **Capability:** `roleHasCapability('facilitator','configure')` is `true`; `requireCapability` for a `setPhases`-equivalent (`configure`) passes for facilitator. Cohost still **lacks** `configure`. Projector has **zero** capabilities.
6. **Host-route capability (must-fix):** a facilitator code passes the gate for the `setPhases` command path (`configure`), proving live-session reconfigure is now allowed for facilitators (intended expansion).
7. **Legacy room:** a room object without `passcodeHashes.projector` → `resolveRole(slug, anyProjectorCode)` returns `null` (no crash); `regenerateRoleCode(slug,'projector')` mints the projector hash on demand and the new code then resolves.

### Manual QA
- **Desktop:** create room → Room access card shows 4 rows, no panic copy. Copy link → paste into a new tab → host console boots authed, address bar has no `#k=`. Open `/build` → launch a custom session (no 403). Reload the host tab → still authed (sessionStorage). Close tab, reopen bare `/host` → password fallback appears.
- **Mobile:** open the Co-host link on a phone → authed co-host console; lead-only controls hidden. Scan the Join QR from the access card → participant join screen (no passcode).
- **Projector:** open the Big-screen link on a projector laptop → read-only view, no controls; confirm a host command cannot be issued (UI exposes none; API returns 403 for a projector code). Open bare `/screen` (no token) → still renders read-only (no lockout). Open `/screen#k=garbage` → calm "ask the host" hint.
- **Regenerate:** in the Access panel, regenerate Facilitator → old facilitator tab's next command 403s with the soft reset copy; co-host tab keeps working; the new Facilitator link works.
- **Legacy room:** for a pre-change room, Access panel shows "Regenerate to get a shareable link" on all rows; regenerate one → link appears and works; original verbal code still authenticates the host console.

---

## Privacy & ethos check (explicit)

- **Preserved:** sha256-only storage (no plaintext persisted), no user accounts, 24h session TTL, End-session wipes, off-the-record contract. Module contract and rev model untouched.
- **Deliberate, called-out deltas (do not bury):**
  - **New read-only projector bearer tier.** Cannot write (empty cap set, verified) — worst case is someone sees the already-wall-projected screen.
  - **Regenerable/retrievable links.** Codes become re-copyable for NEW rooms and regenerable for any room. Copy says "anyone with this link can run the room; regenerate to lock the old one out." Regenerate confirm explicitly warns it breaks anyone **currently** using the link.
  - **Token-at-rest in `sessionStorage` (resolved tension).** The bearer token (== a durable, non-expiring room control credential) is persisted in **`sessionStorage` only** — tab-scoped, cleared when the tab closes; **never `localStorage`.** This is a stronger persistence than today's in-React-state-only code, so: (a) clear it on End-session/logout; (b) `readAndScrubToken` runs in the mount effect **before** any analytics/SSE/Referer-leaking init so the `#k=` fragment never escapes; (c) document in the privacy review that closing the tab clears it. Fragment (not query) is chosen so the token never reaches server logs or the `Referer` header.
  - **Honesty about Big-screen.** `/api/r/[room]/stream` and `/state?role=projector` are already publicly readable by slug, so the Big-screen link is a **convenience / anti-casual-takeover affordance**, NOT a confidentiality boundary. Do not oversell it as a security improvement.
- **Net verdict:** ethos intact; the three deltas are intentional and surfaced in copy + the PR's privacy note.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk | Resolution (folded into this spec) |
|---|---|
| **Doc self-inconsistency** — original design says "add a projector Role / add CAPABILITIES.projector." | **Resolved:** `Role` and `CAPABILITIES.projector` already exist. The ONLY type changes are `PasscodeTier`, `passcodeHashes`, `RoomCreated.passcodes`, `resolveRole`, and `updateRoom`'s `Pick`. Do not redefine existing union members. |
| **Capability blast radius** — `configure` on facilitator also unlocks `setPhases` on the **live** host route. | **Resolved (intended):** stated as intended in API section + PR note; facilitator becomes capability-equal to admin; admin tier kept-but-vestigial (no Owner portal this slice). Test 6 asserts facilitator can `setPhases`. |
| **Regenerate KV race / lost update** — unlocked get-then-set in `updateRoom`. | **Resolved:** `regenerateRoleCode` (and `updateRoom`) acquire a room-scoped `setNX` lock around get→mint→set; single targeted `passcodeHashes[tier]` write. Test 4 asserts two concurrent rotations both survive. |
| **Token-at-rest** — bearer token persisted client-side. | **Resolved:** `sessionStorage` only (never `localStorage`), cleared on End/logout; `readAndScrubToken` runs before any Referer/analytics/SSE leak; fragment transport so the token never hits server logs. |
| **Legacy rooms** — no stored plaintext, no projector hash. | **Resolved:** every code in `RoomAccessCard` is optional → per-row "Regenerate to get a shareable link"; `resolveRole` guards the projector field; `regenerateRoleCode` mints projector on demand. Test 7 covers it. |
| **Scope creep** — Owner-portal link; pulling PR2's fragment work into PR1. | **Resolved:** Owner portal explicitly **out of scope**. Ship as two PRs so the URL-fragment/sessionStorage work lands isolated and testable. |
| **Stream is an unauth firehose** (pre-existing). | **Out of scope** to fix here; documented honestly so Big-screen gating is not oversold. |

---

## Out of scope / future

- **Owner link / per-room admin portal.** Repurposing the room `admin` tier into an "Owner" link that also unlocks `/admin` for that one room would fork the env-`checkSuperAdmin` gate across every `/api/admin/*` route. Bigger scope — flag for product, **not** in this slice.
- **Gating `/stream` and `/state?role=projector`.** Making the session state confidential-by-credential is a separate, larger auth change; today they are public by slug by design.
- **Link expiry / TTL.** Links persist with the durable room; revocation is via Regenerate, not time-expiry. A future TTL/expiry option is deferred.
- **Retiring the room `admin` tier.** After this change it is vestigial; whether to formally remove it (vs keep it minted/un-surfaced) is a follow-up product decision.
