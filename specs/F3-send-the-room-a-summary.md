# F3 — Send-the-room-a-summary

> Section F. Outcomes & deliverables · Status: ready-to-build (design + architecture + pressure-test synthesised; all must-fixes folded in)

## Priority / effort / dependencies

- **Priority:** P1
- **Effort:** 6 days (was 5.5; +0.5 for the per-phase anonymity filtering of the contributions index, the snapshot-before-state ordering + null-snapshot fallback, and the cross-room token / dynamic-page hardening surfaced by the pressure-test). Thinnest MVP cut lands in ~3.5 days; see MVP below.
- **Depends on (item ids / existing code):**
  - `lib/rooms.ts` — `generateSessionReport()` + `SessionReport` type + `archiveRoom()` (reused verbatim; the deliverable generator already exists)
  - `lib/store.ts` — `endSession()` wipe semantics, `writeState()` rev stamping, `getPublicState()`, `getFacilitatorState()`, `withLock()`
  - `app/api/r/[room]/host/route.ts` — `navState()` authoritative write-then-apply pattern + `COMMAND_CAP`
  - `lib/auth.ts` — `"end"` capability + `requireCapability`
  - `lib/session.ts` — `roomKeys()` / `TTL_SECONDS` (the snapshot is a TTL'd session-store key)
  - `lib/types.ts` — `Submission.token` (for the token-gated personal recap)
  - `lib/ai.ts` — content-free logging + `aiAvailable()` gating (the model for any server-send; v1 ships mailto-only)
  - `components/HostConsole.tsx` (SessionControls), `components/ParticipantApp.tsx` (ended branch), `components/ProjectorApp.tsx` (ended branch, `QRCodeSVG`), `lib/strings.ts`
  - Related roadmap items (non-blocking, share surface): **F2 action-items** (overlaps `nextSteps` / `.ics`), the synthesis module (the "review privately, then promote" discipline). No hard ordering dependency on either.

---

## Problem & facilitator value (facilitator's voice)

> "Today my room builds something real over an afternoon — and the second I end the session, every participant's phone says *'Session closed. Nothing was kept.'* The work evaporates from their side. Meanwhile **I** walk away with a genuinely good whole-session AI report (summary, themes, tensions, decisions, next steps) sitting in the admin portal. The people who actually did the work leave with nothing but their memory.
>
> What I want is one tap at the end that hands the room back what they built — on their own phones, with no email-collection, no de-anonymising anyone, no durable copy of anything sensitive. I want to **curate** what leaves the room first (read the AI report privately, edit a line, drop a tension that named a person), exactly the way I already trust the synthesis 'review then promote' flow. And I never want to have to explain a privacy footgun to a nervous client — the room's anonymity contract has to hold end-to-end.
>
> The difference this makes: 'that was a nice afternoon' becomes 'that workshop produced something we can act on.' I look generous and competent, and I collected zero email addresses to do it."

The hard part is **not** generating the summary — `generateSessionReport()` already does that well. The hard part is **delivery that doesn't betray privacy**: no email harvesting, no de-anonymisation, no durable PII, and an honest reconciliation of "nothing was kept" with "here's a link to what you built."

---

## MVP cut (thinnest shippable) and Full vision

### MVP (thinnest shippable, ~3.5 days)
Cuts the highest-bug-density surface (the redaction modal) and zero-infra extras, keeps the whole ethos story intact:

1. **`publishTakeaway` host command** that consumes an **already-generated** report and does only fast KV writes (snapshot → state via `navState`) — no AI in the publish request.
2. **`previewTakeawayReport`** read-only command (AI runs here, lock-protected) → returns the report for a **minimal** review step (publish-as-is or edit the summary textarea only; **no per-item toggles in MVP**).
3. **`TakeawayScreen`** warm path in `ParticipantApp`, with **Copy link** + **Email-to-me (mailto:)** only.
4. **Public `/r/[room]/takeaway?k=<token>` page + API route**, `force-dynamic`, with the 410-on-expiry path.
5. Server-side personal recap (`yourContributions`), correctly anonymity-filtered.
6. `STRINGS.ended` honesty rewrite (pending sign-off — see Privacy & ethos).

### Full vision (this spec, ~6 days)
MVP **plus**: per-item include/exclude toggles + per-line redaction in `TakeawayReviewModal` with a live "what participants will see" preview reusing `TakeawayScreen`; **Add to calendar (.ics)** from next-steps; **Save/Print PDF** via a print stylesheet; **projector QR slide** for latecomers/closed phones; the degraded (AI-unavailable) **raw-deliverables** snapshot.

### Explicitly deferred (post-v1)
Server-send transactional email (Resend etc.) behind a per-room opt-in; any TTL longer than 24h; posting the short link into the "Room content" inject panel. (See Out of scope.)

---

## Experience & flows

### Screens & states

1. **`TakeawayReviewModal`** (host, Session tab) — editable `SessionReport`: summary textarea, per-item include/exclude toggles for each theme / tension / decision / next-step, per-line redact, an **anonymity-confirmed badge**, and a live **"what participants will see"** preview that renders the real `TakeawayScreen`. Buttons: **"Publish take-away & wipe"** / **"Cancel"**. The report is fetched via `previewTakeawayReport` (read-only — proposes, never wipes). Publish is **disabled** when there is nothing substantial to send (see empty-state).
2. **Session-controls row** (host) — existing *Download export*, *Archive (save report + wipe)*, *End session*, **plus** a new **primary** CTA **"Send the room a take-away"** (the primary action for most facilitators; plain **Archive** stays as the secondary/silent admin-only path). Whole control gated on `role !== "cohost"` for visibility; the API cap is the real gate.
3. **`TakeawayScreen`** (participant — replaces the bare ended screen when a take-away is published) — branded header (room logo), report body (summary / themes / tensions / decisions / next steps, same list layout as the admin report panel), an optional **"What you contributed"** collapsible (server-resolved, token-gated, **hidden entirely in anonymous mode**), and a calm action row: **Copy link · Save/Print PDF · Add to calendar · Email to me**. Footer microcopy: *"Yours for 24 hours, then wiped — by design."*
4. **Plain ended screen** (participant, when NO take-away published) — unchanged honest copy.
5. **Public take-away page** `/r/[room]/takeaway?k=<token>` (no auth, read-only) — the same `TakeawayScreen` body, server-rendered from the snapshot, **never** the personal recap (no token context here). `410 Gone` after TTL with calm copy.
6. **Projector take-away slide** (screen route ended branch) — big QR to the public page + short URL + *"Scan to keep what we built (24h)"*.
7. **AI-unavailable state** — `report` is null; the snapshot degrades to **rawDeliverables** (curated patterns + injected content + the participant's own contributions) so the feature still ships something honest.
8. **Empty / zero-substance state** — facilitator sees *"Nothing substantial to send"* and Publish is disabled (matches synthesis empty-result honesty). **Gated on substantial submission/pattern/content count — NOT on `report === null`** (which also fires when AI is merely unavailable).

### Flows

- **Facilitator end-of-session (primary):** tap **"Send the room a take-away"** → modal runs `previewTakeawayReport` (AI, lock-protected, result cached for the modal session) → curate/redact/toggle → **Publish** calls `publishTakeaway` → snapshot written, state flips to `ended` with a `publishedTakeaway` descriptor, live data wiped, durable archive optionally written **before** the wipe. Host applies the authoritative `navState` via `usePolledState.apply` — **never a read-back**.
- **Participant in-room (warm path):** phone is polling `/state`; `rev` increments; `ended` flips with a `takeaway` payload present → `ParticipantApp` renders `TakeawayScreen`. They Copy link / Save PDF / Add to calendar / Email-to-myself and leave with it.
- **Participant who already closed the phone (cold path):** projector shows the take-away QR + short link → scanning opens the read-only public page, no join, no passcode.
- **Self-email (privacy-safe default):** "Email it to me" builds a `mailto:` (subject = session name, body = plaintext take-away + the link) and opens the participant's **own** mail client. Nothing touches our servers.
- **Admin later:** unchanged — the durable archive + report still appears in `/admin`; F3 additionally surfaced a participant-shaped copy at archive time.

### Copy that matters

- `STRINGS.ended` (when a take-away **was** published, this screen is replaced by `TakeawayScreen`; the *plain* ended copy is revised for honesty across the board): change from
  `"Session closed. Nothing was kept. See you next time."`
  → `"The live room is wiped. Here's a copy of what we built — yours for 24 hours, then it's gone too."`
  **LOAD-BEARING TRUST COPY — requires product/legal sign-off before merge** (see Privacy & ethos).
- New `STRINGS.takeawayExpired`: *"This take-away has expired — by design."*
- `TakeawayScreen` footer: *"Yours for 24 hours, then wiped — by design."*
- Server-send notice (deferred, but reserve the string): *"We send once and never store your address."*

---

## Architecture

### Files to add

| Path | Purpose |
|---|---|
| `lib/takeaway.ts` | Snapshot domain logic. `TakeawaySnapshot` type; `takeawayKey(slug, token) = \`room:${slug}:takeaway:${token}\`` (a **session-store** key, inherits `TTL_SECONDS`, self-destructs — confirmed room-scoped, not global). `writeTakeaway(slug, snapshot)` (set with TTL), `getTakeaway(slug, token)` (null when expired/missing), and `buildTakeaway(room, fs, report, edits)` which assembles the participant-shaped body from a `SessionReport` **plus a per-submission contributions index that includes ONLY submissions whose source phase `config.anonymity !== "anonymous"`** (resolve each submission's `phaseId` → phase config). Token = `randomBytes(16).toString("hex")`. No durable Blob. |
| `components/TakeawayScreen.tsx` | Shared participant-facing card (reused by `ParticipantApp` ended state AND the public page). Branded header, report body, optional server-resolved **"What you contributed"** collapsible (rendered only when `yourContributions` is present in the payload — the public page never passes it), calm action row (Copy link / Save-Print PDF / Add to calendar / Email to me), footer microcopy. Uses `render-kit` `StatusLine`/`StickyAction`. |
| `lib/ics.ts` | Dependency-free `.ics` builder: `nextSteps` + session name → a string for client-side download. No server, no storage. *(Full vision)* |
| `app/r/[room]/takeaway/page.tsx` | Public, no-auth read-only page. **`export const dynamic = "force-dynamic"` (and `revalidate = 0`)** so an expired take-away can never be served from edge cache past TTL. Reads `?k=<token>`, fetches via `getTakeaway`; missing/expired → calm 410-style "expired by design"; otherwise renders `TakeawayScreen` with **no** personal recap. Print stylesheet for Save-as-PDF. |
| `app/api/r/[room]/takeaway/route.ts` | `GET ?k=<token>` → JSON snapshot (handle-free body, **no contributions index**) or `410` when expired. `Cache-Control: no-store`. Read-only, no passcode. |
| `test/takeaway.test.ts` | Vitest (in-memory store, no KV/AI). Cases enumerated in Test plan. |

### Files to change

| Path | Change |
|---|---|
| `lib/store.ts` | Add `publishTakeaway(room, { report, includeFlags?, alsoArchive? })`: **(1)** snapshot live submissions/patterns/content into memory; **(2)** `writeTakeaway(snapshot)` **BEFORE** the state write; **(3)** wipe the same keys as `endSession` (participants/submissions/content/patterns/votes/words); **(4)** `writeState({ ...DEFAULT_STATE, ended: true, publishedTakeaway: { token, anon, hasReport } })`; **return the written `SessionState`** for `navState`. Does **NO AI** — consumes the report passed in. Extend `getPublicState()` to attach an optional `takeaway` payload **only** when `state.publishedTakeaway` is set **and** `getTakeaway` returns non-null; when the snapshot read returns null (replication lag at hour-0 or TTL expiry at hour-23), **degrade to plain ended (no takeaway card)**. The personal recap is resolved **server-side**: `yourContributions = snapshot.contributions[token]` (or `undefined`), and `snapshot.contributions` is **never** shipped in bulk. |
| `lib/types.ts` | `SessionState += publishedTakeaway?: { token: string; anon: boolean; hasReport: boolean }`. `PublicState += takeaway?: TakeawayPayload \| null` where `TakeawayPayload = { token; sessionName; anon; report: SessionReport \| null; rawDeliverables: { patterns: string[]; content: { title; body }[] }; yourContributions?: { text; tag: string \| null }[] }`. Define/import `TakeawayPayload`/`TakeawaySnapshot` keeping the type-only boundary clean. |
| `lib/rooms.ts` | **Export** `generateSessionReport` (currently file-private). Refactor `archiveRoom()` to accept an optional precomputed `report` AND optional precomputed `submissions`/`patternNames` snapshot, so `publishTakeaway` passes the SAME report **and** the pre-wipe submissions (the durable archive must NOT re-read wiped submissions). One AI spend for both targets. |
| `app/api/r/[room]/host/route.ts` | `COMMAND_CAP += { publishTakeaway: "end", previewTakeawayReport: "end" }`. New `case "previewTakeawayReport"`: wrap `generateSessionReport` in `withLock(room, "ai-generate")` (prevents double-opus on double-tap / host+cohost), **cache the result under a votes-style key** for the modal session, return `{ ok, report }` — never wipes/publishes. New `case "publishTakeaway"`: read `{ report?, includeFlags?, alsoArchive? }`; if `alsoArchive`, call `archiveRoom` with the SAME report **BEFORE** the wipe and **abort on archive-write failure** (do not wipe without the durable copy persisted); call `store.publishTakeaway`; return `{ ok: true, state: await navState(room, writtenState, role) }`. **Do NOT copy the existing non-authoritative `archive` case (returns no `state`).** |
| `components/HostConsole.tsx` | SessionControls: add primary **"Send the room a take-away"** → `TakeawayReviewModal` (preview via `previewTakeawayReport`; editable summary + per-item include/exclude + redact + live `TakeawayScreen` preview + anonymity badge). Publish → `cmd("publishTakeaway", { report, includeFlags, alsoArchive })` (routes through authoritative apply). Keep plain **Archive** as secondary. Disable Publish on zero substantial submissions/patterns/content. Gated `role !== "cohost"`. |
| `components/ParticipantApp.tsx` | Ended branch: when `state.takeaway` present, render `<TakeawayScreen takeaway={state.takeaway} link={publicLink} />` instead of the `STRINGS.ended` block. (The personal recap is already in `state.takeaway.yourContributions`, server-resolved — the phone's localStorage `TK` token was sent on the poll; client does **not** filter a bulk index.) No take-away → existing honest ended copy. |
| `components/ProjectorApp.tsx` | Ended branch (currently `<Centered>Session closed.</Centered>`): when `state.takeaway` present, show a big `QRCodeSVG` to `/r/<room>/takeaway?k=<token>` + short URL + *"Scan to keep what we built (24h)"*. |
| `lib/strings.ts` | Revise `STRINGS.ended` (see Copy). Add `STRINGS.takeawayExpired`. **FLAG: product/legal sign-off.** |
| `app/api/r/[room]/state/route.ts` | No structural change — `getPublicState` populates `takeaway`; the route's existing `{...state, branding, role}` spreads carry it to participant **and** projector reads. **Verify** the projector branch surfaces the `takeaway` payload. |

### Data model

- `SessionState.publishedTakeaway?: { token: string; anon: boolean; hasReport: boolean }` — small, lives in the existing `room:<slug>:state` key, inherits `rev`/TTL.
- **New session-store key** `room:<slug>:takeaway:<token>` holding:
  ```ts
  interface TakeawaySnapshot {
    token: string;            // === the random ?k= key (not a participant token, not the slug)
    createdAt: number;
    sessionName: string | null;
    anon: boolean;            // true if ANY contributing phase ran anonymously
    report: SessionReport | null;   // null when AI unavailable OR no submissions
    rawDeliverables: { patterns: string[]; content: { title: string; body: string }[] };
    contributions?: Record<string, { text: string; tag: string | null }[]>;
    // ^ keyed by participant token; INCLUDES ONLY non-anonymous-phase submissions;
    //   OMITTED entirely when there are no non-anonymous contributions.
    //   NEVER shipped in bulk; getPublicState resolves only the caller's slice.
  }
  ```
  Stored via the SAME TTL'd backend as session keys (`TTL_SECONDS = 86_400`, bumped on write) → self-destructs at 24h. **NOT** the durable `rooms:archive:<slug>` key, **NOT** Vercel Blob.
- The **shared** report body is handle-free (`SessionReport` carries no handles). The per-token contributions index is built **per-submission**, including only submissions whose source phase `config.anonymity !== "anonymous"` — so a mixed (some named, some anonymous) session keeps the personal recap for its named phases and leaks **zero** anonymous-phase tokens.

### API + host commands (+ capability gating)

- `POST /api/r/[room]/host { command: "previewTakeawayReport", code }` — cap **`"end"`**; read-only; generates the report (lock-protected, cached) for the modal; returns `{ ok, report }`. Cohost → 403.
- `POST /api/r/[room]/host { command: "publishTakeaway", code, report?, includeFlags?, alsoArchive? }` — cap **`"end"`**; performs only fast KV writes (snapshot → state → wipe; optional durable archive first); returns `{ ok, state }` where `state` is the authoritative `navState`. Cohost → 403.
- `GET /api/r/[room]/takeaway?k=<token>` — no auth, read-only; `TakeawaySnapshot` JSON (handle-free body, **no contributions index**) or `410`. `Cache-Control: no-store`.
- `GET /api/r/[room]/state` — `PublicState` gains optional `takeaway` (only when `publishedTakeaway` set **and** snapshot alive; carries the caller's own `yourContributions` only when `!anon`).
- `GET /r/[room]/takeaway?k=<token>` — server-rendered read-only page, `force-dynamic`, 410 on expiry.

### Rev / authoritative-apply (no KV read-back)

- **Host's own flip is authoritative:** `publishTakeaway` returns the just-written `SessionState`; the host route returns `navState(room, writtenState, role)` → `getFacilitatorState(room, writtenState)` (state override, **no read-back**), and the client applies via `usePolledState.apply`. Because `getFacilitatorState` is passed the written state, its `rev` is the written rev — strictly greater than any in-flight pre-publish poll, so the anti-flash guard accepts it and no host phone flips to ended-without-takeaway.
- **Participant path is a genuine eventually-consistent read** (it reads the state key AND the separate snapshot key — two keys, not atomic). It **cannot** be made authoritative, so it is made **crash-safe**: snapshot is written **before** state (the `publishedTakeaway` flag never precedes its data), and `getPublicState` degrades to plain-ended when `getTakeaway` returns null. A participant who polls during replication lag sees the honest plain-ended screen, then the take-away on the next 2s poll once the snapshot replicates — never a half-rendered/null card.

---

## Implementation plan (ordered, checkable)

1. [ ] **Types** — add `publishedTakeaway` to `SessionState`, `takeaway`/`TakeawayPayload` to `PublicState`, define `TakeawaySnapshot` (`lib/types.ts` + `lib/takeaway.ts`).
2. [ ] **`lib/takeaway.ts`** — `takeawayKey` (confirm room-scoped), `writeTakeaway`, `getTakeaway`, `buildTakeaway` with **per-phase anonymity-filtered** contributions index + `rawDeliverables` fallback.
3. [ ] **`lib/ics.ts`** — `.ics` builder *(full vision)*.
4. [ ] **`lib/rooms.ts`** — export `generateSessionReport`; refactor `archiveRoom()` to accept precomputed report + pre-wipe submissions/patterns.
5. [ ] **`lib/store.ts`** — `publishTakeaway()` (snapshot-before-state ordering; wipe; return written state; **no AI**); extend `getPublicState()` with the null-snapshot fallback + server-side `yourContributions` slice.
6. [ ] **`test/takeaway.test.ts`** green under `npm run verify` (in-memory store, no KV/AI) — all cases in Test plan.
7. [ ] **Host route** — `COMMAND_CAP` additions; `previewTakeawayReport` (lock + cache, read-only); `publishTakeaway` (durable-archive-before-wipe on `alsoArchive`, abort-on-failure, return `navState`).
8. [ ] **`components/TakeawayScreen.tsx`** — shared card + action row.
9. [ ] **`components/ParticipantApp.tsx`** — render `TakeawayScreen` in the take-away ended branch (pass `TK` token via poll; recap is server-resolved).
10. [ ] **`components/ProjectorApp.tsx`** — QR slide in ended branch.
11. [ ] **Public page + route** — `app/r/[room]/takeaway/page.tsx` (`force-dynamic`, print stylesheet, 410) + `app/api/r/[room]/takeaway/route.ts` (no-store, 410, no contributions index).
12. [ ] **`components/HostConsole.tsx`** — `TakeawayReviewModal` (preview/curate/redact/toggle + live `TakeawayScreen` preview + anonymity badge); primary CTA; empty-state disable on substantial-count.
13. [ ] **`lib/strings.ts`** — revise `STRINGS.ended` (**gated on sign-off**); add `takeawayExpired`.
14. [ ] **`npm run verify` + build** green on Node 24.

---

## Acceptance criteria (facilitator-outcome framed)

1. **One tap delivers the take-away.** A facilitator who taps "Send the room a take-away," reviews/edits, and publishes sees every still-open phone in the room flip to a branded Take-away card within one poll cycle (≤2s), with no manual per-phone action.
2. **The facilitator curates what leaves.** Edits to the summary and any item toggled off in the modal are absent from what participants see; the live "what participants will see" preview matches the published card exactly.
3. **Anonymity holds end-to-end.** In a fully or partially anonymous session, the shared card contains no handles and no who-said-what; the "What you contributed" panel shows only the requesting phone's **non-anonymous-phase** contributions and is hidden entirely when the whole session ran anonymously.
4. **Latecomers can still get it.** Scanning the projector QR opens the read-only public take-away with no join and no passcode; it shows the same report body and never a personal recap.
5. **It self-destructs honestly.** The take-away (and its link/QR) stops working at 24h with "This take-away has expired — by design"; an `.ics`/PDF already downloaded keeps working offline. No durable PII is created in the session store path.
6. **It never collects an email.** "Email to me" opens the participant's own mail app pre-filled; v1 stores/logs zero addresses.
7. **It degrades gracefully.** With no AI key, participants still receive an honest card built from curated patterns + injected content + their own contributions. With nothing substantial said, Publish is disabled with "Nothing substantial to send."
8. **Cohosts can't trigger it.** A cohost gets 403 on `publishTakeaway`/`previewTakeawayReport`; admin/facilitator succeed.
9. **No phone is stranded.** Under store replication lag no phone shows a broken/empty take-away card — it shows the plain ended screen until the snapshot is readable, then the take-away.
10. **The admin path is unchanged.** The durable archive + report still appears in `/admin`; if `alsoArchive` fails, live data is NOT wiped.

---

## Test plan

### Vitest (`test/takeaway.test.ts`, in-memory store, no KV/AI)
1. **Publish flips state authoritatively.** `publishTakeaway` writes a TTL snapshot and `writeState` with `ended:true` + `publishedTakeaway`; the returned state (what `navState` echoes) carries the `publishedTakeaway` descriptor and a `rev` greater than the prior state.
2. **Snapshot-before-state ordering.** Assert the snapshot key exists before/at the moment the state flips (simulate by checking both written in the same `publishTakeaway` call; assert `getTakeaway` non-null after).
3. **Null-snapshot fallback.** With `publishedTakeaway` set on state but the snapshot key deleted, `getPublicState` returns `ended:true` and `takeaway == null` (plain ended), never a half-card.
4. **Mixed-session anonymity filter.** A session with one named phase + one anonymous phase: snapshot `contributions` contains entries for the named-phase token(s) and **zero** anonymous-phase entries; `anon` is `true`; the shared `report` body carries no handles.
5. **Fully anonymous → no recap.** All-anonymous session: snapshot `contributions` omitted; `getPublicState(token)` returns `takeaway.yourContributions === undefined`.
6. **Server-side recap slice only.** `getPublicState(tokenX)` returns only tokenX's contributions; the full index is never present on the payload.
7. **Public API carries no contributions.** The `GET /api/.../takeaway` JSON (and the public page payload) contains the report body but no `contributions`/`yourContributions` field.
8. **Token is not a participant token nor the slug.** The `?k=` token is `randomBytes(16)` hex, distinct from any participant token and from the room slug.
9. **Cross-room token isolation.** A token minted for room A returns 410/null when queried under room B (key is room-scoped).
10. **Capability gating.** `publishTakeaway` and `previewTakeawayReport` require `"end"`; a cohost is blocked (403/`ok:false`); facilitator/admin pass.
11. **No AI in publish.** `publishTakeaway` performs no `generateSessionReport` call (consumes the passed report); only `previewTakeawayReport` generates.
12. **Empty-state disable keys off counts, not nullness.** Zero substantial submissions/patterns/content → publish-disabled condition true. AI-unavailable but non-empty raw deliverables → publish-enabled, snapshot built from `rawDeliverables` with `report:null`.
13. **`alsoArchive` safety.** When the durable archive write throws, the live keys are NOT wiped and no `publishedTakeaway` state is written (error surfaced).
14. **`getTakeaway` after wipe.** After session keys are cleared, `getTakeaway` returns null (TTL self-destruct cannot be proven in-memory — covered by manual KV QA).

### Manual QA
- **Mobile (participant warm path):** publish from host; confirm phone flips to `TakeawayScreen` ≤2s; Copy link copies a working URL; Email-to-me opens the mail app pre-filled with subject + plaintext body + link; Save/Print PDF renders the print stylesheet cleanly; Add to calendar downloads a valid `.ics` (imports into Apple/Google Calendar).
- **Mobile (anonymous room):** confirm no "What you contributed" panel and no handles anywhere.
- **Projector:** ended branch shows the QR + short URL; scanning on a second phone opens the read-only public page with the report body and **no** personal recap.
- **Cold path / closed phone:** open the public link directly — works with no passcode.
- **TTL expiry (real KV / staging):** after 24h (or by manually expiring the key), the public link 410s with the calm copy; a previously downloaded PDF/`.ics` still opens offline; **verify the page is not served stale from edge cache** (`force-dynamic`).
- **Cohost:** confirm the host UI hides the CTA and the API returns 403.
- **Double-tap / host+cohost concurrency:** open the review modal twice quickly — confirm only one opus generation (lock + cache) and no double-spend.

---

## Privacy & ethos check (explicit)

- **24h TTL preserved, no durable PII:** the snapshot lives in the session store under `room:<slug>:takeaway:<token>` (`TTL_SECONDS = 86_400`), self-destructs, and is **NOT** written to durable `rooms:archive:<slug>` or Vercel Blob. The live raw submissions/votes/words ARE still wiped exactly as `endSession`.
- **Account-less / no email harvesting:** v1 delivery is entirely client-side and zero-capture (Copy link, mailto:, in-browser PDF + `.ics`). Server-send is deferred behind a per-room opt-in.
- **Anonymity preserved:** shared body is handle-free; the personal recap is resolved **server-side** to the requesting token's slice only and **excludes anonymous-phase submissions** per-phase (never just suppressed wholesale); fully-anonymous sessions get no recap at all. The full token→text index is **never** shipped in bulk and is unreachable via the public `?k=` page.
- **`?k=` token semantics:** a fresh `randomBytes(16)` snapshot key — **not** a participant token, **not** the slug — granting read of the curated handle-free body **only**; no raw submissions reachable. Safe to display as a projector QR (photographable) because the content is handle-free and TTL-bound; it is a SHARED read capability, distinct from the participant token that drives the personal recap.
- **DELIBERATE ETHOS CHANGE — REQUIRES SIGN-OFF:** `STRINGS.ended` moves from *"Nothing was kept"* to *"here's a copy for 24 hours."* This is honest (live raw data is still wiped; the snapshot is a NEW curated, handle-free artifact under the SAME 24h TTL) but it edits a **load-bearing trust string**. **Block merge on explicit product/legal sign-off of the new wording** and on confirmation that the AI-unavailable degraded card reads honestly.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution folded into spec |
|---|---|
| **Anonymous-mode token leak** — anonymous submissions still store `token`; a wholesale "omit index if any anon phase" either kills the feature for mixed sessions or leaks anon tokens. | `buildTakeaway` builds the index **per-submission**, including only `config.anonymity !== "anonymous"` phases (resolve `phaseId`→phase). Test #4 asserts zero anon entries in a mixed session. (Stripping `token` from anon submissions at `addSubmission` time is the cleaner long-term fix — flagged as future, touches existing privacy surface.) |
| **Client-vs-server recap contradiction** — design said "client-side"; that would bulk-ship the whole token→text map to every phone (leak to all). | **Server-side only.** `getPublicState(token)` returns just that token's slice; the bulk index is never shipped and never reachable via the public page. Client-side framing deleted. Tests #6/#7. |
| **Eventual-consistency / two-key write** — flag could precede data; phone renders null card. | Write **snapshot before state**; `getPublicState` degrades to plain-ended when `getTakeaway` is null. Test #3. |
| **AI timeout in the publish request** — `publishTakeaway` doing AI + writes risks the 60s function ceiling, leaving data un-wiped. | `publishTakeaway` does **NO AI**; the slow opus step is the read-only `previewTakeawayReport`, returned to the modal first. Publish performs only fast KV writes. Test #11. |
| **Existing `archive` case is non-authoritative** (returns no `state`) — implementer might copy it. | Spec mandates `publishTakeaway` return `{ ok, state: await navState(...) }`; explicit "do NOT copy the archive case." Test #1. |
| **Partial failure on `alsoArchive`** — wipe without durable copy persisted. | Durable archive written **before** the wipe; abort the wipe on archive-write failure. Test #13. |
| **Edge-cached take-away served past TTL** — defeats the 410. | Public page `force-dynamic` / `revalidate = 0`; API `no-store`. Cross-room token test #9; manual TTL QA. |
| **Double opus spend** on double-tap / host+cohost modal opens. | `previewTakeawayReport` wrapped in `withLock(room, "ai-generate")` + result cached under a votes-style key for the modal session. Manual concurrency QA. |
| **Empty-state overloads `report === null`** (AI-off vs zero-submission). | Publish-disable gated on substantial submission/pattern/content **count**, independent of report nullness; AI-off but non-empty publishes the degraded card. Test #12. |
| **Trust-copy change** without sign-off. | Block merge on product/legal sign-off (Privacy & ethos). |

---

## Out of scope / future

- **Server-send transactional email** (Resend or similar) behind a per-room opt-in with a "used once, never stored / content-free logging" guarantee and per-room rate limiting. v1 ships mailto-only.
- **TTL longer than 24h** (e.g. a 7-day client window) — breaks the uniform TTL promise; the durable admin archive remains the "permanent" path.
- **Stripping `token` from anonymous submissions at `addSubmission` time** — cleaner long-term anonymity fix; touches the existing submission privacy surface, evaluate separately.
- **Posting the short link into the "Room content" inject panel** as a final card (latecomers reach it via the projector QR for now).
- **Foregrounding personal contributions over the collective report** — v1 keeps collective report first, personal recap collapsed below, suppressed in anonymous mode.
