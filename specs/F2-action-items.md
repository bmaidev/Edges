# F2 — Action items with owners + due dates (captured live, sent after)

> Final executable build spec. The design, architecture, and pressure-test have been synthesised here; **every pressure-test must-fix is already folded into this spec** (see "Risks & mitigations" for the trace). Build to this document; no further design is required.

---

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 5 days (1 dev). Concentrate budget on the always-on host capture panel and the rev-correct single mutation path — that is the genuinely hard part, not a thin add to the module.
- **Section:** F. Outcomes & deliverables
- **Dependency items:** none blocking. Reuses existing infra only. Related fleet items (archive/report) are already shipped. No upstream item ids gate F2.
- **Key code dependencies (existing, reused):**
  - `lib/store.ts` — `writeState` (the ONLY rev-stamping path, store.ts:199-211), `withLock` (store.ts:652), `getPublicState` (store.ts:734), `getFacilitatorState` (store.ts:863), `endSession` (store.ts:623).
  - `app/api/r/[room]/host/route.ts` — `navState` (route.ts:39) authoritative-apply path + `COMMAND_CAP` (route.ts:54).
  - `components/usePolledState.ts` — `apply` (line 135), `refreshUntil` (line 118), rev-reject guard (line 78).
  - `lib/modules/defs/synthesis.server.ts` — promote/`__promoted__` + role-gated `forbidden` template.
  - `lib/modules/defs/needs.server.ts` — sealed participant view + mutation gating template.
  - `lib/rooms.ts` — `archiveRoom` (rooms.ts:304), `RoomArchive`/`SessionReport` (rooms.ts:211-231), `generateSessionReport` (rooms.ts:237).
  - `components/HostConsole.tsx` — `InlineEdit`, `Modal`, `exportJson`, Session-controls block (~950).
  - `app/admin/page.tsx` — archived-report view (~445).
  - `lib/modules/render-kit.tsx` — `Reveal`, `StatusLine`, `Panel`.

---

## Problem & facilitator value

**In the facilitator's voice:**

> "My job isn't done when the room nods — it's done when the commitments land. Today Edges captures every word people say, but the only 'outcome' it gives me is an AI guess at next steps, written after the fact, with no owner, no date, that I can't edit and can't send to anyone. So the single most valuable moment in my whole workshop — *'Maria owns the vendor shortlist by Friday'* — evaporates the instant the projector goes dark.
>
> I want to capture that line **at the speed of speech**: one input, tap Maria from the people already in the room, tap 'Fri', Enter. No modal, never leaving my Run tab, never losing my place. I want those commitments to **survive** — phase advances, the flaky-network flash, all of it. I want to optionally **put them on the projector** so the room sees its own promises (that social pressure is what actually makes owners follow through). And when we're done I want to **send each person their list** — 'here are your 3 items' — so I look organised and the client re-books.
>
> And I want all of that without breaking the trust story I sell on: no accounts, off-the-record, gone in 24 hours."

F2 delivers a first-class, **live-captured, verbatim** Action Items register: decision/task + owner + due date + status, curated on the host console as it is spoken, woven into the durable report at archive (NOT AI-rewritten), and sent to participants afterward in a privacy-preserving way. The differentiator: most tools bolt action-tracking on as a separate Jira-like surface; Edges captures it **inside the facilitation primitive**, anonymously-safe, and ephemeral by default.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (this spec, 5 days) — ships complete

1. **Register stored in `SessionState`** (`actionItems: ActionItem[]`) — every mutation rides `writeState`'s rev bump, killing the Upstash flash race for free. (This is the headline must-fix.)
2. **Single mutation path:** one dedicated host command `actionItem` (capability `advance`) for add / update / setStatus / remove / promote. Returns authoritative `navState`; client applies via `usePolledState.apply`. **No KV read-back.**
3. **Always-on host capture panel** on the Run tab (`ActionItemsPanel`) — collapsible, works during ANY phase. One-line capture: text + Owner chip (tap-list of present handles + free-text + unassigned) + Due chip (Today / this Fri / Next week / No date / native date). Inline edit, status cycle, delete, overdue amber.
4. **`actions` phase module** (server + client) so the builder/AI designer can place it. Its renderers are **read-only views**; capture is the host panel. The module's `handleAction` is read-only (no mutation) — mutations go through the host command only.
5. **Participant "Yours-first" view** when the `actions` phase is active/visible: "N items are yours" then the full list, read-only.
6. **Projector commitment board** when promoted (session-scoped flag in `SessionState`), driven purely from `PublicState`, independent of active phase.
7. **Privacy-safe owner exposure:** participants see owners only on their OWN ("yours") items and never on the shared "all" list (resolves the non-existent-anonymity-flag must-fix without inventing a schema field).
8. **Verbatim archive:** `archiveRoom` reads the register **before** `endSession` wipes anything, writes `RoomArchive.actionItems` verbatim. AI `nextSteps` relabelled "AI also noticed" / suppressed when a real register exists. Admin report shows an Action items table above AI themes.
9. **Send-after v1:** Copy text (with per-owner sections) + client-side CSV download, rendered from the **durable archive** returned by the archive command. Nothing written to the store.

### Full vision (future, out of scope here)

- Env-gated true delivery (e.g. Resend) — per-person email digest, contacts entered at send-time, render-and-discard.
- `.ics` / calendar entries for due dates.
- Live "done" celebration on projector (kept quiet in MVP by design).
- Cross-session carry-over of open items (would touch durable storage — deliberately excluded by the ephemeral ethos).

---

## Experience & flows (screens, states, copy)

### Host Run tab — Action items panel

- **Collapsed header:** `Action items · 4` with a chevron + a `Show on projector` toggle.
- **Expanded:** a capture row above the list.
  - Text input, placeholder: **"What was decided / who does what"**
  - **Owner chip** → popover: scrollable tap-list of current participant handles (live from `state.participantCount` source / participants), a divider, then a **"Type a name…"** free-text row, plus **"Unassigned"**.
  - **Due chip** → popover: presets **Today**, **this Fri**, **Next week**, **No date**, plus a native `<input type="date">`. Stores ISO `yyyy-mm-dd` (date-only) or null.
  - **Enter** (or **Add** button) commits.
- **On commit:** item fades in at the top (reuse `Reveal` shimmer), status dot = open.
- **Each item:** status dot (cycle open → in progress → done), inline-editable text (`InlineEdit`), owner chip, due chip, delete (×).
- **States:**
  - open — hollow dot
  - in-progress — half dot
  - done — filled dot, text struck + dimmed
  - overdue (`due < today` and status ≠ done) — **quiet amber** due chip (never alarming red — stay calm)
- **Empty state:** *"No action items yet. Capture a decision or who-does-what as it happens."*
- **Session tab chip:** `Action items: 4 (1 done)`.

### Projector — commitment board (when promoted)

- Header: **"What we committed to"**
- Large calm list: owners **bold**, due dates as quiet chips, done items struck + dimmed.
- Driven entirely from `PublicState.actionItems` + `PublicState.actionItemsPromoted` (works regardless of which module is the active phase).

### Participant phone — Yours-first (when `actions` phase active/visible)

- Card: **"N items are yours"** (`Reveal` fade-in) listing the viewer's items with text + due.
- Then **"All action items"** — read-only list. **Owners are NOT shown on this list** for anyone but the viewer's own items (privacy-safe default; no anonymity-flag dependency).
- If unassigned/free-text owner, the viewer's own items show the name the facilitator typed or "—".

### Archive modal — added step

- **"Send action items to the room"** with **Copy text** / **Download CSV** / (Deliver — disabled, flagged off).
- Privacy note: *"Contacts are used once to send and are not stored."*
- Sourced from the returned durable archive, not the live (wiped) register.

### Admin archived-report — Outcomes section

- **"Action items"** table (text · owner · due · status) **above** AI themes/tensions.
- AI "suggested next steps" clearly relabelled/separated. Table hidden when register empty (falls back to AI nextSteps).

---

## Architecture

### Storage decision (the critical one)

**The register lives inside `SessionState`, not the votes hash.** Reason (pressure-test must-fix #1): rev is stamped ONLY by `writeState` (store.ts:207); a votes-hash `hset` does **not** bump rev. If the register lived in votes, `navState` would return the same rev as before, and a concurrent in-flight 2s poll started pre-write would return that same rev with stale items and get applied (rev not strictly-less), **clobbering the just-added item** — exactly the documented Upstash disappear bug. Storing in `SessionState` and mutating via the `writeState` path gives a strictly-increasing rev for free on every add/edit/status, so `usePolledState.apply` + the rev guard work as designed.

`endSession` already calls `writeState({...DEFAULT_STATE, ended:true})`, which resets `actionItems` to `[]` along with everything else — the register is wiped on end, consistent with the ephemeral ethos. It only persists into the durable `RoomArchive` (which survives the wipe).

### Files to add

| Path | Purpose |
|---|---|
| `lib/modules/defs/actions.server.ts` | `ModuleServerDef<ActionsConfig>`. zod schema + `defaultConfig {label}`; `defaultVisibility` `vis("visible","visible","visible","visible")`; capabilities `{acceptsActions:true, liveResults:true, needsTimer:false, projectable:true}`. **`computeView` reads `ctx.state.actionItems` + `ctx.state.actionItemsPromoted`** (session-level, from state — NOT votes) and role-splits. **`handleAction` is read-only** — it returns `{ok:false, reason:"forbidden"}` for participants and `{ok:false, reason:"use host command"}` otherwise (mutations never flow through the module; see "single mutation path"). NO direct store/KV import. Exports `ActionsView` consumption via `views.ts`. |
| `lib/modules/defs/actions.client.tsx` | Per-role renderers typed `Renderer` (hooks above early returns; `Array.from`/index loops, no Set-spread/`.entries()`). Participant: "N items are yours" (`Reveal`) then read-only all-list (owners hidden except own). Projector: commitment board. Facilitator renderer: thin pointer ("Capture in the Action items panel on the Run tab"). Exported as `actionsRenderers` and registered `{participant, projector, facilitator}`. |
| `components/ActionItemsPanel.tsx` | The always-on host Run-tab register (collapsible). Capture row + Owner/Due popovers + item list (status cycle, `InlineEdit`, owner/date chips, delete, overdue amber). Header badge + Show-on-projector toggle. Drives all mutations through the `actionItem` host command; applies result via `usePolledState.apply`. Includes `exportActionsCsv()` / `copyActionsText()` pure helpers (no store writes). |
| `test/actions.test.ts` | Vitest, in-memory store. See Test plan. |

### Files to change

| Path | Change |
|---|---|
| `lib/types.ts` | Add `actionItems?: ActionItem[]` and `actionItemsPromoted?: boolean` to **both** `SessionState` and `PublicState`. Define `ActionItem` and `ActionItemStatus` (below). |
| `lib/store.ts` | Add `mutateActionItems(roomId, op)` doing a `withLock` read-modify-write **via `writeState`** (so rev bumps). Add `readActionItems(roomId)` (pure, default `[]`). In `getPublicState` (~794 return): attach `actionItems` (role-filtered) + `actionItemsPromoted` from `state`. In `roomSignature` (store.ts:822): include `state.actionItems?.length` and `state.actionItemsPromoted` so SSE ticks on capture/promote. `DEFAULT_STATE` gains `actionItems: []`, `actionItemsPromoted: false`. |
| `app/api/r/[room]/host/route.ts` | Add `COMMAND_CAP.actionItem = "advance"`. Add `case "actionItem"`: validate `op` + `payload`, call `store.mutateActionItems`, return `{ ok, state: await navState(room, written, role ?? "facilitator") }`. |
| `lib/modules/registry.server.ts` | `import { actionsModule } from "./defs/actions.server"`; add to `SERVER_MODULES`. |
| `lib/modules/registry.client.tsx` | `import { actionsRenderers } from "./defs/actions.client"`; add `actions: { renderers: actionsRenderers }` to `CLIENT_MODULES`. |
| `lib/modules/views.ts` | Add type-only `ActionItemView` shapes (facilitator/participant/projector). |
| `lib/rooms.ts` | Add `ArchivedActionItem` + `actionItems: ArchivedActionItem[]` to `RoomArchive`. In `archiveRoom`: read `fs.actionItems` (from `getFacilitatorState`, which carries `PublicState`) verbatim into `archive.actionItems`. Pass `hasRegister` into `generateSessionReport`; when true, relabel/suppress AI `nextSteps`. |
| `components/HostConsole.tsx` | Mount `<ActionItemsPanel>` on Run tab beneath the live phase. Add Session-tab chip. Add the Archive-modal "Send action items" step (Copy/CSV) sourced from the returned archive. |
| `app/admin/page.tsx` | Archived-report Outcomes section: render `archive.actionItems` table above AI themes; relabel AI nextSteps; hide table when empty. |

### Data model

```ts
// lib/types.ts
export type ActionItemStatus = "open" | "inprogress" | "done";

export interface ActionItem {
  id: string;                 // crypto.randomUUID()
  text: string;
  ownerHandle?: string | null; // for live "yours" matching (normalised compare)
  ownerName?: string | null;   // denormalised snapshot at assignment — survives
                               // participant churn AND the live-data wipe into archive
  due?: string | null;         // ISO yyyy-mm-dd, DATE-ONLY (no time/tz).
                               // "overdue" compares date-only against room locale today.
  status: ActionItemStatus;
  createdAt: number;
  updatedAt: number;
}

// SessionState gains:
//   actionItems?: ActionItem[];
//   actionItemsPromoted?: boolean;
// PublicState gains the same two (role-filtered for participants).
```

**Store keys:** none new. The register rides `roomKeys(roomId).state` (the existing SessionState key, 24h TTL bumped on every write). No votes-hash field, no durable KV key beyond the existing `RoomArchive`.

**Archive shape:**

```ts
// lib/rooms.ts
export interface ArchivedActionItem {
  text: string;
  owner: string | null;   // ownerName snapshot (handles/names, never accounts)
  due: string | null;     // yyyy-mm-dd
  status: ActionItemStatus;
}
// RoomArchive gains: actionItems: ArchivedActionItem[];
```

**View shapes (`lib/modules/views.ts`, type-only):**

```ts
export interface ActionItemFacilitatorView {
  items: ActionItem[];        // full register
  promoted: boolean;
}
export interface ActionItemParticipantView {
  mine: { id: string; text: string; due: string | null; status: ActionItemStatus }[];
  all:  { id: string; text: string; due: string | null; status: ActionItemStatus }[]; // NO owner field
  promoted: boolean;
}
export interface ActionItemProjectorView {
  items: { text: string; owner: string | null; due: string | null; status: ActionItemStatus }[];
  promoted: boolean;
}
export type ActionItemView =
  | ActionItemFacilitatorView
  | ActionItemParticipantView
  | ActionItemProjectorView;
```

### API + host commands (+ capability gating)

**New host command** — `POST /api/r/[room]/host`:

```jsonc
{
  "command": "actionItem",
  "code": "<facilitator|cohost passcode>",
  "op": "add" | "update" | "setStatus" | "remove" | "promote",
  "payload": {
    "id": "…",            // required for update/setStatus/remove
    "text": "…",          // add/update
    "ownerHandle": "…",   // add/update (optional)
    "ownerName": "…",     // add/update (optional, snapshot)
    "due": "yyyy-mm-dd",  // add/update (optional, nullable)
    "status": "open|inprogress|done", // setStatus
    "promoted": true       // promote (optional; toggles if omitted)
  }
}
```

- **Capability:** `actionItem → "advance"` (same tier as `moduleAction`). Cohosts capture; participants and the admin `configure` cap are NOT required (avoids the documented custom-build `configure` gotcha).
- **Returns:** `{ ok, state }` where `state = await navState(room, written, role)` — authoritative state computed from the just-written state. Client applies via `usePolledState.apply`. **No read-back.**
- **Phase-independent:** works during ANY phase because it mutates `SessionState` directly, not the active module. This is precisely why it is a dedicated command and not `moduleAction` (which only routes to the active phase's module and, per route.ts:281, returns no state).

**Single mutation path (must-fix #3):** ALL register writes go through `actionItem`. The `actions` module's `handleAction` does **not** mutate — its `computeView` is read-only and `handleAction` rejects everything. The `storeFacade` (store.ts:670) cannot bump rev, so routing module-driven mutations through it would behave differently (flash). The host panel AND the `actions` module's facilitator UI both call the `actionItem` command.

**`mutateActionItems(roomId, op)` (store.ts):**

```ts
// Pseudocode — read-modify-write inside withLock, persisted via writeState (bumps rev).
export async function mutateActionItems(roomId, op): Promise<SessionState> {
  const res = await withLock(roomId, "actionItems", async () => {
    const state = await getState(roomId);
    const items = [...(state.actionItems ?? [])];
    // apply op (add | update | setStatus | remove) to items, or toggle promoted
    const next = { ...state, actionItems, actionItemsPromoted };
    return await writeState(next, roomId); // <-- rev bump happens here
  });
  // on busy: return current state (client re-polls); never silently drop
  return res.ok ? res.value : await getState(roomId);
}
```

### Rev / authoritative-apply pattern (no KV read-back)

1. Host taps Add/edit/status/promote → `ActionItemsPanel` POSTs `actionItem`.
2. Route calls `mutateActionItems` → `withLock` → `writeState` → **rev strictly increases**.
3. Route returns `navState(room, written, role)` = `getFacilitatorState` over the just-written state (authoritative, no read-back).
4. `ActionItemsPanel` calls `usePolledState.apply(state)`. The rev guard (usePolledState.ts:78) then rejects any later in-flight stale poll (`rev < lastRev`), so the item cannot flash/disappear.
5. `roomSignature` includes register length + promoted flag → SSE ticks → other clients (projector, participants) re-fetch and get the new rev.

**Participant filtering in `getPublicState`** (privacy-safe default, must-fix #2 — no anonymity-flag dependency):
- `facilitator` / `cohost` / `admin`: full `actionItems` (owners included).
- `participant`: compute `mine` by normalised handle match (`me.handle`); `all` list carries **no owner field for anyone**. The viewer sees owners only on their own `mine` items.
- `projector`: full board, but only surface when `actionItemsPromoted` is true.

---

## Implementation plan (ordered, checkable steps)

1. [ ] **Types:** add `ActionItem`, `ActionItemStatus` to `lib/types.ts`; add `actionItems?` + `actionItemsPromoted?` to `SessionState` and `PublicState`. Add `actionItems: []`, `actionItemsPromoted: false` to `DEFAULT_STATE` in `lib/store.ts`.
2. [ ] **Store core:** implement `mutateActionItems(roomId, op)` (withLock + `writeState`) and `readActionItems(roomId)` in `lib/store.ts`. Confirm rev strictly increases on every op.
3. [ ] **Surfacing:** in `getPublicState`, attach role-filtered `actionItems` + `actionItemsPromoted`. In `roomSignature`, fold register length + promoted into the signature.
4. [ ] **Host command:** add `COMMAND_CAP.actionItem = "advance"` and `case "actionItem"` returning `{ ok, state: navState(...) }` in `app/api/r/[room]/host/route.ts`. Validate `op` + payload shape; reject unknown ops with 400.
5. [ ] **Module:** add `lib/modules/defs/actions.server.ts` (read-only computeView role-split; handleAction rejects mutations) + `actions.client.tsx` renderers. Register in both registries. Add `views.ts` shapes.
6. [ ] **Host panel:** add `components/ActionItemsPanel.tsx`; mount on the Run tab in `HostConsole.tsx`. Wire Owner/Due popovers, status cycle, InlineEdit, delete, overdue amber, Show-on-projector toggle. Drive via `actionItem` command + `usePolledState.apply`. Add Session-tab chip.
7. [ ] **Archive:** add `ArchivedActionItem` + `RoomArchive.actionItems`. In `archiveRoom`, write `fs.actionItems` verbatim. Pass `hasRegister` to `generateSessionReport`; relabel/suppress AI `nextSteps` when true. **Confirm archiveRoom runs BEFORE endSession** (already true at route.ts:287-288).
8. [ ] **Admin report:** render `archive.actionItems` table in Outcomes above AI themes; relabel AI nextSteps; hide when empty (`app/admin/page.tsx`).
9. [ ] **Send-after:** Archive-modal step (Copy text + CSV) sourced from the returned archive (`copyActionsText`/`exportActionsCsv`). Disabled "Deliver" with privacy note. No store writes.
10. [ ] **Tests:** `test/actions.test.ts` (see Test plan).
11. [ ] **Verify:** `npm run verify` (typecheck + lint + Vitest) + build on Node 24. Manual QA (below).

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. A facilitator can capture an action item in **one input row without leaving the Run tab**, during ANY phase (including a non-`actions` phase), and the item appears at the top within one round-trip.
2. **Captured items never flash or disappear** under eventual consistency: after add/edit/status, `SessionState.rev` strictly increases, the client applies authoritative state, and no later stale poll reverts it.
3. Items **survive phase advances** (stored in SessionState, not phase-scoped) and survive a host+cohost double-tap without clobber (`withLock`).
4. A **cohost can capture/edit** (capability `advance`); a **participant cannot** mutate (host command requires `advance`; module `handleAction` returns `forbidden`).
5. Owner can be a **present participant handle, a free-text name, or unassigned**; assignment never requires a Participant row; the `ownerName` snapshot survives a handle change and the live wipe.
6. Toggling **Show on projector** renders the commitment board on `/screen` regardless of the active phase; participants with the `actions` phase visible see the promoted board too.
7. A participant sees **their own items first ("N are yours")** then a read-only all-list; **no other participant's owner identity is exposed** on the all-list.
8. At archive, the report's Outcomes section shows the **register verbatim** (text · owner · due · status), the AI `nextSteps` are relabelled/suppressed, and an **empty register hides the table** and falls back to AI suggested steps.
9. The facilitator can **Copy a per-owner text block and download a CSV** of the items from the Archive modal; the data comes from the durable archive (post-wipe safe); **no contacts are stored**.
10. Old archives without `actionItems` render cleanly (table hidden); participant clients without the field degrade gracefully.

---

## Test plan

### Vitest (`test/actions.test.ts`, in-memory store)

1. **add round-trip:** `mutateActionItems(add)` → `readActionItems` returns the item; `state.rev` strictly increased.
2. **rev monotonic:** add, update, setStatus, remove each strictly increase `rev` (the anti-flash guarantee).
3. **cross-phase persistence:** add during phase A (`setPhase` A), advance to phase B (`setPhase` B), register still present.
4. **withLock no-clobber:** two near-simultaneous adds both land (serialised), neither lost.
5. **status cycle:** setStatus open → inprogress → done updates `status` + `updatedAt`.
6. **owner snapshot survives churn:** assign `ownerHandle` + `ownerName`; remove/rename the participant; `ownerName` still present in the item.
7. **participant mutation forbidden:** `actionsModule.handleAction` with `role:"participant"` → `{ok:false, reason:"forbidden"}`; host route would 403 (capability `advance`).
8. **participant view privacy:** `getPublicState(token, role:"participant")` returns `mine` for the viewer's items and an `all` list with **no owner fields**.
9. **promote flag:** `mutateActionItems(promote)` sets `actionItemsPromoted`; projector `getPublicState` surfaces the board only when true.
10. **archive verbatim:** with a register present, `archiveRoom` writes `RoomArchive.actionItems` matching the live items (no AI rewrite); `hasRegister` relabels/suppresses AI `nextSteps`.
11. **empty register fallback:** with `actionItems: []`, archive keeps AI `nextSteps` and `RoomArchive.actionItems` is `[]`.
12. **endSession wipe:** after `endSession`, `readActionItems` returns `[]` (register gone from live state) while the archive retains its copy.

### Manual QA

- **Desktop host:** capture during a `capture` phase (non-actions), advance two phases, confirm items persist; edit text inline; cycle status; delete; toggle projector.
- **Upstash/real KV smoke:** capture rapidly (add 3 items in <2s) and confirm **no flash/disappear** (the documented race).
- **Cohost:** log in with the cohost passcode, confirm capture works; confirm participant passcode cannot mutate.
- **Mobile participant:** join, get assigned an item, confirm "1 item is yours" shows first and the all-list shows no other owners; rotate device, confirm layout calm.
- **Projector:** promote, confirm `/screen` shows "What we committed to" with bold owners, quiet due chips, done struck — regardless of active phase.
- **Overdue:** set a due date in the past, confirm quiet amber (not red).
- **Archive:** run Archive, confirm admin report Outcomes table matches verbatim, AI nextSteps relabelled; Copy text + CSV download contain the items; re-open archive later and confirm Send step still works from durable data.

---

## Privacy & ethos check (explicit)

- **24h-TTL / ephemeral:** register lives in `SessionState` (existing key, TTL bumped on write). `endSession` resets it to `[]`. It persists ONLY into the durable `RoomArchive`, which already survives the wipe. ✔
- **Account-less:** owners are handles / free-text names with a denormalised `ownerName` snapshot — never accounts, never logins. ✔
- **Anonymity / no handle leak (must-fix #2 resolved):** participants never see other participants' owner identity on the shared list — owners surface only on host, projector, and the viewer's own items. This needs **no** room-level anonymity flag (none exists; anonymity is per-phase submission config only), so we do not read a non-existent schema field. ✔
- **Off-the-record:** the register is verbatim facilitator capture, NOT AI inference; nothing about it is logged with content. ✔
- **Send contacts never stored:** v1 Copy/CSV render from state/archive and write nothing. True delivery is deferred behind an env-gated provider, off by default. ✔
- **One intentional, flagged change:** `PublicState` now carries participant-visible action-item content. This is deliberate and mirrors the existing synthesis promote-to-room precedent; owner identities are suppressed on the shared list to honour anonymity.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Pressure-test finding | Severity | Resolution folded into this spec |
|---|---|---|
| **Votes-hash storage can't bump rev → Upstash flash/disappear race** | critical | **Store the register inside `SessionState` and mutate via `writeState`** (store.ts:199-211), which stamps a strictly-increasing rev on every op. Test 2 asserts rev monotonicity. The votes-hash approach is explicitly rejected. |
| **Anonymity gate references a non-existent room flag** | critical | **Never expose other participants' owner identity on the participant all-list.** Owners surface only on host/projector and the viewer's own items. No `room.anonymity` read; depends on no field that doesn't exist. |
| **Two mutation paths (host command vs module handleAction) diverge on rev** | major | **Single mutation path:** the `actionItem` host command only. The `actions` module's `handleAction` is read-only (rejects mutations); `storeFacade` is never used to write the register. Behaviour is identical because there is only one writer. |
| **Synthesis promote is phase-scoped; F2 needs session scope** | major | Promote flag is `SessionState.actionItemsPromoted` and the projector board reads `PublicState.actionItemsPromoted` directly — not the active module's `computeView`. Board renders regardless of active phase. |
| **Send must read the durable archive, not the live (wiped) register** | minor | Archive-modal Send/Copy/CSV render from the `RoomArchive` returned by the `archive` command. `archiveRoom` runs before `endSession` (route.ts:287-288). Test 12 covers the wipe. |
| **Scope creep: Deliver/Resend/ICS** | minor | Cut from v1 entirely. v1 = Copy text + client-side CSV only (modelled on `exportJson`). Deliver is a disabled, env-gated follow-up. |

**Other risks:**
- *Long lists / large rooms:* cap the owner tap-list render and never feed the register to AI (it is verbatim). Sensible length guards in the panel.
- *Due-date timezone:* store ISO `yyyy-mm-dd` date-only; compute "today"/"overdue" against the room locale date-only to avoid "Friday" resolving wrong.
- *`getFacilitatorState` carrying `actionItems`:* confirm `FacilitatorState` extends/forwards `PublicState.actionItems` so `archiveRoom` can read `fs.actionItems` (store.ts:863 composes from `getPublicState`).

---

## Out of scope / future

- True after-session email/SMS delivery (env-gated provider, e.g. Resend) with render-and-discard contacts.
- `.ics` / calendar entry generation for due dates.
- Live "done" celebration / notifications on the projector (kept quiet by design).
- Cross-session carry-over of open items (would require durable storage — excluded by the ephemeral ethos).
- Owner visibility to peers under a real, future session-level anonymity setting (would require adding that setting first).
