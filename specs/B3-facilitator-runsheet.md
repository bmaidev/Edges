# B3 — Facilitator notes / run-sheet per phase (printable/exportable)

> Final executable build spec. Pressure-test must-fixes are folded in — this spec is already correct; build to it without re-deriving design.

## Priority / effort / dependencies

- **Priority:** P0
- **Effort:** ~5.5 dev-days (spine + leak tests ~1.5; builder authoring + write-through ~1.5; host panel ~1; print view ~1; AI designer ~0.5). The thinnest viable cut (spine + builder authoring + host read panel) is ~4 days; print export and AI emission are independently shippable follow-ons.
- **Dependencies (item ids / code):**
  - None on other roadmap items. Self-contained.
  - Hard code dependencies (must land in order): `lib/modules/runsheet.ts` → `lib/types.ts` FacilitatorState extension → `lib/store.ts` strip + derive → builder/host/print consumers.
  - Reuses (no change): `navState`→`getFacilitatorState` authoritative-apply path (`app/api/r/[room]/host/route.ts` L39–48), `usePolledState.apply` (`components/usePolledState.ts`), `VoiceTextarea`, `Countdown`, the `setPhases`/`configure` capability gate (`route.ts` L56), and the `window.open` new-tab export precedent in `HostConsole`.

## Problem & facilitator value

> "I don't run a session from the app — I run it from my run-sheet. The script, the talking points, the per-phase timings, the 'if it goes quiet, do this' contingencies. Edges has my phase sequence, but there's nowhere private to keep the words I actually say. The only writable field is the Content panel — and that's on the projector, so if I script there, I leak my cues to the room. So I keep a Google Doc open and alt-tab away from the very tool that's running the room."

B3 adds a **per-phase, facilitator-only run-sheet**: authored in the builder, shown inline and private in the host **Run** tab right above the controls, and **printable** as the single sheet a pro carries into the room.

What it buys the facilitator:

- It turns Edges from "an app that runs activities" into "the tool I trust for the whole session." Script and timing sit above the controls — glance, speak, advance, never alt-tab.
- It closes the worst privacy gap: today the only writable field is participant-facing. The run-sheet is the **first facilitator-private writable field** — it strengthens the off-the-record contract, not violates it.
- The AI designer can draft the script per phase, so a fast design becomes genuinely runnable.
- Print-to-PDF gives a paper backup if the Wi-Fi dies.

## MVP cut (thinnest shippable) and Full vision

**MVP (ship first, in this order — the leak spine is the P0 gate):**

1. `lib/modules/runsheet.ts` (key, type, schema, strip/extract helpers).
2. `getPublicState` strips `runsheet` **before building ctx** (so `computeView` never sees it); `getFacilitatorState` derives `runsheets` + `nextPeek`. FacilitatorState type extended.
3. `test/runsheet.test.ts` proving the P0 leak invariant (the gate — must be green before any UI).
4. Builder authoring: `RunSheetSection` + auto-form special-case + planned-minutes write-through to `timerSeconds`.
5. Host `RunSheetPanel` (read panel, cohost read-only).

**Follow-on (independently shippable):**

6. Print/PDF export view + SessionControls button.
7. AI designer emits per-phase `runsheet` (`lib/design.ts`).

**Full vision (out of scope for this item — see Future):** a per-session global "session brief" block (intent, materials checklist, room setup); a durable "save as my template" store; a structured run-sheet export embedded in the download archive.

## Experience & flows

Tone: **calm, private, one glance away.** Warm private-notes treatment — amber inset, a small lock glyph, the word **private**. Echo the inject panel's shown-vs-hidden messaging.

### Screens & states

- **Builder — collapsed run-sheet.** Under each phase's config form: a `+ run-sheet` link. When notes exist, the link becomes a page glyph + a summary, e.g. `📄 run-sheet · ~8 min`.
- **Builder — expanded run-sheet.** Bespoke collapsible section (amber inset, lock glyph, caption "Private — never shown to participants or the projector."):
  - **Script** — `VoiceTextarea` (type or dictate).
  - **Talking points** — `textarea`, one bullet per line.
  - **Planned minutes** — `number`; writing it also writes the phase `config.timerSeconds = minutes × 60`.
  - **Contingency** — single-line `input`.
- **Host Run tab — run-sheet panel.** Default-open, **above** `ModuleControlPanel`. Amber private inset, lock glyph. Shows: phase **label**, **script**, **bullets**, a **timing chip**, a one-line **next-phase peek** (`Next → <label>`), and a collapse toggle persisted in `localStorage`. Scrolls **within itself** so it never pushes Advance below the fold.
  - **Timing chip — timer running:** compares `timerEndsAt` (live) to `plannedMinutes`, e.g. `Planned 8m · 2m left · on track` / `… · over by 1m`.
  - **Timing chip — no timer started (no-timer state):** degrades to `Planned 8m · timer not started` with a pointer to the session-header start preset. No duplicate timer UI.
  - **Open-ended phase (no timer end):** chip shows planned minutes only, no live delta — never a broken countdown.
  - **Empty state:** muted line `No run-sheet for this phase.` + deep link to `/r/[room]/build`.
- **Cohost view.** Identical panel, **read-only** — no edit affordances. Editing lives in the builder behind `configure`, which cohosts lack; no new gate needed.
- **Print view.** New tab, light print theme, dark chrome hidden via print CSS. Title block: session name, room, date, total planned minutes. Then per-phase blocks: cumulative clock in the margin, label, module, planned minutes, full script, bullets, contingency, and any reference content flagged "shown to the room." Page-break between phases. Produces a useful agenda even with **zero** notes. Carries an off-the-record line on the page itself.
- **Participant phone & projector.** Unchanged — **zero trace** of any run-sheet text. The explicit non-leak invariant.

### Key flows

1. **Author while designing** — expand run-sheet on a phase, dictate script, add bullets, set 8 planned minutes (which writes `timerSeconds=480` so the existing start preset just works). Notes ride inside each phase config.
2. **AI-assisted authoring** — *Suggest a session* returns, per phase, a short script, 2–4 talking points and planned minutes alongside module id + config — runnable, then editable to voice.
3. **Run from it live** — private panel sits at the top of Run; read the framing aloud, watch the timing chip, glance at the next peek, hit Advance. Panel swaps via the **authoritative `navState` apply** — no read-back, no flicker.
4. **Print before the room** — *Run-sheet (print)* opens a new tab with the full agenda + cumulative timings + every script. Print to PDF; carry it.
5. **Co-host stays in sync** — a cohost joins mid-session, opens Run, sees the same private run-sheet **read-only** — knows the lead's script and where the time should be.

## Architecture

### Files to add

| Path | Purpose |
| --- | --- |
| `lib/modules/runsheet.ts` | **Single source of truth.** `RUNSHEET_KEY = "runsheet"`, `RunSheet` type, zod `runSheetSchema` (all-optional), and helpers `stripRunsheet(config)` / `extractRunsheet(config)`. Imported by store, builder, design, host panel, print. |
| `components/RunSheetPanel.tsx` | Host Run-tab private panel (client). Reads `runsheets[phaseId]` + `nextPeek` from FacilitatorState. Amber private inset, lock glyph, script, bullets, timing chip, next-peek, `localStorage` collapse, internal scroll, empty-state deep link. **No fetch — rides applied state.** Read-only for cohost. |
| `components/RunSheetSection.tsx` | Builder collapsible authoring section (client). `+ run-sheet` link / page-glyph summary; expanded = Script (`VoiceTextarea`), Talking points (textarea one/line), Planned minutes (number, write-through to `config.timerSeconds`), Contingency. Mutates the phase config like other builder fields. |
| `app/r/[room]/print/page.tsx` | Client print view in a new tab. Light theme, dark chrome hidden via print CSS. Title block + per-phase blocks (cumulative clock margin, script, bullets, contingency, reference content flagged shown-to-room), page-breaks. **Reads handoff from `sessionStorage` once, then clears it** (see privacy fix). Useful agenda even with no notes. |
| `test/runsheet.test.ts` | P0 leak + behavior tests (see Test plan). |

### Files to change

| Path | Change |
| --- | --- |
| `lib/store.ts` | **(1) Strip on the way IN.** In `buildContext` (~L716–730), set `config: stripRunsheet(phase.config)` for non-facilitator/non-admin roles, so `ctx.config` — and therefore `computeView` (~L774) — never sees `runsheet`. **(2) Strip the returned `config` field** in `getPublicState` (~L745) for public roles too (`cfg = stripRunsheet(phase.config)`). **(3) Derive** in `getFacilitatorState` (~L863): add `runsheets: Record<string, RunSheet>` by walking `resolvePhases(state)` + `extractRunsheet`, and `nextPeek: string | null` (label of the phase after the active one). Both fields populated **only here.** |
| `lib/types.ts` | Extend `FacilitatorState` (L256) with `runsheets: Record<string, RunSheet>` and `nextPeek: string | null`. **`PublicState` unchanged** — script text exists only on the facilitator type (defence in depth). Re-export `RunSheet` from `lib/modules/runsheet.ts` if convenient. |
| `components/BuilderApp.tsx` | Special-case `RUNSHEET_KEY` out of `schemaFields`/`describeField` (mirror the `sourcePhaseId` special-case at L101/L135) so the auto-form never renders it as `unsupported`. Render `<RunSheetSection>` below the per-phase config form. Wire planned-minutes write-through to `config.timerSeconds`. `setPhases` payload carries `config.runsheet` untouched. |
| `components/HostConsole.tsx` | In the Run tab (~L213), render `<RunSheetPanel state={s} role={role} />` **above** `ModuleControlPanel`. Add a *Run-sheet (print)* button in `SessionControls` (~L968) that stashes facilitator state to `sessionStorage` and `window.open(`/r/${room}/print`, "_blank")`. Cohost gets the read-only panel. |
| `lib/design.ts` | Extend `suggestSession` + `reviseSession` prompts to emit per-phase `config.runsheet { script, talkingPoints[2-4], plannedMinutes }`; in `buildPhases`, **coerce/validate via `runSheetSchema`** (array-coerce `talkingPoints`, number-coerce `plannedMinutes`) and write `plannedMinutes` through to `config.timerSeconds`. |
| `app/api/r/[room]/host/route.ts` | **No new command, no new capability.** Authoring flows through existing `setPhases` (gated on admin `configure`). Add a code comment asserting nothing strips `runsheet` on write; confirm `navState`→`getFacilitatorState` now carries `runsheets` + `nextPeek` in its authoritative payload. |

### Data model

**No new store keys, no new TTL, no Redis schema change.** The run-sheet is one optional object nested in each `PhaseInstance.config` under `RUNSHEET_KEY`:

```ts
// lib/modules/runsheet.ts
export const RUNSHEET_KEY = "runsheet" as const;

export interface RunSheet {
  script?: string;
  talkingPoints?: string[];
  plannedMinutes?: number;
  contingency?: string;
}

export const runSheetSchema = z
  .object({
    script: z.string().optional(),
    // tolerant of AI/string input → coerce to string[]
    talkingPoints: z.array(z.string()).optional(),
    plannedMinutes: z.number().int().nonnegative().optional(),
    contingency: z.string().optional(),
  })
  .partial()
  .passthrough();

// Shallow clone + delete ONLY the key — never an allowlist (preserves
// timerSeconds/label/everything the host start-preset depends on).
export function stripRunsheet<T extends Record<string, unknown>>(config: T): T {
  if (!config || !(RUNSHEET_KEY in config)) return config;
  const clone = { ...config };
  delete (clone as Record<string, unknown>)[RUNSHEET_KEY];
  return clone;
}

export function extractRunsheet(config: Record<string, unknown> | null | undefined): RunSheet | null {
  const r = config?.[RUNSHEET_KEY];
  const parsed = runSheetSchema.safeParse(r);
  return parsed.success ? (parsed.data as RunSheet) : null;
}
```

- Persisted exactly like the rest of phase config: inside `SessionState.phases` (24h TTL, bumped on write, in-memory fallback in dev). **Wiped by End session** along with the live phase sequence.
- `plannedMinutes` is **not** a second timer field — it write-throughs to the existing `config.timerSeconds` (`types.ts` L87). Legacy phases with `timerSeconds` but no run-sheet **derive** planned minutes back as `Math.round(timerSeconds / 60)` for display/print.
- FacilitatorState gains two **derived, non-persisted** fields, computed in `getFacilitatorState`: `runsheets` (`Record<phaseId, RunSheet>`) and `nextPeek` (`string | null`).
- **Public/participant/projector state strips `runsheet` from the returned `config` AND never feeds it to `computeView`** — the P0 invariant.

### View shapes

- No change to `ModuleView` or any module's view payload. `RunSheetPanel` reads `state.runsheets[state.phaseId]` and `state.nextPeek` directly off FacilitatorState — fields the `PublicState` type literally does not declare.

### API + host commands (+ capability gating)

- **No new host command, no new capability.** Authoring reuses `setPhases` (requires admin `configure` — the documented gotcha), so cohosts/facilitators view but cannot author, matching the design.
- `setPhases` validation is unchanged in mechanism: it already `safeParse`s each phase config against its module schema. All 26 module schemas use `.passthrough()` and **zero** are `.strict()` (grep-confirmed), so the optional `runsheet` validates without any schema edit.
- `GET /api/r/[room]/state`: participant/projector responses now return `config` with `runsheet` **stripped** (and `view` computed against stripped config). Facilitator/admin/cohost responses gain `runsheets` + `nextPeek`. Additive for facilitator clients; removes a field that should never have shipped to participants.
- Design-assist commands (`suggestSession`/`reviseSession`) now emit `config.runsheet` in returned phase suggestions — additive to the existing suggestion JSON shape.

### Rev / authoritative-apply (no KV read-back)

- The host `navState` path (`route.ts` L39–48) already returns `getFacilitatorState(room, written)` computed from the **just-written** state. Because `runsheets`/`nextPeek` are derived inside `getFacilitatorState`, the authoritative payload now carries them. On Advance/setPhase the client calls `usePolledState.apply` and the panel swaps — **no separate fetch, no read-back, no flicker.** `RunSheetPanel` reads only applied state.
- `getFacilitatorState` walks `resolvePhases` + `extractRunsheet` on every `/state` poll (every 2s). This is **pure in-memory derivation** — no extra KV round-trips, no AI — so it is safe at computeView frequency (consistent with the "no AI in computeView" rule).
- SSE `roomSignature` already ticks on `phaseId`/sequence change; run-sheet-only edits happen in the builder via `setPhases` (which changes the sequence), so no missed-tick concern.

## Implementation plan (ordered, checkable steps)

- [ ] **1. Spine.** Add `lib/modules/runsheet.ts` (`RUNSHEET_KEY`, `RunSheet`, `runSheetSchema`, `stripRunsheet`, `extractRunsheet`).
- [ ] **2. Types.** Extend `FacilitatorState` in `lib/types.ts` with `runsheets` + `nextPeek`; leave `PublicState` untouched.
- [ ] **3. Strip on the way IN.** In `buildContext` (`lib/store.ts` ~L721), build `ctx.config` from `stripRunsheet(phase.config)` for non-facilitator/non-admin roles so `computeView` never sees it.
- [ ] **4. Strip on the way OUT.** In `getPublicState` (~L745), `cfg = stripRunsheet(phase?.config)`.
- [ ] **5. Derive.** In `getFacilitatorState` (~L863), build `runsheets` (walk `resolvePhases` + `extractRunsheet`) and `nextPeek` (label after active phase). Re-attach the **un**stripped facilitator config is NOT needed — host reads `state.runsheets`, never `state.config.runsheet`.
- [ ] **6. P0 leak tests.** Write `test/runsheet.test.ts` (see Test plan). **Gate: green before any UI.**
- [ ] **7. Builder special-case.** In `BuilderApp.tsx`, filter `RUNSHEET_KEY` out of `schemaFields`/`describeField`.
- [ ] **8. Builder authoring.** Add `components/RunSheetSection.tsx`; render below the per-phase form; wire planned-minutes write-through to `config.timerSeconds`.
- [ ] **9. Host panel.** Add `components/RunSheetPanel.tsx`; mount above `ModuleControlPanel` in the Run tab; cohost read-only; `localStorage` collapse; internal scroll; empty-state deep link.
- [ ] **10. Print view.** Add `app/r/[room]/print/page.tsx`; sessionStorage **read-once-then-clear**; light print theme + page-break CSS; agenda works with zero notes.
- [ ] **11. Print button.** Add *Run-sheet (print)* to `SessionControls`; stash state to sessionStorage; `window.open`.
- [ ] **12. AI designer.** Extend `suggestSession`/`reviseSession` prompts; coerce/validate `runsheet` via `runSheetSchema` + write-through in `buildPhases`.
- [ ] **13. Host route comment.** Add the "nothing strips runsheet on write" assertion comment.
- [ ] **14. Docs/MEMORY.** Note: run-sheet wipes with the session like all other config (no durable user-template store; honest wipe-on-End story).
- [ ] **15. `npm run verify` + build (Node 24).** Manual QA per Test plan.

## Acceptance criteria (testable, facilitator-outcome framed)

1. **I can script a phase privately.** In the builder I expand a phase's run-sheet, dictate a script, add bullets, set planned minutes; it saves and reloads with my text intact.
2. **My script never reaches the room.** No participant or projector response — in `config`, `view`, `sequence`, `readaround`, anywhere — contains my script or talking-points text. (Verified by the leak test asserting the **entire serialized response.**)
3. **I run from it live.** On the Run tab a private panel sits above the controls showing my script, bullets, a timing chip and the next-phase peek; Advance is never pushed below the fold.
4. **Advance swaps with no flicker.** Hitting Advance updates the panel to the new phase's run-sheet instantly via the authoritative apply — no stale read.
5. **Planned minutes just works as a timer.** Setting 8 planned minutes makes the session-header start preset run an 8-minute countdown — no second timer UI.
6. **The timing chip degrades gracefully.** With no timer started, the chip shows "planned only" and points at the start preset; on an open-ended phase it shows planned minutes with no broken countdown.
7. **A cohost sees but can't edit.** A cohost on the Run tab sees the same panel read-only, with no edit affordances.
8. **I can print a backup.** *Run-sheet (print)* opens a light-themed tab with every phase's label, module, planned minutes, cumulative clock, script, bullets and contingency, page-broken; Print-to-PDF works. It produces a useful agenda even when no phase has notes.
9. **The print copy doesn't linger.** The sessionStorage handoff is cleared the moment the print page reads it.
10. **AI drafts are runnable.** *Suggest a session* returns per-phase script + 2–4 talking points + planned minutes; malformed AI output (e.g. string talking points) is normalized, not rendered raw.
11. **End session wipes it.** After End session, the live phases carry no run-sheet text.

## Test plan

### Vitest (`test/runsheet.test.ts`, in-memory store)

1. **Leak — whole response (P0).** Seed a phase whose `config.runsheet.script` and `talkingPoints` contain unique sentinel strings. Call `getPublicState(token, room, "participant")` and `getPublicState(null, room, "projector")`; assert `JSON.stringify(response)` contains **neither** sentinel (covers `config`, `view`, `sequence`, `readaround` — everything, not just `config`).
2. **computeView never sees runsheet.** Use a module whose `computeView` echoes its full `ctx.config` into the view (a test stub or the media module); assert the participant `view` payload contains no sentinel — proving the strip happens **before** ctx is built.
3. **Facilitator DOES get it.** `getFacilitatorState(room).runsheets[phaseId]` contains the sentinel script + talking points; `nextPeek` equals the next phase label (or `null` at the last phase).
4. **Strip is surgical.** After `stripRunsheet`, the config still carries `timerSeconds` and `label` (assert the host start-preset write-through keeps working).
5. **Round-trip.** `setPhases` with a config carrying `runsheet` accepts it and round-trips unchanged.
6. **No-strict guard.** Iterate `SERVER_MODULES`; assert no schema is `.strict()` (so optional `runsheet` always validates).
7. **Reserved key guard.** Assert no module schema declares its own `runsheet` key (the no-strict test alone is insufficient).
8. **Write-through.** Setting `plannedMinutes = 8` yields `timerSeconds = 480`; legacy phase with `timerSeconds = 300` and no run-sheet derives planned minutes `5`.
9. **AI coercion.** `buildPhases` normalizes a runsheet with `talkingPoints` as a single string and `plannedMinutes` as `"8"` into `string[]` / `number` (or drops invalid), via `runSheetSchema`.
10. **Wipe.** After End session, no live phase config contains run-sheet text.

### Manual QA

- **Desktop host:** author in builder → reload → text persists; Run tab panel shows script/bullets/chip/next-peek; Advance swaps instantly with no flicker.
- **Mobile host (phone-sized viewport):** long script scrolls **within** the panel; Advance stays visible; collapse toggle persists across reloads.
- **Projector + participant phone:** open both during a phase with a scripted run-sheet; confirm **zero** run-sheet text appears; view DevTools network `/state` payload for the sentinel — absent.
- **Cohost:** join mid-session, open Run, confirm read-only panel, no edit affordances.
- **No-timer / open-ended:** confirm the chip degrades correctly in both states.
- **Print:** open print tab on a real session → Print-to-PDF → check title block, cumulative clock, page-breaks, dark chrome hidden; re-open and confirm sessionStorage handoff was cleared (no stale state). Open print with a zero-notes session → still a useful agenda.
- **Eventually-consistent deploy:** on a real Vercel/Upstash deploy, Advance swaps the panel with no flicker (authoritative apply).

## Privacy & ethos check (explicit)

- **Net privacy-positive.** This adds the first facilitator-private writable field and closes the gap where the only authorable field (Content) was participant-facing.
- **Leak invariant is the spine and is fully closed:** strip happens **before** `computeView` (not only at the return site), and the leak test covers the **entire** participant/projector response, not just `config`.
- **Off-the-record / 24h-TTL / wipe respected.** Run-sheet lives in phase config; End session wipes it like all other config.
- **Honest wipe story — no false durability claim.** There is **no durable user-template store** in this codebase (built-in templates are code; custom builds are 24h-TTL session state). So custom-build run-sheets wipe with the session — nothing to flag as a "durable copy." The only durable artifact is the manual print/PDF the facilitator chooses to make.
- **Print view at-rest copy mitigated.** The sessionStorage handoff is **read-once-then-cleared**; the print route is opened only from the host console and is never linkable to participants/projector/read-only URL holders; the page carries the off-the-record framing.
- **Module contract privacy invariant added:** `RUNSHEET_KEY` is a **forbidden module-owned config key**, and module schemas must remain `.passthrough()` (never `.strict()`) — both enforced by tests.

## Risks & mitigations (pressure-test must-fixes, resolved)

| Risk (pressure-test) | Resolution folded into this spec |
| --- | --- |
| **Strip happened only at the return site; `computeView` ran against unstripped `phase.config`, leaking via the `view` payload.** | Strip **on the way IN** to `ctx` in `buildContext` (step 3), so `computeView` never sees `runsheet`. Plus strip the returned `config` (step 4). |
| **Leak test scoped to `config` only.** | Leak test asserts the **entire serialized** participant AND projector `/state` response contains no script/talking-points text (Test 1), and a module-echoes-config test covers the `view` path (Test 2). |
| **`getFacilitatorState` spreads `...pub`, so stripping `config` also strips it from the facilitator — and the host start-preset reads `state.config.timerSeconds`.** | `stripRunsheet` is shallow-clone + `delete` of **only** `RUNSHEET_KEY` (never an allowlist), preserving `timerSeconds`/`label`. Test 4 asserts this. Host reads run-sheet text **only** from `state.runsheets[phaseId]` — `state.config.runsheet` is a documented forbidden path. |
| **False "persists durably in saved templates" privacy framing.** | Dropped. There is no durable user-template store; the honest, cleaner story is wipe-on-End-session like all config. Docs updated. |
| **"Existing download export" cited as reuse precedent — but `exportJson` serializes only patterns + content, not phases/config.** | Print view is treated as **net-new** work (new file + new privacy surface), not reuse. |
| **Print sessionStorage = new at-rest copy of script text, no passcode gate.** | **Read-once-then-clear** the sessionStorage key; print route reachable only from the host console; off-the-record framing on the page. |
| **AI-emitted runsheet with wrong-typed fields passes `passthrough` validation and renders raw.** | `buildPhases` coerces/validates via `runSheetSchema` (array-coerce `talkingPoints`, number-coerce `plannedMinutes`) at write time (Test 9). |
| **No-strict guard insufficient as modules evolve.** | Added Test 7: no module schema declares its own `runsheet` key; `RUNSHEET_KEY` reserved in the module contract. |
| **Builder auto-form renders nested `runsheet` as `unsupported`.** | `RUNSHEET_KEY` special-cased out of `schemaFields`/`describeField` (mirrors `sourcePhaseId`); rendered as bespoke `RunSheetSection`. |
| **Planned-minutes / timerSeconds drift.** | Single source: `plannedMinutes` writes through to `timerSeconds`; legacy phases derive planned minutes from `timerSeconds`. |

## Out of scope / future

- **Per-session global "session brief"** (overall intent, materials checklist, room setup) — needs a new home in state beyond `sessionName`. Defer; separate feature. The print view leaves room for it.
- **Durable "save as my template" store** — does not exist today; building it is a separate item. The only durable artifact here is the print/PDF.
- **Extending the download archive to embed phases + run-sheet** as a structured export — explicitly scoped out (the after-action archive owns counts/submissions/patterns).
- **Server-rendered, passcode-gated, shareable print URL** — client-side print-from-loaded-state ships first; a server route is a later option if shareable links are wanted.
- **The next-peek must never surface on the What-they-see or projector tab** — confirmed boundary; this item keeps it strictly in the private panel.
