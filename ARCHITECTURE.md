# Architecture

This is the deep doc for contributors. For how to run and contribute, see
[CONTRIBUTING.md](CONTRIBUTING.md); for user-facing behaviour, see
[`docs/`](docs/).

## The keystone idea

Facilitation methods are not bespoke features. A "World Café", a "1-2-4-All", a
"Troika" — each is a **configured chain of a few irreducible interaction
primitives**. The primitives are things like: collect short text (capture), pick
from a fixed set (poll), spend a budget (dot vote), order items (rank), claim a
lens or side (allocate), tell each person who they're with (coordinator), and
pace through results (read-around). A named method is then just a sequence of
these primitives with the right configuration on each phase.

This is why everything in the system is a **module**, and a **session** is a
list of **phases**, each phase being one module plus its config.

## The Module contract

The contract is the heart of the platform. Each module is self-describing and
split across the server/client boundary, because Next.js cannot share a single
import graph between server logic (which touches the KV store) and client React
renderers.

### The server half — `ModuleServerDef`

Defined in [`lib/modules/types.ts`](lib/modules/types.ts):

```ts
interface ModuleServerDef<Config = Record<string, unknown>> {
  id: ModuleKind;
  meta: { name: string; description: string; icon?: string };
  schema: ZodType<Config>;              // config is validated by zod
  defaultConfig: Config;
  defaultVisibility: Record<Role, Visibility>;
  capabilities: ModuleCapabilities;     // acceptsActions / liveResults / needsTimer / projectable
  computeView(ctx: ModuleContext): Promise<unknown> | unknown;
  handleAction?(ctx, action): Promise<{ ok: boolean; reason?: string }>;
}
```

- **`schema`** is the single source of truth for a module's configuration — a
  zod schema (typically `.passthrough()` so the builder can carry the shared
  `label`). `Config` is inferred from it.
- **`computeView(ctx)`** returns the role-scoped view payload for the active
  phase. It receives a read snapshot (`ModuleContext`) the store fetched once —
  participants, visible content, patterns, the caller (`me`), session `state`,
  and a write facade (`store`). It must never call AI (see below). It is the
  only place a module decides what each role gets to see.
- **`handleAction(ctx, action)`** validates and applies a participant (or
  facilitator) action. Display-only modules omit it. Modules never import the
  store directly — they go through `ctx.store` (a `ModuleStore` facade with
  `roomId` pre-bound), which breaks the module ↔ store import cycle.

`ModuleContext.submissions` is facilitator-only data — it is `[]` for the
participant role, so a module physically cannot leak raw submissions to a phone.

### The client half — renderers

Defined per role in `registry.client.tsx` and the `defs/*.client.tsx` files. A
renderer is a pure function of the server-computed view data plus an action
dispatcher:

```ts
type Renderer = (props: RendererProps) => JSX.Element;
interface ClientModule { renderers: Partial<Record<Role, Renderer>>; }
```

Renderers are typed `const X: Renderer = ...` and built from the shared
primitives in [`lib/modules/render-kit.tsx`](lib/modules/render-kit.tsx):
`Bars`, `BigStat`, `useSend` + `StatusLine` (honest send feedback with retry),
`StickyAction`, `AiGenerating`/`Shimmer`/`Reveal` (calm AI loading states),
and the rotation kit (`RoundBanner`, `GroupChips`, `WaitingForGroup`,
`CaptureDone`) used by the round-based modules. `RendererProps.act` resolves to
whether the write landed, so a renderer can give honest feedback instead of
assuming success.

### The split, and why

Each module is two files keyed by the same `ModuleKind`:

```
lib/modules/defs/<id>.server.ts    ModuleServerDef: schema, computeView, handleAction
lib/modules/defs/<id>.client.tsx   per-role renderers (uses render-kit primitives)
lib/modules/views.ts               type-only view shapes shared by both halves
```

`views.ts` is the **type-only boundary**: it declares the shape of each
module's view payload and is safe to import from both sides, because importing a
type pulls no runtime code. This is the whole point of the split — it keeps
server code (the KV client, AI, secrets) out of the client bundle while letting
the two halves stay type-checked against the same contract.

The two halves are wired into parallel registries:

- [`lib/modules/registry.server.ts`](lib/modules/registry.server.ts) →
  `SERVER_MODULES: Record<ModuleKind, ModuleServerDef>`
- `lib/modules/registry.client.tsx` → `CLIENT_MODULES: Record<ModuleKind, ClientModule>`

There are currently ~39 modules: the original set is defined inline in
`registry.server.ts` (lobby, content, capture, allocate, coordinator,
readaround, close, poll, dotvote, rank, scale, wordcloud, qna, matrix); the
later "fleet" modules each live as a self-contained pair under
`lib/modules/defs/`.

## State & realtime model

There is a single `SessionState` per room (mode/phase id, timer, read-around
index, topic, ended flag, and the phase sequence) plus separate collections for
participants, submissions, votes, words, content, and patterns.

The keystone field is **`rev`**, a strictly-increasing revision number. Every
write stamps `rev = max(Date.now(), prev.rev + 1)` (see `writeState` in
[`lib/store.ts`](lib/store.ts)), so monotonicity holds even across clock skew
between serverless instances.

[`components/usePolledState.ts`](components/usePolledState.ts) enforces two
guards on every applied response:

- **Out-of-order:** every fetch carries a monotonic seq; a response is applied
  only if it's the newest one started.
- **Anti-flash (the important one):** a response whose `rev` is *lower* than the
  last applied `rev` is dropped. Because KV is eventually consistent, a slow read
  can return stale state — without this guard, a screen could jump backwards or
  flap between phases. With it, screens only ever move forward.

### R1 — the realtime tier (push + conditional polling)

The hard requirement is *hundreds of people per room across hundreds of
simultaneous rooms with no disconnects and perfect syncs*. A naive 2s poll that
recomputes a full snapshot per request does not get there: at ~90k clients it is
~270k Redis ops/s of identical work, which rate-limits the store and reads as
disconnects. The realtime tier fixes this **without giving up the correctness the
monotonic guard provides**, by making "did anything change?" cost one cheap read
and pushing that answer instead of polling for it.

- **The per-room version counter.** A single Redis `INCR` (`room:<id>:ver`) is
  bumped on *every participant-visible write* — and only those: liveness
  heartbeats are deliberately excluded so 300 phones a beat don't churn it. The
  bump is wired centrally in the storage backend by key-suffix allow-list
  (`BUMP_SUFFIXES` in `store.ts`), so no write path can forget it. The counter is
  the one source of truth for "has this room moved", read in a single GET.
- **Push (Pusher Channels).** After a bump, the server fans a tiny `{ver}` tick
  out to the room's channel (throttled to ≤1/s/room so a vote burst coalesces).
  Clients re-poll on the tick, so updates land sub-second with no per-client
  drum-beat. Gated on `PUSHER_*`: with no credentials it is a no-op and the
  system falls back to polling (see [`lib/realtime.ts`](lib/realtime.ts)).
- **Conditional polling (304).** The participant `/state` route ETags its
  response with `p:<ver>:<roomTag>`. A client echoes it as `If-None-Match`; an
  unchanged room answers **304 with no body, skipping the five-key snapshot read
  and `computeView` entirely**. With push active, the participant poll drops to a
  slow backstop (~8s) whose steady state is a single tiny version read.
- **Push is an accelerator, never the source of truth.** Correctness lives in the
  counter (always written before the response returns) and the monotonic `rev`
  guard. A dropped, duplicated, or out-of-order tick is harmless: a client
  re-fetches on *any* tick (a no-op collapses to a 304), and the backstop poll
  heals a tick that never arrives. Nothing is ever missed — the system is exactly
  as correct with push entirely disabled.

The legacy SSE accelerator (`/api/r/[room]/stream`) still exists for polling-only
deployments and is now backed by the same counter (its signature is one read, not
six); the client uses it only when Pusher is unconfigured, since the per-client
SSE loop is exactly the connection-holding cost push removes.

## Storage

The state layer ([`lib/store.ts`](lib/store.ts)) targets **Vercel KV / Upstash
Redis** as the hot path, with an **in-memory fallback** for local dev and tests
(pinned to `globalThis` so all route-module instances share one map; it resets
on reload). Both classic Vercel KV and Upstash env names are supported.

- **Room-scoped keys** with a **24h TTL** on every write (`TTL_SECONDS`).
- **No durable database by design** — this is a privacy decision. There is no
  long-lived record of who said what. Durable, no-TTL data is limited to the
  room registry itself (rooms, passcode hashes, themes) in
  [`lib/rooms.ts`](lib/rooms.ts).

Atomic operations chosen to be concurrency-safe for a whole room writing at once:

- **Per-token hash writes** — participants and votes are stored as hash fields
  (`hset`), so a join or a vote for one token never collides with another's;
  there is no read-modify-write of the whole set.
- **`rpush`** — submissions and words are append-only lists, so concurrent
  sends from the whole room can't drop each other.
- **`withLock` (Redis `SET NX EX`)** — a named, room-scoped, auto-expiring lock
  used to make read-modify-write *control* actions safe against double-taps and
  host+cohost collisions (advancing a round, firing a single AI generation). It
  returns `{ ok: false, busy: true }` without running the function if contended,
  and the TTL means a crashed holder never wedges a room. The in-memory fallback
  is atomic by virtue of JS being single-threaded.

## Auth

Passcode role tiers, defined in [`lib/auth.ts`](lib/auth.ts) and
[`lib/rooms.ts`](lib/rooms.ts):

- **Roles:** `admin`, `facilitator`, `cohost`, `projector`, `participant`. Admin,
  facilitator, and co-host are reached with a per-room passcode; the projector is
  a read-only screen URL with no passcode; participants join by token.
- **Hashing:** passcodes are **sha256-hashed**; plaintext is returned once at
  room creation and never persisted. `resolveRole` hashes the supplied code and
  compares against the stored hashes with a timing-safe comparison. A single
  bootstrap super-admin passcode (`ADMIN_PASSCODE`) can create rooms and acts as
  admin on every room.
- **Capabilities:** `CAPABILITIES: Record<Role, Set<Capability>>` maps each role
  to a capability set (`configure`, `advance`, `timer`, `inject`, `curate`,
  `readaround`, `reassign`, `cluster`, `viewRaw`, `end`). Co-host is a reduced
  facilitator (no `configure`, `reassign`, or `end`); **`configure` is admin-only
  — the facilitator role intentionally lacks it.** Host routes gate on
  `requireCapability(slug, code, cap)`, which resolves the role and checks the
  capability in one step.

See [docs/roles-and-passcodes.md](docs/roles-and-passcodes.md) for the
user-facing view.

## AI service

All AI goes through one service, [`lib/ai.ts`](lib/ai.ts), so model choice,
streaming, refusal handling, truncation, prompt-injection delimiting, cost
guards, and observability live in one place.

- **Gated on `ANTHROPIC_API_KEY`** — `aiAvailable()` is false without it, and
  every call returns `{ ok: false, reason: "AI unavailable" }`, so the whole
  platform runs (degraded) with no key and no participant text ever leaves it.
- **Model tiers:** `reasoning` (Opus, for red-team / tension / issue-mapping /
  latent-need / generation tasks) and `fast` (Sonnet, for short extraction and
  turn-taking).
- **Never logs content:** observability records latency, model, stop reason, and
  token counts only — never prompt or submission text.
- **Timeout:** requests abort at 55s, inside the route's 60s wall, so users get a
  friendly "try again" rather than an opaque 504.
- **Generation lock:** `withGenerateLock` wraps a generation in `withLock` (60s
  TTL) so a host+cohost double-trigger can't fire two expensive calls for the
  same phase.
- **Prompt-injection delimiting:** `asData()` fences participant-submitted text
  and instructs the model to treat it as content to analyse, never as
  instructions; `capItems()` caps the set so a large room can't blow the context.
- **AI is never called in `computeView`.** `computeView` runs on every poll;
  putting a model call there would mean an API hit every 2 seconds per client.
  Generations are explicit, locked actions instead.

## Request / render flow

```
            participant phone                              host console
                  |                                              |
          poll /api/state (2s)                          dispatch host action
                  |                                              |
                  v                                              v
        store.getPublicState(role)                     store.dispatchAction(...)
                  |                                              |
       buildContext: load snapshot                    requireCapability gate
       (state, participants, content,                          |
        patterns, submissions*)                                v
                  |                                   module.handleAction(ctx, action)
                  v                                        write via ctx.store
       module.computeView(ctx)  ---------------------->  (hset / rpush / withLock)
                  |                                              |
                  v                                              v
        role-scoped view payload                       SessionState.rev++  (writeState)
                  |                                              |
                  v                                              |
   client renderer (CLIENT_MODULES[id])  <--- next poll picks up the higher rev
   reject if view.rev < lastRev (anti-flash)

   * submissions are [] unless the role may see raw data (facilitator/admin)
```

The projector (`/r/<room>/screen`) is just another polling client that selects
the `projector` renderer; the participant phone selects `participant`; the host
console selects `facilitator`/`admin`.
