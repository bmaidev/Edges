# Admin guide

Your **workspace** is your own space on Edges — your rooms, your branding, your
teammates, your reports. The admin console (`/admin`) is where you run it. This
guide gets you from "I have a link" to "the room is live".

## 1. Get into your workspace

There are two ways in, depending on how you arrived:

- **You're starting fresh.** Go to **`/start`**, give your workspace a name
  (your own name, a team, or an org like "ANU School of Applied Cybernetics"),
  and — if the instance asks for one — paste the **sign-up code** you were given.
  You'll get a private **sign-in link** to bookmark. That link *is* your key.
- **Someone set one up for you.** They'll send you a **sign-in link** that looks
  like `…/admin#k=XXXX`. Click it once and **bookmark it**. You're in.

> **Your sign-in link is your password.** The code rides in the part of the URL
> after the `#`, which your browser never sends to any server — so it stays
> private. Bookmark the link; if you ever lose it, an owner of your workspace can
> issue a new one (or you can start a fresh workspace). There's nothing to
> "recover" — keep the bookmark safe and you never think about it again.

Already signed in on this device? `/admin` just opens — no re-entry.

> **New to Edges entirely?** The fastest way to *get* it is the **sample room &
> 5-minute tour** — see the section near the end of this guide. It spins up a
> safe demo you can't break and walks you through driving a live session.

## 2. Create a room

In **New room**, give it a name and an optional **topic**, then **Create room**.

The topic matters: it grounds the AI features (cluster assist, devil's-advocate,
synthesis, the session report, the design assistant) in *your* subject rather
than a generic one. Set it if you can.

You'll immediately get a one-time panel with:

- **Three room passcodes** — `admin`, `facilitator`, `co-host`.
- **Three URLs** — Join (`/r/<room>`), Host (`/r/<room>/host`), Screen
  (`/r/<room>/screen`).

> **Save these now.** Room passcodes are shown once and stored only as hashes —
> they cannot be recovered. Use **Copy all** to grab everything. If you lose a
> code, just create a new room. See [Roles & passcodes](roles-and-passcodes.md)
> for who should get which code.

Rooms are **shared across your workspace** — anyone you invite (see step 5) sees
the same rooms list and can help run them. Each room is stamped with who created
it.

## 3. Share access — and the join QR

Participants need **no passcode** — just the room link and a handle (which
defaults to Anonymous, so it's effectively one tap). The smoothest way to get a
room of people in:

- The create-room panel shows a **scan-to-join QR** and a **Door QR** URL
  (`/r/<room>/qr`) — a full-screen QR you can throw on a screen or print for the
  door. People scan, pick a name (or stay anonymous), and they're in.
- The **projector lobby** (`/r/<room>/screen`) also shows the join QR
  automatically while the room is gathering / between phases.
- Give your **facilitator** the facilitator passcode + Host URL; a **co-host**
  gets the co-host passcode.

## 4. Theme & brand the room (incl. the QR / lobby)

Each room card has a **theme** panel:

- **Colours** — set the palette (background, cards, highlight, secondary text,
  lines). Every view under the room, including the QR and projector, picks it up.
- **Join-screen branding** — add a **logo URL**, a big **headline** (e.g.
  "Welcome, beautiful nerds 🛸"), and a **tagline / surprise line**. These show on
  the projector lobby and the `/r/<room>/qr` door page — a chance to greet people
  with something they won't expect as they walk in.

Use **Preview the QR / lobby page** to see it, then **Save theme & branding**.

## 5. Invite your teammates (optional)

If you'll run sessions with others, add them as **members** so they have their
own way in. In the **Members** panel (workspace owners only):

- Add a person by name and pick a **role** — **owner** (full control, can invite
  others and manage the workspace) or **member** (can create and run rooms).
- Each gets their **own sign-in link** to bookmark. Revoke anyone's access at any
  time; their link stops working immediately.

Everyone in the workspace shares the same rooms, so two facilitators can tag-team
the same event. See [Roles & passcodes](roles-and-passcodes.md) for the full
breakdown of workspace roles vs. room roles.

## 6. Use your own AI key (optional)

The AI features run on an Anthropic API key. The instance may already have one
set, in which case AI just works. If you'd rather **bring your own** — so AI
usage bills to your account — open the **AI key** panel (owners only) and paste
your key. It's **encrypted at rest** and never shown back to you. Remove it any
time to fall back to the instance default. No key anywhere? Everything still
works; the AI buttons simply read "AI unavailable". See
[AI features & privacy](ai-and-privacy.md).

## 7. After the session: reports

When the facilitator **archives** a session, its live data is wiped and a
snapshot is saved. Open the room's **report** panel in `/admin` to see it:

- Session name · participants · submission count.
- If an AI key is configured, an **AI session report**: a short summary, the
  themes, the unresolved tensions, any decisions, and next steps — synthesised
  from all of that session's contributions.
- The facilitator's curated **patterns**.

If no AI key was set when the session was archived, you'll see the data snapshot
without the AI synthesis.

## Sample room & the 5-minute tour

The fastest way to understand Edges is to drive a workshop that's already
mid-flight. From `/admin`:

- A pinned **DEMO** card sits at the top of the rooms list: a `sample-demo` room
  seeded with **seven fake participants**, real messy ideas, pre-clustered
  patterns, and a running timer — landed mid read-around.
- **open host** drops you straight into a live-looking host console (no extra
  passcode). Press **Advance** to move the room, open **What they see** to watch
  the participant view, and try **Content** and **Patterns**.
- **open screen** shows the projector view.
- **reset sample** re-seeds it from scratch (and rotates its passcodes).

A short **guided tour** (the *Start tour* / *Replay tour* link in the header)
points at each of these in turn. It never blocks the UI — the real buttons stay
clickable the whole time.

**It's safe to break.** Everything in the sample is fake. The best beat is the
last one: press **End session** and watch every participant, submission, pattern
and note vanish — that's the off-the-record contract, felt rather than read.

Privacy notes for the sample:

- Sample passcodes are **generated randomly each time you seed** and shown only
  once — never committed to the codebase.
- The only durable trace is a tiny non-PII "you've seen the tour" flag, keyed by
  a hash of your sign-in code so the first-run nudge doesn't re-appear. Deleting
  the `sample-demo` room and that flag removes the feature entirely.

## Notes

- **Privacy:** raw submissions are never shown to participants; everything
  carries a 24-hour TTL; archiving/ending wipes the live data immediately. Full
  model in [AI features & privacy](ai-and-privacy.md).
- **Building custom sessions:** facilitators usually pick a
  [template](templates.md), but a workspace owner can compose a bespoke sequence
  in the builder at `/r/<room>/build` — including letting the AI **suggest** one
  from a goal. See the
  [Facilitator guide](facilitator-guide.md#designing-a-custom-session).
- **Closing a workspace:** an owner can permanently erase a whole workspace — all
  its rooms, reports, analytics, designs and members — from the **Manage
  workspaces** panel (typed-name confirmation, can't be undone).
