# Facilitator guide

This is how you run a session from the host console. You need a room's
**facilitator** (or **co-host**, or **admin**) passcode — someone in your
workspace creates the room and shares the host link + code with you (see the
[Admin guide](admin-guide.md)). You don't need the admin console to run a room;
the host URL and your passcode are enough.

## 1. Log in

Open **`/r/<room>/host`** and enter your passcode. (You'll briefly see
"Checking…" while it verifies — that's normal. A genuinely wrong code says so.)

## 2. Pick what to run

If no session is running yet, you'll see the **session picker**:

- **Research-grounded templates** — ~21 one-tap sessions (pre-mortem, 1-2-4-All,
  World Café, idea marketplace, AI red-team, and more), each a complete sequence
  you can run as-is. See the [Templates catalog](templates.md).
- **+ Build a custom session** — opens the builder (room-admin code needed to
  launch).

Tap a template and it loads into the room.

## 3. The console, top to bottom

**Header** — your bearings: session name · *phase X of Y* · the current phase's
label · how many have joined · the **timer**. Timer buttons (start the phase's
preset, +1:00, +5:00, Clear) live here.

**Phase timeline** — a clickable row of every phase in the session. The current
one is highlighted; done ones are dimmed. **Jump** to any phase by tapping it, or
use **←** / **Advance →** to step. (Navigation is instant — the console refreshes
right after each action.)

**Tabs** — the work area, so you're not scrolling a wall:

- **Run** — the controls for the *current* phase only: AI "generate" buttons,
  live results, allocation/read-around/submission panels as relevant. If a phase
  is display-only it tells you so.
- **What they see** — a live, read-only preview of the participant phone view
  **and** the projector view for this phase. Never guess what's on their screens.
- **Content** — inject content into the room (push now, queue for the next
  phase, or hold privately); load a starter library.
- **Patterns** — curate named patterns from submissions (manually, or with AI
  "Suggest patterns").
- **Session** — download an export, **Archive** (save a report + wipe), or **End**
  (wipe). *(Co-hosts don't see End/Archive.)*

## 4. Running it

1. **Advance** through phases on the timeline as the conversation moves. Start a
   **timer** when you want a countdown (participants see it and hear a soft chime
   when it ends).
2. On capture/voting phases, watch **Run** (live results) or **What they see**.
   Raw submissions are yours alone — participants only ever see curated or
   aggregated output.
3. For **AI** phases (devil's-advocate, synthesis, persona, etc.) you press
   **Generate** / **Run** / **Build** when ready — AI never fires on its own.
   With live synthesis you **review** privately, then **Promote** it to the room.
   (AI needs an API key; without one those buttons say "AI unavailable" and
   everything else still works.) See [AI features](ai-and-privacy.md).
4. **Inject** content any time from the Content tab — a constraint, a case, a
   prompt. Participants get a gentle "the facilitator just added something" pulse.
5. When you're done, go to **Session → Archive** to save a report and wipe the
   live data (or **End** to just wipe).

## Designing a custom session

Open **`/r/<room>/build`** (you'll need the room's **admin** passcode to
*launch*; the AI design tools work with the admin or facilitator code):

- **✨ Suggest a session** — type your goal ("45 min, 12 people, decide between
  three options and leave with owners") and the AI proposes a full sequence of
  real modules with sensible settings, which you can then edit.
- **Start from a template** — load any template's phases as a starting point.
- **Add a module** — pick from the categorised palette; each phase shows its
  required/optional settings and validates as you edit.
- **🔍 Critique this design** — the AI flags problems (no convergence step, a
  dangling reference, pacing) before you run it.
- **Launch into room** — pushes the sequence live.

## Tips

- **Co-host?** You can drive everything except ending, reconfiguring, and
  reassigning — those stay with the lead facilitator.
- **Phones reconnect automatically.** If the network blips, participants see a
  quiet "Reconnecting…" strip; their last screen stays put.
- See the [Module reference](modules.md) for exactly what each tool does.
