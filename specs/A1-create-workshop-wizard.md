# A1 — Create-a-workshop wizard (unify room + session + brand + share)

> Section A. First-run & access · Priority **P0**
> Final executable build spec. Every must-fix from the pressure-test has been folded in; where the original design conflicted with the codebase or the privacy ethos, this spec overrides it and says so inline.

---

## Priority / effort / dependencies

- **Priority:** P0 (the single biggest friction wall before a facilitator feels the product's calm).
- **Effort:** **6 days** (revised down from the design's 7 by cutting the durable-draft + rotate/delete complexity out of the MVP via the *defer-the-create* fix; +0.5d contingency for the status audit if Mark-live ships in the same train — see Out of scope).
  - MVP (Phase 1): ~4.5d
  - Mark-live + draft/live list semantics (Phase 2): ~1d (own audited piece)
  - rotate/delete passcode safety net (Phase 3, optional): ~1d — **not needed in MVP because the create write is deferred** (see Risks R2).
- **Dependencies (item ids):** none hard. This item is self-contained orchestration of shipped endpoints. It *unblocks* and is adjacent to the rest of Section A (first-run/access) and to any "room lifecycle / draft-live" item. It reuses, but does not depend on new work in: the host command surface, `lib/design.ts`, `lib/templates.ts`, the theme panel, and the QR/join surfaces.

---

## Problem & facilitator value

### Problem (today)
Getting from "I want to run a workshop" to "people are joining a live, branded session" takes **four context switches and two passcode prompts**:

1. Go to `/admin`, authenticate with the super-admin `ADMIN_PASSCODE`, fill a bare name+topic form, then copy three cryptic "shown once" passcodes (`adm-…/fac-…/co-…`).
2. Open `/r/[room]/build` — a separate page that knows nothing about step 1 — and re-enter a passcode. **The trap:** the build page asks for the *room's* ADMIN-tier passcode to launch a custom build (`setPhases` needs the `configure` capability, which is admin-only), but the facilitator just stashed three strings and has no idea which one works (and doesn't know the super-admin code also works on every room).
3. Compose / AI-design a session and launch — and discover the capability mismatch only as a **red 403 after a failed launch**.
4. Bounce back to `/admin`'s RoomCard to open a collapsed "theme" sub-panel for colours/logo/headline/tagline.
5. Hand-assemble share links (join / host / screen / QR) from a copy-all blob.

Branding is bolted on as an afterthought; the passcode footgun surfaces only as an error; the AI designer is hidden behind a second authentication.

### Facilitator value (in the facilitator's voice)
> "I clicked **Create a workshop**, typed one passcode once, named it, watched the AI lay out a calm agenda I could read in plain English, dropped in my logo and saw exactly what people will see at the door, got my keys with a clear 'save these now', and landed on one screen with four big buttons: open the host console, open the projector, print the door QR, copy the invite. Two minutes. I walked to the projector knowing the QR, the host screen and the projector were already correct — I never touched JSON, never saw a 403, never wondered which passcode was which."

The wizard's three unlocks:
1. **Removes the `/admin → /build → /admin` hop** entirely.
2. **Defeats the passcode footgun** by carrying the authenticated super-admin code straight through to `setPhases` (super-admin resolves to role `admin` on *every* room via `isSuperAdmin` in `resolveRole`, so it satisfies both `configure` and `advance` — no capability-map change, no per-room `adm-` fishing).
3. **Reframes session-design and branding as first-class happy-path steps**, not buried panels.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (thinnest shippable) — Phase 1
An **in-page** five-step state machine reachable from `/admin` (no `?code` in the URL — see Privacy). The MVP:
- Authenticates **once** with the super-admin code, held in React state only.
- **Defers the durable `createRoom` write until the facilitator commits at the Share step.** Name/topic/headcount, the chosen design intent, and the brand draft all live in client state until then. (This is the key simplification: abandoning the wizard before Share leaves **nothing** durable, so no orphan rooms, no unseen passcodes, no rotate/delete machinery needed.)
- Step 2 Design: **Templates** lane (the shipped templates) + **AI** lane (`suggestSession`/`critiqueSession`/`reviseSession`) + **Blank/Advanced** escape hatch (deep-link to `/r/[slug]/build`). All three apply *after* the room is created at commit (see "deferred-create sequencing" below).
- Step 3 Brand: the extracted ThemePanel beside a faithful join-screen preview.
- Step 4 Share: reveal the three passcodes with the existing "shown once" gravity + copied-gated continue + per-tier plain-language + prebuilt share links.
- Step 5 Ready: branded room card + four launch tap targets.
- New `GET /api/admin/capabilities` returns `{ aiAvailable }` only, so the AI lane is hidden cleanly when `ANTHROPIC_API_KEY` is unset.
- New `GET /api/admin/module-meta` (or a build-time client map) supplies `{ moduleId → { name, description } }` so the AI agenda renders as plain-language prose **without importing the server registry into client code**.
- `topic` added to `GET /api/admin/rooms/[slug]` (harmless; used by any future rehydration and by the Ready card).
- The legacy inline `CreateRoom` + `RoomCard` theme panel stay fully functional as the fallback path (zero regression risk; instant rollback by hiding the button).

### Full vision — later phases
- **Phase 2:** "Mark live" (first-ever writer of `status:"live"`) + visually distinguishing draft vs live in the room list — gated behind a status-read audit (Risks R5).
- **Phase 3 (optional):** `rotatePasscodes` + `deleteRoom`/stale-draft prune — only if product ever wants a *persisted draft* model. Not needed while the create write is deferred.
- Resumable named drafts / deep-link "continue setting up <slug>" — **explicitly dropped** for MVP because it implies a persisted credential the account-less model can't provide (Privacy R1).
- Headcount-aware AI sizing (already wired: `suggestSession` accepts `headcount`).

---

## Experience & flows

Calm, single-column, one-thing-per-screen. Inherits the existing dark palette (bg `#0F1A35`, accent `#E8B14A`) and `font-display` (Fraunces) headings already used on `/admin` and `/qr`. A slim 5-dot progress rail across the top: **Name · Design · Brand · Share · Ready** — current accent-lit, completed checked, forward-gated (can't reach Design before a name exists). Each step: generous whitespace, one clear primary `Button`, a quiet "Back". A thin "Saving…" indicator whenever a write is in flight. The AI/preview region is wrapped in the platform `ErrorBoundary`.

Emotional arc: **name it → watch it take shape → make it yours → here are your keys → go.**

### Entry / gate
- `/admin` gains a prominent primary **"Create a workshop"** Button above the (now-secondary) inline create form.
- Clicking it opens the wizard **in-page** (state machine inside `/admin`, or a client island), carrying the already-authenticated super-admin `code` via **React state / context — never the URL**.
- If `ADMIN_PASSCODE` is unconfigured for the deployment, the **unauthenticated gate** shows: *"No admin passcode is configured for this deployment."* (This message must come from the gate, not the capabilities endpoint — see API notes.)

### Step 1 — Name
- Autofocused **Workshop name** (required; Continue disabled until non-empty).
- Optional **Topic** (feeds AI `topicLine` + the session report) and optional **"Roughly how many people?"** headcount (fed to `suggestSession`).
- Continue **does not POST yet** (deferred-create). It validates locally and advances. Copy under the field, muted: *"You can change all of this later."*

### Step 2 — Design (default sub-tab: AI — the differentiator)
Three lanes:
- **(a) Design with AI** — goal textarea + minutes + auto-passed headcount/topic → on "Design it", show the `AiGenerating` shimmer while `suggestSession` runs, then **reveal the proposed agenda as plain-language prose**, one human sentence per phase derived from the module-meta map (e.g. *"1. Capture — silent ideas · 2. Read-around · 3. Dot-vote"*) with the AI's `rationale` in muted text. Affordances: **Use this** and **Refine** (→ `critiqueSession` → show issues → `reviseSession` → re-reveal). Config/JSON is never shown here.
- **(b) Start from a template** — the shipped templates grid.
- **(c) Start blank / edit in detail →** — deep-links to `/r/[slug]/build` (BuilderApp) prefilled with the resolved code + slug (after create).
- **AI-off fallback:** if `aiAvailable === false`, the AI lane is hidden/disabled with: *"AI design is off for this deployment — pick a template instead."* No dead "Designing…" spinner.

### Step 3 — Brand
- Palette pickers (bg/surface/accent/muted/border) + logo upload + headline + tagline on the left; a **faithful `/qr`-style live preview** (logo / headline / QR / tagline on the chosen palette) on the right, so what they brand is literally what attendees see at the door.
- **Save & continue** and a secondary **Skip branding** (theme stays default).

### Step 4 — Share / passcodes (commit point)
- **This is where the room is actually created** (deferred-create): on entering Step 4, the wizard POSTs `/api/admin/rooms`, then applies the chosen design + brand against the new slug (see sequencing). A "Setting up your room…" state covers this.
- Reveal the three passcodes with the existing **"Save these now — shown once and cannot be recovered"** gravity + Copy-all; the "continue" affordance is **gated on copied** (mirrors today's UX).
- One plain sentence per tier: *facilitator = you when you run it · co-host = a helper · admin = you as owner of this room.*
- Prebuilt share links: join / host / screen / QR.

### Step 5 — Ready (launchpad)
- Branded room card + four big tap targets: **Open host console** (`/r/[slug]/host`), **Open projector** (`/r/[slug]/screen`), **Print door QR** (`/r/[slug]/qr`), **Copy invite text**.
- Optional **Mark live** toggle (Phase 2; `PATCH status:"live"`) — non-blocking.
- **Create another** / **Back to all rooms**.

### Screens & states (summary)
| Step | Idle | Busy | Error |
|---|---|---|---|
| Gate | passcode prompt | checking | wrong code · *no ADMIN_PASSCODE configured* |
| Name | fields | — | (local validation only) |
| Design | AI default sub-tab | `AiGenerating` shimmer | AI-off fallback · revise failure toast |
| Brand | editor + live preview | uploading logo | upload error inline (non-blocking) |
| Share | "Setting up…" → passcode reveal | creating room + applying design/brand | create 403 → back to gate; design-apply failure → retry without re-creating |
| Ready | launchpad | — | — |

---

## Architecture

### Approach
The wizard is **almost entirely orchestration of already-authoritative endpoints**. It introduces **no module, no `lib/modules` change, no view type** — the module contract is UNTOUCHED. Two small server additions (`capabilities`, `module-meta`) and one field add (`topic` on GET room) are the only backend changes for the MVP.

**Decision: in-page state machine, super-admin code in React state/context, NEVER in the URL.** (Overrides the design's `/admin/new?code=` route + `replaceState` proposal — see Privacy R1.) Reasons: the design's own pressure-test flagged the `?code` route as a real new exposure of the master code (history, shoulder-surf at the podium, Referer leak), and the account-less model can't back a resumable deep-link credential anyway. An in-page machine keeps the code exactly where `/admin` keeps it today.

### Exact files to add

| Path | Purpose |
|---|---|
| `components/wizard/WizardShell.tsx` | Presentational shell: single-column calm layout, 5-dot progress rail (accent-lit current / checked-complete / forward-gated), Back affordance, thin "Saving…" indicator. Inherits dark palette + `font-display`. |
| `components/wizard/CreateWorkshop.tsx` | The in-page client state machine: holds `{ code, name, topic, headcount, design intent, brandDraft, slug, passcodes, step }` in React state; renders the five steps inside `WizardShell`; wraps the AI/preview region in the platform `ErrorBoundary`. Receives `code` via props/context from `/admin` (no URL). |
| `components/wizard/StepName.tsx` | Step 1: autofocused name (required) + optional topic + optional headcount. Local-only (no POST). |
| `components/wizard/StepDesign.tsx` | Step 2: AI / Templates / Blank tabs. Reuses host commands `suggestSession`/`critiqueSession`/`reviseSession`/`setTemplate`/`setPhases`. Renders `SuggestedSession` as plain-language prose via the **module-meta map** (never SERVER_MODULES). `AiGenerating` shimmer; AI-off fallback; "Edit in detail →" deep-link to `/r/[slug]/build`. |
| `components/wizard/StepBrand.tsx` | Step 3: `ThemePanel` editor beside `JoinScreenPreview`; Save → `PATCH theme`; Skip secondary. |
| `components/wizard/StepShare.tsx` | Step 4 (commit): triggers the deferred create + design/brand apply, then renders `PasscodeReveal` (shown-once, copied-gated) + share links. |
| `components/wizard/StepReady.tsx` | Step 5: branded card + four launch tap targets + optional Mark live + Create another / Back. |
| `components/admin/ThemePanel.tsx` | Theme/branding editor (palette pickers + logo upload via `/api/admin/upload?code=` + headline/tagline) **extracted from `RoomCard`** so both `StepBrand` and legacy `RoomCard` reuse it instead of duplicating `PALETTE_*`. |
| `components/admin/JoinScreenPreview.tsx` | Reusable component mirroring `app/r/[room]/qr/page.tsx` layout (logo / headline / QR / tagline) rendered against an arbitrary palette+branding object. |
| `components/admin/PasscodeReveal.tsx` | The "shown once, copied-gated" passcode block + Copy-all + share-link list, **extracted from `CreateRoom`** so both `StepShare` and legacy `CreateRoom` reuse it. |
| `app/api/admin/capabilities/route.ts` | `GET ?code=` → `{ aiAvailable: boolean }`, gated by `checkSuperAdmin`. (Drops `superAdminConfigured` — see API notes.) |
| `app/api/admin/module-meta/route.ts` | `GET ?code=` → `{ [moduleId]: { name, description } }`, gated by `checkSuperAdmin`. Server-only read of `SERVER_MODULES[*].meta`, serialized to plain strings so the client never imports the server registry. (Alternative: a build-time generated client constant — pick the endpoint for simplicity.) |
| `test/wizard-flow.test.ts` | Vitest (in-memory store): create → `setTemplate` via super-admin (advance) succeeds → `setPhases` via super-admin (configure) succeeds (footgun defeated) → `PATCH theme` + `status:"live"` → capabilities shape `{ aiAvailable:false }` under in-memory store → module-meta shape. `Array.from` only; no Set-spread/`.entries()`. |

### Exact files to change

| Path | Change |
|---|---|
| `app/admin/page.tsx` | Add prominent "Create a workshop" primary Button that opens the in-page wizard (passing `code` via state/context — **not** a `?code` link). Refactor `RoomCard`'s theme panel to use `components/admin/ThemePanel.tsx` + `JoinScreenPreview.tsx`; refactor `CreateRoom`'s passcode block to use `PasscodeReveal.tsx`. Keep the legacy inline create as the fallback. (Phase 2: visually distinguish draft vs live in the list.) |
| `app/api/admin/rooms/[slug]/route.ts` | Add `topic` to the GET response room object: `{ slug, name, topic, status, theme }`. No other change — PATCH already accepts `theme` + `status`. |
| `next.config.js` | Add a `Referrer-Policy: no-referrer` (or `same-origin`) response header for `/admin*` (and ideally globally) to prevent any admin URL/code from leaking via the `Referer` header on the next outbound navigation. (Defense-in-depth even though we keep the code out of the URL.) |

**Not changed (MVP):** `lib/rooms.ts` (no `rotatePasscodes`/`deleteRoom` needed — deferred-create makes them unnecessary), `app/api/r/[room]/host/route.ts` (all commands already exist and return authoritative state), the capability map (`lib/auth.ts`), any `lib/modules/*`.

### Data model (types / zod / store keys / view shapes)
**No schema migration. No new persisted fields.** Reuses the durable `Room` (`lib/rooms.ts`):

```
Room {
  slug; name; topic; templateId;
  status: "draft" | "live" | "archived";   // RoomStatus
  createdAt;
  theme?: RoomTheme;                         // palette + logoUrl/headline/tagline
  passcodeHashes: Record<"admin"|"facilitator"|"cohost", string>;
}
```

- All wizard progress (slug, plaintext passcodes, chosen phases, brand draft, current step, the super-admin code) lives in **client component state only — never persisted** (consistent with the account-less/ephemeral ethos).
- Plaintext passcodes remain **returned-once-only** from `createRoom`. Because the create is deferred to the Share step (where they are immediately revealed copied-gated), there is no window where passcodes are minted but never shown.
- **No new store keys.** The MVP touches: durable room registry (`createRoom`/`updateRoom`/`getRoom`) and the per-room session store via host commands.
- View shapes: none added. The AI agenda prose is derived client-side from `SuggestedSession.phases[*].moduleId` + the serialized `{ moduleId → {name, description} }` meta map.

### API + host commands (+ capability gating)
| Endpoint / command | Cap / gate | Change |
|---|---|---|
| `POST /api/admin/rooms { name, topic, code }` → `{ slug, passcodes }` | `checkSuperAdmin` | **unchanged** (called at commit, Step 4) |
| host `setTemplate { templateId, code }` | `advance` | **unchanged** — super-admin satisfies it |
| host `setPhases { phases, sessionName, code }` | **`configure`** | **unchanged** — super-admin satisfies it (this is the footgun fix) |
| host `suggestSession` / `critiqueSession` / `reviseSession` | `advance` | **unchanged** |
| `PATCH /api/admin/rooms/[slug] { code, theme?, status? }` | `checkSuperAdmin` | **unchanged** — already accepts `theme` + `status` |
| `GET /api/admin/rooms/[slug]?code=` | `checkSuperAdmin` | **CHANGE:** add `topic` to response |
| `GET /api/admin/capabilities?code=` → `{ aiAvailable }` | `checkSuperAdmin` | **NEW** |
| `GET /api/admin/module-meta?code=` → `{ [id]: {name, description} }` | `checkSuperAdmin` | **NEW** |
| `POST /api/admin/upload?code=` | `checkSuperAdmin` | **unchanged** (logo) |

**Capability gating note (the footgun fix, verified in code):** `resolveRole` → `isSuperAdmin(code)` returns role `"admin"` for the super-admin code on *every* room (`lib/rooms.ts`), so the single super-admin code satisfies both `configure` (custom `setPhases`) and `advance` (`setTemplate`/AI). The wizard launches custom builds with **zero capability-map edits** and never asks the facilitator to pick between `adm-/fac-/co-`. (If the wizard is ever opened to a *plain facilitator*, `setPhases` would 403 while `setTemplate` succeeds — so the AI/custom lane would need to gate on the resolved tier. MVP is super-admin-only, so this is moot; stated for completeness.)

**Capabilities endpoint correction (must-fix):** `superAdminConfigured` is **dropped** from `/api/admin/capabilities` because the endpoint is `checkSuperAdmin`-gated, and when `ADMIN_PASSCODE` is unset `checkSuperAdmin` returns false for *everyone* — so a gated endpoint can never surface "no admin passcode configured". That message is rendered by the **unauthenticated gate** instead (the gate already can't authenticate anyone in that deployment). The endpoint returns `{ aiAvailable }` only, and must return `aiAvailable: false` cleanly under the in-memory test store so `npm run verify` stays green.

### Rev / authoritative-apply pattern (no KV read-back)
- Every applying host command (`setTemplate` / `setPhases`) already returns the **authoritative** state via `navState` → `getFacilitatorState(room, written)` in `app/api/r/[room]/host/route.ts`. The wizard **trusts that returned state** for its confirmation panel and **never reads back from KV**.
- The wizard **does not mount a polled session view**, so it does **not** build a parallel rev guard (overrides the design's "usePolledState-style applied-rev guard" musing — re-implementing the canonical `components/usePolledState.ts` guard invites drift). It simply shows a confirmation from the returned state.
- The real eventual-consistency exposure is **Step 5's launch tap-targets**: opening `/host` or `/screen` in a fresh tab immediately after `setPhases` may hit a cold serverless instance that reads stale KV and briefly renders `DEFAULT_STATE`. Mitigation: rely on those surfaces' **own** `usePolledState` rev guard (it already rejects `rev < lastRev` and converges on the next 2s poll). Optionally pass the known-good `rev` from `navState` to the host/screen links so they don't render below it. The wizard stays entirely out of the polling business.

### Deferred-create sequencing (Step 4 commit)
Because the room is created late, the design/brand chosen in Steps 2–3 must be applied *after* the slug exists. On entering Step 4:
1. `POST /api/admin/rooms { name, topic, code }` → `{ slug, passcodes }` (stash in state).
2. Apply the design intent against the new slug:
   - Template intent → host `setTemplate { templateId, code }`.
   - AI intent → host `setPhases { phases, sessionName, code }` using the phases already produced/approved in Step 2 (the AI calls themselves were run in Step 2 for preview; only the final `setPhases` write happens now).
   - Blank intent → no write; the "Edit in detail →" link points at the new slug.
3. If `brandDraft` is non-default → `PATCH /api/admin/rooms/[slug] { code, theme }`.
4. Reveal passcodes.

Each write trusts its returned authoritative state; any single failure shows a retry that re-applies **only the failed step** (the room already exists, so it is not re-created). This keeps the happy path read-back-free and idempotent on retry.

---

## Implementation plan (ordered, checkable steps)

1. [ ] **Extract `ThemePanel`** from `RoomCard` (`PALETTE_KEYS/DEFAULTS/LABELS`, logo upload, headline/tagline) into `components/admin/ThemePanel.tsx`; repoint `RoomCard` to it. Verify `/admin` theme editing still works unchanged.
2. [ ] **Build `JoinScreenPreview`** mirroring `app/r/[room]/qr/page.tsx` (logo/headline/QR/tagline) against an arbitrary palette+branding prop.
3. [ ] **Extract `PasscodeReveal`** from `CreateRoom` (shown-once, copied-gated, Copy-all, share links); repoint `CreateRoom` to it. Verify legacy create still reveals passcodes identically.
4. [ ] **Add `GET /api/admin/capabilities`** → `{ aiAvailable }`, `checkSuperAdmin`-gated; returns `aiAvailable:false` under in-memory store.
5. [ ] **Add `GET /api/admin/module-meta`** → serialized `{ id → {name, description} }` from `SERVER_MODULES[*].meta`; `checkSuperAdmin`-gated. (Server-only file; never imported by client components.)
6. [ ] **Add `topic`** to `GET /api/admin/rooms/[slug]` response.
7. [ ] **Build `WizardShell`** (progress rail, Back, Saving indicator, ErrorBoundary slot).
8. [ ] **Build `CreateWorkshop`** in-page state machine; wire `code` from `/admin` via state/context.
9. [ ] **StepName** (local-only, no POST).
10. [ ] **StepDesign** — Templates lane, AI lane (suggest/critique/revise preview + plain-language prose via module-meta), Blank deep-link; AI-off fallback gated on `aiAvailable`.
11. [ ] **StepBrand** — `ThemePanel` + `JoinScreenPreview`; Skip secondary.
12. [ ] **StepShare** — deferred-create commit sequencing (create → apply design → apply brand → reveal), `PasscodeReveal`, copied-gated continue, per-tier copy, share links.
13. [ ] **StepReady** — branded card + four launch tap targets + Create another / Back.
14. [ ] **Add "Create a workshop"** primary Button to `/admin` (opens wizard in-page; no `?code`).
15. [ ] **Add `Referrer-Policy`** header for `/admin*` in `next.config.js`.
16. [ ] **Write `test/wizard-flow.test.ts`** (see Test plan).
17. [ ] `npm run verify` (typecheck+lint+test) + `npm run build` green on Node 24.
18. [ ] **Manual QA** (see Test plan): happy path, AI-off path, no-ADMIN_PASSCODE path, mobile, projector.
19. [ ] *(Phase 2, separate)* Status-read audit → Mark live + draft/live list distinction.

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. **One passcode, once.** A facilitator who enters the super-admin code at `/admin` can complete the entire wizard (name → design → brand → share → ready) **without being prompted for a passcode a second time** and without ever choosing between `adm-/fac-/co-`.
2. **Custom AI build launches with no 403.** Designing a session with AI and choosing "Use this" writes the custom phases (`setPhases`/`configure`) successfully under the super-admin code — **no red 403** appears anywhere in the flow.
3. **Plain-language agenda.** The AI proposal renders as a readable list of phases in human language (e.g. "1. Capture — silent ideas") plus a muted rationale; **no JSON, module ids, or config forms** appear on the non-technical path.
4. **What you brand is what they see.** The Brand step preview matches the actual `/r/[slug]/qr` door screen (logo, headline, QR, tagline, palette).
5. **Keys with gravity.** Passcodes are revealed only at Share, with the "shown once, cannot be recovered" warning, and "continue" is **disabled until Copy-all is used**.
6. **Abandonment leaves nothing.** Closing the tab before the Share step creates **no durable room** and mints **no passcodes** (deferred-create). The `/admin` room list does not fill with orphans.
7. **Ready launchpad correct.** On Ready, "Open host console", "Open projector", "Print door QR", and "Copy invite" all point at the correct slug; the host and projector reflect the just-written session (no persistent stale `DEFAULT_STATE`).
8. **Graceful AI-off.** With `ANTHROPIC_API_KEY` unset, the AI lane is hidden/disabled with a clear "pick a template instead" message — no dead spinner.
9. **Graceful no-admin-passcode.** With `ADMIN_PASSCODE` unset, the gate clearly states no admin passcode is configured — not a silent 403.
10. **No regression.** The legacy inline create + RoomCard theme panel continue to work; rollback = hide the button.
11. **`npm run verify` + build green** on Node 24.

---

## Test plan

### Vitest (`test/wizard-flow.test.ts`, in-memory store, no KV/AI)
1. `createRoom` → returns slug + three plaintext passcodes; room exists in `status:"draft"`.
2. **Footgun defeated — template:** super-admin code → `setTemplate` (cap `advance`) succeeds and writes phases.
3. **Footgun defeated — custom:** super-admin code → `setPhases` (cap `configure`) succeeds (proves the super-admin → `admin` resolution grants `configure`).
4. **Authoritative state:** the host route returns non-default authoritative state after `setPhases` (assert `rev` advanced / phases present) — no read-back needed.
5. `PATCH theme` then `PATCH status:"live"` both succeed under super-admin; `GET room` reflects them and **includes `topic`**.
6. `GET /api/admin/capabilities` returns `{ aiAvailable: false }` under the in-memory/no-AI store (so `verify` stays green).
7. `GET /api/admin/module-meta` returns a serializable map containing known module ids (e.g. `capture`, `poll`) with string `name`/`description`.
8. **Boundary assertion:** grep/static check that no file under `components/wizard/*` imports `*.server` or `registry.server` (the prose source must be the meta endpoint/client map). Conventions: `Array.from`, no Set-spread/`.entries()`.

### Manual QA
- **Happy path (desktop):** `/admin` → Create a workshop → name → AI design → Use this → brand + watch preview → Share (copy passcodes) → Ready → open host / projector / QR / copy invite. Confirm host + projector show the session immediately (allow ≤1 poll for cold KV).
- **Template path:** pick a template instead of AI; confirm phases applied.
- **Blank/Advanced:** "Edit in detail →" opens `/r/[slug]/build` already authenticated/prefilled.
- **AI-off deployment:** unset `ANTHROPIC_API_KEY`; confirm AI lane hidden + message, templates still work.
- **No-ADMIN_PASSCODE deployment:** unset `ADMIN_PASSCODE`; confirm the gate message (not a 403).
- **Abandon:** quit at Step 2/3; reload `/admin`; confirm **no new room** appears.
- **Logo upload failure / Blob unlinked:** confirm inline error, Brand still skippable, Ready still reachable.
- **Mobile (participant device sanity):** scan the door QR from the Ready/QR screen on a phone; confirm frictionless join lands correctly on the branded lobby.
- **Projector:** open `/r/[slug]/screen` from Ready on a second display; confirm the lobby QR + branding render and the session advances when driven from host.

---

## Privacy & ethos check (explicit)

- **Account-less preserved.** No accounts, no sessions. The super-admin code is held in React state/context exactly as `/admin` does today.
- **MUST-FIX APPLIED — code never enters the URL/history.** The design's `/admin/new?code=…` route, `replaceState`-to-`?code`, and "continue setting up <slug>" deep-link are **removed**. The wizard is in-page; the code stays out of the address bar, browser history, autocomplete, and analytics/error-reporting URL capture. A `Referrer-Policy` header on `/admin*` is added as defense-in-depth. This avoids leaking the *master* code (which governs every room and cannot be rotated) — a strict improvement over the design's plan and no worse than today.
- **MUST-FIX APPLIED — no orphaned durable state.** The `createRoom` write is **deferred to the Share commit**, so abandoning the wizard creates no durable, no-TTL room and mints no unseen/unrotatable passcodes. This honours the ephemeral ethos and needs no new cleanup/rotate machinery in `lib/rooms.ts`.
- **Shown-once passcodes preserved.** Passcodes are minted and revealed in the same step, copied-gated, with the existing "cannot be recovered" gravity.
- **No new persistence.** Zero new store keys, zero new fields; the only data-touching changes are the existing `createRoom`/`updateRoom` calls and the additive `topic` field on GET.
- **MUST-FIX APPLIED — module boundary respected.** Plain-language prose comes from a serialized server `module-meta` endpoint (or a build-time client map), **never** by importing `SERVER_MODULES` into client code — so no server-only code (AI keys, `node:crypto`, store) is bundled into the client and the type-only boundary (`lib/modules/views.ts`) stays intact.
- **No read-back-after-write.** Honours the anti-flash contract (authoritative `navState` only).

**Verdict:** privacy check **PASS** with the three must-fixes folded in (the original design failed only because of the URL-code exposure and the eager durable create; both are removed here).

---

## Risks & mitigations (pressure-test must-fixes, resolved)

- **R1 — Super-admin code exposed via URL/history (design's `?code` route).** *Resolved:* in-page state machine; code in React state/context only; no `?code` deep-link, no `replaceState`, no "continue setting up" deep-link; `Referrer-Policy` header added.
- **R2 — Abandoned wizards orphan durable no-TTL rooms with unseen, unrotatable passcodes.** *Resolved:* defer the `createRoom` write to the Share commit. Because nothing durable exists before commit, `rotatePasscodes` + `deleteRoom`/prune are **not required** for the MVP (kept as optional Phase 3 only if a persisted-draft model is ever wanted).
- **R3 — Plain-language prose silently crosses the type-only module boundary (`SERVER_MODULES` in client).** *Resolved:* serialized `GET /api/admin/module-meta` (or build-time client constant); a static test asserts no `*.server` import under `components/wizard/*`.
- **R4 — Re-implementing a parallel rev guard / read-back risk.** *Resolved:* the wizard mounts no polled view and builds no second guard; it trusts the returned `navState` for confirmation and defers live convergence to the host/screen surfaces' own `usePolledState`. Step-5 cold-tab staleness is mitigated by those surfaces' existing rev guard (optionally seed the known-good `rev` via the link).
- **R5 — `status:"live"` is the first-ever writer of "live".** *Resolved by deferral:* Mark-live is split into **Phase 2** behind a mandatory audit of every `room.status` read across `app/` and `lib/` (room-list filters, archive checks, lobby copy). Kept non-blocking; the happy path does not depend on it. MVP ships rooms in `draft` exactly as today.
- **R6 — Capabilities endpoint can't surface "no ADMIN_PASSCODE configured".** *Resolved:* that message moves to the **unauthenticated gate**; `/api/admin/capabilities` returns `{ aiAvailable }` only and is verified to return `false` under the in-memory test store.
- **R7 — Scope creep / 7-day optimism.** *Resolved:* thinnest cut = in-page wizard + extract three components + two tiny endpoints + `topic` field; rotate/delete/Mark-live deferred. Effort revised to 6 days with Phase 2/3 carved out.
- **R8 — Logo upload / Blob unlinked (returns 503).** *Mitigation:* surface the upload route's error inline; branding is skippable; Ready stays reachable.

---

## Out of scope / future

- **Mark live + draft/live list semantics** (Phase 2, own audited piece — see R5).
- **`rotatePasscodes` + `deleteRoom`/stale-draft prune** (Phase 3, optional — only if a persisted-draft model replaces deferred-create).
- **Resumable named drafts / "continue setting up <slug>" deep-links** — dropped (account-less can't back a persisted credential; privacy).
- **Opening the wizard to plain facilitators** (would require gating the AI/custom lane on the resolved tier, since `setPhases` would 403). MVP is super-admin-only.
- **Per-facilitator / multi-tenant scoping** of the single super-admin code — out of scope; trust model is deliberately "one owner, one admin code".
- **Headcount-driven AI agenda sizing UX** beyond passing `headcount` to `suggestSession` (already wired).
