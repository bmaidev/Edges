# Self-hosting Edges

Edges is an always-free, multi-org facilitation platform you can run yourself —
on Vercel (one click) or anywhere that runs a Node container (Docker). This guide
is the operator reference: the environment, the two deploy paths, and how to
verify your instance.

## What you need

| Thing | Why | Required? |
|---|---|---|
| A **KV / Redis** store (Vercel KV or Upstash) | durable + live session state | **Yes** in production |
| **`ADMIN_PASSCODE`** | the super-admin who creates workspaces + reaches `/admin` | **Yes** |
| **`ANTHROPIC_API_KEY`** | the AI baseline (modules, synthesis, reports, design help) | Optional |
| **`EDGES_SECRET_KEY`** | encrypts each workspace's bring-your-own Anthropic key at rest | Optional |
| **`SIGNUP_OPEN` / `SIGNUP_CODE`** | open self-service workspace sign-up at `/start` | Optional |
| **`BLOB_READ_WRITE_TOKEN`** | logo **uploads** (otherwise paste a logo URL) | Optional |

`.env.example` in the repo root is the authoritative, annotated list of every
variable the code reads.

## Environment reference

- **`ADMIN_PASSCODE`** — the bootstrap super-admin. Creates/erases workspaces,
  acts as admin in any room. Per-room and per-member passcodes are generated at
  creation, never env vars.
- **`KV_REST_API_URL` / `KV_REST_API_TOKEN`** *(or* `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN`*)* — the datastore. Set **either** pair. Without it,
  an in-memory store is used (dev only — single process, resets on restart).
- **`ANTHROPIC_API_KEY`** — the baseline key that keeps AI available for keyless
  workspaces. A workspace owner can set **their own** key in `/admin` → it routes
  + bills that workspace's AI through their own Anthropic account (their DPA).
- **`EDGES_SECRET_KEY`** — a 16+ char master secret (AES-256-GCM). Required to let
  workspaces store a BYO key; if unset, BYO is disabled and nothing is stored
  unprotected. Generate: `openssl rand -hex 32`.
- **`SIGNUP_OPEN=true`** → anyone can create a workspace at `/start`; else
  **`SIGNUP_CODE=<secret>`** → gated by a shared community code; else **closed**
  (only the super-admin mints workspaces).
- **`BLOB_READ_WRITE_TOKEN`** — Vercel Blob for logo uploads. Not available off
  Vercel; use logo-by-URL there.

## Deploy on Vercel

1. **Deploy with Vercel** button in the README (prompts for KV + env), or
   `vercel link && vercel --prod`.
2. Connect a KV / Upstash store in the dashboard (provisions the `KV_REST_API_*`
   pair).
3. Set the env vars above.
4. Disable Vercel Analytics (privacy requirement).

## Deploy with Docker

The image is a standard Next.js standalone build. A `docker compose up` brings up
the app **plus** a self-contained Upstash-REST-compatible store, so you need
nothing external:

```bash
cp .env.example .env            # set ADMIN_PASSCODE (+ optional keys)
docker compose up --build       # app on http://localhost:3000
```

`docker-compose.yml` runs a local `redis` + an Upstash-REST shim and points the
app at it. To use **hosted Upstash** instead, drop those services and set
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in `.env`.

Note: Vercel Blob (logo **upload**) isn't available off Vercel — set a logo by
URL in the theme panel instead. Everything else works identically.

## Verify your instance

- **`GET /api/health`** → `{ "ok": true, "storage": true }` — for uptime monitors
  (public, no secrets).
- Sign in to **`/admin`** as the super-admin → the **Instance setup** panel shows
  a green/grey checklist (datastore, super-admin, AI baseline, BYO-key encryption,
  logo uploads, signup mode) with a hint for anything not yet enabled.

## Running a community instance

To let people self-onboard, set `SIGNUP_OPEN=true` (fully open) or
`SIGNUP_CODE=<shared password>` (community-gated). Newcomers create a workspace at
`/start` and get a bookmarkable sign-in link. Keep it **closed** (the default) if
you'd rather mint each workspace yourself from `/admin`.
