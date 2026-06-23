# Contributing

Thanks for helping make Edges better. This guide covers dev setup, the checks
CI runs, the conventions the codebase follows, and — most importantly — how to
add a new facilitation module. For the design behind all of this, read
[ARCHITECTURE.md](ARCHITECTURE.md) first.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Dev setup

Prerequisites: **Node >= 20**.

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSCODE; KV and AI are optional in dev
npm run dev
```

In dev, state uses an in-memory fallback (no Redis needed) and AI is disabled
unless `ANTHROPIC_API_KEY` is set — both degrade gracefully. See the
[README](README.md#quickstart) for the full quickstart.

## Scripts and the verify gate

| Script              | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Dev server                                  |
| `npm run build`     | Production build                            |
| `npm test`          | Vitest, once                                |
| `npm run coverage`  | Tests with coverage                         |
| `npm run typecheck` | `tsc --noEmit`                              |
| `npm run lint`      | `next lint`                                 |
| `npm run format`    | Prettier (write)                            |
| `npm run verify`    | `typecheck` + `lint` + `test`               |

**`npm run verify` is the gate** — it runs typecheck, lint, and the full test
suite, and is what CI runs. Run it before every PR.

## Code conventions

These are observed throughout the repo; match them so diffs stay calm.

- **Terse, comment-led style.** Most files open with a short comment explaining
  what the module is and why it's shaped the way it is. Comments explain *why*,
  not *what*.
- **Renderers** are `const PascalCaseRenderer: Renderer = ({ view, act }) => ...`,
  typed with the `Renderer` type from `render-kit`. Build UI from the shared
  `render-kit` primitives rather than re-rolling bars, stat callouts, send
  feedback, or AI loading states.
- **Hooks before early returns.** React hooks go at the top of a renderer,
  above any conditional `return` — never call a hook after a guard clause.
- **No `Set` spreads or `.entries()`/`for…of` over iterators.**
  `downlevelIteration` is off, so spreading a `Set`/`Map` or iterating an
  iterator directly won't compile. Use `Array.from(...)`, `Object.entries(...)`,
  or index loops instead. (You'll see `Array.from({ length: n })` and
  `Object.values(votes)` patterns everywhere for this reason.)
- **zod schemas are the config source of truth.** A module's `schema` defines
  its configuration; infer the config type from it (`z.infer<typeof schema>`)
  rather than declaring a parallel interface. Schemas are usually
  `.passthrough()` so the shared `label` rides along.
- **Server/client split is strict.** Server logic lives in `*.server.ts`,
  renderers in `*.client.tsx`, and the only thing shared between them is the
  type-only `views.ts`. Never import server code from a client file.
- **Privacy is load-bearing.** Don't log submission or prompt text; don't add
  durable storage of participant content; keep raw data facilitator-only via
  `computeView`'s role checks.

## How to add a module

A module is the unit of extension. The simplest existing modules to copy are
**`poll`** and **`capture`** (both inline in `registry.server.ts`, with
renderers in `registry.client.tsx`) and **`spectrogram`** (a self-contained
pair under `defs/`). New modules should follow the `defs/` pattern.

Say you're adding a module with id `mymod`.

### 1. Define the view shape (the type-only boundary)

Add the view payload interface to
[`lib/modules/views.ts`](lib/modules/views.ts), or — as the `defs/` modules do —
export it from the server file itself (it's a `type`, so it stays safe to import
on the client). This is the contract between `computeView` and the renderers.

### 2. Write the server half — `lib/modules/defs/mymod.server.ts`

Define a `ModuleServerDef` with:

- a zod **`schema`** (config source of truth) and `type Config = z.infer<...>`;
- `meta`, `defaultConfig`, `defaultVisibility` (use the `vis(...)` helper for the
  role matrix), and `capabilities`;
- **`computeView(ctx)`** — read from `ctx` (and `ctx.store.readVotes(...)` etc.),
  return your view payload. Respect roles: give participants aggregate-only data
  and keep raw lists for facilitators (`ctx.role`, `ctx.submissions`).
- **`handleAction(ctx, action)`** (if the module accepts input) — validate the
  payload, write through `ctx.store` (`castVote` / `addSubmission` / `addWord`),
  and return `{ ok }`. Gate facilitator-only actions on `ctx.role`. For
  read-modify-write control actions, wrap in `ctx.store.withLock(...)`.

Export it as `myModule` (e.g. `export const mymodModule = myMod;`).

### 3. Write the client half — `lib/modules/defs/mymod.client.tsx`

Start the file with `"use client"`. Export a `renderers` object keyed by role:

```tsx
const MyParticipant: Renderer = ({ view, act }) => { /* ... */ };
const MyProjector: Renderer = ({ view }) => { /* ... */ };
export const mymodRenderers: ClientModule["renderers"] = {
  participant: MyParticipant,
  projector: MyProjector,
};
```

Use `render-kit` primitives (`useSend`, `StatusLine`, `Bars`, `BigStat`,
`StickyAction`, `Reveal`, …). Cast `view` to your view type at the top.

### 4. Register both halves

- Add the `ModuleKind` literal to the union in `lib/types.ts`.
- Import and add the server def to `SERVER_MODULES` in
  [`registry.server.ts`](lib/modules/registry.server.ts).
- Import and add the renderers to `CLIENT_MODULES` in `registry.client.tsx`.

### 5. (Optional) add a template

If the module makes a good ready-made session, add an entry in
[`lib/templates.ts`](lib/templates.ts) and document it in
[`docs/templates.md`](docs/templates.md). Document the module itself in
[`docs/modules.md`](docs/modules.md).

### 6. Write a test

Add `test/modules/mymod.test.ts`. Drive it through the real `dispatchAction`
path (which builds the `ctx` + store facade exactly as `/api/action` does) so
you exercise the whole pipeline — see `test/modules/capture.test.ts` as the
template: `createRoom` → `setPhases` → `setPhase` → `addParticipant` →
`dispatchAction` → assert via the store read functions.

Then run `npm run verify`.

## PR process

1. Branch off the default branch.
2. Make your change with tests; keep diffs focused.
3. Run **`npm run verify`** and make sure it's green.
4. Open a PR using the template, describing what and why. Link any related
   issue.

We aim for small, reviewable PRs and a calm, well-commented codebase.
