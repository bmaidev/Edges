# Production operations

This is the release and incident runbook for an Edges deployment. It deliberately
uses content-free checks: participant submissions, prompts, and handles must not
enter logs, traces, tickets, load-test output, or monitoring labels.

## Production gates

Before promoting a release:

1. Deploy the exact commit to a staging environment that uses the same Redis/KV,
   realtime, Blob, and AI configuration as production.
2. Run `npm ci`, `npm run verify`, and `npm run build`. `verify` includes the
   high-severity production dependency audit.
3. Confirm `GET /api/health/live` returns 200 and `GET /api/health` returns 200
   with `ok`, `storage`, and `storageConfigured` all `true`.
4. Use a disposable room for a facilitator rehearsal: join, reconnect, advance,
   co-host collision, projector loss/recovery, archive, report, and room deletion.
5. Run the content-free capacity smoke test against that room:

   ```bash
   npm run load:smoke -- --base-url https://staging.example --room disposable-room --clients 100 --seconds 60
   ```

   It fails above 1% errors or 1.5 seconds p95 by default. Increase clients in
   steps to the intended room size and keep the output with the release record.
   Set `EDGES_LOAD_CODE` only when testing the privileged state path; do not put a
   passcode in command-line arguments or shared logs.
6. Complete the supported browser/device and facilitator UI review before calling
   a release ready for live master-facilitator use.

The smoke test is API-level and intentionally not a substitute for the deferred
browser/UI acceptance work.

## Monitoring and alerts

- Use `/api/health/live` for process liveness. A failure may trigger a restart.
- Use `/api/health` for readiness. A 503 means the deployment must receive no
  workshop traffic; in production, the app also fails closed when durable storage
  is missing.
- Alert on sustained 429s, 5xx responses, readiness failures, Redis latency, and
  p95 `/state` latency. Monitor aggregate counts only—never request bodies or full
  URLs containing historical credentials.
- Treat realtime as an accelerator. A Pusher outage should increase update delay,
  not break correctness; polling remains the source of truth.

## Privacy operations

- Configure proxy, CDN, application, and AI-provider logs to exclude bodies and
  authentication headers. Do not enable session replay or third-party analytics.
- Do not retain whole-Redis snapshots for longer than the 24-hour live-data
  contract. If backups are required, use a key-filtered process that excludes
  `room:*` live-session keys and validate deletion behavior with the provider.
- Presenter uploads are tracked and deleted on End/Archive; also configure Blob
  lifecycle cleanup as defense in depth for failed or interrupted deletions.
- Use a provider DPA and verify regional storage, backup, and deletion terms before
  workshops involving confidential or regulated material.
- Rotate any legacy workspace/member capability created before the 128-bit code
  release. New codes contain 128 bits of cryptographic randomness.

## Incident response

1. Stop new traffic or mark the deployment unavailable if confidentiality,
   authorization, or state integrity may be affected.
2. Preserve content-free infrastructure evidence only. Do not copy participant
   text into an incident system.
3. Rotate `ADMIN_PASSCODE`, workspace/member codes, affected room codes, Pusher,
   Blob, Redis, AI, and encryption credentials as applicable. Revoking a member
   and regenerating room codes invalidates the corresponding capability.
4. End or delete affected rooms to wipe live state and tracked uploads.
5. Confirm readiness, run the non-E2E release gates, and rehearse a disposable
   room before reopening.
6. Notify affected operators under the deployment's legal and contractual
   obligations, without exposing participant content in the notice.

## Recovery

Redis/KV is required in production. Test provider restore procedures in staging,
but remember that a whole-store restore can resurrect live data that should have
expired. Restore only durable, content-free workspace records where possible, and
re-run the retention check immediately afterward.
