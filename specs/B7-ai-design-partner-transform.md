# B7 — AI design partner (transform an existing session)

> Section B. Session design · **P2**
> Final executable build spec. Every pressure-test must-fix is folded into the design below, so this spec is already correct — build it as written.

---

## Priority / effort / dependencies

- **Priority:** P2
- **Effort:** **6 days** (the pressure-test corrected the original 4-day estimate; the server helper + route are thin, but a correct sequence-aligned diff, honest timer tally, capability-aware Apply gating, and the mid-session `setPhasesPreserving` store function are the real work). Thinnest MVP cut (see below) lands in **3 days**.
- **Depends on (existing code, not other roadmap items):**
  - `lib/design.ts` — `buildPhases`, `repairDependencies`, `timeGuidance`, `moduleCatalog`, `sourceConsumers`, `PRODUCERS`, `topicLine`, `SuggestedSession`, `generateJSON` (the entire backbone; `transformSession` is a `reviseSession` clone)
  - `lib/ai.ts` — `asData()` (injection delimiting), `topicLine()`, `generateJSON({tier:"reasoning", maxTokens:8000, shape:"object"})`
  - `lib/store.ts` — `listSubmissions`, `listParticipants` (for the rebalance hint), `setPhases`, `getState`, `writeState`, `withLock(roomId, name, fn, {ttlSeconds})` (cost lock + the new `setPhasesPreserving`)
  - `lib/auth.ts` — `requireCapability` + the existing `"advance"` and `"configure"` capabilities (no new cap)
  - `app/api/r/[room]/host/route.ts` — `navState()` authoritative-apply, `COMMAND_CAP`, the existing `setPhases` command, `maxDuration = 60`
  - `components/BuilderApp.tsx` — `BuilderPhase`, `parsedPhases()`, `loadSuggestion()`, `aiBusy` state machine, `msg` banner, the `PRODUCERS` dup (collapse to one)
  - `components/render-kit.tsx` — `AiGenerating` shimmer for the working state
  - `lib/modules/defs/equity.server.ts` — **REFERENCE ONLY** for the contribution-spread tally (copied as a tiny local route helper; never imported, so `design.ts` stays module-agnostic)
- **Roadmap dependency item ids:** none required. Pairs naturally with **B1** (agenda/timeline arc — the same timer-sum math) and **B2** (room preview); ships independently of both.

---

## Problem & facilitator value

### Problem
Facilitators rarely start blank. They arrive with an existing session — a template, last week's AI suggestion, last quarter's agenda — and reality shifts: the room ran 20 minutes over, it's post-lunch and stacked with heady analysis, three loud voices dominate while the quiet stay silent. They need to **adjust** the design in hand, not rebuild it. Today `lib/design.ts` offers only `suggestSession` (goal → a whole NEW session, discarding what you have) and `critiqueSession → reviseSession` (machine-detected issues → an opaque full rewrite). Neither is a **directed, named transform of the design in hand**. B7 is the missing verb.

### Facilitator value (my voice)
- **"Design WITH me, not FOR me."** I think in moves, not configs — *trim it, warm them up, wake them after lunch, even out airtime*. Let me speak the move and watch the agenda change.
- **"Keep me the author."** I want to inspect what changed and why, accept it, or reverse it — so I can defend every choice to the room.
- **"Rescue the 90%-right design."** One adjustment, without the violence of a full re-suggest.
- **"Teach me craft, quietly."** The named chips (anonymous divergence before named convergence, energy arcs, airtime equity) are one-tap lessons.

---

## MVP cut (thinnest shippable) and Full vision

### MVP (3 days) — prove the foundation before breadth
- **Three chips only:** `shorter` (−20), `warmup`, `custom` (free-text). These exercise the three prompt families: time-budget, insertion, and free instruction.
- **Robust client diff** via sequence alignment (LCS over `(moduleId, config-fingerprint)`) — this is non-negotiable even in MVP, because a naive diff cries wolf on exactly `warmup` (insertion shifts every later index). Build it once, correctly.
- **Setup-only Apply.** When `state.phaseId` is past lobby, Apply is **disabled** with a "Copy to builder / session is live" affordance. No mid-session apply yet.
- **Server invariant post-pass** (`enforceArc`) so `shorter`-never-cuts-lobby/close and lobby-first/close-last are *guaranteed*, not prompted.
- **`withGenerateLock`** on the call from day one.
- Honest timer tally with "N untimed" labelling.

### Full vision (the remaining 3 days, behind the MVP foundation)
- All nine chips: `shorter` / `longer` / `warmup` / `energy` / `rebalance` / `calm` / `anonymity` / `tighten` / `custom`.
- **Mid-session Apply** via a new `setPhasesPreserving` store function (keeps the current `phaseId` if it survives) behind a confirm dialog and the `navState` authoritative-apply.
- **Rebalance** with a server-computed, anonymity-safe, coarse-band `participationHint`.
- Delta stepper for time chips; single-level undo + read-only refinement-history trail.

---

## Experience & flows

A **third** AI affordance sits **above** the phase list (it acts on the whole sequence) — a calm **"Refine this design"** bar, visually distinct from the dashed "Design with AI" suggest box. Rendered only when `phases.length > 0`.

### Layout (top → bottom inside BuilderApp)
1. Name + passcode inputs (existing)
2. "Design with AI" suggest box (existing dashed box)
3. **➕ Refine this design** (NEW — this spec)
4. Start from a template (existing)
5. Add a module (existing)
6. Sequence list (existing)

### The Refine bar — idle state
- A row of **named transform chips**, each one tap = one transform:
  `20 min shorter` · `+15 longer` · `Add a warm-up` · `More energy after lunch` · `Rebalance voices` · `Calm it down` · `More anonymity` · `Tighten to the goal`
- A free-text **"…or tell me what to change"** input (e.g. *"too academic"*, *"move the persona exercise earlier"*) → `custom`.
- A **delta stepper** that appears **only** after a time chip (`shorter`/`longer`) is selected: ±5-minute steps, default ±20/+15.
- Chips are **disabled with helper text until a passcode is entered**, mirroring the existing AI gating.
- A persistent pre-warning line: *"Applying a refined build needs the room's **admin** passcode (designing a refinement only needs your facilitator code)."*

### Working state
- Chips disabled; the targeted region of the phase list dimmed.
- `render-kit`'s `AiGenerating` shimmer with the **specific verb**: *Trimming ~20 minutes…* / *Adding a warm-up…* / *Rebalancing voices…* / *Refining…*.

### Diff review card (the heart)
- Header: **Proposed refinement** · running tally **`52 min · was 72`** (with honesty caveats below).
- Body: the ordered new phase list with change badges per row:
  - **added** (green row)
  - **removed** (struck row, shown in place)
  - **moved** (amber row)
  - **retimed** (timer changed only)
  - **reconfigured** (config changed)
  - unchanged rows are quiet
- Each changed row carries a **one-line reason**.
- Footer: **Apply** (primary) · **Discard** (ghost) · the model's **2–3 sentence rationale** of what it changed and why.
- **Apply gating:**
  - If the resolved role lacks `configure` (facilitator/cohost), Apply renders **disabled** with inline text *"Enter the admin passcode to apply"* — never an enabled button that 403s after a satisfying reveal.
  - If `state.phaseId` is past lobby (live room) **and** mid-session apply is enabled, Apply carries a confirm: *"This replaces the live agenda. The room stays on the current phase if it still exists, otherwise it jumps to the nearest surviving phase."*
  - In MVP (setup-only), live rooms show Apply disabled with *"Session is live — refine in setup, or end & rebuild."*
- **Nothing changes until Apply.** Honors `design.ts`'s propose-never-apply contract.

### Applied state
- Diff collapses into a **Refinement history** trail of timestamped one-liners: *Trimmed to 52 min* · *Added word-cloud warm-up*.
- **Undo last refinement** link on the most recent entry restores the prior phase list (single-level undo).
- The phase list reflects the change and stays **fully hand-editable** (the existing AutoForm/JSON editors).

### Error / no-op / honesty copy
- **Partial transform:** *"I couldn't safely trim 20 min without cutting the core — trimmed 12 and flagged Rank."* (from the model rationale).
- **No-op:** *"No change needed — this is already lean."* (shown instead of an Apply button when semantically identical).
- **AI key / network:** reuse the existing `msg` banner (*"…AI key needed."* / *"Network error."*).
- **Rebalance without live data:** *"No live participation data yet — this is best-practice, not a read of the room."*

---

## Architecture

### Files to add / change

**No new files.** Three changed files + one new store function.

#### 1. `lib/design.ts` — add `transformSession`
Add **one** exported async function modelled structurally on `reviseSession`, plus a small `enforceArc` post-pass and a `TRANSFORMS` prompt map.

```ts
export type TransformKind =
  | "shorter" | "longer" | "warmup" | "energy"
  | "rebalance" | "calm" | "anonymity" | "tighten" | "custom";

export interface TransformOpts {
  goal?: string;
  minutes?: number;
  delta?: number;              // shorter/longer (minutes; negative for shorter)
  instruction?: string;        // custom (free text; injection-delimited)
  participationHint?: "skewed" | "fairly even" | "unknown"; // rebalance ONLY — coarse band, never per-person
}

export async function transformSession(
  current: { id: string; moduleId: string; config: Record<string, unknown> }[],
  transform: TransformKind,
  topic: string,
  opts: TransformOpts,
): Promise<{ ok: boolean; suggestion?: SuggestedSession; reason?: string }>;
```

Behaviour:
- A `TRANSFORMS: Record<TransformKind, { verb: string; rules: string }>` map encoding the per-transform invariants (rules folded in below). One `generateJSON` call (`tier:"reasoning"`, `maxTokens:8000`, `shape:"object"`), reusing `timeGuidance`/`moduleCatalog`/`topicLine`/`PRODUCERS`/`sourceConsumers`.
- `instruction` and `topic` wrapped via `asData("instruction", …)` / `topicLine()` so they cannot override invariants.
- Returns through the **SAME** `buildPhases → repairDependencies → enforceArc` pipeline (B7 must not bypass it).
- Returns `SuggestedSession`-shaped `{ ok, suggestion?, reason? }`. Writes nothing.

**`enforceArc(phases)` (NEW, also wired into `suggest`/`revise` for consistency):** a deterministic post-pass — today `buildPhases` enforces neither lobby-first nor close-last; these live only in prose prompts. `enforceArc`:
- If no `lobby` phase exists, prepend the module's default `lobby`; if not first, move it first.
- If no `close` phase exists, append default `close`; if not last, move it last.
- Guarantees `shorter` "never cuts lobby/close" structurally regardless of what the model returns.

**Per-transform prompt rules (`TRANSFORMS`):**
- **shorter:** cut the lowest-value phase or shorten debriefs and drop `timerSeconds` proportionally; **never** cut lobby/close (also guaranteed by `enforceArc`); keep the open→diverge→converge→close arc. **REQUIRE `config.timerSeconds` on every non-lobby/close phase** so the tally has a denominator (the timer-honesty fix). If the delta would gut the session below ~3 substantive phases, do a **partial** trim and SAY so in the rationale.
- **longer:** add depth/debrief or one phase; require timers on non-lobby/close phases.
- **warmup:** insert **exactly ONE** short low-stakes opener (`onetwofour`, `wordcloud`, or `scale`) **right after lobby**, under ~8 min, tuned to goal/topic; leave later phases except to absorb the time.
- **energy:** find the heaviest run of consecutive analytical phases (`qna`, `synthesis`, `devil`, `friction`, `rank`, `matrix`) and break it with a movement/voice phase (`spectrogram`, `onetwofour`, `lightning`) or a reorder, within budget.
- **rebalance:** bias toward structured-turn / anonymous-divergence modules (`onetwofour`, `brainwrite` → `redistribute`, `dotvote`, anonymous `capture`) and away from open free-for-all; ensure **anonymous divergence precedes named convergence**. If `participationHint` is `"skewed"`, lean harder; if `"unknown"`, state in the rationale that this is **best-practice, not a read of the room**.
- **calm:** lower stakes/energy, fewer phases, more reflective; protect psychological safety.
- **anonymity:** flip capture/divergence phases to anonymous where appropriate; preserve named convergence.
- **tighten:** drop phases not serving `goal`; sharpen prompts to the goal.
- **custom:** carry the delimited `instruction`. Structural invariants (lobby/close, valid ids, dependencies) are enforced by `buildPhases`/`repairDependencies`/`enforceArc` — not by the prompt — so a semantically-valid-but-off-goal instruction can't break the build; the facilitator reviews the diff and is the author.

#### 2. `app/api/r/[room]/host/route.ts` — add the `transformSession` command
- Import `transformSession`, `TransformKind` from `@/lib/design`; import `listSubmissions`, `listParticipants`, `withLock` from `@/lib/store`.
- `COMMAND_CAP["transformSession"] = "advance"` (read-only proposal tier, same as suggest/critique/revise).
- New `case "transformSession"`:
  1. Validate the inbound `phases` array (non-empty, each module known) — same guard as `critiqueSession`.
  2. Read `roomRec.topic`.
  3. For `transform === "rebalance"`, build a **coarse, anonymity-safe** `participationHint` server-side (local helper, below).
  4. Wrap the AI call in **`withLock(room, "gen:transform:" + transform, fn, { ttlSeconds: 60 })`** (the cost lock — the nine-chip bar is the most double-tap-prone AI surface). On lock contention return `{ error: "A refinement is already running — one moment." }` with 409.
  5. Return `{ ok: true, suggestion }` or `502 { error }`.
- **No `setPhases` here.** Apply reuses the existing `setPhases` (or the new `setPhasesPreserving`) command.

**Local `participationHint` helper (anonymity-safe — the critical privacy fix):**
```ts
// Coarse band only. NEVER per-person. Returns "unknown" whenever attributable
// data is a small fraction of submissions, so anonymous phases (which strip the
// token) read as live-signal-ABSENT — never as "everyone equal".
function rebalanceHint(subs: Submission[], roster: Participant[]):
  "skewed" | "fairly even" | "unknown" {
  const total = subs.length;
  const attributable = subs.filter((s) => s.token);          // anonymity strips token
  if (total === 0 || attributable.length < total * 0.5 || roster.length < 3)
    return "unknown";                                         // blinded → best-practice fallback
  const counts = new Map<string, number>();
  for (const s of attributable) counts.set(s.token!, (counts.get(s.token!) ?? 0) + 1);
  const vals = roster.map((p) => counts.get(p.token) ?? 0);
  const max = Math.max(...vals), median = /* median of vals */ 0;
  return max >= Math.max(3, median * 3) ? "skewed" : "fairly even";
}
```
This mirrors `equity.server.ts`'s `if (!tok) continue` token-attribution logic but **collapses to a band** so the transient string can never reconstruct who-said-what, and it treats anonymity-blinded rooms as `"unknown"` — so B7 creates **zero incentive to de-anonymise** the room. There is **no UI affordance** anywhere that suggests turning anonymity off "for better rebalance".

#### 3. `lib/store.ts` — add `setPhasesPreserving` (Full vision; not MVP)
Plain `setPhases` hardcodes `phaseId: phases[0]?.id ?? null`, `timerEndsAt: null`, `readaroundIndex: 0` — applying mid-session **teleports the whole room back to the lobby and wipes the timer**. A confirm dialog over plain `setPhases` is not enough. Add:
```ts
export async function setPhasesPreserving(
  phases: PhaseInstance[], sessionName: string, roomId = DEFAULT_ROOM_ID,
): Promise<SessionState> {
  const state = await getState(roomId);
  const keep = phases.some((p) => p.id === state.phaseId)
    ? state.phaseId                                  // current phase survives → stay put
    : (phases[0]?.id ?? null);                        // clamp to first if it was removed
  return writeState({ ...state, mode: null, sessionName, phases,
    phaseId: keep, /* leave timerEndsAt + readaroundIndex untouched when keep is unchanged */
    ended: false }, roomId);
}
```
Wire a `case "setPhasesPreserving"` (cap `"configure"`) that flows through `navState` exactly like `setPhases`. The builder's Apply uses `setPhasesPreserving` when the room is live, plain `setPhases` when in setup.

#### 4. `components/BuilderApp.tsx` — the Refine bar
New state:
```ts
const [refineBusy, setRefineBusy] = useState<TransformKind | null>(null);
const [proposal, setProposal] = useState<{ phases: BuilderPhase[]; rationale: string;
  diff: DiffRow[]; tally: Tally; transform: TransformKind } | null>(null);
const [delta, setDelta] = useState(-20);
const [instruction, setInstruction] = useState("");
const [undoStack, setUndoStack] = useState<BuilderPhase[][]>([]);   // single-level effectively (push 1, pop 1)
const [history, setHistory] = useState<{ at: number; text: string }[]>([]);
const [liveState, setLiveState] = useState<{ phaseId: string | null } | null>(null); // for live-room detection
const [role, setRole] = useState<Role | null>(null); // resolved client-side for Apply gating
```
- The builder currently has **no role resolution** — add a lightweight one: on passcode entry, the existing AI calls already prove the code is valid; resolve the tier by attempting capability client-side is brittle, so instead **trust the server**: render Apply optimistically but on a 403 fall to the existing admin-passcode message. **Better (the chosen fix):** the builder reads the resolved role the same way `HostConsole` does (it authenticates by resolved role). Lift that resolution (a cheap `requireCapability`-style probe call, or reuse the role returned by `navState` on any command) into BuilderApp so Apply can be **disabled** for non-`configure` codes. Concretely: the first successful refine response (or a tiny `whoami` probe gated at `advance`) returns `role`; if `role !== "admin"`, Apply renders disabled with *"Enter the admin passcode to apply"*.
- Each chip POSTs `transformSession` with `{ command, transform, delta?, phases: parsedPhases(), goal, minutes, instruction?, code }`.
- On response, compute the **DIFF client-side** (algorithm below) and the **tally**, then render the review card. Apply: push current `phases` onto `undoStack`, append a `history` one-liner, then `loadSuggestion`-style replace `phases`; if live, POST `setPhasesPreserving` (else `setPhases`) and apply the returned `navState` — **never a read-back**.
- Discard clears `proposal`. **Undo last refinement** pops `undoStack`.
- Working state reuses `AiGenerating` with the transform-specific verb.
- **Collapse the `PRODUCERS` duplication:** remove BuilderApp's local `PRODUCERS` set and import it from `design.ts` (the architecture's "no third copy" rule — there must be exactly one).

### The client diff — sequence alignment, NOT id/position (the major fix)
`buildPhases` regenerates ids (`${moduleId}-${i+1}` on missing/duplicate) and `repairDependencies` can rename on collision, and the model **re-emits the whole session**, so returned ids bear little relation to inputs even for "the same" phase. Diffing by raw id → spurious remove+add pairs; diffing by raw position → an insertion paints the entire tail as moved. Both cry wolf on exactly the move-heavy transforms (`warmup`, `energy`).

**Algorithm:**
1. Build a stable **fingerprint** per phase: `moduleId` + a normalized config signature = sorted `key:value` of the **non-timer** config (timers excluded so a retime doesn't read as a different phase). Hash to a short string.
2. Run an **LCS / sequence alignment** over the old and new fingerprint sequences.
3. Classify each row:
   - in both, same position-in-LCS → **unchanged** (then compare timers → **retimed** if `timerSeconds` differs)
   - in new only → **added**
   - in old only → **removed**
   - matched but order changed relative to LCS → **moved**
   - same `moduleId`, fingerprint differs but clearly the "same slot" (matched by LCS on moduleId fallback) → **reconfigured**
4. Use **no Set spreads / no `.entries()`** (downlevelIteration off) — `Array.from()` and index loops only.

### Timer tally honesty (the major fix)
- `config.timerSeconds` is optional and the model can silently drop it; `buildPhases` drops nothing, so a missing timer counts as 0/untimed. A `shorter` result could show a fake "was 72 → 52" purely from dropped timers.
- Mitigations: (a) `shorter`/`longer` prompts **require** `timerSeconds` on non-lobby/close phases; (b) the tally surfaces **"N untimed"** prominently next to the number; (c) the headline is a **(phase-count, timed-sum) pair**, not the timed-sum alone; (d) if the timed-phase proportion changes materially between old and new, label the tally **"approximate"**. Reuse `timeGuidance()` to keep retimed phases realistic. Never present the timed-sum delta as authoritative.

### Data model
- **No persisted schema changes.** Consistent with the account-less / no-durable-DB / 24h-TTL ethos.
- `transformSession` is a pure read-only proposal: returns `{ sessionName, rationale, phases: PhaseInstance[] }`, writes nothing.
- Undo stack + refinement history live **entirely in BuilderApp component state** (in-memory, single-level undo + read-only trail) and vanish on reload — no new store keys, no new `SessionState` fields.
- The only state mutation in the whole flow is the **existing** `setPhases` (setup) or the **new** `setPhasesPreserving` (live) on Apply.
- `participationHint` is a transient, content-free, **coarse band** computed per-request from already-stored submissions/participants — never persisted, never logged (honors submissions-never-logged).
- The new-total tally is derived client-side from each phase's `config.timerSeconds`.

### API + host commands (+ capability gating)
- **`transformSession`** (NEW, `POST /api/r/[room]/host`):
  - Request: `{ command:"transformSession", transform: TransformKind, phases: PhaseInstance[], goal?, minutes?, delta?, instruction?, code }`
  - Response: `200 { ok:true, suggestion:{sessionName, rationale, phases} }` · `400` (no phases / no goal where required) · `403` (lacks `advance`) · `409 { error }` (a refinement already running — the lock) · `502 { error }` (AI unavailable / no usable phases)
  - **Capability: `"advance"`** — same read-only tier as `suggestSession`/`critiqueSession`/`reviseSession`.
- **`setPhasesPreserving`** (NEW, Full vision): `{ command:"setPhasesPreserving", phases, sessionName, code }` → `navState` authoritative state. **Capability: `"configure"`** (admin-only, the same as `setPhases`).
- **`setPhases`** contract unchanged: setup-time Apply reuses it (`"configure"`), returns authoritative state via `navState`.

### rev / authoritative-apply (no KV read-back)
- The **proposal/diff path writes nothing and reads nothing back** for its result — purely read-only.
- **Apply** flows through `setPhases` / `setPhasesPreserving` → `navState(room, written, role)` → returned as `{ ...state, role, branding, topic }` and applied by the client via `usePolledState.apply` (BuilderApp can either redirect to the host console on success as it does today, or, if it adopts polled state, apply the returned `navState`). **Never depends on a read-back** — `navState` computes from the just-written state, correct even on eventually-consistent Upstash.
- `writeState` stamps the strictly-increasing `rev`, so the client's monotonic guard accepts the new agenda and rejects any stale read that arrives after.
- `participationHint` is a **read of already-stored** submissions/participants once per request — not a write-then-read; no consistency hazard.

---

## Implementation plan (ordered, checkable)

1. **[ ] `lib/design.ts`:** add `enforceArc(phases)`; wire it into `suggestSession`/`reviseSession`/`transformSession` after `repairDependencies`.
2. **[ ] `lib/design.ts`:** add `TransformKind`, `TransformOpts`, the `TRANSFORMS` prompt map, and `transformSession()` (clone `reviseSession`; delimit `instruction`/`topic` via `asData`/`topicLine`).
3. **[ ] Vitest** (`test/design-transform.test.ts`) on in-memory store / mocked `generateJSON`: each transform returns dependency-repaired phases; `shorter` keeps lobby+close (assert `enforceArc`); structurally-identical input ⇒ recognizable no-op; `asData` delimiting applied to `instruction`.
4. **[ ] `app/api/r/[room]/host/route.ts`:** `COMMAND_CAP["transformSession"]="advance"`; `case "transformSession"` with phases validation, topic read, `rebalanceHint` helper, and `withLock` cost guard.
5. **[ ] Route test:** `advance` allowed, lower tier 403, `rebalance` hint built from seeded submissions, **anonymous (token-stripped) submissions ⇒ `"unknown"`**, lock contention ⇒ 409.
6. **[ ] `lib/store.ts`:** add `setPhasesPreserving`; **[ ] route:** `case "setPhasesPreserving"` (cap `configure`, via `navState`).
7. **[ ] Store test:** current `phaseId` preserved when it survives; clamped to first when removed; `timerEndsAt` untouched on survive.
8. **[ ] `components/BuilderApp.tsx`:** collapse `PRODUCERS` to the `design.ts` import; build the client **LCS diff** + **honest tally** utilities (pure, unit-tested separately).
9. **[ ] BuilderApp:** Refine bar UI (chips, free-text, conditional delta stepper, passcode gating), `refineBusy` shimmer verb, diff review card, Apply (role-gated + live-room confirm + `setPhasesPreserving`), Discard, Undo, history trail.
10. **[ ] BuilderApp:** resolve role client-side for Apply gating (disable for non-`configure` codes).
11. **[ ] `npm run verify`** (typecheck + lint + test) — watch the no-Set-spread / no-`.entries()` rule in the diff/tally code; use `Array.from()` / index loops.
12. **[ ] Manual builder smoke test:** trim, warm-up, rebalance pre-session (best-practice label), rebalance mid-session (`unknown` on anonymous rooms), mid-session apply (confirm + preserved phase + authoritative-apply), facilitator-code Apply disabled.
13. **[ ] Deploy** via the existing Vercel syd1 / Node 24 pipeline (`maxDuration 60` already set). No flag, no migration, no privacy-posture announcement.

---

## Acceptance criteria (facilitator-outcome framed)

1. **Targeted trim:** From a 72-min design, tapping `20 min shorter` produces a proposal whose diff shows specific cuts/retimes and a tally near 52 min — and **lobby and close are still present** every time.
2. **Author stays in control:** Nothing in my design changes until I tap **Apply**; **Discard** leaves it exactly as it was; **Undo last refinement** restores the prior list after an Apply.
3. **Legible diff:** Adding a warm-up shows **one** green added row and the rest unchanged — not a wall of "moved". Reordering shows amber moves, not remove+add pairs.
4. **Honest math:** The tally never claims time was saved that wasn't; untimed phases are labelled "N untimed" and excluded from the sum.
5. **Rebalance never misleads:** Pre-session (or on an anonymous room) it is labelled *"best-practice, no live participation data"*; it **never** shows a spread computed from a partial, anonymity-biased sample, and **nothing** anywhere nudges me to turn anonymity off.
6. **Capability honesty:** As a facilitator (no `configure`), Apply is **disabled** with "enter the admin passcode" — I never earn a 403 after the AI reveal.
7. **Live room safe:** Applying mid-session keeps the room on its current phase (or the nearest surviving one) and does **not** dump everyone back to the lobby; a confirm warns me first.
8. **Cost-safe:** A double-tapped chip or a host+cohost collision does not fire two Opus generations (the lock returns 409 to the second).
9. **No-op:** When the design is already lean, I see *"No change needed"* — not an Apply button for cosmetic churn.

---

## Test plan

### Vitest (in-memory store, no KV/AI — mock `generateJSON`)
- **design-transform.test.ts:** each `TransformKind` ⇒ dependency-repaired phases; `enforceArc` guarantees lobby-first + close-last + lobby/close survive `shorter`; structurally-identical model output ⇒ no-op recognizable; `asData` wraps `instruction`; `repairDependencies` still rewires a `sourcePhaseId` after a `shorter` cut.
- **diff.test.ts (pure client util):** insertion ⇒ exactly one `added` + rest unchanged; reorder ⇒ `moved` not remove+add; id rename of an otherwise-identical phase ⇒ unchanged (fingerprint matches); timer-only change ⇒ `retimed`; config change ⇒ `reconfigured`. **No Set spreads / no `.entries()`.**
- **tally.test.ts:** dropped `timerSeconds` ⇒ counted as untimed + surfaced as "N untimed", not silently zero; headline is `(count, timedSum)` pair.
- **route.test.ts:** `transformSession` allowed at `advance`, `403` below; `rebalanceHint` ⇒ `skewed`/`fairly even` from seeded **tokened** submissions; **token-stripped (anonymous) submissions ⇒ `unknown`**; `withLock` contention ⇒ 409.
- **store.test.ts:** `setPhasesPreserving` keeps surviving `phaseId`, clamps to first when removed, leaves `timerEndsAt` on survive; stamps a strictly-greater `rev`.

### Manual QA
- **Builder (desktop):** trim → diff legible → Apply → undo restores. Warm-up → one added row. Custom "too academic" → sensible directed revision. Discard is a true no-op.
- **Mobile (host on phone):** Refine bar chips wrap and tap cleanly at `max-w-sm`; diff card scrolls; shimmer verb visible; no `StickyAction`-style overlap.
- **Projector:** Apply to a **live** room → projector and participants stay on the current phase (not dumped to lobby); after a phase-removing Apply they move to the nearest surviving phase via the `rev`/authoritative path with no flash.
- **Passcode tiers:** facilitator code → chips work, Apply disabled with admin hint; admin code → Apply enabled.
- **Rebalance:** pre-session ⇒ best-practice label; live tokened room ⇒ a band; live anonymous-capture room ⇒ `unknown` + best-practice label (proves the anonymity guard).
- **AI off (no key):** chips disable exactly like the suggest box (graceful no-op).

---

## Privacy & ethos check (explicit)

- **No new persistence, no new store keys, no new `SessionState` fields.** Undo/history are component-state-only and vanish on reload.
- **Submissions stay unlogged.** `participationHint` is transient, content-free, and a **coarse band** (`skewed` | `fairly even` | `unknown`) — never per-person — so even the in-flight string cannot reconstruct who-said-what.
- **The anonymity ethos hazard is closed.** Anonymous capture deliberately strips `submission.token` (even the facilitator can't attribute who-said-who). B7 treats token-stripped / low-attribution rooms as **live-signal-ABSENT** and falls back to the labelled best-practice heuristic — it **never** computes a spread from a partial, anonymity-biased sample, and it **never** surfaces any affordance that nudges de-anonymising the room "for better rebalance". The off-the-record differentiator is preserved, not weakened.
- **AI runs only in the route command** (a `handleAction`-equivalent), **never in `computeView`** (which runs every 2s).
- **Prompt injection:** free-text `instruction` + `topic` delimited via `asData()`/`topicLine()`; structural invariants (lobby/close, valid module ids, dependency rules) enforced by `buildPhases`/`repairDependencies`/`enforceArc` — never trusted to the prompt.
- **24h TTL, end-session wipe, account-less** all untouched.

---

## Risks & mitigations (pressure-test must-fixes, resolved)

| # | Risk (severity) | Resolution (folded into spec) |
|---|---|---|
| 1 | **Rebalance reads a blinded anonymous sample as "balanced" / nudges de-anonymising** (critical) | `rebalanceHint` returns `"unknown"` whenever attributable submissions are < 50% of total (anonymous phases strip the token); coarse band only, never per-person; **no UI affordance** anywhere suggests turning anonymity off. |
| 2 | **Mid-session Apply teleports the room to phase 0** (critical) — `setPhases` hardcodes `phaseId: phases[0].id, timerEndsAt:null`. | MVP: Apply **disabled** when past lobby. Full: new `setPhasesPreserving` keeps the current `phaseId` if it survives (clamps otherwise), leaves the timer, behind a confirm + `navState` authoritative-apply. **Never plain `setPhases` + a confirm.** |
| 3 | **Client diff cries wolf** (major) — `buildPhases` regenerates ids, model re-emits whole session; id/position diffing paints spurious moves/remove+add. | **LCS / sequence alignment** over `(moduleId, non-timer-config fingerprint)`; id is not used as the diff key. One insertion ⇒ one added row. |
| 4 | **No cost lock — double-fire** (major) — suggest/revise lack `withGenerateLock`; the nine-chip bar is the most tap-prone surface. | Wrap the call in `withLock(room, "gen:transform:<kind>", fn, {ttlSeconds:60})`; second concurrent call ⇒ 409. |
| 5 | **Timer tally is a half-truth** (major) — optional `timerSeconds` silently dropped ⇒ fake "was 72 → 52". | Require `timerSeconds` on non-lobby/close phases in `shorter`/`longer`; surface "N untimed"; headline is a `(count, timedSum)` pair; label "approximate" when timed-proportion shifts. |
| 6 | **Late 403 for facilitator/cohost** (major) — `transformSession` is `advance` but Apply needs `configure`. | Resolve role client-side; render Apply **disabled** with "enter the admin passcode" for non-`configure` codes — never an enabled button that 403s after the reveal. A persistent pre-warning line states it up front. |
| 7 | **Lobby/close not structurally enforced** (minor→guarantee) — invariants live only in prose today. | New `enforceArc` post-pass guarantees lobby-first/close-last and lobby/close survival, applied to suggest/revise/transform alike. |
| — | **No-op detection across re-emitted sessions** (minor) | No-op = same multiset of moduleIds in the same relative order with per-phase timer deltas < 30s; sub-threshold jitter ⇒ "No change needed". |
| — | **Custom instruction steers off-goal** (minor) | Accepted (facilitator is the author and reviews the diff); structural invariants are enforced by the pipeline, not the prompt. |

---

## Out of scope / future

- **Composable transforms in one call** (`shorter` AND `more energy`). One-at-a-time for legibility/reversibility; the free-text `custom` field already expresses compound intent for power users.
- **Multi-step undo + redo.** Start single-level undo + a read-only history trail; revisit only if facilitators ask.
- **Persisted refinement history** (would need a store key — declined; conflicts with the ephemeral ethos).
- **Per-person rebalance detail / named airtime callouts.** Deliberately excluded to protect anonymity — the coarse band is the ceiling.
- **A free-form delta stepper beyond ±5-min steps** / arbitrary "make it 47 minutes" — fixed chips + stepper cover the calm common case.
- **Surfacing the diff on the projector** (it's an authoring affordance, host-only).
