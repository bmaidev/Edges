# F1 — One-tap client-ready report + exports (PDF / Notion / Miro / Google Doc)

> Section F. Outcomes & deliverables · Status: ready to build (pressure-test fixes folded in).
> This is the final executable build spec. The synthesis spine already exists in `lib/rooms.ts`; F1 is a **presentation + light-curation + distribution** layer on top of it. Do **not** rebuild synthesis.

---

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** **6 days** for the committed MVP + P0 distribution (down from the design's 11d — the OAuth destinations, server-side Chromium PDF, and Miro are explicitly cut to follow-ups per the pressure-test). Full vision (with a future, separately-justified OAuth slice) ~9d.
- **Dependency item ids:** none hard. Reuses existing spine only:
  - `lib/rooms.ts` — `SessionReport`, `RoomArchive`, `generateSessionReport`, `archiveRoom`, `getArchive`, `getRoom`, `updateRoom`, `RoomTheme`.
  - `lib/store.ts` — `getFacilitatorState`, `withLock`, live backend `setNX`.
  - `lib/ai.ts` — `aiAvailable`, `generateJSON`, `capItems` (synthesis engine, reused as-is).
  - `lib/auth.ts` — `requireCapability` + the existing `end` capability (facilitator + admin, **not** cohost, **not** `configure`).
  - `app/api/r/[room]/host/route.ts` — `COMMAND_CAP` + switch + the `navState`/authoritative-apply convention.
  - `components/HostConsole.tsx` — `SessionControls` mount (~L949), the `cmd()` helper (~L90-116).
  - `lib/modules/render-kit.tsx` — `AiGenerating`, `Reveal`, `StatusLine`, `StickyAction`, `Shimmer`.
  - `@vercel/blob` — already wired in `app/api/r/[room]/upload`.

---

## Problem & facilitator value (facilitator's voice)

> "I just ran a powerful three-hour offsite. The room produced gold — themes, the real tension nobody wanted to name, two decisions, a clear set of next steps. Edges already wrote that up for me… and then buried it in an admin panel I can't even reach, behind the *super-admin* passcode, as a wall of plain text. The only thing I can hand the sponsor tonight is a JSON file of pattern names. So I go home and re-type the whole thing into a Google Doc by hand, at 11pm, hoping I remember it right.
>
> What I want is simple: the moment I close the room, **one tap** gives me a polished, on-brand handover — *my* (or the client's) logo, the session name, the date, 'N people, M contributions' — that reads like I wrote it after a thoughtful evening. I want to glance at it, fix a theme title, drop the one tension that was off-topic, and send it. To email as a PDF. As a link the sponsor can open on their phone. As markdown I paste straight into their Notion. I never want to see the word 'AI', never touch JSON, and never break the off-the-record promise I made the room. That handover is what gets me re-hired. Right now it doesn't exist."

The win is emotional and commercial: the deliverable lands within minutes of the room closing, branded as the facilitator's craft, and makes the buyer feel the spend was worth it. F1 (1) elevates the hidden `SessionReport` into the product's headline outcome, (2) gives the **facilitator** — not just super-admin — ownership of it, (3) lets them lightly curate before it leaves their hands, and (4) meets the client in their native tool with zero friction.

---

## MVP cut (thinnest shippable) and Full vision

### MVP — "the handover that always works" (committed, ~6d)

Everything here ships with **zero external dependencies, zero stored third-party credentials, zero server-side Chromium**:

1. **Live, no-wipe `buildReport`** — facilitator taps *Preview handover* anytime; runs `generateSessionReport` against live state without ending the room, caches into the durable archive, returns it authoritatively.
2. **Branded preview** in the Session tab using the room's existing theme (logo, accent, headline) — a real document page, not a form.
3. **Inline light curation** — rename a theme, delete a tension, reorder next steps, edit the summary, toggle quotes on/off. Edits stored as a `curatedReport` overlay on the archive.
4. **AI-unavailable fallback** — a structured deliverable assembled from raw contributions + curated patterns + a facilitator-typed summary box. Never a dead end.
5. **Three always-works exports:**
   - **Hosted branded page** `/r/[room]/report?t=<token>` — token + absolute-timestamp expiry + `noindex`, reads durable archive only.
   - **PDF** = browser **print-to-PDF** of that page (`window.print()` + `@media print` CSS). No Chromium, no cold-start, no server PDF lib.
   - **Copy markdown** — clipboard markdown the facilitator pastes directly into Notion / Google Docs / email (account-less, no OAuth).
6. **Admin panel parity** — `app/admin/page.tsx` report panel renders the *same* `ReportDocument` component + the same export row.
7. **`archiveRoom` reuse fix** — End-session reuses an already-built report/curation instead of regenerating (no double opus spend, no clobbering the facilitator's edits).

### Full vision (separately-justified follow-ups — NOT in the 6d)

- **P1 — Google Doc + Notion via OAuth.** Deferred behind its own product + security review (confused-deputy risk on shared room tokens, see Risks). The `destinations` interface is built MVP-ready so these land incrementally without refactor.
- **P2 — Miro board seeding** from capped patterns + themes.
- **Server-streamed PDF attachment** only if a client demands a non-interactive attachment; its own spike.

---

## Experience & flows (screens, states, copy)

### Host console → Session tab → **Handover** panel (replaces "Download export")

The bare `exportJson()` / "Download export" button in `SessionControls` is replaced by `<HandoverPanel>`. Four states:

- **(a) No report yet** — primary button **"Preview handover"**, helper: *"Builds a branded summary you can edit and send."*
- **(b) Generating** — `AiGenerating` shimmer over a document skeleton; themes/tensions fade in via `Reveal`.
- **(c) Ready** — branded `ReportDocument` preview + inline edit affordances + a destination row + the privacy line. Destination row via `StickyAction`:
  `PDF · Copy markdown · Copy link` (MVP) — `Google Doc · Notion · Miro` appear as disabled "Soon" chips, not broken buttons.
  `StatusLine` shows progress, e.g. *"Building your link…"* → *"Link copied ↗"*.
- **(d) AI-unavailable** — *"AI isn't set up, so I've laid out your contributions and patterns — add a summary in your words and it's ready to send."* A summary textarea + the same export row, still produces a real deliverable.

**Privacy line (always visible in state c/d):** a single inline row with a toggle —
> *Quotes off · attributed as Anonymous · nothing here was logged.*
When the facilitator turns quotes **on**, the copy changes to a deliberate warning:
> *Quotes on · this writes a durable copy your link can forward — the 24h wipe won't reach it.*

### Key flows

1. **End-of-session happy path.** Facilitator taps *Archive (save report + wipe)* → the existing `archive` command runs (already returns `{ok, archive}`), and the Session tab auto-opens the Handover preview built from that **returned** archive object (authoritative-apply — never a KV read-back). If they already built/curated a report this session, archive **reuses** it (no regenerate).
2. **On-demand handover (the killer pre-close move).** Facilitator taps *Preview handover* late in a session → `buildReport` runs against live `getFacilitatorState` **without wiping**, caches into the archive, returns it authoritatively. Lets them review/edit before pulling the wipe trigger.
3. **Curate-before-send.** Inline title/detail edits, delete item, reorder, toggle quotes. Each edit → `editReport`/`setReportMeta`; stored on `curatedReport`/`reportMeta`. A *Regenerate* affordance re-runs the AI under a lock if they want a fresh draft (replaces the raw `report`, **preserves** `curatedReport` unless they confirm overwrite).
4. **Export PDF.** One tap → opens `/r/[room]/report?t=…` and calls `window.print()` (or just opens it with a "Download PDF" button the page itself carries). Browser renders the designed page; zero server cost.
5. **Copy markdown.** One tap → markdown of the curated report to clipboard; `StatusLine`: *"Copied — paste into Notion, Docs, or email."*
6. **Copy link.** One tap → mints/returns the hosted page token, copies the URL. The link honours absolute-timestamp expiry + `noindex`.

### Screens / states inventory

- Host Session tab → Handover panel (4 states above).
- `ReportDocument` (shared, server-renderable): header (logo top-left + session name + date + "N people · M contributions"), Summary, Themes (accent-ruled cards), Tensions, Decisions, Next steps, optional Selected quotes (only when `meta.quotesOn`), footer "Presented by {name/org} · Captured with Edges · off-the-record."
- Hosted read-only `/r/[room]/report` — same document, mobile-friendly, small "Download PDF" (print) button, `noindex`.
- Admin report panel — same `ReportDocument` + same export row.

---

## Architecture

### Files to add

| Path | Purpose |
|---|---|
| `lib/report/ReportDocument.tsx` | Shared, server-renderable branded React component. Props `{ theme: RoomTheme; archive: RoomArchive; report: CuratedReport; meta: ReportMeta; mode: "preview" \| "public" }`. Pure render, **no hooks/fetch**. Accent-ruled cards from `theme.palette.accent`, logo top-left, presented-by footer. Renders quotes **only** when `meta.quotesOn` **and** they are present in `report` (see strip rule). Source of truth for host preview, admin panel, and the public page. |
| `lib/report/html.ts` | `renderReportPageHtml(theme, archive, report, meta): string` — server-only full HTML document (inline critical CSS + `@media print`/`@page` rules + `<meta name="robots" content="noindex">`). Used by the public page route to emit a print-ready, designed page **without** a server PDF lib. No React dep. |
| `lib/report/curate.ts` | Pure, unit-testable helpers: `buildFallbackReport(archive, summaryText)`, `applyReportEdits(report, edits)` (rename/delete/reorder per section), `selectQuotes(submissions, cap, attribution)` (handle/Anonymous, capped at 12), `toMarkdown(report, meta)`, `stripQuotes(report)` (drops any quote text/handle fields). No KV/AI. |
| `lib/report/destinations.ts` | Pluggable interface `type ReportDestination = { id: "pdf" \| "link" \| "markdown" \| "gdoc" \| "notion" \| "miro"; available(room): boolean; }`. MVP implements `pdf`/`link`/`markdown` (always available, client-side). `gdoc`/`notion`/`miro` declared but `available()` returns `false` until a future slice — UI shows "Soon". Keeps the tail incrementally landable with no MVP coupling. |
| `components/HandoverPanel.tsx` | Client component mounted in `SessionControls`. Owns **local** report state, applied from host-command response bodies (`d.archive`) — **never** a KV read-back, **never** through `usePolledState`. Renders the four states via `AiGenerating`/`Reveal`/`StatusLine`/`StickyAction`. Calls the host route directly (see cmd note) and parses `d.archive` itself. |
| `app/r/[room]/report/page.tsx` | Hosted read-only branded page, token-gated via `?t=<reportToken>`. Reads **durable archive only** (survives the 24h live wipe). Validates token + absolute-timestamp expiry against `Date.now()`. Sets `X-Robots-Tag: noindex` and `<meta robots noindex>`. Renders `ReportDocument` in `public` mode + a print button. Returns 404 on missing/expired token. |
| `test/report.test.ts` | Vitest (in-memory store, no KV/AI) — see Test plan. |

> **No new module.** F1 adds no `defs/*.server.ts` / `*.client.tsx`, no registry entry, no `views.ts` type. Module contract untouched.

### Files to change

| Path | Change |
|---|---|
| `lib/rooms.ts` | Extend `RoomArchive` with `curatedReport?: CuratedReport` and `reportMeta?: ReportMeta`. Add types. Add `buildReport(slug)`, `editReport(slug, edits)`, `setReportMeta(slug, meta)`, `regenerateReport(slug)`, plus `mintReportToken`/`verifyReportToken`. Refactor `generateSessionReport` to be **exported** (so `buildReport` reuses it). Refactor `archiveRoom` to **reuse** an existing report/curation rather than unconditionally regenerating. Add a durable-store guard for the archive read-modify-write (see Concurrency). Add `presentedBy` either on `RoomTheme` or `reportMeta` (chosen: `reportMeta`, room-config can pre-fill via theme). |
| `app/api/r/[room]/host/route.ts` | Add `COMMAND_CAP`: `buildReport: "end"`, `editReport: "end"`, `setReportMeta: "end"`, `regenerateReport: "end"`. Add switch cases returning `{ ok: true, archive }` directly (authoritative-apply of the **archive**, not `navState`). Existing `archive` case unchanged. |
| `components/HostConsole.tsx` | Replace `exportJson()` + the "Download export" button in `SessionControls` (~L949-970) with `<HandoverPanel state={state} apiBase={apiBase} code={code} role={role} />`. Keep Archive/End; route the `archive` response's `d.archive` into HandoverPanel's initial state. **Do not** route the new commands through the shared `cmd()` (it only applies `d.state` with a numeric rev — see cmd note). |
| `app/admin/page.tsx` | Refactor the plain-text report panel (~L442) + `ReportList` (~L506) to render the shared `<ReportDocument>` + the same destination row. Admin passes a valid code (admin has `end`). |

### Data model

```ts
// lib/rooms.ts — additive, all optional → backward-compatible with old archives.

// The human-editable overlay. Mirrors SessionReport but writable.
export interface CuratedReport {
  summary: string;
  themes: { title: string; detail: string }[];
  tensions: string[];
  decisions: string[];
  nextSteps: string[];
  generatedAt: number;
  editedAt?: number;
  source: "ai" | "fallback"; // fallback = assembled when no AI key
}

export interface ReportMeta {
  quotesOn: boolean;               // default false
  attribution: "anon" | "handle";  // default "anon" (participants never
                                   //   consented to client-facing handle use)
  presentedBy?: { name?: string; org?: string };
  selectedQuoteIds?: string[];     // capped at 12 in selectQuotes()
  token?: string;                  // unguessable hex, minted on first Copy link
  expiresAt?: number;              // absolute ms timestamp — the PRIMARY gate
  revoked?: boolean;               // best-effort only (eventually consistent)
}

export interface RoomArchive {
  /* …existing fields… */
  report?: SessionReport | null;   // raw AI draft (unchanged; used for regenerate diff)
  curatedReport?: CuratedReport;   // NEW — what every export renders when present
  reportMeta?: ReportMeta;         // NEW
}
```

**Store keys** (durable backend, `lib/rooms.ts`, no TTL): unchanged — everything lives on the existing `rooms:archive:<slug>` record. No new always-on data. Submissions are **not** newly logged; quotes read from the already-archived `submissions` only when `quotesOn` is explicitly true.

**Lock key** (live backend, `lib/store.ts`, TTL): `lock:<slug>:report` — guards `buildReport`/`regenerateReport`/`archiveRoom` AI generation + the archive read-modify-write.

### API + host commands (+ capability gating)

All new host commands gate on the existing **`end`** capability (facilitator + admin; **not** cohost, **not** `configure`):

| Command (POST `/api/r/[room]/host`) | Cap | Returns | Notes |
|---|---|---|---|
| `buildReport` | `end` | `{ ok, archive }` | Live, no-wipe. Runs under the report lock; persists into archive. |
| `editReport` `{ edits }` | `end` | `{ ok, archive }` | Read-merge-write under the lock; writes `curatedReport`. |
| `setReportMeta` `{ meta }` | `end` | `{ ok, archive }` | Mints `token`/sets `expiresAt` for Copy-link; writes `reportMeta`. |
| `regenerateReport` | `end` | `{ ok, archive }` | Under the report lock; replaces raw `report`. Preserves `curatedReport` unless `{ overwrite: true }`. |
| `archive` *(existing)* | `end` | `{ ok, archive }` | **Refactored** to reuse existing report/curation, then wipe. |

Page route: `GET /r/[room]/report?t=<token>` — public, token + absolute-timestamp-expiry gated, `noindex`, durable archive only.

> **No server PDF route in MVP.** PDF = `window.print()` on the hosted page.
> **Deferred (P1/P2), not built now:** `POST /api/r/[room]/report/export { dest }` for gdoc/notion/miro.

### How it uses the rev / authoritative-apply pattern (no KV read-back)

- Report data is **archive-scoped, not `SessionState`** — it must **not** flow through `SessionState.rev` / `usePolledState` and must not bump session rev (report edits must never fight the 2s poll).
- The new commands return `{ ok, archive }` with **no `rev` and no `state`**. The existing `HostConsole.cmd()` only applies `d.state` when `typeof d.state.rev === "number"`, otherwise calls `refresh()` — so it would **drop the archive** and fire a useless `/state` re-poll on every edit. Therefore **`HandoverPanel` calls the host route itself** (its own `fetch`) and applies `d.archive` to its own local state. It does **not** use the shared `cmd()` for these commands.
- The discipline strictly observed: **never read the archive back from KV to render** — always render the `archive` object returned in the command response (the same authoritative-apply principle as `navState`/`getFacilitatorState`, applied to the archive instead of session state).
- The **public** `/report` page cannot use authoritative-apply (no prior write to echo back), so it reads durable KV directly. Because durable KV is eventually consistent, **revoke is best-effort**; the **primary, consistency-safe gate is the absolute-timestamp `expiresAt`** checked against `Date.now()`.

---

## Implementation plan (ordered, checkable)

**Slice 1 — spine + curation + host commands (~2.5d)**

- [ ] Add `CuratedReport` + `ReportMeta` types; extend `RoomArchive` (all optional).
- [ ] Export `generateSessionReport`.
- [ ] Add `buildReport(slug)`: acquire live `withLock(slug, "report")`; build/merge report from live `getFacilitatorState`; **read-merge-write** the archive (preserve any `curatedReport`); persist; return archive. If the lock is busy, return the current archive (no double generation).
- [ ] Add `editReport`, `setReportMeta`, `regenerateReport` (all read-merge-write under the report lock; regenerate preserves `curatedReport` unless overwrite).
- [ ] Refactor `archiveRoom`: if archive already has `curatedReport` → keep it untouched; else if it has a raw `report` → reuse (no regenerate); else generate once. Never overwrite curation.
- [ ] Add `mintReportToken`/`verifyReportToken` + absolute `expiresAt` (default +7d).
- [ ] Host route: add the four `COMMAND_CAP` entries + switch cases returning `{ ok, archive }`.
- [ ] `lib/report/curate.ts`: `buildFallbackReport`, `applyReportEdits`, `selectQuotes` (cap 12, Anonymous default), `toMarkdown`, `stripQuotes`.

**Slice 2 — shared document + host UI + admin parity (~2d)**

- [ ] `lib/report/ReportDocument.tsx` (pure render, theme-driven, quotes gated + stripped).
- [ ] `components/HandoverPanel.tsx`: four states; own `fetch` to host route; apply `d.archive`; inline edits → `editReport`; privacy toggle → `setReportMeta`; uses `AiGenerating`/`Reveal`/`StatusLine`/`StickyAction`.
- [ ] Wire into `SessionControls`; route `archive` response's `d.archive` into HandoverPanel initial state.
- [ ] Refactor admin report panel to render `ReportDocument` + export row.

**Slice 3 — distribution (P0, ~1.5d)**

- [ ] `lib/report/html.ts`: `renderReportPageHtml` (inline CSS, `@media print`, `@page`, `noindex`).
- [ ] `app/r/[room]/report/page.tsx`: token + `expiresAt` gate; durable archive only; `X-Robots-Tag: noindex`; print button; 404 on missing/expired.
- [ ] Strip rule: when `meta.quotesOn === false`, call `stripQuotes(report)` **before** rendering/serialising — quotes/handles never reach the DOM, PDF, or markdown.
- [ ] Copy-markdown (`toMarkdown`) + Copy-link (mint token via `setReportMeta`) in HandoverPanel.
- [ ] `lib/report/destinations.ts` with `pdf`/`link`/`markdown` live; gdoc/notion/miro `available(): false` → "Soon" chips.
- [ ] `test/report.test.ts` (see Test plan).
- [ ] `npm run verify` + build on Node 24 green.

---

## Acceptance criteria (facilitator-outcome framed)

- [ ] From the Session tab, a facilitator with the facilitator passcode can tap **Preview handover** mid-session and see a branded document with the room's logo, accent, session name, date, and "N people · M contributions" — **without** ending the room and **without** seeing JSON or the word "AI".
- [ ] The facilitator can rename a theme, delete a tension, reorder next steps, and edit the summary inline; the changes survive a page refresh and are reflected in every export.
- [ ] Tapping **End/Archive** after curating does **not** regenerate or overwrite the facilitator's edits, and does **not** trigger a second AI call.
- [ ] With **no `ANTHROPIC_API_KEY`**, the facilitator still gets a real, sendable deliverable (contributions + patterns + their own summary box) — never an empty/dead state.
- [ ] **Copy link** produces a URL that opens a branded, mobile-friendly read-only page that still works **after the 24h live wipe**, carries `noindex`, and stops working after its expiry.
- [ ] **PDF** (browser print) and **Copy markdown** both work with zero integrations connected.
- [ ] Quotes are **off by default**, attributed as **Anonymous**; turning them on shows the explicit durable-copy warning; with quotes off, no participant text or handle appears anywhere in the page source, PDF, or markdown.
- [ ] A cohost (no `end` cap) **cannot** build/edit/regenerate; an admin can (admin path renders the same component).
- [ ] A host + cohost double-tap of Preview handover does not fire two opus generations or lose curation.

---

## Test plan

### Vitest (`test/report.test.ts`, in-memory store, no KV/AI)

- [ ] `buildReport` persists into the archive **without** wiping live session keys (live submissions still readable after).
- [ ] End-session (`archiveRoom`) **does not overwrite** an existing `curatedReport` (build → edit → archive → curatedReport unchanged). **Hard CI gate.**
- [ ] `archiveRoom` **reuses** an existing raw `report` and does not call generate again (assert generate call count / `generatedAt` unchanged).
- [ ] `applyReportEdits` reorders, deletes, and renames correctly across all five sections.
- [ ] `buildFallbackReport` yields a non-empty deliverable (contributions + patterns + summary) when AI is null.
- [ ] `selectQuotes` respects the cap (12), defaults attribution to **Anonymous**, and returns nothing when `quotesOn` is false.
- [ ] `stripQuotes` removes all quote text/handle fields from the rendered object.
- [ ] `toMarkdown` round-trips a curated report into headed sections; omits quotes when off.
- [ ] Report token: valid token + future `expiresAt` resolves; expired `expiresAt` (past `Date.now()`) gates the page (404); missing token gates.
- [ ] Concurrency: two overlapping `buildReport` calls do not both generate (lock busy → returns current archive).

### Manual QA

- [ ] **Desktop host:** build → curate → PDF (print preview shows the designed page, logo top-left, accent rules) → copy markdown (paste into a doc renders clean) → copy link (opens branded page).
- [ ] **Mobile participant device** opening a copied `/report` link: layout is readable, single column, print button works, `noindex` present in source.
- [ ] **Projector / `/screen`:** unaffected — confirm no report data leaks onto the projector view (report is host-only).
- [ ] **No-AI build** (unset key locally): fallback state renders and exports.
- [ ] **Admin path:** admin passcode renders the same `ReportDocument` + exports.
- [ ] **Expiry:** set a short expiry, confirm the link 404s after it passes.

---

## Privacy & ethos check (explicit)

This is a **called-out, deliberate softening** of "submissions never surface attributed" — owned by the facilitator, defaulted to the safe side, and the leak vectors are closed:

- **Quotes OFF by default.** When off, `stripQuotes` removes submission text + handles from the rendered object **before** render/serialise — not a CSS hide (a hosted HTML page or PDF can leak hidden DOM). Nothing leaks to page source, PDF, or markdown.
- **Attribution defaults to "Anonymous."** Handles are participant-chosen and frequently are real names; participants never consented to **client-facing** handle attribution. "handle" is an explicit opt-in.
- **Durable-copy honesty.** Turning quotes on writes a durable, forwardable copy the 24h wipe will not reach. The facilitator sees that exact warning before it leaves the room.
- **Forwardable link is gated by absolute-timestamp expiry** (default +7d, consistency-safe) as the **primary** control; `revoked` is best-effort only (durable KV is eventually consistent on the public read path). `noindex` on the page + `X-Robots-Tag` header prevents search indexing.
- **No permanent public artifact.** MVP does **not** mint a permanent public Blob URL. The PDF is produced client-side from the token-gated page; nothing durable escapes the expiry gate.
- **Account-less preserved.** No third-party OAuth tokens stored anywhere in MVP — Notion/Docs reach is via **Copy markdown** the facilitator pastes themselves.
- **Pre-existing caveat surfaced:** `archiveRoom` already snapshots submissions **with handle** into durable, no-TTL KV (`lib/rooms.ts:308-313`). F1 does not deepen this for the default path (quotes off strips it), but the team should note the archive itself is the underlying durable copy; consider a follow-up to hash/anonymise archived handles at rest.
- **Prompt-injection blast radius widened** (output now client-facing): mitigated by **enforced preview-before-export** (no export path that skips the preview) + prominent inline delete/edit so injected nonsense is removable.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Lock/concurrency gap (critical, resolved).** The durable `DurableBackend` (`lib/rooms.ts:18-22`) has **only** get/set/del — no `setNX`/`withLock`. Resolution: `buildReport`/`regenerateReport`/`archiveRoom` acquire the **live** backend's `withLock(slug, "report")` (`lib/store.ts:652`, backed by live `setNX`) and persist only the **result** to durable KV. The archive write is a **read-merge-write under that lock** so concurrent edit/build/archive cannot clobber `curatedReport`. `buildReport` runs while live keys still exist (before any wipe), so the lock namespace is present. We do **not** claim `withGenerateLock` (which needs a `ModuleStore`) — we use `withLock` directly.
2. **Quotes leak via durable artifact (critical, resolved).** `stripQuotes` removes text+handles from the object (not CSS); Anonymous default; no permanent public Blob; absolute-timestamp expiry; explicit facilitator warning. (See Privacy.)
3. **Forwardable non-expiring link (critical, resolved).** `noindex` + `X-Robots-Tag`; primary gate is absolute `expiresAt` (default 7d), not the best-effort `revoked` flag; no separate permanent Blob URL — PDF is client-side print of the gated page.
4. **Authoritative-apply / `cmd()` drops the archive (major, resolved).** New commands return `{ ok, archive }` (no rev); the shared `cmd()` only applies `d.state` with a numeric rev and would `refresh()` (a wasted `/state` poll). `HandoverPanel` therefore fetches the host route itself and applies `d.archive` to its own state — bypassing `cmd()`. `editReport` fires on commit (blur/Enter), not per keystroke, so no per-keystroke re-poll.
5. **Server PDF on syd1/Node 24 (major, resolved by cutting).** Chromium/puppeteer is cold-start- and function-size-hostile and fights the 60s budget; pure HTML→PDF libs can't render the designed page. **MVP PDF = `window.print()` on the branded `/report` page** (`@media print` CSS). Zero deps, zero cold-start, browser does layout. Server PDF deferred to its own spike only if a non-interactive attachment is demanded.
6. **Account-less vs stored OAuth tokens (major, resolved by cutting).** Storing gdoc/notion/miro tokens on the shared Room record is a confused-deputy escalation (any room-admin exports into the token owner's personal workspace) and contradicts the no-accounts ethos. **MVP ships no stored credentials** — Notion/Docs via **Copy markdown**. Real OAuth is a separate product+security decision with per-export disclosure of the target account.
7. **Double AI spend + divergence at archive (major, resolved).** `archiveRoom` refactored to **reuse** an existing report/curation and only generate when none exists — no second opus spend, no overwrite of curation. End-after-edit no-overwrite is a hard CI gate.
8. **Prompt injection now client-facing (minor, resolved).** Preview-before-export enforced; inline edit/delete prominent.
9. **Admin panel second caller (minor, resolved).** Admin (`end` cap) reuses the exact same `ReportDocument` + destination components and passes a valid code; export logic is not forked.

---

## Out of scope / future

- **P1:** Google Doc + Notion via OAuth (room- or, preferably, per-export-scoped tokens) behind the `destinations` interface — after a dedicated security review.
- **P2:** Miro board seeding from capped patterns + themes.
- **Server-streamed PDF** attachment (its own spike; only if a client needs a non-interactive file).
- **Archived-handle anonymisation at rest** (hash handles in `archiveRoom` snapshot) — a privacy hardening follow-up.
- **Per-facilitator identity** beyond `reportMeta.presentedBy` (e.g. a saved facilitator profile) — deliberately account-less for now.
