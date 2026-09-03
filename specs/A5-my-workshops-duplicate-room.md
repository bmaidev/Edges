# A5 — "My workshops" view + duplicate-a-room

> **Status:** Ready to build. This spec folds in every must-fix from the pressure-test.
> The thin-cut MVP is what ships; the Full-vision section is explicitly deferred.

---

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** ~3 days for the MVP cut (down from the 4.5-day full estimate, because room-delete, content carry-over, design.ts repair-on-stamp, per-facilitator scoping and blueprint TTL/cap are explicitly deferred). Budget 4.5 days only if any Full-vision item is pulled forward.
- **Dependencies (item ids / code surfaces):**
  - `lib/rooms.ts` — durable registry (createRoom, listRooms, updateRoom, archiveRoom, getArchive). Add `RoomBlueprint`, `saveBlueprint`, `duplicateRoom`, `stampFromBlueprint`, `blueprintSummary`, and the `lastRun` co-location.
  - `app/api/admin/rooms/route.ts` — GET list enrichment + POST `duplicateOf`/`fromBlueprint` branches.
  - `app/api/r/[room]/host/route.ts` — capture-on-launch hook in the **`setPhases` case only**.
  - `lib/store.ts` — `setPhases` (line 258) is the launch path; `endSession` (the wipe) is the durability-split proof. No change to store.ts required for MVP (capture happens in the host route, post-`setPhases`).
  - `app/admin/page.tsx` — My-workshops layout, enriched RoomCard, inline Duplicate confirm, reused PasscodeReveal block, SavedBlueprintCard.
  - `components/HostConsole.tsx` — "Start: \<blueprint\>" post-wipe rescue in the no-sequence-yet branch (line ~144) and a "Save this design as a blueprint" affordance in the Session tab.
- **No new npm deps.**

---

## Problem & facilitator value

**The trap (facilitator's voice):** "I spent an hour on Tuesday building a 5-phase custom session — the prompts, the timers, the lens text, the whole brand. I come back Friday to run it again and it's *gone*. The room is still here, but the design evaporated with the 24h wipe, so 'run it again' secretly means 'rebuild it from scratch.' And there's no notion of *my* workshops — `/admin` just dumps every room by date."

**The fix (facilitator's voice):**

> "I never lose a workshop I built, and I can start next week's in one tap."

1. Open `/admin` and see rooms grouped by what they *are* to me — **Live now / Recent / Saved blueprints** — not a flat `createdAt` dump.
2. **Duplicate** any room: fresh slug + fresh passcodes, but it inherits the whole session sequence, every module's config, the topic and the full branding (palette + logo + headline + tagline). The 40 minutes of design and brand work carries over; only the people and their words don't.
3. **Reuse last session** even after the 24h wipe — because the blueprint was snapshotted *durably the moment I launched it*, separate from the ephemeral submissions.
4. **Save the current design as a named blueprint** ("My Monday retro") and stamp new rooms from it without touching a single phase.

This is Edges going from "a tool I configure per-event" to "my facilitation practice, with a memory" — **no accounts, no database, no weakening of the off-the-record contract**, because nothing personal or participant-authored is ever retained. The durability split is *already real in code* (`lib/rooms.ts` is no-TTL durable; `endSession` wipes only the six live keys). A5 just makes that split legible and persists the one thing currently falling through the crack: the session **blueprint** (sequence + config + branding), which contains zero participant content.

---

## MVP cut (thinnest shippable)

**Ships:**

1. `duplicateRoom(slug)` = `createRoom(name + " (copy)", topic)` (fresh slug + **fresh passcodes**) → copy `source.theme` + `source.blueprint` onto the new room → return passcodes **once**.
2. **Capture-on-launch on the admin `setPhases` path only.** On launch of a custom design, the host route writes a durable `RoomBlueprint` mirror onto the Room record. (Built-in templates via `setTemplate` are **not** captured — see Risks.)
3. **Enriched admin cards** fed entirely from fields **co-located on the durable Room record** (`blueprint.summary` + `lastRun`), so the GET stays at the existing N reads — **no `getArchive` fan-out.**
4. **My-workshops grouping**: Live now / Recent (14 days) / Saved blueprints.
5. **"Start: \<blueprint\>" post-wipe rescue** in the host console when `state.phases` is empty but a durable blueprint exists. Routes through `setPhases` → `navState` → `usePolledState.apply` (authoritative-apply, no read-back).
6. **Save current design as a named blueprint** + **stamp a new room from a saved blueprint**, with **per-phase `schema.safeParse` validation on stamp** (fail loud into the builder, never silent-drop).
7. **Blueprint rename + delete** (pure registry entries; no blob, no slug).
8. **Trust banner** with the tightened design/session/report copy.

**Cut for v1 (deferred, see Out of scope):** room-delete + blob ref-counting; content / inject carry-over (hard NO for v1); `design.ts` repair-on-stamp; per-facilitator scoping; blueprint TTL/cap (ship keep-until-deleted with blueprint-only delete).

## Full vision

Per-facilitator owner tags for client-side "mine" filtering; room-delete with blob ref-counting; an explicit `authoredContent` blueprint field (facilitator-authored deck/case reuse, never the live content key); blueprint TTL/cap with archival; cross-instance blueprint export/import.

---

## Experience & flows

### Screens & states

**`/admin` — My workshops (authed default)**
- **Trust banner** (persistent one-liner — load-bearing, see copy below).
- **New room composer** (existing `CreateRoom`) collapsed at top — unchanged.
- Three sections, in order: **Live now**, **Recent** (rooms with `createdAt` within 14 days, or any non-archived), **Saved blueprints**.
- Hide a section entirely if empty rather than show an empty shell. No saved blueprints → no "Saved blueprints" header.

**Empty state:** no rooms → "No workshops yet. Create your first room above." (warmer than current, same intent).

**Enriched RoomCard:**
- `name`, `/slug · status` with a **status dot** (Live pulses softly via a CSS animation; draft/archived static).
- **Blueprint chip-row**: the phase sequence read from `room.blueprint.summary.chips` (e.g. `Solo write → Cluster → Vote → Synthesis`), *not* live state. Omit the row if no blueprint.
- **"last run: N joined · M contributions"** line read from `room.lastRun` (co-located), omitted if absent.
- Existing action link row (join / host / build / screen / qr / theme / report) unchanged.
- **Duplicate** — a promoted **primary Button**, lifted out of the small-text link row.

**Duplicate confirm (inline, expands within the card — same pattern as the theme/report panels, no modal):**
- Two columns.
  - **Carries over:** sequence chips, brand swatch strip (the 5 palette colours), topic.
  - **Resets:** new join link, new passcodes, **0 participants**.
- Buttons: **Duplicate room** (primary) / **Cancel** (ghost).

**Passcode reveal (reused verbatim from `CreateRoom`):** the once-only block — admin/facilitator/cohost, join/host/screen/qr links, join QR, **Copy all**, and the "I've saved them — dismiss" affordance. Extract `CreateRoom`'s reveal JSX (lines ~183–229 of `app/admin/page.tsx`) into a shared `<PasscodeReveal created={...} />` component so Duplicate and Stamp render the *same* block.

**Saved-blueprint card:** blueprint name, sequence chips, **Stamp new room** (primary), rename + delete affordances. **No slug, no passcodes** (it's a design, not a room).

**Host console — Session tab + no-sequence-yet branch (`HostConsole.tsx` ~line 144):**
- When `!s.mode && (!s.sequence || s.sequence.length === 0)` **and** the room has a durable blueprint, render a **"Start: \<blueprint name\>"** one-tap above/within the `ModeSelector`.
- In the Session tab (role !== cohost), add **"Save this design as a blueprint"** (only meaningful when a custom sequence is live).

### Copy that matters

**Trust banner (tightened to resolve the must-fix — distinguishes design / session / report):**

> **Designs and branding are saved.** Your session sequence, prompts and brand carry over every time. **Live sessions self-erase 24h after they run** — participant words are never kept. The optional **AI session report** is a no-names synthesis you choose to keep or delete.

- Do **not** say "your sessions are saved" — only *designs* persist; the launched session still wipes in 24h.
- Say **"Workshops"**, never "Your private workshops" — scoping is instance-wide for v1 (account-less).

**Duplicate confirm header:** "This copies the design — not the people. New links, new passcodes, zero participants."

**Stale-blueprint-on-stamp error (loud-fail):** "1 phase in this blueprint is out of date — open the builder to fix it before launch." → drop into `/r/\<newslug\>/build`.

---

## Architecture

### Files to add

| Path | Purpose |
|---|---|
| `test/blueprint.test.ts` | Fresh passcodes on copy; copies start with **zero participants AND zero submissions AND zero content**; source `passcodeHashes` absent on the copy; `saveBlueprint`/`blueprintSummary` shape; stamp re-validates per-phase schema and fails loud on a bad config. |

### Files to change

| Path | Change |
|---|---|
| `lib/rooms.ts` | `RoomBlueprint` type; `Room.blueprint?` + `Room.lastRun?` fields; `saveBlueprint(slug, bp)`; `duplicateRoom(slug)`; `stampFromBlueprint(blueprintId)` (or stamp via a stored blueprint registry); `blueprintSummary(phases)`; co-locate `lastRun` onto the Room inside `archiveRoom`. Add `listBlueprints` / `deleteBlueprint` / `renameBlueprint`. |
| `app/api/admin/rooms/route.ts` | GET projection adds `blueprint` summary chips + `lastRun`; POST accepts `{ duplicateOf }` and `{ fromBlueprint }` and branches to `duplicateRoom` / `stampFromBlueprint`. Also expose blueprint list/rename/delete (new sub-route or extend). |
| `app/api/r/[room]/host/route.ts` | After a successful `setPhases` write, call `saveBlueprint(room, { name, phases, savedAt })`. **`setTemplate` case unchanged** (no capture). |
| `app/admin/page.tsx` | My-workshops layout; section grouping; enriched RoomCard; inline Duplicate confirm; extracted `PasscodeReveal`; SavedBlueprintCard; trust banner. |
| `components/HostConsole.tsx` | "Start: \<blueprint\>" rescue; "Save this design as a blueprint" in Session tab. |

### Data model

```ts
// lib/rooms.ts

// The durable mirror of an ephemeral state.phases. Config + branding ONLY —
// NEVER participant content, handles, votes, patterns, or the live content key.
export interface RoomBlueprint {
  name: string;                 // facilitator-named, e.g. "My Monday retro"
  phases: PhaseInstance[];      // sequence + each module's config (the craft)
  savedAt: number;
  summary: BlueprintSummary;    // co-located so the admin list needs no recompute
}

export interface BlueprintSummary {
  chips: string[];              // human module labels, e.g. ["Solo write","Cluster","Vote"]
  phaseCount: number;
}

// Co-located on the Room at archive time so the admin GET needs NO archive fan-out.
export interface RoomLastRun {
  participantCount: number;
  submissionCount: number;
  at: number;
}

export interface Room {
  // …existing fields…
  blueprint?: RoomBlueprint;    // durable design mirror (set on setPhases launch)
  lastRun?: RoomLastRun;        // stamped by archiveRoom via updateRoom
}
```

- **`PhaseInstance`** (already in `lib/types.ts`): `{ id, moduleId, config }`. That is exactly the blueprint payload — zero participant content by construction.
- **Standalone saved blueprints** (the "Saved blueprints" section that are *not* tied to a live room) are stored under their own durable key so they survive a room being archived/cleaned:
  - Key: `rooms:blueprint:<id>` (id = `randomBytes` hex), with an index `rooms:blueprints:index`.
  - `RoomBlueprint` is the stored value (plus an `id`). Keep-until-deleted (no TTL).
- **`updateRoom` signature** must widen its `Pick` to allow patching `blueprint` and `lastRun`.

### Store keys

| Key | Durability | Written by |
|---|---|---|
| `rooms:room:<slug>` (existing) | durable, no TTL | createRoom/updateRoom (+ now `blueprint`, `lastRun`) |
| `rooms:archive:<slug>` (existing) | durable, no TTL | archiveRoom |
| `rooms:blueprint:<id>` (new) | durable, no TTL | saveBlueprint (named, standalone) |
| `rooms:blueprints:index` (new) | durable, no TTL | saveBlueprint/deleteBlueprint |

No new SessionState (24h) keys. **`blueprintSummary`, `saveBlueprint`, and the `lastRun` stamp are plain durable `set()`s — no rev, no TTL — and run only in route handlers / `handleAction`, never in `computeView`.**

### View shapes (admin GET projection)

```ts
// GET /api/admin/rooms response row
{
  slug, name, topic, status, createdAt, templateId,
  blueprint?: { name: string; chips: string[]; phaseCount: number } | null,
  lastRun?: { participantCount: number; submissionCount: number; at: number } | null,
}
// plus a top-level `blueprints: { id, name, chips, phaseCount, savedAt }[]`
```

### API + host commands (+ capability gating)

- **`GET /api/admin/rooms?code=`** — same `checkSuperAdmin` gate. Enriched projection above. **No archive fan-out** — `blueprint` and `lastRun` are read straight off the Room record (already loaded by `listRooms`). Use the existing `Promise.all`.
- **`POST /api/admin/rooms`** — same `checkSuperAdmin` gate. New optional body fields:
  - `{ duplicateOf: slug }` → `duplicateRoom(slug)` → returns `{ slug, name, passcodes }` (once).
  - `{ fromBlueprint: id }` → `stampFromBlueprint(id)` (creates a fresh room and copies the blueprint) → returns `{ slug, name, passcodes }` (once).
  - Bare `{ name, topic }` → unchanged `createRoom`.
- **Blueprint management** (admin-gated): a small sub-route `app/api/admin/blueprints/route.ts` (GET list / POST save / PATCH rename / DELETE) **or** fold into the admin rooms route. Either is fine; gate all with `checkSuperAdmin`.
- **Host command `setPhases`** — capability **`configure`** (admin) — unchanged. After the successful `navState` write, also `await saveBlueprint(room, …)`. This keeps durable design-writes on the admin path.
- **Host command `setTemplate`** — capability **`advance`** (facilitator) — **unchanged, no blueprint capture.** Built-ins are already durable in `lib/templates.ts`.
- **Host command for "Save this design as a blueprint"** — reuse the admin-gated path; it requires `configure`. (Saving a named, pinned blueprint is admin work, consistent with capture-on-launch.)

### Rev / authoritative-apply usage (no KV read-back)

- **Duplicate / stamp / saveBlueprint are durable-registry writes, NOT SessionState writes** — they have no rev and correctly do **not** use the `navState` authoritative-apply path. The admin list simply refetches after the POST (`onCreated` already calls `load(code)`).
- **The "Start: \<blueprint\>" post-wipe rescue DOES go through SessionState** — it calls the host `setPhases` command, which returns the **authoritative** `navState(room, written, role)` computed from the just-written state, and the client applies it via `usePolledState.apply`. **Never read-back** the store to confirm the launch. This honours the eventual-consistency contract exactly as the existing setup-phase launch does.

---

## Implementation plan (ordered, checkable steps)

1. **`lib/rooms.ts` types + summary helper.** Add `RoomBlueprint`, `BlueprintSummary`, `RoomLastRun`, the new `Room.blueprint?`/`Room.lastRun?` fields, and `blueprintSummary(phases): BlueprintSummary` (maps `moduleId` → human label via the module registry's display name; fall back to `moduleId` if unregistered). Widen `updateRoom`'s `Pick`.
2. **`saveBlueprint(slug, { name, phases })`** — computes summary, sets `room.blueprint` via `updateRoom`, AND (for the named standalone case) writes `rooms:blueprint:<id>` + index. Decide at call site whether it's a room-mirror (capture-on-launch) or a named pin (Save-as-blueprint).
3. **`duplicateRoom(slug)`** — `getRoom(source)`; `createRoom(stripCopy(source.name) + " (copy)", source.topic)`; then `updateRoom(newSlug, { theme: source.theme, blueprint: source.blueprint })`. **Never** touch `passcodeHashes` (fresh ones already minted) and **never** read any live SessionState key. `stripCopy` trims a trailing `" (copy)"` before re-appending to avoid `(copy) (copy)`.
4. **`stampFromBlueprint(id)`** — load `rooms:blueprint:<id>`; **validate every phase against `getServerModule(p.moduleId)?.schema.safeParse(p.config)`**; if any fails OR a module is unregistered, return a structured `{ ok: false, badPhases: [...] }` so the API can fail loud into the builder. On success, `createRoom` + copy blueprint onto the new room.
5. **`archiveRoom` co-location** — inside the existing `archiveRoom`, after building the archive, `await updateRoom(slug, { lastRun: { participantCount: fs.participantCount, submissionCount: submissions.length, at: Date.now() } })`. One extra durable field; no new fan-out at read time.
6. **`listBlueprints` / `renameBlueprint` / `deleteBlueprint`.**
7. **`app/api/admin/rooms/route.ts`** — enrich GET projection (blueprint chips + lastRun + top-level blueprints list); branch POST on `duplicateOf` / `fromBlueprint`; on a stamp validation failure return a 422 with `{ error, badPhases }`.
8. **`app/api/r/[room]/host/route.ts`** — in the `setPhases` case, after `navState`, `await saveBlueprint(room, { name: sessionName, phases })` as a room-mirror. Leave `setTemplate` untouched.
9. **`app/admin/page.tsx`** — extract `PasscodeReveal`; build the three grouped sections; enriched RoomCard with chip-row + lastRun line + status dot + promoted Duplicate button + inline Duplicate confirm (calls POST with `duplicateOf`, then renders `PasscodeReveal`); SavedBlueprintCard (Stamp / rename / delete); trust banner.
10. **`components/HostConsole.tsx`** — "Start: \<blueprint\>" rescue in the no-sequence branch (cmd `setPhases` with `blueprint.phases` + `blueprint.name`); "Save this design as a blueprint" in the Session tab.
11. **`test/blueprint.test.ts`** — all cases below.
12. **`npm run verify`** + manual QA.

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. **"I can see my workshops grouped."** `/admin` renders Live now / Recent / Saved blueprints; empty sections are hidden; the trust banner is present and uses the design/session/report wording.
2. **"Duplicate carries my craft, not the people."** Duplicating a room produces a new slug with **fresh passcodes**, inheriting `theme` and `blueprint`; the new room's live session has **0 participants, 0 submissions, 0 content**.
3. **"Passcodes never leak across rooms."** The duplicate's `passcodeHashes` differ from the source's on all three tiers; the source hashes never appear on the copy.
4. **"My design survives the wipe."** After a custom `setPhases` launch, the Room record carries a durable `blueprint`. After `endSession` (and the 24h wipe simulation), the blueprint still loads, and the host console offers **"Start: \<blueprint\>"** which relaunches it via authoritative-apply (no read-back).
5. **"Built-ins don't pollute my blueprints."** Launching a built-in via `setTemplate` does **not** create a saved blueprint.
6. **"A stale design fails loud, not silent."** Stamping a blueprint whose module config no longer validates returns a clear error and routes to the builder; it never silently drops phases.
7. **"The dashboard stays fast."** `GET /api/admin/rooms` performs no per-room `getArchive` call — the `lastRun` and `blueprint` summaries are read off the Room record (assert via a spy/mock that `getArchive` is not called in the list path).
8. **"Copy naming stays clean."** Duplicating "Retro (copy)" yields "Retro (copy)" (or "Retro (copy 2)"), never "Retro (copy) (copy)".

---

## Test plan

### Vitest (`test/blueprint.test.ts`, in-memory store)

- `duplicateRoom` mints fresh passcodes (returned plaintext differs; all three `passcodeHashes` differ from source).
- Duplicated room's `getFacilitatorState` (or live keys) shows **0 participants, 0 submissions, 0 content** — assert each explicitly.
- Duplicated room inherits `theme` and `blueprint`; source `passcodeHashes` absent on copy.
- `blueprintSummary` produces the expected chip labels for a known phase list; unregistered module falls back to its `moduleId`.
- `saveBlueprint` on a room-mirror sets `room.blueprint` and is idempotent on re-launch.
- `setTemplate` path does **not** write a standalone blueprint (no `rooms:blueprint:*` entry created).
- `stampFromBlueprint` with a **valid** blueprint → new room with copied phases.
- `stampFromBlueprint` with an **invalid** phase config → `{ ok: false, badPhases }`, no room created.
- `archiveRoom` co-locates `lastRun` onto the Room (`participantCount`, `submissionCount`, `at`).
- Admin GET list path does not invoke `getArchive` (mock/spy assertion).
- `stripCopy` dedup: `"X (copy)"` → `"X (copy)"` not `"X (copy) (copy)"`.

### Manual QA

- **Desktop `/admin`:** create → duplicate → confirm columns show correct carry/reset → passcode reveal renders, Copy all works, dismiss works → new card appears in Recent with chip-row.
- **Save-as-blueprint:** from host Session tab, save a named blueprint → appears under Saved blueprints → Stamp new room → passcode reveal.
- **Post-wipe rescue:** launch a custom design, archive/end the room, reopen host → "Start: \<blueprint\>" present and relaunches.
- **Mobile (`/r/[room]/host`):** "Start: \<blueprint\>" tap target is finger-sized; Session-tab save affordance doesn't overflow.
- **Projector (`/r/[room]/screen`):** unaffected — confirm a duplicated room's branding (palette + logo + headline + tagline) renders on the lobby/QR page identically to source (shared blob URL, no re-upload).
- **Stale blueprint:** hand-edit a blueprint's config to be invalid, stamp → loud error + builder redirect.

---

## Privacy & ethos check (explicit)

- **The durability split is real and respected.** `lib/rooms.ts` is no-TTL durable; `endSession` wipes only the six live keys (participants/submissions/content/patterns/votes/words). A blueprint of `phases + module config + branding` introduces **zero participant content** and is ethos-safe.
- **MUST-FIX (resolved): zero content carry-over for v1.** Blueprints carry `phases + module config + branding` **only** — **never the live `content` key**, because that same key is where synthesis *promote-to-room* and promoted submissions land. Copying it would leak participant-derived material. `duplicateRoom` and `stampFromBlueprint` read only the Room record + blueprint, **never** any live SessionState key. A test asserts a duplicate/stamp starts with **0 content**.
- **MUST-FIX (resolved): passcodes never copy.** Fresh passcodes via `createRoom`'s `randomPasscode` path only. Test asserts source hashes absent on the copy.
- **MUST-FIX (resolved): trust-banner honesty.** Banner distinguishes **design (saved)** vs **session (self-erases 24h)** vs **AI report (no-names, keep/delete)**. Before claiming "participant words are never kept," confirm the durable `SessionReport` is de-identified: `archiveRoom` currently passes `handle` into the archive's raw `submissions`, but `generateSessionReport` receives **only `{ phaseId, text, tag }`** (handles are stripped before the AI call — verified in `lib/rooms.ts`), so the report output carries no handles. Verify the report contains no verbatim handles/quotes, and give facilitators an archive-delete affordance (deferred to a fast-follow if not in MVP; the banner's "keep or delete" wording assumes it).
- **No accounts, no DB, no new infra.** Instance-wide scoping (account-less) — copy says "Workshops," never "Your private workshops."

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution folded into spec |
|---|---|
| **Capture-on-launch pollutes "Saved blueprints" with built-ins + capability mismatch.** Auto-saving on `setTemplate` (advance cap) lets a cohost write durable records and fills the section with vetted built-ins. | **Capture only on `setPhases` (admin `configure`).** `setTemplate` writes no blueprint. Post-wipe rescue for template sessions is out of scope for MVP (could later store a lightweight `templateId` pointer on the Room). |
| **Content carry-over could leak promoted/AI participant material.** | **Hard NO for v1.** Blueprints carry phases+config+branding only; test asserts 0 content on copy. |
| **KV read amplification: enriched GET fans out `getArchive(slug)` per room (~2N+1 Upstash calls on a force-dynamic route).** | **Co-locate `lastRun` (at archive time) and `blueprint.summary` (at save time) on the Room record.** GET stays at the existing N reads; test asserts no `getArchive` in the list path. |
| **`design.ts` repair-on-stamp is lossy (drops required-source phases) and over-stated.** | **Replace with `mod.schema.safeParse` per phase on stamp** (same loop as the host `setPhases` case). On failure, **fail loud into the builder** — never silently mutate a named design. `repairDependencies` reserved for AI drafts only. |
| **Trust banner over-promises ("words never kept" vs durable AI report; "designs saved" misread as "sessions saved").** | **Three-way copy** (design / session / report). Verified handles are stripped before the report's AI call. Archive-delete affordance noted. |
| **No delete exists; accretion + shared-logo-blob coupling.** | **MVP ships rename/delete for blueprints only** (pure registry, no blob/slug). **Room-delete deferred.** When it lands, never delete the logo Blob on room delete (refs may exist). |
| **Naming `(copy) (copy)`.** | `stripCopy` trims a trailing `" (copy)"` before re-appending. |
| **Eventual consistency on launch.** | Rescue routes through `setPhases` → `navState` authoritative-apply; duplicate/stamp are durable writes with a plain refetch. No read-back anywhere. |

---

## Out of scope / future

- Room-delete + Blob ref-counting (logos are cheap to leave; ref-counting is out of scope).
- Content / inject carry-over — needs its own typed `authoredContent` field populated only at inject time, with a test that no promoted/AI item can enter it.
- `design.ts` dependency-repair on stamp (AI-draft-only tool).
- Per-facilitator scoping (account-less today; instance-wide is acceptable for a single-master instance). A cosmetic free-text owner tag for client-side filtering only — not a security boundary.
- Blueprint TTL / cap (ship keep-until-deleted; revisit a last-50 cap on busy instances).
- Post-wipe rescue for *template* sessions via a lightweight `templateId` pointer on the Room.
- Cross-instance blueprint export/import.
