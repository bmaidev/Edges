# Edges

**A calm, privacy-first, multi-room facilitation platform.** Run great
workshops from a phone: participants join on their devices, the room shares a
projector, and the facilitator drives everything from a console.

Named facilitation methods — World Café, 1-2-4-All, Troika, 25/10 Crowdsourcing,
gradients of agreement, and the rest — aren't bespoke features here. They're
**configured chains of a few irreducible interaction primitives** (capture, a
vote, an allocation, a coordinated round). One small contract, many methods.

## What it is

Edges is a Next.js web app for facilitating live, in-person and remote
sessions. It is mobile-first and voice-first for participants, and deliberately
privacy-preserving: no accounts, no analytics, no durable database, raw
contributions are facilitator-only, and everything self-erases within 24 hours.

## Features

- **Multi-room** — create as many independent rooms as you like, each with its
  own passcodes, theme, and session.
- **25+ facilitation modules** — capture, polls, dot/idea voting, ranking,
  scales, 2×2 matrices, word clouds, Q&A + upvoting, brainwriting, World Café,
  Open Space, fishbowl, 1-2-4-All, Troika/Wise Crowds, 25/10, Min Specs,
  gradients of agreement, human spectrogram, participation equity, and a family
  of optional AI tools. See the [module reference](docs/modules.md).
- **Three live surfaces** — a participant phone view, a host/facilitator
  console, and a shared projector screen — each module renders per role.
- **Passcode role tiers** — admin, facilitator, and co-host are passcode-gated
  with a sha256-hashed capability model; the projector screen is a read-only
  URL. See [roles & passcodes](docs/roles-and-passcodes.md).
- **Off-the-record privacy posture** — handles default to Anonymous (or can be
  stripped entirely), submissions are never logged, and all room data carries a
  24h TTL with an immediate wipe on End session.
- **Optional AI assist** — cluster assist, AI facilitation modules, a setup
  design assistant, and a post-session report — all gated on an API key and
  content-free in logs. See [AI features & privacy](docs/ai-and-privacy.md).
- **Session builder + AI designer** — compose a custom phase sequence by hand,
  start from a one-tap template, or describe a session and let the AI draft it.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Vercel KV / Upstash Redis** for live session state (in-memory fallback in dev)
- **Anthropic SDK** (`@anthropic-ai/sdk`) for the optional AI service
- Deployed on **Vercel**

## Quickstart

Prerequisites: **Node >= 20**.

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSCODE; the rest are optional in dev
npm run dev
```

Then open <http://localhost:3000/admin> (the admin passcode defaults to whatever
you set as `ADMIN_PASSCODE`). Create a room — it returns the participant, host,
and projector URLs plus the per-room passcodes, shown **once**.

In development, **Redis and AI are both optional**:

- With no `KV_REST_API_URL` / `KV_REST_API_TOKEN`, state falls back to an
  in-memory store (single process; resets when the dev server restarts).
- With no `ANTHROPIC_API_KEY`, every AI feature degrades gracefully to "AI
  unavailable" and no text is ever sent to a model.

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the Next.js dev server                   |
| `npm run build`     | Production build                               |
| `npm test`          | Run the Vitest suite once                      |
| `npm run coverage`  | Run tests with a coverage report               |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | `next lint`                                    |
| `npm run format`    | Prettier (write)                               |
| `npm run verify`    | `typecheck` + `lint` + `test` (the CI gate)    |

## Deploy

Edges is built for Vercel:

1. `vercel link`, then `vercel --prod`.
2. Create a KV / Upstash (Redis) store in the Vercel dashboard and connect it to
   the project — this provisions `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
3. Set `ADMIN_PASSCODE` (and optionally `ANTHROPIC_API_KEY`) as project env vars.
4. Disable Vercel Analytics in project settings (privacy requirement).

**Production requires KV** — the in-memory fallback only works for a single
local process, and serverless functions don't share memory. All required and
optional environment variables are documented in
[`.env.example`](.env.example).

## Architecture

Each facilitation tool is a self-describing **module** split across the
server/client boundary: the server half owns a zod config schema, a role-scoped
`computeView`, and a `handleAction`; the client half owns per-role React
renderers. Sessions are sequences of module phases held in room-scoped
Redis/KV with a 24h TTL. State carries a strictly-increasing revision number,
and clients poll every 2 seconds and reject any response older than the last one
they applied — the guarantee that screens never flash backwards.

The full design — the module contract, the realtime/anti-flash model, storage,
auth, and the AI service — is in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Privacy & ethics

Privacy is a design constraint, not a setting:

- **Off-the-record contract** — no accounts, no PII; handles default to
  Anonymous and an anonymous capture mode strips them from stored submissions.
- **24h TTL** — every room key auto-expires within 24 hours; **End session**
  wipes participants, submissions, content, patterns, votes, and words
  immediately.
- **Submissions are never logged** — AI observability records latency and token
  counts only, never prompt or participant content.
- **Raw contributions are facilitator-only**; participants see curated or
  aggregated output.

See [docs/ai-and-privacy.md](docs/ai-and-privacy.md) for the full model and
[SECURITY.md](SECURITY.md) for the security posture.

## Documentation

User-facing guides live in [`docs/`](docs/):

- [Start here](docs/README.md) — the doc index
- [Admin guide](docs/admin-guide.md) — create rooms, passcodes, theming, reports
- [Facilitator guide](docs/facilitator-guide.md) — run a session from the console
- [Roles & passcodes](docs/roles-and-passcodes.md) — who can do what
- [Module reference](docs/modules.md) — every module, in plain language
- [Templates catalog](docs/templates.md) — the ready-made sessions
- [AI features & privacy](docs/ai-and-privacy.md) — what the AI does, and the privacy model

Contributor docs: [ARCHITECTURE.md](ARCHITECTURE.md) ·
[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) ·
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) — it
covers dev setup, the `verify` gate, the code conventions, and a step-by-step
guide to adding a new module. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please follow responsible disclosure in
[SECURITY.md](SECURITY.md) rather than opening a public issue.

## License

[MIT](LICENSE) © 2026 Black Mountain AI.
