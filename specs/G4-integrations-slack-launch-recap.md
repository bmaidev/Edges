# G4 — Integrations (Slack/Teams launch, calendar, Miro/Mural, Zoom/Meet)

> Final, executable build spec. The pressure-test must-fixes are already folded
> in below — build to this document as written.

---

## Priority / effort / dependencies

- **Priority:** P2 (Section G — Differentiators / moonshots)
- **Effort:** **3.5 days for the MVP cut** (Slack-only, outbound, end-to-end). Full four-provider vision ≈ 7 days. Build the MVP, validate against a real Slack channel, then fast-follow.
- **Depends on (existing, must not regress):**
  - Durable, no-TTL room registry — `lib/rooms.ts` `DurableBackend` + `updateRoom` PATCH path (home for connection config + audit, outside the 24h wipe).
  - Passcode-hash redaction discipline — `lib/rooms.ts` `passcodeHashes` (stored, never round-tripped) + admin GET that exposes only `theme`. Mirror this for connection secrets.
  - Host-command switch + `COMMAND_CAP` + `navState` authoritative-apply — `app/api/r/[room]/host/route.ts`.
  - Capability model — `lib/auth.ts` `requireCapability` / `CAPABILITIES` (`inject`, `advance`, `end`) and `checkSuperAdmin` (admin route gate).
  - `SessionReport` + `archiveRoom()` — `lib/rooms.ts` (the recap artefact; **no new AI work**).
  - `withLock` — `lib/store.ts` (de-dup the launch-card fire).
  - Admin RoomCard `panel` union + join-URL/QR "Copy all" block + `/r/[room]/qr` door page + `qrcode.react` — `app/admin/page.tsx`.
- **Related roadmap items:** E1 (join lobby — the canonical door the launch card routes to), F1 (report exports — the same `SessionReport` artefact), C2/C5 (live signals / co-facilitation — the "N here" count surfaced in the card).

---

## Problem & facilitator value

**The seam, in the facilitator's voice:**

> "Edges starts cold and ends cold. Before the room, I copy a join link out of `/admin` and paste it into Slack by hand, then nag people to switch out of their work tool into a browser. After the room, the AI recap — the whole reason we met, the themes and the decisions — sits in the admin portal where nobody on the team will ever see it, and in 24 hours it's gone. The calm is great; the **edges around the calm** are all manual."

**Two moments of leverage this delivers:**

- **LAUNCH** — From the host Run tab I tap **"Post join card to #design-team"**. Slack gets a branded card: room name, our logo, the one-tap join link, a link to the full-screen QR, and "**N here so far**". 25 people join from the tool they already have open. I never leave my host console to herd people in.
- **HANDOFF (the bigger win)** — When I hit **Archive**, one pre-checked toggle says *"Also send the recap to #design-team."* The AI synthesis (summary / themes / tensions / decisions / next-steps) lands back in the channel as a clean, copy-pasteable recap — automatically, **only what I consciously chose to send**, never the raw contributions. The room's value escapes the wipe and lands where the team works.

**Set-up-once:** the admin pastes a Slack **Incoming Webhook URL** into the room's new **Connections** panel a single time. Every future session of that recurring workshop auto-launches and auto-recaps. No OAuth, no app install, no accounts, nothing to revoke beyond deleting the secret.

---

## MVP cut (thinnest shippable) and Full vision

### MVP — Slack only, outbound, end-to-end (build this)

1. `lib/integrations.ts` — `RoomConnection` data shape, SSRF-guarded `postJson`, masking/redaction, the **Slack** formatters (`formatLaunch`, `formatReport`), `pingConnection`, `postLaunchCard`, `deliverReport`, `buildLaunchCard`, `reportToPayload`.
2. `RoomConnection[]` on the durable `Room`; admin GET returns **redacted** view; admin PATCH adds/updates/removes a connection and runs a server-side **Test** ping.
3. Outbound **audit log** stored under its **own durable key** (`rooms:audit:<slug>`), content-free, bounded.
4. Host command **`postLaunch`** (`inject` cap, `withLock` ttl≥12s) — posts/updates the launch card.
5. Host command **`connStatus`** (`advance` cap) — fetched **once on host-console mount**, tells the Run tab whether to show the Invite affordance.
6. **`archive`** command extended with `{ deliverRecap?: boolean }` — wipe-first, then fire-and-forget recap delivery.
7. `components/ConnectionsPanel.tsx` + a `'connections'` value on the admin RoomCard `panel` union.
8. HostConsole: Run-tab **Invite** affordance + archive-dialog **recap toggle** + a **pre-send recap preview** (privacy fix).
9. `test/integrations.test.ts` — privacy, SSRF, redaction, wipe-survives-failure, audit bounds.
10. **Base-origin env** plumbed for server-side URL building.

### Full vision (fast-follows, deferred)

- **Teams** — a second formatter (`formatLaunch`/`formatReport` → MessageCard/Adaptive Card) on the **same** `postJson` path. Allowlist `*.webhook.office.com`.
- **Calendar** — outbound-only `/api/r/[room]/calendar.ics` read-only feed (join URL + `/qr` link in the VEVENT description; recap summary appended after archive). Feed-token-gated path (anti-enumeration).
- **Miro/Mural** — zero-token default: a downloadable `.txt`/`.csv` "sticky import" built from the archive report; optional board-token REST POST (allowlist `api.miro.com`) as opt-in advanced.
- **Admin "Send recap again"** — re-fires `deliverReport` from the stored `RoomArchive.report`.
- **Zoom/Meet** — named in the title but **out of scope for G4** (their meeting-create APIs require OAuth + accounts, which collides with the ethos). Tracked as future.

---

## Experience & flows

Aesthetic: calm, opt-in, honest about the boundary; matches the refined-editorial system (Fraunces/Hanken, gradient-mesh). **Zero UI and zero behaviour change when no connection is configured** — the Run-tab Invite affordance and the archive-dialog toggle are hidden entirely until an admin pastes a webhook. The participant and projector surfaces are **visually unchanged** — the projector lobby QR and `/r/[room]` join page remain the canonical door; integrations only change *how the invite reached people*.

### Screens & states

**1. Admin → RoomCard → new `connections` panel** (third value of the existing `panel` union; reached by a new `connect` link in the RoomCard link row beside `theme`/`report`):
- A list of **connection cards**, each: provider label, **masked URL** (`hooks.slack.com/…/abc`), **status dot**, **Test** button, **Remove** button, and a per-provider **privacy line**.
- An **"Add connection"** picker. MVP shows **Slack** only (Teams/Calendar/Mifor greyed "coming soon" or omitted).
- A masked-secret paste field (`type="password"`-style, never pre-filled with the stored secret).

**Connection-card states (status dot copy):**
| State | Dot | Copy |
|---|---|---|
| never-configured | — | "Add connection" |
| configured-untested | amber | "Test to confirm" |
| connected | green | "Ready" or "last fired 4m ago" |
| errored | red | "last attempt failed — check the URL" |

**Privacy line (Slack), exact copy — reworded from the design to be honest (see Privacy check):**
> "Sends the **AI recap** — a synthesis derived from the room's contributions (summary, themes, decisions, next-steps) — plus a join link and live count. **Never sends raw submissions, handles, or votes.** You'll see the exact recap text before it's sent."

**2. Host console → Run tab → Invite affordance** (shown only when a launch connection exists):
- Button: **"Post join card to #design-team"**. On success, inline: **"Posted ✓ · Update count"** (the second tap re-fires `postLaunch` with `mode:'update'`). The button disables until the response returns (dedup belt + braces with the lock).
- Calm failure line on error: **"Couldn't reach Slack — try again."**

**3. Host console → Session tab → Archive confirm dialog** (the existing `Modal` in `SessionControls`, `confirming === "archive"`):
- One checkbox: **"Also send the recap to #design-team"** (checked by default **only when** a delivery connection exists).
- A **"Preview recap"** disclosure that shows the exact `summary / themes / tensions / decisions / nextSteps` text that will be sent (this is the privacy fix — the facilitator sees precisely what crosses the boundary).
- Reminder line: **"Sends the AI synthesis of this session — derived from contributions, never the raw submissions themselves."**

**4. Post-archive admin Report panel** (MVP shows status; "Send again" is a fast-follow):
- A line: **"Delivered to Slack ✓"** / **"Not delivered — couldn't reach Slack"** (read from the audit tail / archive delivery status).
- (Fast-follow) **"Send recap again"** button.

**5. Participant + projector:** unchanged.

### Key flows

- **LAUNCH:** admin pastes webhook once → facilitator taps "Post join card" in Run tab → `postLaunch` (`inject`, `withLock` ttl 12s) builds `joinUrl`/`qrUrl` from the **configured base origin**, calls `postLaunchCard`, POSTs Slack Block Kit, appends audit, returns `{ ok, posted, count, reason }` (no state mutation) → team taps → lands on the existing passcode-less `/r/[room]`. Live count refreshes on a second tap (`mode:'update'`), never a background job.
- **HANDOFF:** facilitator hits Archive with toggle on → `archive` command runs `archiveRoom()` (which already does the opus synthesis) → **`endSession()` (the wipe) runs and is awaited to completion** → **then** `deliverReport()` fires in try/catch (its own ≤10s timeout), appends audit → response gains `{ delivered, deliveryError? }`. A failed/slow webhook can never block or skip the wipe.

---

## Architecture

Integrations are **NOT a module** — no `ModuleServerDef`/registry/views changes. They are a host-command + admin-config surface. The rev/authoritative-apply model is respected: `postLaunch`/`connStatus` return **command results, not state**, applied inline by the Run-tab UI; `archive` continues to return the archive object. **Nothing reads connection data through the eventually-consistent `/state` path** — connections are read only from the durable room via `getRoom`/`getConnection`. No `Set` spreads, no `.entries()` — index loops / `Array.from()`.

### Files to ADD

| Path | Purpose |
|---|---|
| `lib/integrations.ts` | Server-only core. Exports: `RoomConnection`, `RoomConnectionPublic`, `Provider` union, `AuditEntry`; `maskUrl()` / `redactConnections()`; `validateOutboundUrl()` (SSRF guard); `PROVIDERS` adapter table `{ label, formatLaunch, formatReport }` (Slack Block Kit in MVP); `postJson(url, payload, timeoutMs=10000)` (calls the SSRF guard first); `pingConnection`, `postLaunchCard`, `deliverReport`; `buildLaunchCard`; `reportToPayload()` (compile-time + runtime guard — accepts ONLY `SessionReport` fields); `appendAudit()` / `readAudit()` writing the **separate** `rooms:audit:<slug>` key. |
| `components/ConnectionsPanel.tsx` | Admin Connections UI (client). Connection-card list, status dots, Test/Remove, "Add connection" picker, per-provider privacy line, masked-secret paste field. Talks to PATCH `/api/admin/rooms/[slug]`. |
| `test/integrations.test.ts` | Vitest (in-memory store, no KV/AI). Privacy, SSRF, redaction, wipe-survives-failure, audit bounds. |
| *(fast-follow)* `app/api/r/[room]/calendar.ics/route.ts` | Public read-only ICS feed (feed-token-gated). Deferred. |

### Files to CHANGE

**`lib/rooms.ts`**
- Define the data shapes here (avoid an import cycle): add `RoomConnection`, `RoomConnectionPublic`, `Provider`, `AuditEntry` to this module (behaviour lives in `lib/integrations.ts`, which imports the types from here).
- Add `connections?: RoomConnection[]` to `Room`. **Audit log does NOT live on `Room`** — it has its own key (see SSRF/race fix below).
- Widen `updateRoom`'s `Pick<>` to include `"connections"`.
- Add `getConnection(slug, id)` — reads the durable room only.
- `archiveRoom()` is **unchanged** in shape (still returns `RoomArchive`); delivery stays out of `rooms.ts` so AI/POST/audit ownership lives in the route.

**`app/api/admin/rooms/[slug]/route.ts`** (gated `checkSuperAdmin`)
- **GET:** add `connections: redactConnections(room.connections)` (build `RoomConnectionPublic[]` explicitly — **never spread `room.connections`**, the raw `secret` must never appear) + the content-free audit tail (`readAudit(slug)`).
- **PATCH:** accept `body.connections` ops (`{ op: 'add'|'update'|'remove', connection?, id? }`) and `body.connTest` (`{ id }` → `pingConnection` server-side, persist `status`/`lastFiredAt`/`lastError`, return the redacted view). On add/update, **validate the URL with `validateOutboundUrl` before storing**. Store the raw secret; return only the redacted view.

**`app/api/r/[room]/host/route.ts`**
- `COMMAND_CAP`: `postLaunch: "inject"`, `connStatus: "advance"`. (`archive` stays `"end"`.)
- **`postLaunch` case:** wrap in `withLock(room, "postLaunch", fn, { ttlSeconds: 12 })`; load the launch connection from the durable room; build `joinUrl`/`qrUrl` from the **configured base origin** (fail calmly if unset); `postLaunchCard(..., mode)`; `appendAudit`; return `{ ok, posted, count, reason }`. **No state mutation, no `navState`.**
- **`connStatus` case:** return `{ hasLaunch, hasDelivery, launchLabel? }` — no secrets.
- **`archive` case — reordered (must-fix):**
  ```
  const archive = await archiveRoom(room);   // opus synthesis already spent here
  await endSession(room);                     // WIPE FIRST — guaranteed, awaited
  let delivered = false, deliveryError;
  if (body.deliverRecap && archive?.report) {
    const conn = getDeliveryConnection(roomRec);
    if (conn) {
      try { await deliverReport(roomRec, conn, archive.report); delivered = true; }
      catch (e) { deliveryError = String(e); }
      await appendAudit(room, { at: Date.now(), provider: conn.provider, event: "recap", ok: delivered });
    }
  }
  return NextResponse.json({ ok: true, archive, delivered, deliveryError });
  ```
  Keep `maxDuration = 60`. The wipe can never be skipped or hung by a slow/blocked webhook.

**`app/admin/page.tsx`**
- Extend RoomCard `panel` union: `"theme" | "report" | "connections" | null`.
- Add a `connect` link to the RoomCard link row; render `<ConnectionsPanel room={room.slug} code={code} />` when `panel === "connections"`.
- Report panel: add the "Delivered to Slack ✓ / not delivered" line from the audit tail.

**`components/HostConsole.tsx`**
- Fetch `connStatus` **once on mount** (and after a connection-change signal); cache client-side. **Do NOT** put connection presence in `FacilitatorState`/`computeView`/the 2s poll.
- Run tab: render the Invite affordance only when `connStatus.hasLaunch`; button disabled until response; inline result; `postLaunch` `mode:'update'` for the count.
- `SessionControls` archive Modal: recap checkbox (default-on iff `hasDelivery`), the **Preview recap** disclosure, the privacy reminder; thread `{ deliverRecap }` through `cmd("archive", { deliverRecap })`.

### Data model

On the durable, no-TTL `Room` (`lib/rooms.ts`):

```ts
export type Provider = "slack" | "teams" | "calendar" | "miro";

export interface RoomConnection {
  id: string;                       // randomBytes hex (node:crypto, already used here)
  provider: Provider;
  label?: string;                   // e.g. "#design-team"
  secret: string;                   // bearer credential (webhook URL / board token) — stored RAW, NEVER returned
  role: "launch" | "delivery" | "both";
  status: "untested" | "connected" | "errored";
  lastFiredAt?: number;
  lastError?: string;               // short, content-free
  createdAt: number;
}

// Room gains:
connections?: RoomConnection[];
```

Client-facing redacted view (from GET — built explicitly, never a spread):

```ts
export interface RoomConnectionPublic {
  id: string;
  provider: Provider;
  label?: string;
  role: "launch" | "delivery" | "both";
  configured: true;
  urlPreview: string;               // "hooks.slack.com/…/abc"
  status: "untested" | "connected" | "errored";
  lastFiredAt?: number;
  lastError?: string;
}
```

**Audit log — its own durable key (race/SSRF fix), NOT on `Room`:**

```ts
export interface AuditEntry { at: number; provider: string; event: "ping" | "launch" | "recap"; ok: boolean }
// stored at  rooms:audit:<slug>  as AuditEntry[], bounded to ~50 newest, content-free.
```
This avoids lost-update/clobber races between a `postLaunch` audit write and a concurrent admin `connections` PATCH (the durable backend has no atomic RMW, and the session `withLock` does not cover durable Room writes). Audit is best-effort; trimming on write is fine.

**Store keys:** `rooms:room:<slug>` (existing, now carries `connections`), `rooms:audit:<slug>` (new). Calendar ICS (fast-follow) holds only public slug-derived URLs, no secret.

**Handoff payload** is derived strictly from the existing `SessionReport` (`summary`/`themes`/`tensions`/`decisions`/`nextSteps`) on `RoomArchive.report`. `RoomArchive` is unchanged.

### SSRF guard (must-fix) — `validateOutboundUrl(url, provider)`

`postJson` calls this before every fire, and PATCH calls it before storing:
- Require `https:`.
- Reject loopback / private / link-local / metadata ranges: `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` (incl. `169.254.169.254`), `::1`, `fc00::/7`, `fe80::/10`, and literal `localhost`.
- **Allowlist provider hostnames:** Slack `hooks.slack.com`; Teams `*.webhook.office.com` (fast-follow); Miro `api.miro.com` (fast-follow). Reject any other host.
- Resolve-and-check is best-effort defence-in-depth; the hostname allowlist is the primary gate.

### Privacy guard — `reportToPayload(report: SessionReport)`

- Typed to accept **only** `SessionReport`. Runtime guard rejects any object carrying a `submissions` / `handle` / `votes` / `token` key. This is **necessary but not sufficient** — see Privacy check for the real fix (honest copy + pre-send preview).

### How it uses rev / authoritative-apply (no KV read-back)

- `postLaunch` and `connStatus` **mutate no session state**; they return plain command results applied inline by the Run-tab UI — there is nothing to read back.
- `archive` continues to return the authoritative archive object (plus new `delivered`/`deliveryError`); the host UI applies via `usePolledState.apply` as today, never via a read-back of the (now-wiped) session.
- Connection presence is fetched **once** via `connStatus` and cached client-side — it is intentionally kept off the 2s `/state` poll so the durable registry is never coupled to `computeView`.

### Capability gating (the `configure` gotcha, dodged on purpose)

- **Configuring** a connection = room config = **admin-only** (`checkSuperAdmin` on `/api/admin/rooms/[slug]`).
- **Firing** a launch card = **`inject`** (facilitator *and cohost* — see Risks; intentional, low-stakes content push).
- **Recap delivery** rides **`end`** (facilitator/admin only — cohost does **not** have `end`, so only a full facilitator can cross the privacy boundary). Correct.

---

## Implementation plan (ordered, checkable)

1. **Types + durable surface, no UI.** Add `Provider`/`RoomConnection`/`RoomConnectionPublic`/`AuditEntry` to `lib/rooms.ts`; add `connections?` to `Room`; widen `updateRoom` `Pick`; add `getConnection`. ✅ `npm run verify` green.
2. **`lib/integrations.ts`** with: `validateOutboundUrl`, `maskUrl`, `redactConnections`, Slack `PROVIDERS` entry, `postJson`, `pingConnection`, `postLaunchCard`, `deliverReport`, `buildLaunchCard`, `reportToPayload`, `appendAudit`/`readAudit` (separate key).
3. **`test/integrations.test.ts`** — write the privacy + SSRF + redaction + audit-bound + wipe-survives tests first; ✅ green.
4. **Base-origin env** — add `APP_ORIGIN` (or reuse `VERCEL_PROJECT_PRODUCTION_URL`) to `.env.example`; a `resolveOrigin()` helper. URL building uses this, never request `Host`.
5. **Admin route** — GET redacted `connections` + audit tail; PATCH connection ops + `connTest` (validate-on-store). Add test asserting GET JSON contains no raw secret substring.
6. **`ConnectionsPanel.tsx`** — Slack add/test/remove, status dots, privacy line, masked field.
7. **Admin page** — `'connections'` panel value + `connect` link + render panel + Report-panel delivery line.
8. **Host route** — `postLaunch` (`withLock` ttl 12, audit), `connStatus`, reordered `archive` with wipe-first + try/catch delivery.
9. **HostConsole** — mount-time `connStatus` fetch; Run-tab Invite affordance (disable-until-response); archive-dialog recap toggle + **Preview recap** + thread `deliverRecap`.
10. **Manual QA** against a real Slack incoming-webhook (launch card renders, recap posts, raw submissions absent). ✅ `npm run verify` + `next build` green.

---

## Acceptance criteria (facilitator-outcome framed)

1. **Set up once:** an admin pastes a Slack webhook into a room's Connections panel; "Test" turns the dot green; the plaintext URL is never visible again (only `hooks.slack.com/…/abc`).
2. **Launch without leaving the console:** from the Run tab, the facilitator taps "Post join card" and a branded card (name, logo, join link, QR link, live count) appears in the Slack channel; a second tap updates the count. A double-tap never posts twice.
3. **Handoff at archive:** hitting Archive with the toggle on posts the recap to the channel; the facilitator could see the exact recap text in the preview before sending.
4. **The wipe always wins:** if Slack is down/slow/blocked at archive time, the session still ends and data still wipes on schedule; the facilitator sees a calm "couldn't reach Slack" line, never an error, never a hang.
5. **No leak:** the channel recap contains the AI synthesis only — no raw submission list, no handles, no votes.
6. **Calm by default:** a room with no connection shows zero new UI in the host console, participant phone, or projector.
7. **Capability correctness:** a cohost cannot trigger recap delivery (no `end` cap); configuring a connection requires admin.
8. **No SSRF:** a connection URL pointing at `localhost` / `169.254.169.254` / `http://` is rejected at save and at fire time.

---

## Test plan

### Vitest (`test/integrations.test.ts` — in-memory store, no KV/AI)

1. **`redactConnections` never leaks** — output for a stored connection has `urlPreview`/`configured` and **no** `secret` and no full URL substring.
2. **Admin GET redaction** — `JSON.stringify(response)` contains neither the raw webhook URL nor the word `secret` as a value.
3. **Privacy payload** — for the Slack provider, feed a `SessionReport` **plus a poisoned `RoomArchive`** (submissions/handles/votes present); assert `JSON.stringify(reportToPayload(report))` excludes every submission string, handle, and vote value, and that `reportToPayload` **throws** if handed an object carrying a `submissions`/`handle`/`votes` key.
4. **SSRF** — `validateOutboundUrl` rejects `http://hooks.slack.com/...`, `https://localhost/...`, `https://169.254.169.254/...`, `https://10.0.0.1/...`, and a non-allowlisted host; accepts `https://hooks.slack.com/services/...`.
5. **`maskUrl`** — `https://hooks.slack.com/services/T000/B000/abcd` → `hooks.slack.com/…/abcd`.
6. **Audit content-free + bounded** — entries have only `at`/`provider`/`event`/`ok`; writing 60 entries keeps ≤50 newest; audit lives at `rooms:audit:<slug>`, not on `Room`.
7. **`deliverReport` never throws** on a failing/blocked webhook (mock `fetch` to reject/timeout); returns/raises in a way the route's try/catch absorbs.
8. **Wipe survives delivery failure (route-level)** — simulate `archive` with `deliverRecap:true` and a throwing `deliverReport`; assert `endSession` ran (session keys gone) and the response carries `delivered:false` + `deliveryError`.
9. **`withLock` dedup** — two concurrent `postLaunch` calls → exactly one POST (`busy:true` for the second).

### Manual QA

- **Slack (real incoming-webhook in a scratch channel):** Test ping arrives; launch card renders with logo + join link + QR link + count; "Update count" reflects new joiners; archive posts the recap; **eyeball the recap — confirm no raw submission list / handles / votes**.
- **Mobile (participant):** tapping the Slack join link opens `/r/[room]` join page unchanged; no integration UI bleeds in.
- **Projector:** lobby QR + `/qr` door unchanged; high-fidelity QR remains the projector's job (chat only links to it).
- **Failure posture:** point the webhook at a 500-returning URL, archive — session still wipes, calm "couldn't reach Slack" line shown.
- **No-connection room:** host console / phone / projector show zero new UI.

---

## Privacy & ethos check (explicit)

**PASS, with one reframing already applied.**

- **Durable, not session:** connections live on the no-TTL `Room` (and audit under its own durable key) — never the 24h session store, never the eventually-consistent `/state` path.
- **Secrets redacted:** webhook URLs are bearer credentials; stored raw, returned only as masked preview + `configured`, mirroring `passcodeHashes`. GET builds the public view explicitly (no spread).
- **Conscious boundary crossing:** the recap leaves the room ONLY on an admin-configured delivery connection AND a facilitator's conscious archive-dialog tap (default-on only when a delivery connection exists), gated on the `end` cap.
- **Honest privacy copy (must-fix folded in):** the delivered artefact is the **AI synthesis**, which is *derived from* contributions and could paraphrase or name participants. The UI no longer claims "never raw submissions" as if the recap were submission-free; it says **"the AI recap, derived from contributions"** and **adds a pre-send preview** of the exact text so the facilitator sees precisely what crosses the line and can choose not to send. The structural key-name guard remains as defence-in-depth but is explicitly **not** treated as sufficient.
- **Server-enforced:** `reportToPayload` derives outbound payloads only from `SessionReport`; the privacy Vitest asserts no submission/handle/vote text in any outbound payload.
- **Content-free audit:** timestamp + provider + event + ok only — never the payload (mirrors `lib/ai.ts` label-only observability), so a facilitator can prove *that* a recap was sent without logging *what*.
- **Account-less upheld:** opaque paste-a-URL secrets; admin-delete is the only revocation (no rotation affordance in v1).

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| # | Risk | Resolution (folded into the spec) |
|---|---|---|
| 1 | **Wipe hung/skipped by slow webhook + opus + `maxDuration=60`.** | `archive` reordered: `archiveRoom()` → **`await endSession()` (wipe guaranteed)** → **then** `deliverReport` in try/catch with its own ≤10s timeout. Delivery can never block or skip the wipe. Test #8 asserts this. |
| 2 | **SSRF via arbitrary outbound POST URL (metadata/KV/localhost).** | `validateOutboundUrl`: https-only, block loopback/private/link-local/metadata, allowlist `hooks.slack.com` (+ Teams/Miro hosts later). Enforced in `postJson` **and** at PATCH store time. Test #4. |
| 3 | **Privacy overpromise — AI recap can quote/name participants.** | Reworded UI copy + **pre-send facilitator preview** of the exact recap; structural guard kept but explicitly not sufficient. (Optional fast-follow: tighten `generateSessionReport` prompt to forbid naming handles / verbatim quotes.) |
| 4 | **Connection presence coupling the 2s poll to the durable registry.** | `connStatus` fetched **once on host-console mount** + after connection changes; cached client-side. **Never** in `FacilitatorState`/`computeView`. |
| 5 | **No canonical origin server-side (`req.nextUrl.origin` spoofable/internal).** | Explicit `APP_ORIGIN` env (or `VERCEL_PROJECT_PRODUCTION_URL`); URL building uses it, never request headers; `postLaunch` fails calmly if unset. |
| 6 | **`withLock` 5s default TTL < 10s POST → double-post.** | `postLaunch` uses `withLock(..., { ttlSeconds: 12 })` **plus** client-side disable-until-response. |
| 7 | **Audit RMW clobbering connection config (no atomic durable RMW).** | Audit stored under its **own** key `rooms:audit:<slug>`, written independently of the `Room` object; best-effort bounded trim. Connection writes never race audit writes. |
| 8 | **`updateRoom` `Pick<>` + GET redaction easy to forget.** | Widen `Pick` to include `connections`; GET builds `RoomConnectionPublic` explicitly (no spread). Test #2 asserts no raw secret in GET. |
| 9 | **Cohost can fire launch cards (`inject`).** | **Intended** — launch is a low-stakes content push. Documented. Recap delivery rides `end`, which cohost lacks — so cohost can never cross the privacy boundary. |
| 10 | **Scope risk — four integrations in 7 days.** | **MVP cut to Slack-only outbound end-to-end** (3.5d). Teams/Calendar/Miro/resend deferred until the Slack path is validated against a real channel. The "one adapter table, four formatters" architecture stays — only the Slack formatter is built in v1. |
| 11 | **Calendar ICS slug enumeration** (fast-follow only). | When built: per-room random **feed token** in the ICS path; the feed exposes nothing beyond the already-public join page. |

---

## Out of scope / future

- **Zoom/Meet meeting creation** — requires OAuth + accounts; collides with the account-less ethos. Future, not G4.
- **Inbound calendar** (read a calendar to pre-create rooms) — needs Google OAuth; collides with the ethos. G4 is **outbound-only**.
- **Teams / Calendar (ICS) / Miro** — designed here, deferred to fast-follows after Slack validation; each is one formatter or one read-only route on the same SSRF-guarded `postJson` / public-feed pattern.
- **Miro REST board-token posting** — opt-in advanced after the zero-token sticky-import default.
- **Admin "Send recap again"** — re-fire from stored `RoomArchive.report`; fast-follow.
- **Connection secret rotation/expiry** — admin-delete is the only lifecycle in v1.
- **Curated pattern names in the handoff** — patterns are facilitator-authored and arguably safe/high-value, but edge toward content; needs an explicit product call before inclusion.
- **Auto-post-on-room-open** launch setting (vs. the manual Run-tab tap) — plausible v2; v1 stays manual to keep timing in the facilitator's hands and within the request-driven model.
