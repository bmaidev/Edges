# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for a
suspected vulnerability.

Email **security@blackmountain.ai** *(placeholder — please confirm the correct
address before publishing this repository)* with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if you have one),
- any affected versions or deployment configurations.

We'll acknowledge your report, keep you updated on progress, and credit you on
request once a fix ships. Please give us reasonable time to remediate before any
public disclosure.

## Supported versions

Edges is pre-1.0 and ships from the default branch. Security fixes are applied
to the latest release on the default branch; older snapshots are not maintained.

| Version        | Supported |
| -------------- | --------- |
| Latest (main)  | ✅        |
| Older          | ❌        |

## Security & privacy posture

Privacy is a design constraint of this platform, not a feature. The relevant
mechanisms (see [ARCHITECTURE.md](ARCHITECTURE.md) and
[docs/ai-and-privacy.md](docs/ai-and-privacy.md) for detail):

- **Passcode role tiers.** Admin, facilitator, and co-host are reached with a
  per-room passcode; the projector is a read-only screen URL; participants join
  by token. Host actions are gated server-side by capability
  (`requireCapability`), and `configure` is admin-only.
- **sha256-hashed passcodes.** Plaintext passcodes are shown **once** at room
  creation and never persisted; only sha256 hashes are stored, and they're
  compared with a timing-safe comparison (`lib/rooms.ts`).
- **Off-the-record contract.** No accounts, no PII; handles default to Anonymous
  and an anonymous capture mode strips the handle from stored submissions. All
  room data carries a **24h TTL**, and **End session** wipes participants,
  submissions, content, patterns, votes, and words immediately.
- **Submissions are never logged.** Server logs never contain prompt or
  participant content; AI observability records latency, model, stop reason, and
  token counts only.
- **AI is gated and content-free.** The AI service is disabled without
  `ANTHROPIC_API_KEY`, so no text leaves the deployment by default. When enabled,
  it has request timeouts and a generation lock to bound cost.
- **Prompt-injection delimiting.** Participant-submitted text sent to the model
  is wrapped as data (`asData()`) and the model is told to treat it as content to
  analyse, never as instructions.

## Known hardening backlog

In the spirit of honesty, current known gaps:

- **No per-endpoint rate limiting yet.** Rooms are passcode-gated and data is
  short-lived, which limits exposure, but there is no request throttling on the
  participant/host APIs. Adding limits is on the backlog.
- **No durable audit log — by design.** There is intentionally no long-lived
  record of who did or said what; the same privacy posture that protects
  participants also means there's no after-the-fact audit trail.

If your deployment has stricter requirements (regulated data, untrusted public
access), add rate limiting and access controls at your edge/proxy layer.
