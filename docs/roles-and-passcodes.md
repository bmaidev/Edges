# Roles & passcodes

The platform has no accounts. Access is by **passcode**, and the passcode you
use determines your **role**. There are four privileged roles plus participants.

## The passcodes

- **Super-admin** — a single platform passcode (the `ADMIN_PASSCODE` env var).
  It opens `/admin`, creates rooms, and acts as **admin** on every room.
- **Per-room passcodes** — when you create a room, it generates **three**
  passcodes: **admin**, **facilitator**, and **co-host**. These are shown
  **once** at creation and stored only as hashes — they can't be recovered. If
  you lose one, create a new room.
- **Projector** — the projector screen (`/r/<room>/screen`) is a read-only view
  and needs no passcode; just open the URL on the shared screen.

## What each role can do

| Capability | Admin | Facilitator | Co-host | Projector | Participant |
|---|:--:|:--:|:--:|:--:|:--:|
| Join, contribute (submit / vote / etc.) | — | — | — | — | ✓ |
| See the live projector view | ✓ | ✓ | ✓ | ✓ | — |
| Advance / jump phases, set timers | ✓ | ✓ | ✓ | — | — |
| Inject content, curate patterns, run AI generate | ✓ | ✓ | ✓ | — | — |
| Pace the read-around | ✓ | ✓ | ✓ | — | — |
| See **raw** submissions (facilitator-only data) | ✓ | ✓ | ✓ | — | — |
| Reassign participants (lens/side) | ✓ | ✓ | — | — | — |
| End / archive the session | ✓ | ✓ | — | — | — |
| Reconfigure the session / launch a custom build | ✓ | — | — | — | — |

In short:

- **Admin** — can do everything, including reconfiguring the session and
  launching a custom sequence from the builder.
- **Facilitator** — runs the room end to end (drive phases, inject, curate, run
  AI, see raw notes, end/archive) but can't reconfigure the session structure or
  launch an arbitrary custom build. (Launching a vetted **template** is fine.)
- **Co-host** — a reduced facilitator: can drive the room (advance, timers,
  inject, curate, AI) but can't end it, reconfigure it, or reassign people.
- **Projector** — read-only big-screen view.
- **Participant** — joins and contributes; never sees other people's raw notes.

> The builder's AI design tools (Suggest / Critique) work with an **admin or
> facilitator** passcode, but **launching** a custom-built session needs the
> **admin** passcode.

## Which URL uses which passcode

| URL | Who | Passcode |
|---|---|---|
| `/admin` | Admin / organiser | Super-admin (`ADMIN_PASSCODE`) |
| `/r/<room>` | Participants | none (just a handle) |
| `/r/<room>/host` | Facilitator / co-host | the room's facilitator or co-host code (admin also works) |
| `/r/<room>/screen` | The projector | none (read-only) |
| `/r/<room>/build` | Admin | the room's admin code (to launch) |

All passwords are compared in constant time and stored only as SHA-256 hashes;
plaintext is shown once at creation and never persisted.
