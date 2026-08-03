# Roles & passcodes

Edges has **no participant accounts** and no passwords to remember. Access works
on two levels, and it's worth holding them apart in your head:

1. **Your workspace** — who can get into the `/admin` console and manage rooms.
2. **A single room** — who can do what once a live session is running.

This page explains both, then lists which URL needs which key.

---

## Level 1 — your workspace (the console)

A **workspace** is your space: your rooms, your branding, your people, your
reports. You get into it with a **sign-in link**, not a typed password. The link
looks like `…/admin#k=XXXX` — the browser does not include the fragment in the
HTTP URL; Edges reads and scrubs it, then authenticates with a request header.
**The link is the key.**

Inside a workspace there are two roles:

- **Owner** — full control. Creates and runs rooms, **invites and removes
  members**, sets the workspace's own AI key, brands rooms, reads reports, and can
  erase the whole workspace. The person who creates a workspace at `/start` is its
  first owner.
- **Member** — creates and runs rooms, brands them, and reads reports, but can't
  manage other people, change the workspace AI key, or delete the workspace.

Everyone in a workspace **shares the same rooms**, so two facilitators can
tag-team the same event. Each room is stamped with who created it.

> **Super-admin (the instance operator).** Whoever runs the Edges instance holds
> a platform-level passcode (the `ADMIN_PASSCODE` setting). They own the default
> workspace, can mint new workspaces and hand each one's sign-in link to an org,
> and can check the instance's setup status. If you're just running workshops,
> you'll never touch this — you live entirely inside your own workspace.

---

## Level 2 — inside a single room

When you create a room it generates **three room passcodes**, shown **once** and
stored only as hashes (they can't be recovered — if you lose one, make a new
room). These set what someone can do in the _live_ session:

- **Room admin** — can do everything in the room, including reconfiguring the
  session and launching a custom sequence from the builder.
- **Facilitator** — runs and designs the room end to end (drive phases, inject
  content, curate patterns, run AI, see raw notes, configure, and end/archive).
  Workspace membership, keys, and other rooms remain owner/admin concerns.
- **Co-host** — a reduced facilitator: can drive the room (advance, timers,
  inject, curate, AI) but can't end it, reconfigure it, or reassign people.
- **Projector** — the read-only big-screen view (`/r/<room>/screen`). Needs **no
  passcode**; just open the URL on the shared screen.
- **Participant** — joins with the room link and a handle (no passcode). Most
  phases show only their own input or aggregates; methods that intentionally
  rotate/share a note say so in the phase instructions.

### What each room role can do

| Capability                                       | Room admin | Facilitator | Co-host | Projector | Participant |
| ------------------------------------------------ | :--------: | :---------: | :-----: | :-------: | :---------: |
| Join, contribute (submit / vote / etc.)          |     —      |      —      |    —    |     —     |      ✓      |
| See the live projector view                      |     ✓      |      ✓      |    ✓    |     ✓     |      —      |
| Advance / jump phases, set timers                |     ✓      |      ✓      |    ✓    |     —     |      —      |
| Inject content, curate patterns, run AI generate |     ✓      |      ✓      |    ✓    |     —     |      —      |
| Pace the read-around                             |     ✓      |      ✓      |    ✓    |     —     |      —      |
| See **raw** submissions (facilitator-only data)  |     ✓      |      ✓      |    ✓    |     —     |      —      |
| Reassign participants (lens/side)                |     ✓      |      ✓      |    —    |     —     |      —      |
| End / archive the session                        |     ✓      |      ✓      |    —    |     —     |      —      |
| Reconfigure the session / launch a custom build  |     ✓      |      ✓      |    —    |     —     |      —      |

> The builder's AI design tools (Suggest / Critique) work with a **room admin or
> facilitator** passcode; both can launch a custom-built session in that room.

---

## Which URL uses which key

| URL                    | Who                          | Key                                                            |
| ---------------------- | ---------------------------- | -------------------------------------------------------------- |
| `/start`               | Anyone creating a workspace  | the instance sign-up code (if required)                        |
| `/admin`               | You, managing your workspace | your **sign-in link** (`/admin#k=…`)                           |
| `/r/<room>`            | Participants                 | none (just a handle)                                           |
| `/r/<room>/facilitate` | Facilitator / co-host        | the room's facilitator or co-host code (room admin also works) |
| `/r/<room>/host`       | Legacy facilitator link      | compatibility alias for the same Facilitator portal            |
| `/r/<room>/screen`     | The projector                | none (read-only)                                               |
| `/r/<room>/build`      | Facilitator / room admin     | the remembered facilitator or room-admin key                   |

Generated passcodes contain 128 bits of cryptographic randomness. They are
compared in constant time and stored only as SHA-256 hashes; plaintext is shown
once at creation and never persisted. The same is true of the code inside a
sign-in link.
