# D2 — Accessibility pillar (text size, dyslexia/colour-blind-safe, screen reader)

> Section D — Participant experience. Priority **P0**. Build spec, ready to implement.
> This spec folds in every must-fix from the pressure-test; the design below is already corrected.

---

## Priority / effort / dependencies

- **Priority:** P0 (brand pillar; hard procurement gate for public-sector / education / DEI work).
- **Effort:** **6 days** for the MVP cut (see below); **9 days** for the full vision. The original 7-day estimate is reduced to a 6-day MVP by deferring the light high-contrast preset, the projector room-level toggle + projector SR landmarks, and OpenDyslexic (all moved to Full vision).
- **Dependencies (item ids):** none hard. This item is self-contained and additive. It *touches* surfaces other items also touch (admin theme editor `app/admin/page.tsx`, host console "What they see" tab `components/HostConsole.tsx`), so if those are being reworked concurrently, land the shared `lib/a11y/contrast.ts` first so both consumers share one audited function.
- **Internal build order (within this item):** `lib/a11y/contrast.ts` → `lib/a11y/prefs.ts` → `globals.css` vars/classes + Atkinson font → `A11yProvider` + `A11yTray` + `Aa` trigger → render-kit colour-safe + SR live regions → admin contrast strip → (Full vision) projector slice.

---

## Problem & facilitator value (facilitator's voice)

> "I run inclusion and public-sector sessions for mixed-ability groups. I cannot, in good conscience, put a tool in front of a room that might quietly exclude someone — and right now I have to take Edges' accessibility on faith. A low-vision participant on a phone has no way to make the text bigger without OS zoom, which breaks the layout. If I brand a room with my client's colours, nothing warns me I've just shipped grey-on-grey body text nobody can read. Someone with colour-blindness can't tell my poll bars apart because everything's the same accent colour. And a screen-reader user gets dropped into a brand-new task with no announcement when I advance a phase.
>
> What I need is simple: every participant can self-tune text size, font, and contrast on their own phone without asking me for help mid-session; I get a contrast guardrail in the theme editor so I can't accidentally brand my way into an inaccessible room; and I get a one-line 'Accessibility: AA' assurance and a statement I can forward to a procurement or DEI lead. Turn 'we hope it's accessible' into 'every participant can self-tune, and I can prove the room is AA-clean before anyone joins.'"

This is felt, not just claimed: a participant who bumps text size once and has it persist across every room they ever join experiences the calm-and-inclusive promise directly. It de-risks WCAG-AA procurement gates.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (6 days) — ship this first

1. **Participant device prefs** (`A11yProvider`, global `localStorage` key `edges_a11y`, try/catch + in-memory fallback).
2. **Accessibility tray** (`A11yTray`) with **four controls**: Text size (A / A+ / A++ / A+++), Readable font (Atkinson Hyperlegible, self-hosted), High-contrast & colour-safe (**one dark AA-clean preset only**), Reduce motion (manual switch).
3. **"Aa" trigger** inside `Screen`, **gated on `A11yProvider` presence** so it appears only on participant/projector trees — never on `/admin` or `/build` (which also import `Screen`).
4. **Root font-scale** via `--a11y-scale` on `<html>`, capped at 1.5×. Body classes for dyslexic / contrast / reduce-motion.
5. **Colour-safe data viz** in the shared `render-kit` `Bars` helper (pattern fill + always-visible labels + explicit up/down word for deltas) via a `useColourSafe()` hook reading context. Other viz helpers (gradient/spectrogram/distribution) opt in via the same hook where time permits; at minimum `Bars` ships.
6. **SR support:** single polite `aria-live` phase announcement in `ParticipantApp` (skips initial render, fires only on a real non-null `phaseId` change); `StatusLine` gains `role="status" aria-live="polite"`.
7. **Admin contrast strip** in the theme editor: live ratios + pass/fail chips via `lib/a11y/contrast.ts`; **non-blocking** warning on Save when any pairing fails AA.
8. **`/help` Accessibility doc** (`docs/accessibility.md`) — the public, forwardable statement; explicitly states device prefs never leave the device.
9. **`contrast.ts` Vitest test** green under `npm run verify`.

### Full vision (additional ~3 days) — defer

- **Light high-contrast preset** (`a11y-contrast-light`, black-on-white) as a second colour-safe option (a common low-vision preference).
- **Projector room-level a11y toggle** (`setProjectorA11y` host command + `SessionState.projectorA11y` + `ProjectorApp` consumption + HostConsole "What they see" card). The projector has no device to self-serve, so this is server state. *(Full architecture for this slice is specified below so it can be picked up cleanly.)*
- **Projector SR landmarks** (`<header>`/`<main>`/`h1`).
- **OpenDyslexic** as an optional second readable font.

---

## Experience & flows (screens, states, copy where it matters)

### The "Aa" trigger
A 44×44px button, top-right, present on join / phase / holding / ended screens (all use `Screen`). `aria-label="Accessibility options"`. Calm, low-contrast-with-purpose; never competes with content. Global focus ring already applies. Explicit `z-index` above `PhaseBar`/`StatusBar` (`z-10`) and below the open tray/Modal (`z-50`); offset for the notch/safe area so it never overlaps the `ReconnectBanner` (`z-20`).

### The Accessibility tray (`components/A11yTray.tsx`)
Bottom sheet on mobile / centred Modal on larger, reusing the `Modal` aesthetic. Four rows, each: label + one-line helper + big (≥44px) segmented/toggle buttons with `aria-pressed`. Sentence case, words not icons-only. Closes with **"Done"**. Nothing is submitted anywhere.

- **Text size** — segmented `A` / `A+` / `A++` / `A+++` → root multiplier `1 / 1.15 / 1.3 / 1.5`.
  Helper: *"Make everything bigger. This follows you into every room."*
- **Readable font** — on/off. Swaps body face to Atkinson Hyperlegible.
  Helper: *"A typeface that's easier for some people to read."*
- **High-contrast & colour-safe** — on/off (MVP: single dark preset).
  Helper: *"Stronger contrast, and charts that don't rely on colour alone."*
- **Reduce motion** — on/off (adds to the OS preference already honoured).
  Helper: *"Calm the gentle animations."*

Empty/default state = platform defaults (A, brand font, brand palette, OS motion) so the tray is honest about current state on first open.

### Key flows

1. **Self-tune text size:** tap `Aa` → tray → tap `A++` → `--a11y-scale` updates on `<html>` instantly → whole rem tree reflows → sticky footer stays anchored (it's `sticky`, not `fixed`) → "Done" → saved to `edges_a11y` → next room already reads at A++, no action.
2. **Colour-safe mode:** tray → toggle on → `<body>` gets `a11y-contrast` which (a) overrides the five `--c-*` palette vars with `!important` (beating the room's `:root` injection on that one device) **and neutralises the atmospheric mesh + grain** so the vetted palette is genuinely flat, and (b) flips `Bars` (and opted-in viz) to the colour-safe branch (pattern fill + direct labels + up/down words). Works even on a room branded with a low-contrast palette.
3. **Readable font:** toggle on → `<body>` gets `a11y-dyslexic` → `--font-sans` rebinds to the self-hosted Atkinson stack → all body/UI text swaps; the display serif (Fraunces) for big projector moments also falls back to the readable face when this is on.
4. **SR phase change:** host advances → `PhaseScreen`'s keyed `ErrorBoundary` remounts the renderer → a single polite `aria-live` region in `ParticipantApp` announces the new phase label ("Now: Spectrogram — place yourself"); `StatusLine` (`role="status"`) speaks "Saved." / "Couldn't send".
5. **Facilitator brand-contrast guard:** admin opens theme editor → picks accent → live Contrast check strip recomputes the deliberate pairing set client-side → failing pairs show "AA fail 3.1:1" chips → Save allowed but a calm non-blocking warning explains participants are protected by high-contrast mode.
6. **Facilitator assurance:** `/help` → new "Accessibility" doc lists commitments → forward to procurement; a quiet "Accessibility" line in the join-screen privacy block lets participants discover the tray.

---

## Architecture

Three presentation layers + one (deferred) server slice. **No a11y in `computeView` or any `*.server.ts`** — the type-only module boundary (`lib/modules/views.ts`) and all `ModuleServerDef` files stay untouched. computeView runs every 2s; a11y is presentation-only.

### Files to ADD

| Path | Purpose |
|---|---|
| `/Users/jordan/workshop/edges-v2/lib/a11y/contrast.ts` | **Build first.** Pure WCAG utils: `relativeLuminance(hex)`, `contrastRatio(hexA,hexB)`, `passesAA(ratio, large?)`, `paletteAudit(palette)` → the deliberate pairing set with ratios + pass/fail. No DOM, no React. Shared by admin strip, host AA card, Vitest. |
| `/Users/jordan/workshop/edges-v2/lib/a11y/prefs.ts` | `A11yPrefs` type, (de)serialise + safe read/write for `edges_a11y`, the scale-stop→multiplier map `[1, 1.15, 1.3, 1.5]`, and the vetted high-contrast palette(s) as `{bg,surface,accent,muted,border}` RGB-triple constants. Pure, importable by tests. |
| `/Users/jordan/workshop/edges-v2/lib/a11y/fonts.ts` | `next/font/local` declaration for self-hosted Atkinson Hyperlegible (woff2), exporting a CSS var `--font-readable` with `display: "swap"`. Imported by `app/layout.tsx`. |
| `/Users/jordan/workshop/edges-v2/components/A11yProvider.tsx` | Client context: reads/writes global `edges_a11y` (try/catch + in-memory fallback); applies `--a11y-scale` on `<html>` and body classes (`a11y-dyslexic` / `a11y-contrast` / `a11y-reduce-motion`); exposes `{ prefs, setPrefs, colourSafe }`. Consumed by `Screen` (Aa trigger), `A11yTray`, render-kit helpers. |
| `/Users/jordan/workshop/edges-v2/components/A11yTray.tsx` | The tray (four segmented rows, 44px buttons, `aria-pressed`, "Done"). Copy from `lib/strings.ts`. |
| `/Users/jordan/workshop/edges-v2/public/fonts/AtkinsonHyperlegible.woff2` | Self-hosted OFL font (offline, no Google Fonts call). |
| `/Users/jordan/workshop/edges-v2/public/fonts/AtkinsonHyperlegible-OFL.txt` | OFL license note alongside the font. |
| `/Users/jordan/workshop/edges-v2/docs/accessibility.md` | The public Accessibility statement (markdown). **Note:** `/help` DOCS import `.md` files from `@/docs/*.md` (confirmed in `app/help/page.tsx`), NOT a `lib/help/*.ts` string — this corrects the design's proposed `lib/help/accessibility.ts`. |
| `/Users/jordan/workshop/edges-v2/test/a11y-contrast.test.ts` | Vitest: known-pair ratios (default `muted`/`surface` ~7.2:1 passes; a 2:1 pair fails), AA thresholds for normal (4.5) vs large (3.0) text. |

### Files to CHANGE

| Path | Change |
|---|---|
| `app/globals.css` | Add `--a11y-scale: 1` default + `html { font-size: calc(100% * var(--a11y-scale, 1)); }`. Add `body.a11y-contrast` block: override all five `--c-*` vars with `!important`, **and** `background-image: none` (flat `rgb(var(--c-bg))`) **and** zero the `.grain` opacity within contrast mode, so the vetted palette is genuinely flat and the AA claim holds in practice. Add `.a11y-dyslexic { --font-sans: var(--font-readable), ...; }` (rebind `--font-display` too). Add `.a11y-reduce-motion` reusing the **same** animation/transition kill the `prefers-reduced-motion` media query already applies (so OS-off + manual-on both work, no duplicated keyframes). Add `.a11y-pattern` utility (`repeating-linear-gradient` overlay) for colour-safe bars. |
| `app/layout.tsx` | Import the Atkinson var from `lib/a11y/fonts.ts`; add it to the `<html>` className alongside `--font-display`/`--font-sans`. **Keep `Viewport.maximumScale: 5` untouched** (never re-introduce `user-scalable=no`). |
| `components/ui.tsx` | Add the 44×44 `Aa` trigger inside `Screen`, top-right, opening `A11yTray`. Read `A11yProvider` via an **optional** context hook; if no provider, render nothing (so admin/builder `Screen`s no-op). Explicit `z-index`: trigger above `z-10`, tray/Modal `z-50`, never overlapping the `z-20` ReconnectBanner; safe-area offset. No change to Button/Modal aesthetics. |
| `components/ParticipantApp.tsx` | Wrap the returned tree in `<A11yProvider>`. Add one polite `aria-live` region rendering the current phase label, updated in a `useEffect` keyed **only** on `state.phaseId`, with a `prevPhaseId` ref so it **skips the initial render** and fires only on a real, **non-null** `phaseId` change. Label sourced from `state.sequence.find(s => s.id === phaseId)?.label` with a sensible fallback. No change to `usePolledState`/rev/apply logic. |
| `lib/modules/render-kit.tsx` | `StatusLine`: add `role="status" aria-live="polite"` to the sending/sent/error nodes. `Bars`: read `colourSafe` via a new exported `useColourSafe()` hook; when on, add `.a11y-pattern` to each bar fill, always render the `n · %` label inline (not implied by colour alone), keep `aria-hidden` correct, and for any before/after delta render an explicit "up"/"down" word. Export `useColourSafe()` so gradient/spectrogram/distribution can opt in without touching their renderer files. |
| `app/admin/page.tsx` | Under the five `<input type=color>` pickers, render a Contrast check strip: for each pairing in `paletteAudit(palette)` show ratio + pass/fail chip, recomputed on every palette change. On `saveTheme`, if any pair fails AA, show a calm **non-blocking** warning; Save still proceeds. |
| `lib/strings.ts` | Add tray copy (section labels + helpers), "Done", the quiet join-screen "Accessibility" privacy-block line, and the admin contrast warning text — all sentence case. |

### Files to CHANGE — **Full vision only** (projector slice; defer from MVP)

| Path | Change |
|---|---|
| `lib/types.ts` | Add optional `projectorA11y?: { colourSafe: boolean; largeText: boolean }` to `SessionState` and project it into `PublicState`. Optional so existing rooms/in-memory fallback keep working. |
| `lib/store.ts` | Add `setProjectorA11y(flags, roomId)` following the `setTimer` pattern (`getState` → `writeState({ ...state, projectorA11y: flags })`, which bumps rev + TTL). **Project `state.projectorA11y` into the `getPublicState` return object** (alongside `rev`/`phaseId`) so `ProjectorApp` actually receives it. |
| `app/api/r/[room]/host/route.ts` | Add `COMMAND_CAP["setProjectorA11y"] = "advance"` and a `case "setProjectorA11y"` returning `navState(room, await setProjectorA11y(flags, room), role)`. **Advance**, not admin `configure` — it's a live run-time choice mirroring `setTimer`/`setPhase`, avoiding the known `configure` gotcha. |
| `components/HostConsole.tsx` | In the "What they see" tab, add an Accessibility card: room AA status (from `paletteAudit`) worded honestly + a projector colour-safe/large-text toggle calling `cmd("setProjectorA11y", { colourSafe, largeText })`. |
| `components/ProjectorApp.tsx` | Read `state.projectorA11y` from `PublicState`; apply the same body classes / `--a11y-scale` at the projector root, and drive `Bars` colour-safe via a controlled `A11yProvider` variant (no localStorage on the projector). Add `<header>`/`<main>`/`h1` landmarks. |

### Data model

**1) DEVICE prefs — never leave the device, never logged.** Global `localStorage` key `edges_a11y` (NOT per-room like `edges_token:`/`edges_handle:`), so prefs follow the person room-to-room:

```ts
type A11yPrefs = {
  scale: 0 | 1 | 2 | 3;          // -> font multiplier 1 / 1.15 / 1.3 / 1.5 (cap 1.5)
  dyslexic: boolean;
  contrast: "off" | "dark";       // MVP: dark only. Full vision adds "light".
  reduceMotion: boolean;
};
```
Default/empty = platform defaults. Access wrapped in try/catch (mirrors the chime/token pattern in `ParticipantApp`); private-mode/SR browsers degrade to in-memory session state, never throw.

**2) Vetted palettes** — constants in `lib/a11y/prefs.ts`, not stored: one dark high-contrast `{bg,surface,accent,muted,border}` RGB-triple set, applied as body-scoped CSS overrides. Presentation, not data.

**3) ROOM-level projector a11y (Full vision only)** — `SessionState.projectorA11y?: { colourSafe, largeText }`, default `undefined`/off. No new Redis keys — a field on the existing session-state object; `writeState` bumps rev + TTL; follows the same 24h TTL + End-session wipe. Two booleans, no personal data.

**View shapes:** `RendererProps` is **not widened** — colour-safe rides on `A11yContext` consumed by `render-kit` helpers, so the ~26 modules mostly don't change. `computeView` never branches on a11y.

### API + host commands + capability gating

- **MVP:** **no new endpoints.** Device prefs are localStorage-only, intentionally never sent to the server. No change to `/action` or `/join`.
- **Full vision:** new host command `POST /api/r/[room]/host { command: "setProjectorA11y", code, colourSafe, largeText }`. **Capability: `advance`** (facilitator/cohost), not admin `configure`. `PublicState` (all roles incl. projector) gains optional `projectorA11y` — additive; existing clients ignore it.

### rev / authoritative-apply — and the corrected projector caveat

- **Host's own console (Full vision):** `setProjectorA11y` returns `navState(room, written, role)` → `getFacilitatorState(room, written)`, applied via `usePolledState.apply`. **Authoritative-apply, no KV read-back** — the host sees its own toggle immediately.
- **Projector convergence — corrected:** the **projector does NOT get authoritative-apply.** `navState` returns FacilitatorState only to the host's own client. The projector at `/r/[room]/screen` polls `GET /state?role=projector` (`getPublicState(null, room, "projector")`), a read of eventually-consistent KV, plus the SSE tick. So after the host toggles, the projector reflects the change only once its own ~2s poll **reads back** the just-written state. This is acceptable here because the flag is **idempotent and non-destructive** (two booleans, ~2s convergence) — but it is NOT the read-back-free authoritative path, and is documented as such. (The original architecture mis-stated this; corrected here.) The fix requirement on `getPublicState` — actually projecting `state.projectorA11y` into its return — is what makes this convergence work at all.
- **SR phase announcement respects rev/anti-flash:** keyed off `state.phaseId` change only, with a prev-ref guard, so it never fires on the 2s poll and never fights the rev/anti-flash guard.

---

## Implementation plan (ordered, checkable steps)

1. [ ] **`lib/a11y/contrast.ts`** — `relativeLuminance`, `contrastRatio`, `passesAA(ratio, large?)`, `paletteAudit(palette)` returning the **complete deliberate pairing set** (see below). Pure.
2. [ ] **`test/a11y-contrast.test.ts`** — assert default `muted`/`surface` ≈ 7.2:1 passes, a synthetic 2:1 pair fails, normal-vs-large thresholds (4.5 / 3.0). `npm run verify` green.
3. [ ] **`lib/a11y/prefs.ts`** — `A11yPrefs` type, safe (de)serialise of `edges_a11y`, scale map, dark high-contrast palette constants.
4. [ ] **`lib/a11y/fonts.ts`** + vendor `AtkinsonHyperlegible.woff2` + `-OFL.txt` to `public/fonts/`; wire the var into `app/layout.tsx`.
5. [ ] **`app/globals.css`** — `--a11y-scale` + `html` font-size; `body.a11y-contrast` (5 vars `!important` + flat background + grain off); `.a11y-dyslexic` font rebind; `.a11y-reduce-motion` reusing the existing media-query kill; `.a11y-pattern` utility.
6. [ ] **`components/A11yProvider.tsx`** — context, localStorage I/O (try/catch + in-memory fallback), applies `--a11y-scale` + body classes, exposes `colourSafe`.
7. [ ] **`components/A11yTray.tsx`** — four rows, 44px buttons, `aria-pressed`, "Done".
8. [ ] **`components/ui.tsx`** — `Aa` trigger in `Screen`, gated on optional `A11yProvider` context, explicit z-index + safe-area offset.
9. [ ] **`components/ParticipantApp.tsx`** — wrap in `<A11yProvider>`; add the guarded `aria-live` phase announcer.
10. [ ] **`lib/modules/render-kit.tsx`** — `StatusLine role="status"`; `Bars` colour-safe branch + exported `useColourSafe()`. Opt in gradient/spectrogram/distribution as time permits.
11. [ ] **`lib/strings.ts`** — tray + Aa + privacy-block + admin-warning copy.
12. [ ] **`app/admin/page.tsx`** — Contrast check strip + non-blocking Save warning.
13. [ ] **`docs/accessibility.md`** + register `{ slug: "accessibility", title: "Accessibility" }` in the `DOCS` array in `app/help/page.tsx` (import the `.md`); add the quiet join-screen "Accessibility" privacy line.
14. [ ] **One-time manual audit** at A+++ (1.5×) + readable font + colour-safe across the ~26 renderers: 44px tap targets, and clipping on `BigStat` (`text-5xl leading-none`, render-kit line ~129) and projector `text-3xl`/`text-5xl`. Add a CONTRIBUTING note (no unreliable automated lint).
15. [ ] **Full vision (defer):** `lib/types.ts` → `store.setProjectorA11y` + `getPublicState` projection → host-route `setProjectorA11y` (`advance`) → `ProjectorApp` consumption + landmarks → HostConsole "What they see" card; light contrast preset; OpenDyslexic.

### `paletteAudit` pairing set (deliberate & complete)

Audit these, recomputed on every palette change. Hardcoded semantic hex (error `#ff8a8a`, retry, lead `#ffd27a`, danger `#2a1a1a`) is **vetted only against the default palette** and must be documented as such — never claim a custom-branded room is provably AA:

- `white` (#fff body text) over `bg`
- `white` over `surface`
- `muted` over `bg`
- `muted` over `surface`  ← the 352-use secondary-text pairing
- `accent` over `bg` (links / markers / lead text)
- `bg` over `accent` ← **highest-risk: the primary Button label is `text-bg` on `bg-accent`; a pale accent fails this and it's the easiest to omit**

---

## Acceptance criteria (testable, facilitator-outcome framed)

1. A participant can open the tray from a 44px "Aa" button on **every** participant screen (join, phase, holding, ended) and on the projector — and the button **never** appears on `/admin` or `/build`.
2. Choosing A+++ enlarges all text to 1.5×, the sticky footer stays anchored and reachable, and nothing on the holding/phase screens clips — verified on a 360px-wide phone.
3. The text-size / font / contrast / motion choice **persists into the next room the participant joins** with no further action (global `edges_a11y` key).
4. With high-contrast mode on, a room branded with a deliberately low-contrast custom palette renders AA-clean body text **on that device**, the atmospheric mesh/grain is gone (flat background), and poll bars are distinguishable **without colour** (patterns + labels).
5. A screen-reader user hears the new phase announced once when the host advances (not on mount, not on every 2s poll, not on a null transition), and hears "Saved." / "Couldn't send" from `StatusLine`.
6. In the admin theme editor, picking colours shows live pass/fail ratio chips for the complete pairing set (including button-label-over-accent); failing AA shows a calm warning on Save but **does not block** Save.
7. A facilitator can open `/help → Accessibility` and forward a statement that truthfully says participant prefs never leave the device.
8. `npm run verify` passes, including the new `contrast.ts` unit test.
9. **(Full vision)** A facilitator toggles projector colour-safe/large-text in "What they see"; the projector reflects it within ~2s; the host's own console reflects it immediately; the host AA card is worded so it isn't mistaken as a per-phone guarantee.

---

## Test plan

### Vitest (`test/a11y-contrast.test.ts`, in-memory store)
- Known default pairings: `muted`/`surface` ≈ 7.2:1 → `passesAA(..., false) === true`.
- A synthetic 2:1 pair → fails normal **and** large thresholds.
- A 3.5:1 pair → fails normal (4.5) but passes large (3.0).
- `relativeLuminance` of pure black `#000000` ≈ 0 and pure white `#ffffff` ≈ 1.
- `paletteAudit(defaultPalette)` returns exactly the 6 deliberate pairings, all with computed ratios; flag a pale-accent palette as failing `bg`-over-`accent`.
- Pure module: no DOM, no React, no KV — runs under `npm run verify`.

### Manual QA — mobile
- iOS Safari + Android Chrome, 360px wide: tap "Aa", cycle A→A+++ ; confirm reflow, sticky footer reachable, no horizontal scroll. Pinch-zoom still works on top of A+++.
- Readable font: confirm Atkinson loads offline (throttle/airplane after first load) and swaps body + display.
- High-contrast on a low-contrast custom-palette room: body text legible, mesh/grain gone, bars patterned + labelled.
- Private-mode / localStorage blocked: tray still works in-memory for the session, no throw.
- VoiceOver/TalkBack: advance a phase as host on another device; confirm one announcement, correct label, none on mount; `StatusLine` spoken on submit.

### Manual QA — projector (Full vision)
- 1366×768 projector at large-text: `BigStat` (`text-5xl leading-none`) and projector `text-3xl` do not clip in the fixed-height centre-flex; prefer driving projector sizes from the room `largeText` flag (or `clamp()` fluid type) rather than the participant `--a11y-scale`.
- Two-screen test: host toggles `setProjectorA11y` → host console flips immediately (authoritative `navState`); projector flips within ~2s via its own poll (documented read-back, acceptable).
- Bars readable from the back of the room with colour-safe on.

### Manual QA — admin
- Drag accent toward pale: button-label-over-accent chip flips to fail; Save shows the calm warning but still saves.

---

## Privacy & ethos check (explicit)

**PASS.** Participant a11y prefs live in localStorage under a **global** key `edges_a11y`, are **never transmitted, never logged, invisible to the host** — consistent with the off-the-record / account-less / nothing-logged contract, and mirroring the existing `edges_token`/`edges_handle` convention. The global key persisting across rooms and after a room ends is correct **device** state, not a TTL violation.

**One documented exception (Full vision only):** `projectorA11y` (two booleans) is server state on `SessionState` because a projector has no device to self-serve. It carries no personal data, follows the same 24h TTL + End-session wipe (`writeState` bumps rev + TTL), and is a facilitator control — so it does not violate the ethos.

**Must-do:** the `/help` Accessibility doc must state plainly that device prefs never leave the device (trust signal + honest).

**Module contract:** untouched — `computeView` never branches on a11y; the type-only boundary and all `*.server.ts` are unchanged; colour-safe lives entirely in `*.client.tsx`/render-kit via context.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

1. **Projector mis-stated as authoritative-apply** → **Resolved.** Spec now states the projector converges via eventually-consistent `/state` read-back (~2s), acceptable for an idempotent flag; only the host's own console applies `navState`. And `getPublicState` is explicitly required to project `state.projectorA11y` into its return.
2. **High-contrast palette undercut by atmospheric mesh/grain** → **Resolved.** `body.a11y-contrast` overrides all five `--c-*` with `!important` (body selector already beats the room's plain `:root` injection — verified specificity), **and** flattens `background-image` + zeroes `.grain`, so the AA ratio holds in rendered practice, not just on flat hex pairs.
3. **Incomplete/false "AA-clean" admin assurance** → **Resolved.** `paletteAudit` uses the deliberate 6-pairing set including **bg-over-accent (button label)**; hardcoded semantic hex documented as vetted only against the default palette; high-contrast mode is the guaranteed floor; never claim a custom room is provably AA. Host AA card worded "Branded palette: AA ✓ (6 core pairings) — participants can always switch to high-contrast mode."
4. **"Aa" trigger leaking onto admin/builder Screens + z-order** → **Resolved.** Trigger gated on `A11yProvider` presence (optional context → no-op without provider); explicit z-index above `PhaseBar` (z-10), below tray (z-50), safe-area offset, never overlapping the ReconnectBanner (z-20).
5. **`aria-live` spam on mount / null-label drop** → **Resolved.** Announce only on a real, non-null `phaseId` change with a prev-ref guard (skip initial); label sourced from `sequence` with a fallback.
6. **Text-scale vs viewport-unit clip** → **Mitigated.** Cap at 1.5×; one-time manual audit of `BigStat` (`leading-none text-5xl`) and projector `text-3xl`; prefer driving projector display sizes from the room `largeText` flag / `clamp()` rather than the participant scale.
7. **Scope blow-out on a 7-day estimate** → **Resolved.** Trimmed to a 6-day MVP (one dark preset, four controls, admin strip warning-only, `StatusLine` `role=status`, one `aria-live`); light preset + projector slice + OpenDyslexic deferred to Full vision.
8. **`leading-none` clipping descenders when scaled** → flagged in the audit step; bump to a `leading-tight` equivalent only if clipping is observed.
9. **Self-hosted font bundle weight** → one variable woff2, `display: swap`, OFL note vendored; no Google Fonts network call (privacy-preserving).
10. **Conventions** → no `Set` spreads / `.entries()` (use `Array.from()`/index loops); zod stays config source of truth; `contrast.ts` pure + unit-tested under `npm run verify`; pinch-zoom `maximumScale: 5` untouched.

---

## Out of scope / future

- **Light high-contrast (black-on-white) preset** — common low-vision preference; Full vision.
- **Projector room-level a11y toggle + projector SR landmarks** — Full vision (server slice fully specced above).
- **OpenDyslexic** as a second readable font (Atkinson is the less-divisive default).
- **Automated 44px / contrast lint** — deferred; a reliable automated check is hard. One-time manual audit + CONTRIBUTING note instead.
- **Per-room enforced a11y (hard-block branding below AA)** — deliberately NOT done; branding freedom is preserved and high-contrast mode is the participant-side safety net that makes the admin guard a warning, not a block.
- **Participant-facing "AA ✓" badge** — kept facilitator-only (in `/help`) plus a quiet join-screen line, to avoid clutter.
