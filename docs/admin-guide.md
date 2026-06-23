# Admin guide

The admin portal (`/admin`) is where you create and manage rooms. You need the
super-admin passcode (`ADMIN_PASSCODE`).

## 1. Open the portal

Go to **`/admin`** and enter the super-admin passcode. (The site root `/`
redirects here.)

## 2. Create a room

In **New room**, give it a name and an optional **topic**, then **Create room**.

The topic matters: it grounds the AI features (cluster assist, devil's-advocate,
synthesis, the session report, the design assistant) in *your* subject rather
than a generic one. Set it if you can.

You'll immediately get a one-time panel with:

- **Three passcodes** — `admin`, `facilitator`, `co-host`.
- **Three URLs** — Join (`/r/<room>`), Host (`/r/<room>/host`), Screen
  (`/r/<room>/screen`).

> **Save these now.** Passcodes are shown once and stored only as hashes — they
> cannot be recovered. Use **Copy all** to grab everything. If you lose a code,
> just create a new room. See [Roles & passcodes](roles-and-passcodes.md) for
> who should get which code.

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

## 5. After the session: reports

When the facilitator **archives** a session, its live data is wiped and a
snapshot is saved. Open the room's **report** panel in `/admin` to see it:

- Session name · participants · submission count.
- If an AI key is configured, an **AI session report**: a short summary, the
  themes, the unresolved tensions, any decisions, and next steps — synthesised
  from all of that session's contributions.
- The facilitator's curated **patterns**.

If no AI key was set when the session was archived, you'll see the data snapshot
without the AI synthesis.

## Notes

- **Privacy:** raw submissions are never shown to participants; everything
  carries a 24-hour TTL; archiving/ending wipes the live data immediately. Full
  model in [AI features & privacy](ai-and-privacy.md).
- **Building custom sessions:** facilitators usually pick a
  [template](templates.md), but you (admin) can compose a bespoke sequence in the
  builder at `/r/<room>/build` — including letting the AI **suggest** one from a
  goal. See the [Facilitator guide](facilitator-guide.md#designing-a-custom-session).
