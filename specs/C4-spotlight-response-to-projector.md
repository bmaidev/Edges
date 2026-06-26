# C4 — Spotlight a participant response to the projector

> Status: ready to build. This spec folds in every must-fix from the pressure-test (notably: **text-only on the projector, no attribution in v1**; auto-clear on **all** launch/advance writes; SSE signature token; FacilitatorState-only raw ref for the host compare). A developer or coding agent can implement this with no further design.

## Priority / effort / dependencies
- **Priority:** P1 (Section C — Running live)
- **Effort:** ~2.5 days (the text-only attribution decision removes the thorniest sub-task — anonymity-signal resolution — so this estimate holds)
- **Depends on (existing systems, reuse — do not reinvent):**
  - `lib/store.ts` `writeState`/`rev` machinery (monotonic rev for authoritative apply)
  - `navState()` + `getFacilitatorState(room, stateOverride)` authoritative write-then-show path in `app/api/r/[room]/host/route.ts`
  - `usePolledState.apply` (HostConsole already wires `d.state → apply` for nav commands, `components/HostConsole.tsx:103`)
  - `lib/auth.ts` CAPABILITIES — the `advance` capability (held by facilitator + cohost)
  - `render-kit.tsx` `Reveal` / `animate-riseIn` (tailwind `riseIn` keyframe) for the bloom
  - `ProjectorApp` top-bar + `Countdown` + `ErrorBoundary` layout (`components/ProjectorApp.tsx`)
  - `SubmissionsPanel` + `SessionHeader` existing `cmd()` plumbing (`components/HostConsole.tsx:785`, `:451`)
  - readaround submissions `computeView` as the anonymity / no-handle precedent to mirror (`lib/modules/registry.server.ts:330-343` — emits `{ text, tag }`, never a handle)
- **No new dependencies, no new KV key, no migration, no AI, no new passcode tier.**

## Problem & facilitator value (in the facilitator's voice)
> A participant just wrote the line — the sharp reframe, the vulnerable admission, the sentence that names what we've been circling for ten minutes. I can see it in my Run tab. But there is no calm way to make *the room* see it. My only "one thing on the big screen" tool is read-around, and that's a whole configured phase I have to be *in*, that pages sequentially through a set and hijacks whatever I'm running. So I read the line aloud — badly, in my words, losing the weight — or I fumble a screen-share. I want to **tap that submission and have it bloom, full-screen, on the projector, from wherever I am**, without leaving the poll or brainwrite that's still running. And I want to clear it just as fast.

This is the move that turns a chat-log of submissions into a **moment**. It lets me:
1. **Honor a contribution publicly** — the participant's own words, full-screen, with weight, not my paraphrase.
2. **Anchor a discussion** — drop one provocation on the screen and let the room talk *to* it while the phase keeps running underneath.
3. **Punctuate** — a calm full-bleed quote is a natural breath between activities.

It is **module-independent and phase-independent**: a cross-cutting projector overlay I can summon from anywhere (mid-poll, mid-brainwrite), exactly the always-available primitive Edges is built around. One tap to bloom, one tap to clear. No new screen for participants — their phones are untouched. No AI. No new passcode.

## MVP cut (thinnest shippable) vs Full vision

### MVP (this PR)
- **Source = Run-tab submissions only.** A "Spotlight on screen" affordance on each submission card.
- **Projector renders the quote text only — NO attribution** (no name, no "shared anonymously"), mirroring readaround's submission item. (See Privacy.)
- Overlay on `/screen`: dimmed + blurred live module behind, quote risen in (display type), one length down-scale step + clamp, soft bottom fade past a `~280`-char cap.
- Clear: from the card, from a global header chip, or by spotlighting a different submission (replace, never stack).
- Auto-clear on every phase advance / session (re)launch / end.
- `setSpotlight` is built to accept **either** a `submission` ref **or** a `literal {text, handle}` ref now (so read-around/result modules can reuse it later), but **only the submission affordance is wired in the UI**. The literal path stays present-but-unused in v1.

### Full vision (future, not this PR)
- Wire the same `spotlight` command to read-around items and result/quote modules (synthesis lines, top poll/qna answers) via the `literal` ref.
- **Opt-in attribution**: an explicit per-spotlight "show name" toggle the facilitator chooses at spotlight time (literal kind, handle passed deliberately) — never inferred from a submission's stored handle.
- Optional projector polish (multiple length tiers, richer transitions).

## Experience & flows

### Projector (`/screen`, `components/ProjectorApp.tsx`)
- **No spotlight:** unchanged — active module's projector renderer, or the join-QR title card.
- **Spotlight active:** the live module stays mounted and *live* behind a **dimmed + blurred scrim** (it keeps updating — a poll's bars still move, dimmed — preserving the room's sense of place; no hard cut). Above it: the quote in large display type, centered, generously kerned, risen in via `Reveal`/`animate-riseIn`. Font size **clamps by length**: full size up to ~30 words; one down-scale step for longer; past `~280` chars, height is capped with a **soft bottom fade** (never overflow off-screen, never shrink to unreadable). **No attribution line in v1.** The **top bar (phase/topic label + Countdown) stays mounted above the overlay** so the room's frame is intact. The overlay sits **outside** the `ErrorBoundary` so a module render error can't take down the spotlight and vice-versa.
- **Spotlight of a now-deleted submission:** resolves to `null`, overlay simply absent — no error state, no ghost quote.
- **Clearing:** overlay unmounts / fades; the live module resolves to full opacity.

### Host console — Run tab → `SubmissionsPanel` (`components/HostConsole.tsx:785`)
Each submission card gains a ghost action beside the existing `InlineEdit` / `delete`:
- Default copy: **`Spotlight on screen`**
- When this card is the one on screen: **`On screen — tap to clear`** + a subtle **accent ring** on the card, so the facilitator always knows what the room is seeing without looking at the projector.
- Tap default → `cmd("spotlight", { kind: "submission", id: s.id })`. Tap the active one → `cmd("spotlight", { id: null })`.

### Host console — `SessionHeader` (`components/HostConsole.tsx:451`), present on **every tab**
- Whenever a spotlight is live, a dismissible low-key chip: **`Spotlight: "…first ~40 chars…" — Clear`**. Tapping `Clear` → `cmd("spotlight", { id: null })`. This makes spotlight dismissible from anywhere, even after the facilitator changes tabs.

### Participant phone (`/r/[room]`)
- **UNCHANGED.** Spotlight is projector-only by design. Phones keep running the live phase, preserving the calm no-surprise contract on personal devices.

### Co-host
- Spotlight + clear allowed (gated on `advance` — same cap as `setPhase`/`moduleAction`). A normal running-the-room action, **not** admin `configure`.

### Key flows (write-then-show, authoritative apply)
1. **Set from Run tab:** facilitator (in any phase) taps `Spotlight on screen`. `cmd("spotlight", {kind:"submission", id})` POSTs to the host route → route calls `setSpotlight` (single read-modify-`writeState`, fresh monotonic rev) → returns `navState(writtenState)` (the authoritative `FacilitatorState` built from the just-written state, **no read-back**) → HostConsole applies via `usePolledState.apply`. Projector blooms on its next SSE tick (~<2s; see SSE fix) or poll.
2. **Clear:** tap the active card, the header chip, or spotlight a different submission (replaces — one field, so replace-not-stack falls out for free). Same command with `{id:null}` or a new id.
3. **Auto-clear on phase change / relaunch / end:** advancing the phase (`setPhase`), launching a mode/template/custom build (`setMode`/`setPhases`), or ending the session clears spotlight in the same write — a stale quote can never bleed over a new activity or survive a wipe.
4. **Resolution at render time:** `getPublicState` resolves `state.spotlight` (a ref) against the already-loaded submissions list into a small `{ text }` payload, honoring the deleted-id → `null` rule.

## Architecture

### Data model

**`lib/types.ts`** — add:
```ts
// A spotlight target: either a live submission (resolved to text at view time,
// so the no-logging contract holds) or an already-public literal quote (built
// for read-around / result modules to reuse later; unused in the v1 UI).
export type SpotlightRef =
  | { kind: "submission"; id: string }
  | { kind: "literal"; text: string; handle?: string | null };
```
- `SessionState`: add `spotlight?: SpotlightRef | null;` (a sibling of the cross-cutting room-level fields `timerEndsAt` / `readaroundIndex` / `ended`). Optional → legacy/existing state reads default to `null`. No migration.
- `PublicState`: add `spotlight: { text: string; handle: string | null } | null;` — a **top-level** resolved, render-ready field (NOT inside `ModuleView.data` → module-independence guard). In v1 `handle` is **always `null`** for submissions.
- `FacilitatorState extends PublicState`: **additionally** carry the raw `spotlightRef: SpotlightRef | null;` so the host UI can do an **exact per-card id compare** for the "On screen" ring. The raw ref (incl. id) is exposed to the **facilitator only**, never to participants/projector.

### Store changes — `lib/store.ts`

1. **`DEFAULT_STATE`** (`:179`): add `spotlight: null`. (This is what makes `endSession`'s `{ ...DEFAULT_STATE, ended: true }` write clear spotlight for free.)

2. **Shared reset object** — to prevent the next cross-cutting field being forgotten the same way spotlight nearly was, factor the launch/advance reset fields into one helper and spread it:
```ts
// Cross-cutting room-level fields that must reset on every phase advance and on
// every (re)launch — so a stale timer/index/spotlight can't bleed onto a fresh
// phase or session. Spread into setPhase/setMode/setPhases writes.
const RESET_ON_PHASE = { timerEndsAt: null, readaroundIndex: 0, spotlight: null } as const;
```
  Spread `...RESET_ON_PHASE` into the `writeState` payloads of **`setMode` (`:242`)**, **`setPhases` (`:264`)**, and **`setPhase` (`:286`)**, replacing the inline `timerEndsAt: null, readaroundIndex: 0`. (`setTemplate` routes through `setPhases`, so it is covered. `endSession` is covered via `DEFAULT_STATE`.)

3. **`setSpotlight`** — new exported fn, mirrors `setTimer` (`:297`), read-modify-`writeState` for a fresh rev:
```ts
export async function setSpotlight(
  ref: SpotlightRef | null,
  roomId: string = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  return writeState({ ...state, spotlight: ref ?? null }, roomId);
}
```

4. **`getPublicState`** (`:734`) — resolve `state.spotlight` into `PublicState.spotlight`. `buildContext` **already loads `listSubmissions`** (`:701-708`), so this is **free — no extra KV read**. The only change needed: surface that already-fetched `submissions` array out of `buildContext` (add it to the returned object at `:731`) so `getPublicState` can resolve against it. Resolution:
```ts
// Resolve the spotlight ref to render-ready text. submission → look up live text
// (deleted/edited-away id → null, overlay simply absent, no error). literal →
// pass through. v1 emits NO handle on the projector — mirroring readaround's
// submission item, which never surfaces a name. (Anonymity: see Privacy.)
let spotlight: PublicState["spotlight"] = null;
const ref = state.spotlight ?? null;
if (ref?.kind === "submission") {
  const hit = submissions.find((s) => s.id === ref.id);
  if (hit) spotlight = { text: hit.text, handle: null };
} else if (ref?.kind === "literal") {
  spotlight = { text: ref.text, handle: null }; // v1: still no projector handle
}
```
  Add `spotlight` to the returned `PublicState` object (`:794-817`). In `getFacilitatorState` (`:863`), also attach `spotlightRef: written?.spotlight ?? state.spotlight ?? null` so the host gets the raw ref for the compare. (Use `pub` from the override-aware `getPublicState`; the simplest reliable source is the resolved state used inside — pass the ref through from the same state object.)

5. **`roomSignature`** (`:822`) — append a stable spotlight token so a spotlight-only set/clear/replace triggers an SSE tick (currently it does **not**, so the projector would wait up to 2s for the poll). `listSubmissions` is already fetched here. Keep it a **primitive join value** (no Set-spread / `.entries()` — `downlevelIteration` is off):
```ts
// Spotlight token: submission id, or a short stable marker for a literal, or "".
const sp = state.spotlight;
const spotToken = !sp
  ? ""
  : sp.kind === "submission"
    ? `s:${sp.id}`
    : `l:${sp.text.length}:${sp.text.slice(0, 24)}`;
```
  Add `spotToken` to the joined `[...]` array at `:834-845`.

### API + host command — `app/api/r/[room]/host/route.ts`

- Import `setSpotlight`.
- **`COMMAND_CAP`** (`:54`): add `spotlight: "advance"` (consistent with `setPhase`/`setTimer`/`moduleAction`/`readaroundNext`; **not** `configure` — deliberately avoids the documented setPhases pain).
- New `case "spotlight":` — parse the body into a `SpotlightRef | null` and return the authoritative state:
```ts
case "spotlight": {
  // id present (string) → submission ref; text present → literal; else clear.
  // Validate/ignore malformed payloads → clear (null). Never trust raw text len
  // beyond the projector's own clamp; store as-is (already-public literal).
  let ref: SpotlightRef | null = null;
  if (typeof a.id === "string" && a.id) ref = { kind: "submission", id: a.id };
  else if (typeof a.text === "string" && a.text)
    ref = { kind: "literal", text: a.text, handle: typeof a.handle === "string" ? a.handle : null };
  // a.id === null / absent / "" → null (clear)
  return {
    ok: true,
    state: await navState(room, await setSpotlight(ref, room), role ?? "facilitator"),
  };
}
```

#### API surface summary
- `POST /api/r/[room]/host` new command: `{ command: "spotlight", code, kind?, id?: string|null, text?, handle? }`. Capability `advance`. Returns `{ ok: true, state: <authoritative FacilitatorState via navState(writtenState)> }`. `id: null` / absent clears; a different id replaces (never stacks — one field).
- `GET /api/r/[room]/state` and the `/host` navState response — every role's payload now carries the resolved top-level `spotlight: { text, handle: null } | null`; facilitator additionally gets `spotlightRef`. Additive + backward-compatible (`null` when no spotlight or unresolved id; older clients ignore it).
- SSE `/api/r/[room]/stream` — `roomSignature` now incorporates `spotToken`, so set/clear/replace ticks near-instantly.

### Projector — `components/ProjectorApp.tsx`
After the existing module/`ErrorBoundary` block, conditionally render a local `SpotlightOverlay` when `state.spotlight` is set:
- Absolutely-positioned over the content area, **below the top bar** (keep topic + `Countdown` mounted above), **outside** the `ErrorBoundary`.
- Backdrop: `backdrop-blur` + a dark scrim (e.g. `bg-black/55`) over the still-live module; fade in via the page's existing fade idiom / `Reveal`.
- Quote: `Reveal` wrapping centered display type (`font-display`). Length-clamped size — e.g. `text-6xl` for ≤ ~120 chars, step down to `text-4xl` past that; `max-h` + `overflow-hidden` + a soft bottom fade (`mask`/gradient) past the `~280`-char readable cap.
- **No attribution element in v1.**
- Clearing = overlay not rendered (fades out), module returns to full opacity.

### Host console — `components/HostConsole.tsx`
- **`SubmissionsPanel` (`:785`):** add the ghost button beside `InlineEdit`/`delete`. Active when `state.spotlightRef?.kind === "submission" && state.spotlightRef.id === s.id` → render `On screen — tap to clear` + accent ring (`ring-1 ring-accent`) on the card wrapper. Default → `cmd("spotlight", { kind: "submission", id: s.id })`; active → `cmd("spotlight", { id: null })`.
- **`SessionHeader` (`:451`):** when `state.spotlight` is present, render the dismissible chip `Spotlight: "{state.spotlight.text.slice(0,40)}…" — Clear` (truncate, low-key border) calling `cmd("spotlight", { id: null })`.
- Both reuse the existing `cmd()` / `apply()` plumbing with zero new data fetching.

### How it uses the rev / authoritative-apply pattern (no KV read-back)
`setSpotlight` does a read-modify-`writeState`, so the written state carries a **fresh, strictly-increasing rev**. The host route returns `navState(writtenState)` = `getFacilitatorState(room, writtenState)` — built from the **just-written** state, never a read-back — and HostConsole applies it via `usePolledState.apply` (`:103`). The rev guard in `usePolledState` rejects any later stale KV read with a lower rev, so an eventually-consistent read right after the write can never drop or revert the spotlight. This is the exact established nav-command pattern (`setPhase`/`setTimer`/`readaroundNext`).

## Implementation plan (ordered, checkable)
1. [ ] `lib/types.ts`: add `SpotlightRef`; add `spotlight?: SpotlightRef | null` to `SessionState`; add `spotlight: {text;handle:string|null}|null` to `PublicState`; add `spotlightRef: SpotlightRef | null` to `FacilitatorState`.
2. [ ] `lib/store.ts`: `DEFAULT_STATE.spotlight = null`; add `RESET_ON_PHASE` and spread it into `setMode`/`setPhases`/`setPhase`; add `setSpotlight`.
3. [ ] `lib/store.ts`: surface `submissions` out of `buildContext`; resolve `spotlight` in `getPublicState` (submission → live text or `null`; literal → text; `handle` always `null`); add `spotlight` to the returned PublicState; add `spotlightRef` in `getFacilitatorState`.
4. [ ] `lib/store.ts`: add `spotToken` to `roomSignature` (primitive join; no Set-spread/`.entries()`).
5. [ ] `app/api/r/[room]/host/route.ts`: import `setSpotlight`; `COMMAND_CAP.spotlight = "advance"`; add `case "spotlight"` returning `navState(written)`.
6. [ ] `components/ProjectorApp.tsx`: add `SpotlightOverlay` (dimmed+blurred scrim, `Reveal` bloom, length clamp + soft fade, no attribution), outside `ErrorBoundary`, below top bar.
7. [ ] `components/HostConsole.tsx`: `SubmissionsPanel` ghost button + active ring via `spotlightRef` id compare; `SessionHeader` dismissible chip.
8. [ ] Tests (Vitest, in-memory store) — see Test plan.
9. [ ] `npm run verify` (typecheck + lint + test) + build on Node 24. Watch for `downlevelIteration` pitfalls (index loops / `Array.from()`, no Set-spread / `.entries()`).

## Acceptance criteria (facilitator-outcome framed, testable)
1. From **any** phase's Run tab, tapping `Spotlight on screen` on a submission blooms that exact text full-screen on `/screen` within ~2s (SSE), over a dimmed/blurred live module, **without changing the phase** and **without touching any participant phone**.
2. The spotlit card shows `On screen — tap to clear` + an accent ring; tapping it clears the projector (overlay fades, module returns to full opacity).
3. A `Spotlight: "…" — Clear` chip is visible on **every** host tab while a spotlight is live, and clears it.
4. Spotlighting a **different** submission replaces the current one (cross-fade, never two overlays).
5. **Advancing the phase, launching a mode/template/custom build, or ending the session** clears the spotlight — no stale quote ever lingers over a new activity or survives a wipe.
6. Deleting the spotlit submission makes the overlay vanish with **no error** and no ghost quote.
7. The projector shows **only the quote text — never a name** in v1, regardless of whether the submission carried a handle or came from an anonymous-by-design phase.
8. A **co-host** can spotlight and clear; a **participant** code is `403`.
9. Long submissions down-scale and cap with a soft fade — never overflow off-screen, never shrink to unreadable.

## Test plan

### Vitest (in-memory store; no KV/AI)
- `setSpotlight` writes the ref and bumps `rev` (`> prev.rev`); `setSpotlight(null)` clears.
- `setPhase` clears a previously-set spotlight (via `RESET_ON_PHASE`).
- `setMode` and `setPhases` clear a previously-set spotlight.
- `endSession` clears spotlight (via `DEFAULT_STATE`).
- `getPublicState` resolves a live submission ref → `{ text, handle: null }`.
- `getPublicState` returns `spotlight: null` for a ref whose submission was deleted.
- `getPublicState` emits `handle: null` **even when the underlying submission has a real handle** and even when `handle === "Anonymous"` (assert no name ever leaks).
- `getFacilitatorState` carries `spotlightRef` (raw, incl. id); a non-facilitator `getPublicState` payload does **not** carry `spotlightRef`.
- `roomSignature` changes when spotlight is set, replaced with a different id, and cleared.
- Host route: `spotlight` command with a cohost code → `ok` + returned `state` is a `FacilitatorState` with the resolved `spotlight`; with a participant code → `403`.
- Host route: malformed `spotlight` payload (no id, no text) → stores `null` (clear), no throw.

### Manual QA
- **Projector + host, live room:** set a spotlight from Run tab **mid-poll** → projector blooms `<2s` (SSE) over the dimmed, still-updating poll bars; phones unchanged.
- Clear via card, via header chip, and by spotlighting a different submission (replace).
- Delete the spotlit submission → overlay vanishes, no error.
- Advance phase, relaunch a template, and End session → spotlight auto-clears each time.
- Cohost can spotlight; participant URL/code cannot (403).
- **Mobile (host on phone):** the ghost button + ring + header chip are tappable and legible at `max-w-2xl`; chip truncates cleanly.
- **Long text:** spotlight a ~280+ char paragraph → down-scales, caps height with soft bottom fade, never overflows the screen.

## Privacy & ethos check (explicit)
- **No violation.** Spotlight is **projector-only**; participant phones are untouched (no new participant render) — preserving the calm no-surprise contract.
- The write persists only a **submission id** (or an already-public literal) — submission text is resolved at view-compute time exactly like every other module, so **submissions are still never logged**.
- State lives in the existing room-scoped `SessionState` key under the existing **24h TTL** and **End-session wipe** — off-the-record + ephemeral contracts hold automatically; no new key, no new TTL/lock logic.
- **Anonymity — the resolved must-fix:** the projector shows **no attribution in v1** (`handle: null` always), exactly mirroring readaround's submission item (`registry.server.ts:342`, which emits `{ text, tag }` and never a handle). This is deliberate: there is **no room/phase anonymity flag** in this codebase — anonymity is per-module, and a `Submission` record's stored `handle` is **not** a reliable "is this public?" signal (modules like brainwrite/spectrogram/prework/equity-anonymize never emit handles even though the underlying submission carries one). Defaulting attribution **on** would leak a name an anonymous-by-design phase intended to hide. So: never infer a name from the stored handle. Any future attribution must be an **explicit per-spotlight facilitator opt-in** (literal kind, handle passed deliberately).
- **AI:** none involved. **Auth:** reuses `advance` — no new tier, no `configure`.

## Risks & mitigations (pressure-test must-fixes, resolved)
1. **Anonymity leak via default attribution (major).** → **Resolved:** v1 renders text-only, `handle: null` always (mirrors readaround). No name is ever derived from a submission's stored handle.
2. **Stale spotlight surviving a relaunch (major).** → **Resolved:** auto-clear is wired into `setMode`, `setPhases`, **and** `setPhase` via the shared `RESET_ON_PHASE` object (not just `setPhase`); `setTemplate` routes through `setPhases`; `endSession` via `DEFAULT_STATE`. The shared object also stops the next cross-cutting field from being forgotten.
3. **SSE blind spot (minor).** → **Resolved:** `roomSignature` includes a primitive `spotToken`, so set/clear/replace ticks near-instant instead of waiting for the 2s poll.
4. **Extra per-poll KV read for resolution (minor).** → **Resolved/moot:** `buildContext` (the path `getPublicState` already uses) **already loads `listSubmissions`** on every call, so resolving the spotlight adds **zero** extra reads; we only surface the already-fetched array. No hot-path cost even when no spotlight is set.
5. **Host can't reliably tell which card is on screen (minor).** → **Resolved:** `FacilitatorState.spotlightRef` carries the raw id for an exact per-card compare; participants/projector never receive it, so module-independence + privacy hold.
6. **Capability mapping (minor).** → **Confirmed:** `spotlight → "advance"`, consistent with `setPhase`/`setTimer`/`moduleAction`/`readaroundNext`; cohost allowed, participant 403.
7. **Eventual consistency revert.** → **Resolved by design:** authoritative `navState(written)` → `apply`, monotonic rev guard, no read-back.
8. **Scope creep.** → **Capped:** ship submission-spotlight only; `literal` path present-but-unwired; projector polish limited to one down-scale step + clamp/overflow + soft fade, reusing existing `Reveal`/`riseIn`, **no new keyframes**.

## Out of scope / future
- Wiring read-around items and result/quote modules (synthesis, lightning, qna answers) to the `literal` ref.
- Opt-in projector attribution (explicit per-spotlight facilitator choice).
- Any participant-phone signal that the room is looking at a spotlight (default: stay untouched).
- Multiple length tiers / richer transition choreography on the projector.
