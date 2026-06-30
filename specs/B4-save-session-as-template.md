# B4 — Save custom session as a reusable template + share/import

> Status: ready-to-build executable spec. All pressure-test must-fixes are folded in (allowlist-strip is the real control, super-admin gate on global writes, lost-update-free index, id-only `setDesign`, no `deleteRoom`, shared durable `db`, documented disclosure scope). Where this spec and the original design disagree, **this spec wins** — the deltas are flagged inline.

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 4 days (was 5; the `deleteRoom`/cascade and the `/admin` global-library manager are cut from v1, and global scope is delivered but with the concurrency-safe hash index that removes the riskiest work — see Out of scope).
- **Section:** B. Session design
- **Dependency item ids:** none hard. This is additive on shipped infra. It *reuses* (does not depend on a not-yet-built item): the durable `db` in `lib/rooms.ts`, `getServerModule().schema`, `lib/auth.ts` capability gate, `setPhases`/`navState` authoritative-apply, `lib/templates.ts` `SessionTemplate`, `components/usePolledState.ts` `apply`, the builder's `loadTemplate` hydration.

## Problem & facilitator value

**Problem.** Today a custom session is throwaway. The builder (`components/BuilderApp.tsx`) composes a `PhaseInstance[]`, validates each config against its module's zod schema, and fires `setPhases` (`app/api/r/[room]/host/route.ts:123`), which writes the sequence into the 24h-TTL `SessionState`. The moment those session keys expire — or End-session wipes them — the design is gone. To re-run the same flow next week, in another room, or hand it to a colleague, the facilitator must rebuild it phase-by-phase or re-prompt the AI designer and hope for a similar shape. The 24 built-in `TEMPLATES` (`lib/templates.ts`) are the only reusable library and they're hardcoded in source — a non-technical facilitator cannot add to them. There is no save, no relaunch, no share, no import. The keystone promise ("methods as configured chains of primitives") is undercut: you can author a method but you can't keep it.

**Facilitator value (in their voice).** "I tuned a 90-minute pre-mortem-to-commitments flow once — my prompts, my timings, my anonymity settings. Now it's part of my permanent kit: I relaunch it into any room in two taps, I duplicate-and-tweak it for the next client without touching the original, and I hand a colleague one share code so the whole craft transfers without a screen-share walkthrough. The builder stopped being a one-shot composer and became my personal pattern library, sitting right next to the research-grounded built-ins. And it doesn't cost me the privacy promise: what I saved is the *method* — never a word a participant typed."

## MVP cut (thinnest shippable) and Full vision

**MVP (ship first, all in this spec):**
1. `SessionDesign` durable type + CRUD on the existing no-TTL `db` (`lib/designs.ts`).
2. **Room-scoped save** (`scope: "room"`) — per-room admin saves; visible only in that room. This is the lowest-risk core.
3. `saveDesign` (cap `configure`) with the **allowlist-strip security control**, `setDesign` (cap `advance`, **id-only**) relaunch via the authoritative-apply path, `deleteDesign` / `renameDesign` (cap `configure`).
4. `GET /api/r/[room]/designs?code=` list endpoint returning **metadata only** (no phase configs) — cap `advance`.
5. `DesignLibrary` card grid in **both** `BuilderApp` and `HostConsole` ModeSelector, with a "Built-in" vs "Saved by you" chip; Relaunch / Duplicate / Rename / Delete.
6. **Export / import** via pure client-side base64url envelope (`lib/design-share.ts`); import re-validates and routes through the admin-gated `saveDesign`.
7. **Global scope** (`scope: "global"`, super-admin only) — delivered in MVP because the design's core team-standardisation value depends on it, but built on a **concurrency-safe hash index** (see Architecture) so it carries no lost-update risk, and gated on an explicit `checkSuperAdmin` call.

**Full vision (future / fast-follow — see Out of scope):**
- `/admin` "Session library" curation panel (list/rename/delete/export all global designs in one place).
- Edit history / snapshots (mutable single-record is fine for v1; Duplicate covers forking).
- A "modules required" manifest in the envelope for cross-deployment preflight.
- Cascade cleanup when room deletion ships as its own feature.

## Experience & flows (screens, states, copy)

### SAVE
Builder → compose/validate phases → enter admin code → **"Save as template…"** secondary button next to **"Launch into room"**.
- Disabled until phases validate AND an admin-tier code is present. Tooltip reuses the existing 403 admin copy (`BuilderApp.tsx:588`): *"Saving a template needs the room's admin passcode."*
- Opens an inline panel:
  - **Name** (prefilled from the session `name` field)
  - **Description** (one line)
  - **Tag** chooser: `decide / diverge / reflect / ai / dialogue` (matches `SessionTemplate.tag`)
  - **Scope** toggle: *This room* / *All my rooms* — the *All my rooms* (global) option is **only shown when the entered code is the super-admin passcode**.
  - **Save** / **Cancel**
- On Save → POST `saveDesign`. Toast: **"Saved to your library."** On schema-reject or 403 → inline error naming the failing phase.

### RELAUNCH (facilitator-tier OK)
Host ModeSelector or builder → **"Your saved sessions"** row → pick card → **Relaunch** → `setDesign { designId, code }` → loads stored phases → `setPhases` path → `navState()` authoritative-apply → room is live. No read-back.

### DUPLICATE & TWEAK
Library card kebab → **Duplicate** → loads its phases into the builder as an unsaved draft named `"<orig> (copy)"` → edit → Save as a new design (original untouched). Reuses the existing `loadTemplate` hydration (`BuilderApp.tsx:546`).

### EXPORT / SHARE
Library card kebab → **Export** → opens Export modal:
- Share-code textarea + **Copy share code**
- **Download .edges.json** (fallback for designs too large to comfortably copy)
- Privacy reassurance line: *"This contains the session design only — no participant data. The text is readable by anyone you give it to."*

### IMPORT
Builder → **"Paste a shared session…"** field → decode client-side → re-validate every phase against current schemas → **read-only sequence preview** (ordinal · module name · phase id · headline config) → either **Add to my library** (admin-gated `saveDesign`) or **Load into builder** (edit first). Error states: *"This isn't a valid Edges share code,"* and the precise *"This session uses a module 'foo' not available here."*

### LIBRARY SURFACE
Both BuilderApp (under "Start from a template", `BuilderApp.tsx:719`) and HostConsole ModeSelector (`HostConsole.tsx:426`) render the shared `DesignLibrary` grid: name, description, tag chip, **Built-in** vs **Saved by you** badge, per-card kebab (Relaunch / Duplicate / Export / Rename / Delete; Rename/Delete disabled unless admin code present).

### EMPTY / LOADING / ERROR STATES
- Empty: *"No saved sessions yet. Build one and hit Save as template, or paste a shared session below."*
- Loading: skeleton on the designs fetch.
- Error: toast on save/delete success; inline error on schema-reject or 403.

## Architecture

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/designs.ts` | `SessionDesign` type + durable CRUD. Imports the **shared** `db` via a new `getDb()` accessor from `rooms.ts`. Exports `SessionDesign`, `designKey`, `designIndexKey`, `scopeFor`, `saveDesign`, `listDesigns`, `listDesignMeta`, `getDesign`, `deleteDesign`, `renameDesign`, `validatePhases`, `SCHEMA_VERSION`, `DESIGN_CAP`. |
| `lib/design-share.ts` | Pure isomorphic `encodeShare` / `decodeShare` for the `{v:1, design, checksum}` envelope. No module-schema knowledge (runs client-side). |
| `app/api/r/[room]/designs/route.ts` | `GET ?code=` → `{ designs: SessionDesignMeta[] }` merged global+room, cap `advance`. Returns **metadata only** (no phase configs). |
| `components/DesignLibrary.tsx` | Shared card grid (built-ins + fetched saved designs), kebab actions, callbacks. |
| `components/ShareImportPanel.tsx` | Export modal + Import field with client-side decode/validate/preview. |
| `test/designs.test.ts` | Vitest (in-memory store). |

### Files to CHANGE

| Path | Change |
|---|---|
| `lib/rooms.ts` | Add `export function getDb(): DurableBackend { return db; }`. **Do not** instantiate a second backend in designs.ts (dev's `globalThis.__edgesRoomsMem` singleton + prod single KV client). Mark the unused `RoomTemplate` interface (line 65) deprecated or remove it — `SessionDesign` supersedes it in `lib/designs.ts`. **No `deleteRoom`** (cut). |
| `app/api/r/[room]/host/route.ts` | Refactor the phase-validation loop (lines 128–141) into `validatePhases()` in `lib/designs.ts`; `setPhases` now calls it. Add `COMMAND_CAP` entries + switch cases for `saveDesign`, `setDesign`, `deleteDesign`, `renameDesign` (below). |
| `components/BuilderApp.tsx` | "Save as template…" button + inline Save panel; render `<DesignLibrary>` under "Start from a template"; render `<ShareImportPanel>`; fetch saved designs from `GET /designs?code=`. |
| `components/HostConsole.tsx` | In ModeSelector (line 402) add the "Your saved sessions" grid via `<DesignLibrary>`; Relaunch fires `cmd("setDesign", { designId })`, applied by the existing `cmd` apply path (line 103). |
| `lib/templates.ts` | No behavioural change. Export `SessionTemplate` type so `SessionDesign` reuses its `tag` union and both render through `DesignLibrary`. |

### Data model

```ts
// lib/designs.ts
export const SCHEMA_VERSION = 1;

export type DesignScope = "global" | "room";

export interface SessionDesign {
  id: string;                 // slug-style generated id; dup names allowed, keyed by id
  name: string;
  description: string;
  tag: "decide" | "diverge" | "reflect" | "ai" | "dialogue"; // = SessionTemplate["tag"]
  phases: PhaseInstance[];    // ONLY {id, moduleId, config} per phase, allowlist-rebuilt
  createdAt: number;
  origin: "built" | "imported" | "ai";
  scope: DesignScope;
  schemaVersion: number;
}

// List payload: metadata ONLY — no phase configs (reduces read-endpoint blast radius).
export interface SessionDesignMeta {
  id: string;
  name: string;
  description: string;
  tag: SessionDesign["tag"];
  createdAt: number;
  origin: SessionDesign["origin"];
  scope: DesignScope;
  phaseCount: number;
  moduleIds: ModuleKind[];    // for the card's "uses: capture, dotvote…" line
}
```

**Durable keys (no TTL, on the same `db` as Room/RoomArchive). MUST-FIX: lost-update-free index via a per-scope HASH, not a `string[]` index.**

The durable `db` (`rooms.ts:18-22`) only exposes `get/set/del` — no atomic list ops and no `withLock` around it. A `string[]` index under a *shared* `rooms:designs:global` key is a classic concurrent read-modify-write lost-update (two super-admins in two rooms each append, last writer drops the other's id → orphaned design). **Resolution:** store each scope's designs as **fields of a single durable hash value**, written field-by-field — but since `db` has no `hset`, model the hash as one value whose individual design records live under their own keys and whose *membership* is recovered without a mutable shared list:

- **Per-design record key:** `rooms:design:{scopeKey}:{id}` → `SessionDesign`
  where `scopeKey ∈ "global" | "room:{slug}"`.
- **Membership map key:** `rooms:designidx:{scopeKey}` → `Record<string, SessionDesignMeta>` (object keyed by design id). Adds/deletes are an **atomic whole-object replace under a lock**: wrap the read-modify-write of this single object in the existing `withLock` (SET NX EX) primitive from `lib/store.ts`, keyed `lock:designidx:{scopeKey}`. This eliminates the lost-update for the shared global scope.

> Implementation note: `withLock` lives in `lib/store.ts` and runs against the *session* backend, which is the same Redis/in-memory substrate. Import and reuse it; the lock key namespace `lock:designidx:*` does not collide with session keys. The membership map doubles as the list payload source so `listDesignMeta` is a single `get` (no N-key fan-out) and never depends on a separately-mutated list.

`listDesigns(slug)` (full records, used only by relaunch-by-id internally) and `listDesignMeta(slug)` (the GET payload) merge `global ∪ room:{slug}`. **Soft cap ~100 per scope**, enforced on the membership map at save (reject with a clear error when full). Built-in `TEMPLATES` are **not** stored here — they stay source-hardcoded and render client-side.

### `validatePhases` — the allowlist-strip is the actual security control (MUST-FIX)

zod `safeParse` does **not** drop unknown keys and returns the *original* object. So validation alone does not enforce "a stored phase is exactly `{id, moduleId, config}`." The strip must **reconstruct** each phase from zod's parsed output:

```ts
// lib/designs.ts
export function validatePhases(
  phases: unknown,
): { ok: true; sanitized: PhaseInstance[] } | { ok: false; error: string } {
  if (!Array.isArray(phases) || phases.length === 0)
    return { ok: false, error: "No phases" };
  if (phases.length > 40) return { ok: false, error: "Too many phases" };
  const sanitized: PhaseInstance[] = [];
  for (const p of phases as Array<Record<string, unknown>>) {
    const moduleId = p?.moduleId as ModuleKind;
    const mod = getServerModule(moduleId);
    if (!mod)
      return { ok: false, error: `This session uses a module '${String(moduleId)}' not available here` };
    const parsed = mod.schema.safeParse(p?.config);
    if (!parsed.success)
      return { ok: false, error: `Invalid config for "${String(p?.id)}" (${String(moduleId)})` };
    // REBUILD from parsed.data — never persist the caller's phase object.
    sanitized.push({ id: String(p?.id ?? ""), moduleId, config: parsed.data as Record<string, unknown> });
  }
  return { ok: true, sanitized };
}
```

`setPhases` (route.ts) now calls `validatePhases` instead of its inline loop and uses `sanitized` going forward (behaviour-preserving — it already strips at the client). `saveDesign` stores `sanitized`. `setDesign` re-runs `validatePhases` on the stored phases as a schema-drift guard before launch.

### API + host commands (+ capability gating)

Add to `COMMAND_CAP` (`route.ts:54`):

```ts
saveDesign: "configure",   // author/save/import-commit = admin
setDesign:  "advance",     // relaunch a TRUSTED, already-validated design = facilitator
deleteDesign: "configure",
renameDesign: "configure",
```

Switch cases:

- **`saveDesign { name, description, tag, phases, scope, code }`** → cap `configure`.
  1. `const v = validatePhases(a.phases); if (!v.ok) 400 with v.error.`
  2. Resolve scope: `const scopeKey = scopeFor(role, room, a.scope, a.code)`. **MUST-FIX:** if `a.scope === "global"`, require an **explicit `checkSuperAdmin(a.code)` === true**, else 403 — NOT `role === "admin"` (`resolveRole` returns `"admin"` for per-room admin passcodes too, `rooms.ts:372-378`, so a room admin would otherwise pollute the shared global library). Room admins → `room:{slug}` only.
  3. Build the `SessionDesign` from `v.sanitized` + generated id + `createdAt` + `origin` (`"built"` default, `"imported"` when from import). Write record key; under `withLock(lock:designidx:{scopeKey})` read membership map → add meta → enforce soft cap → write back. Return `{ ok: true, id }`.

- **`setDesign { designId, code }`** → cap `advance`. **id-ONLY — never accepts raw phases** (the security seam).
  1. Resolve which scope holds the id: try `room:{slug}` then `global` (a facilitator may relaunch either; both are admin-curated).
  2. `getDesign(scopeKey, designId)`; 404 if missing.
  3. `const v = validatePhases(design.phases)` (schema-drift guard); if `!v.ok` 400 with the offending phase message.
  4. `const written = await setPhases(v.sanitized, design.name, room);`
  5. `return { ok: true, state: await navState(room, written, role ?? "facilitator") };` — **authoritative-apply, no KV read-back** (mirrors `setPhases`/`setTemplate`). Client applies via the existing `cmd` path (`HostConsole.tsx:103`, gated on `typeof d.state.rev === "number"`).

- **`deleteDesign { id, scope, code }`** → cap `configure`; global requires `checkSuperAdmin`. Remove record key; under lock, drop id from membership map.

- **`renameDesign { id, scope, name, code }`** → cap `configure`; global requires `checkSuperAdmin`. Mutate record + membership meta under lock.

- **`GET /api/r/[room]/designs?code=`** → cap `advance`. Returns `{ designs: SessionDesignMeta[] }` = `listDesignMeta(slug)` (global ∪ room:{slug}). **Metadata only** — phase configs are returned only on relaunch (by id, server-side) or explicit Export, shrinking the read-endpoint blast radius. `force-dynamic`, `runtime = "nodejs"`.

- **Share/import: NO server endpoint.** `encodeShare`/`decodeShare` are pure client-side base64url of `{ v:1, design:{name,description,tag,phases}, checksum }`. Committing an import re-enters via the admin-gated `saveDesign` host command (so a facilitator cannot smuggle arbitrary phase config past the `configure` gate). The checksum is **corruption/typo detection only, not authenticity** — security rests on per-phase re-validation + the admin commit gate. `decodeShare` caps phase count and decoded byte size **before** `JSON.parse`, and rejects anything not matching `v===1`.

### Rev / authoritative-apply pattern (no KV read-back)

`setDesign` is the only command that mutates live `SessionState`. It follows the mandated write-then-show rule exactly: it calls `setPhases(...)` (which returns the just-written `SessionState`), passes that to `navState(room, written, role)` (`route.ts:39`), and returns it. The client applies it via `usePolledState.apply` — already wired generically in `HostConsole.cmd` (`HostConsole.tsx:103`, only applies when `d.state.rev` is a number) and in `BuilderApp`'s launch handler. No flow reads back from the eventually-consistent store. `saveDesign`/`deleteDesign`/`renameDesign`/the GET endpoint touch only the durable `db`, never `SessionState`, so they need no rev handling; the membership map may briefly lag a write but relaunch reads by exact id, never via the index.

## Implementation plan (ordered, checkable)

1. [ ] `lib/rooms.ts`: add `export function getDb()`. Deprecate/remove `RoomTemplate`.
2. [ ] `lib/designs.ts`: `SessionDesign`/`SessionDesignMeta` types, `SCHEMA_VERSION`, keys, `scopeFor` (global ⇒ `checkSuperAdmin` only), `validatePhases` (rebuild from `parsed.data`), `saveDesign`/`getDesign`/`listDesigns`/`listDesignMeta`/`deleteDesign`/`renameDesign` using `getDb()` + `withLock` on the membership map + soft cap.
3. [ ] `lib/design-share.ts`: `encodeShare`/`decodeShare` (base64url, checksum, size/count caps before parse, `v===1`).
4. [ ] `test/designs.test.ts`: write the full case list (below). **`npm run verify` green before any UI.**
5. [ ] `app/api/r/[room]/host/route.ts`: refactor validation loop into `validatePhases`; add the four commands with capability + `checkSuperAdmin`-on-global gating; `setDesign` id-only + `navState`.
6. [ ] `app/api/r/[room]/designs/route.ts`: GET endpoint, cap `advance`, metadata only.
7. [ ] `components/DesignLibrary.tsx`: shared card grid + kebab + callbacks.
8. [ ] `components/ShareImportPanel.tsx`: export modal + import field/preview.
9. [ ] `components/BuilderApp.tsx`: Save button + panel, library, share/import, fetch.
10. [ ] `components/HostConsole.tsx`: ModeSelector "Your saved sessions" grid + Relaunch.
11. [ ] Manual QA (below). `npm run verify` + build green.

## Acceptance criteria (facilitator-outcome framed)

- [ ] A facilitator with the room **admin** code can save a validated custom session and see it appear in "Your saved sessions" in both the builder and the host ModeSelector, in that room.
- [ ] A **facilitator-tier** (non-admin) holder can Relaunch a saved/global design into the room in two taps and the room goes live immediately (no stale flash, no read-back), but **cannot** save, rename, or delete.
- [ ] A **per-room admin cannot** create or modify a **global** design; only the super-admin can. The global design then appears in every room.
- [ ] A saved design round-trips through Export → Copy code → Import in another room, shows a read-only preview, and only commits to the library through the admin gate.
- [ ] An import referencing a module not present on this deployment is rejected with a message naming the offending phase/module; a tampered/oversized/wrong-version code is rejected before launch.
- [ ] A saved design stored from a phase array carrying extra keys round-trips to **exactly** `{id, moduleId, config}` per phase — no extra keys persist.
- [ ] Duplicate loads a copy into the builder as `"<orig> (copy)"` without altering the original.
- [ ] No participant submission, vote, pattern, participant, or synthesis ever appears in a stored design.

## Test plan

### Vitest (`test/designs.test.ts`, in-memory store, no KV/AI)
- [ ] `saveDesign` round-trips and **strips** non-`{id,moduleId,config}` keys: input `phases:[{id,moduleId,config,__evil:1,advanced:true}]` stores exactly `{id,moduleId,config}` (the security-control regression test).
- [ ] `validatePhases` rejects an unknown moduleId (precise message) and a bad config.
- [ ] **Scope:** super-admin code resolves `global`; a per-room admin code requesting `global` is rejected (403/`scopeFor` returns room) — the "room admin cannot write global" regression test.
- [ ] `listDesignMeta` merges global ∪ room and returns **no phase configs**.
- [ ] **Concurrent global save** (two `saveDesign` to `global` interleaved) — both ids survive in the membership map (lost-update regression).
- [ ] Soft cap (~100) enforced — the 101st save to a scope is rejected with a clear error.
- [ ] `encodeShare`/`decodeShare` round-trip; checksum mismatch, oversize, and `v!==1` all rejected.
- [ ] **Capability seam:** `setDesign` accepts only a `designId`; a payload carrying raw `phases` does not launch those phases (id is required; raw phases ignored/rejected).
- [ ] Shared-instance check: a design written via `lib/designs.ts` is readable through the rooms `db` path (`getDb()` is the same instance).

### Manual QA
- [ ] **Desktop builder:** save a built-in-derived design, see toast, see it in the library.
- [ ] **Facilitator-tier relaunch** into a *second* room; room goes live with no flash.
- [ ] **Export → import** round-trip across two rooms; tampered code rejected; unknown-module import names the phase.
- [ ] **Mobile (`/r/[room]` host on phone):** ModeSelector "Your saved sessions" grid is reachable, cards tappable, kebab usable at small width; Relaunch works on a touch device.
- [ ] **Projector (`/r/[room]/screen`):** relaunching a saved design transitions the projector to the design's first phase correctly (it's the same `setPhases` path; confirm no regression).
- [ ] Empty-state copy shows before any save; loading skeleton on slow fetch.

## Privacy & ethos check (explicit)

This **adds durable, no-TTL storage** — a deliberate, called-out exception to the ephemeral ethos, justified because a `SessionDesign` contains **only** `{id, moduleId, config}` per phase (the *method*: prompts, modules, timings), never participant data. The privacy story is *strengthened* by being explicit.

Two guards are enforced, not assumed:
1. **Allowlist strip** rebuilds each phase from zod's `parsed.data` — submissions/votes/patterns/participants/synthesis are structurally impossible to enter because the input type is `PhaseInstance[]`, never `SessionState`.
2. **Save is never wired to `getFacilitatorState`/`SessionState`** (which carries submissions). Sourced only from the builder's `PhaseInstance[]` or a decoded import. If a future "save the live session" feature is wanted, it must read `state.phases` only and run the same strip — explicitly out of scope here.

**Disclosure scope (documented):** a **global** design — including its full prompt/timing text — is **readable and relaunchable by every facilitator-tier holder in every room**. The Export/Save privacy line states this so authors don't paste client-confidential phrasing expecting room-privacy. Room-scoped designs are visible only in their room. No accounts/seats are introduced; ownership = passcode-holder (room admin → room scope; super-admin → global).

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Allowlist strip must re-strip, not just re-parse (critical).** Resolved: `validatePhases` rebuilds each phase from `parsed.data`; never persists the caller object. Regression test included.
2. **Global index lost-update under eventually-consistent KV (critical).** Resolved: per-scope membership is a single object replaced under `withLock(lock:designidx:{scopeKey})` from `lib/store.ts` — no `string[]` read-modify-write. Concurrency test included. (Original design's archiveRoom-style `string[]` index is explicitly rejected for the shared global scope.)
3. **Global write authz (critical).** Resolved: global save/delete/rename require an explicit `checkSuperAdmin(code)` call, independent of the `configure` capability (`resolveRole` grants `"admin"` to per-room admins too). Regression test included.
4. **`setDesign` security seam (critical).** Resolved: id-only; re-validates+strips before launch; returns `navState()` authoritative-apply; never accepts raw phases. Regression test included.
5. **`deleteRoom` + cascade is unnecessary scope (major).** Resolved: **cut**. `deleteRoom` does not exist and rooms are only archived, never deleted, so the orphan case cannot occur. Deferred to whenever room deletion ships.
6. **Read-endpoint leaks full global library (major).** Resolved: GET returns **metadata only**; phase configs come only via relaunch-by-id or explicit Export. Disclosure scope documented in UI.
7. **Shared `db` instance (major).** Resolved: `getDb()` exported from `rooms.ts`; designs.ts imports it — no second backend (preserves dev `globalThis` singleton + single prod KV client). Shared-instance test included.
8. **Checksum read as a trust boundary (minor).** Resolved: documented as corruption detection only; security rests on per-phase re-validation + admin commit gate; size/count caps before parse.
9. **AI-origin designs embedding room topic (minor).** Acceptable — topic/goal are facilitator-supplied, not participant data; structural strip still holds.

## Out of scope / future

- `/admin` "Session library" curation panel (defer; in-builder management is enough for v1).
- Edit history / snapshots (mutable single-record; Duplicate covers forking).
- "Modules required" manifest in the share envelope for cross-deployment preflight (per-phase validation already names a missing module).
- `deleteRoom` + design cascade — only when room deletion ships as its own feature.
- "Save the currently-running session as a template" (would need to read `state.phases` only + the same strip; not built here).
- Restoring room branding/theme on relaunch — **sequence-only by design** (theme is a `/admin` room property; keeps designs portable and identity-free).
- Server-minted share-token links (`/import/<token>`) — copy/paste + `.edges.json` is fully account-less and offline-decodable for v1.
