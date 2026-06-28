# Module reference

This is a guide to every building block you can put in a session, written for facilitators and admins.

## What a module is

A **module** is a single facilitation tool or phase — one thing the room does at one time (a poll, a capture box, a discussion format, an AI step). A **session** is just a sequence of modules: you line them up in the builder and advance through them live, one at a time.

Each module has **per-role visibility**. The four roles are **participant**, **facilitator**, **cohost**, and **projector** (the shared screen). A module can be shown to some roles and hidden from others — for example, an analytics module is shown to the facilitator but hidden from participants and the projector. (The **admin** role always sees whatever the facilitator sees.) Every module ships with sensible defaults, which you can change.

Settings below use the exact field names from the module's configuration so they match what you'll see in the builder.

### A note on AI modules

Some modules use Claude to generate content (objections, summaries, personas, prototypes, and so on). These are marked **Needs AI key** below. They only work if an Anthropic API key is configured for the platform. For every AI module, the AI runs **only when the facilitator (or cohost) taps the generate button** — it never runs automatically, and participants can never trigger it.

### Modules that read an earlier phase

Several modules don't collect anything themselves — they work on what the room produced in an **earlier** phase. You point them at that phase using a **sourcePhaseId** setting (the id of an earlier module, usually a capture). The modules that do this are: **Idea marketplace**, **Redistribute**, **Devil's advocate**, **Tension map**, **Persona panel**, **Issue map**, **Prototype builder**, and **Synthesis**. For **Synthesis** and **Issue map** the source phase is optional — leave it blank and they work across *all* submissions in the session.

---

## Structure

Framing and pacing modules — no data collection.

### Lobby
A holding screen shown before the session starts. Participants see a waiting message; the facilitator keeps it on the projector until they're ready to begin.

- **What participants do:** Wait. They see an optional welcome message.
- **Facilitator / projector:** The lobby is projectable; participants and the projector see it, the facilitator's own controls are hidden by default.
- **Key settings:**
  - `label` — the phase name in the builder.
  - `message` — optional text shown to the room while waiting.

### Content display
Read-only material the facilitator pushes to the room (cases, prompts, notes, etc.).

- **What participants do:** Read. Nothing to submit.
- **Facilitator / projector:** Visible to everyone, including the projector. New items pulse in as they're added.
- **Key settings:**
  - `label` — phase name.
  - `contentHeading` — optional heading above the material.
  - `showContentTypes` — optionally limit to certain content types (`case`, `lens`, `prompt`, `argument`, `note`).

### Presentation
A simple slide-and-video deck on the room screen, advanced by the facilitator — for showing slides (PDF/images) or videos between activities.

- **What participants do:** Watch the current slide/video (the same one that's on the projector). Nothing to submit.
- **Facilitator / projector:** Facilitator loads and reorders the deck live and steps through it; the projector shows the current card large. PowerPoint/Keynote/PDF decks are converted to page images in your browser at upload time, so the projector only ever shows a plain image or an embedded video — playback is bulletproof.
- **Key settings:**
  - `label` — phase name.
  - `cards` — the deck (built in the console by uploading files or pasting image/video URLs); can also be loaded and reordered live.

### Break
A calm "we're on a break" or "we'll resume shortly" holding screen, with optional breathing or countdown scenes. Unlike other modules you don't place it in a sequence — the facilitator **summons it live** at any point to pause the room.

- **What participants do:** See a calm break/hold screen (and a countdown clock if a timer is running). Nothing to submit.
- **Facilitator / projector:** The facilitator drops the room into a break and lifts it when ready. Projectable; everyone sees the same calm screen.
- **Key settings:**
  - `kind` — `break` or `hold`.
  - `scene` — the look: `break`, `hold`, `breathe`, `countdown`, or `cuecard`.
  - `note` — an optional line of copy on the screen.

### Close
An end-of-session message, with a recap of each person's own contributions.

- **What participants do:** Read the closing message and see a list of everything they personally contributed during the session.
- **Facilitator / projector:** Visible to everyone, projectable.
- **Key settings:**
  - `label` — phase name.

---

## Capture & surface

Collecting input and bringing it back into the room.

### Capture
A mic-and-textarea box that collects short text submissions — the workhorse capture step.

- **What participants do:** Type or dictate a response to a prompt (optionally a second prompt too). Can be set to allow multiple submissions.
- **Facilitator / projector:** Shown to the facilitator and cohost; hidden from the projector by default. The facilitator can drop a live "constraint" onto the room mid-phase if a constraint deck is configured.
- **Key settings:**
  - `label`, `prompt` — the main question. `prompt2` adds a second question; `placeholder` / `placeholder2` set the input hint text.
  - `multiSubmit` — allow each person to submit more than once.
  - `timerSeconds` — optional countdown.
  - `tagWith` — tag each submission by the person's `lens` or `side`.
  - `anonymity` — `named` or `anonymous` (anonymous strips the handle so even the facilitator can't see who said what).
  - `constraintDeck` — a list of constraints the facilitator can inject live.
  - `contentHeading` / `showContentTypes` — optionally show reference material alongside the box.

### Pre-work jam
Asynchronous, anonymous pre-session divergence — people add ideas in their own time before you meet.

- **What participants do:** Write or dictate ideas whenever it suits them, see "Saved — add more any time", and review a running list of their *own* prior contributions to build on.
- **Facilitator / projector:** See anonymous aggregate progress only ("N people have contributed M ideas") — never the raw text. Projectable.
- **Key settings:**
  - `label`, `prompt` — the question.
  - `placeholder` — input hint.
  - `brief` — a longer framing note explaining the pre-work.
  - `multiSubmit` — allow multiple ideas (on by default).

### Actions
"Yours-first" commitments capture — the closing move of a good session. Everyone leaves with something concrete *they'll* do.

- **What participants do:** Capture their own short action items and see them listed back, theirs first — a personal to-do list, not a shared feed. They see only their own items, plus a soft anonymous "N people, M commitments" momentum signal.
- **Facilitator / projector:** The facilitator and cohost see the full list (owner + text) for follow-up. The projector shows **counts only** — commitments never go on the big screen verbatim.
- **Key settings:**
  - `label`, `prompt` — the commitment prompt (default: "What's one thing you'll do differently?").
  - `maxLen` — character limit per item (default 200).
  - `maxItems` — how many items each person may capture (default 5).
  - `askOwner` — ask who'll own each action (defaults to the author's handle, editable).

### Read-around
The facilitator paces through submissions or detected patterns, one at a time, live to the room.

- **What participants do:** Watch as items are surfaced one by one.
- **Facilitator / projector:** Visible to everyone and projectable. The facilitator steps forward/back through the list.
- **Key settings:**
  - `label`.
  - `readaround.source` — `submissions` or `patterns`.
  - `readaround.sourcePhaseId` — which earlier phase's submissions to read from (when source is `submissions`).

---

## Group & dialogue

Forming groups and running discussion formats.

### Self-allocation
Participants claim a lens or a side; live counts with an optional cap.

- **What participants do:** Pick one option from a list (e.g. a side or a perspective). See live counts.
- **Facilitator / projector:** Visible to facilitator/cohost; projectable for showing the live tally. Hidden from projector by default.
- **Key settings:**
  - `label`.
  - `allocate.kind` — `lens` or `side`.
  - `allocate.header` — the instruction shown.
  - `allocate.fixedOptions` — a fixed list of choices, **or** `allocate.optionsFromContentType` to build options from content items of a type.
  - `allocate.cap` — optional maximum number of people per option.

### Coordinator
Tells each person who their pair or triad is.

- **What participants do:** See a personal message naming their partner (pair) or their group members (lens-triad).
- **Facilitator / projector:** Shown to facilitator/cohost; not projectable (the message is personalised).
- **Key settings:**
  - `label`.
  - `coordinator.kind` — `pair` or `lens-triad`.
  - `coordinator.message` — the message template; `[PARTNER]`, `[LENS]`, and `[MEMBERS]` are filled in per person.

### 1-2-4-All
The canonical Liberating Structure: the same question worked alone, then in pairs, then in fours, then by the whole group.

- **What participants do:** Work the same question at four widening scales. They see the current stage ("Think alone" → "Compare in pairs" → "Combine into fours" → "Whole-group share"), who they're with, and (optionally) a box to capture the group's combined answer.
- **Facilitator / projector:** Facilitator advances through the four stages with "Next step →". Projector shows the current stage with a 1→2→4→All progress line.
- **Key settings:**
  - `label`, `prompt` — the question.
  - `captureShared` — let groups record their combined answer (on by default).

### World Café
Fixed tables each with a persistent host; everyone else moves to a new table each round, cross-pollinating ideas.

- **What participants do:** Each round, see "Go to Table K", the host's name, and tablemates, all working one shared question. Hosts get a "stay and welcome travellers" panel. With notes on, anyone can record the table's shared insight.
- **Facilitator / projector:** Facilitator drives rounds with "Next round →" and sees the table overview. Projector shows the live table map.
- **Key settings:**
  - `label`, `prompt` — the shared question.
  - `tables` — number of tables (defaults to roughly one per four people).
  - `captureNotes` — allow capturing table insights (on by default).

### Stations
Shift & Share: intact small groups tour a set of named stations, one round per station.

- **What participants do:** Stay in their group and rotate through stations. See "Round N of M — your group is at [Station]", their groupmates, and an optional notes box.
- **Facilitator / projector:** Facilitator advances with "Next round →". Projector and facilitator see the full rotation map (which group is at which station).
- **Key settings:**
  - `label`.
  - `stations` — the list of station names.
  - `groupSize` — people per group (default 3).
  - `captureNotes` — allow station notes (off by default).
  - `prompt` — instruction shown at each station.

### Consult
Troika / Wise Crowds peer consulting: fixed small groups take turns as the "client" who goes silent while consultants advise.

- **What participants do:** Are auto-grouped into trios. Each round one person is the client (presents a challenge, then goes "listen only" with input disabled during the silent sub-phase); the rest are consultants who submit advice by voice or text.
- **Facilitator / projector:** Facilitator toggles the client-silent sub-phase and advances rounds. Projector shows the round number, each group's role map (client + consultants), and advice counts.
- **Key settings:**
  - `label`, `prompt` — the challenge framing.
  - `format` — `troika` or `wisecrowds`.
  - `phaseSeconds.present` and `phaseSeconds.advise` — timing for the present and advise sub-phases.

### Fishbowl
An open fishbowl with the empty chair — a self-facilitating discussion. Take the empty seat to speak; a current speaker then steps out.

- **What participants do:** See a circle of inner seats with one highlighted empty chair. Tap "Take the empty seat" to join (a current speaker steps out) or "Leave the circle" if seated. Those outside can submit short question cards.
- **Facilitator / projector:** Projector mirrors the circle large plus a live feed of questions. Speakers appear anonymised as "Speaker 1…N" to participants and the projector — only facilitator/cohost/admin see real handles.
- **Key settings:**
  - `label`.
  - `innerSeats` — number of seats in the inner circle (at least 2).
  - `mode` — `open` or `closed`.
  - `allowQuestions` — let outer-circle participants submit questions (on by default).

### Open Space
A participant-built agenda: people propose topics, others sign up, and the facilitator places them into a time × space grid.

- **What participants do:** Propose discussion topics, see the live list with signup counts, and Join/Leave any topic freely. Once a topic is placed, they're told which space and slot to go to.
- **Facilitator / projector:** Facilitator gets a console listing topics by popularity with slot/space dropdowns and Place/Unplace buttons. Projector shows the full time (slots) × space (columns) grid plus a "not yet placed" list.
- **Key settings:**
  - `label`.
  - `slots` — number of time slots.
  - `spaces` — the list of named spaces/rooms.

---

## Vote & prioritise

Decision and prioritisation tools, with live results.

### Poll
Single or multiple choice over a fixed set of options, with live results.

- **What participants do:** Choose one option (or several, if multi). See results.
- **Facilitator / projector:** Visible to everyone, projectable. Results can be live or held back until you advance.
- **Key settings:**
  - `label`, `question`.
  - `options` — the choices (at least 2).
  - `multi` — allow choosing more than one.
  - `reveal` — `live` (everyone sees results immediately) or `onAdvance` (participants see results only after you move on; facilitator always sees them).

### Dot voting
Spend a budget of dots across options to prioritise.

- **What participants do:** Distribute a fixed number of dots across options using +/− steppers; see how many dots they have left.
- **Facilitator / projector:** Visible to everyone, projectable, live totals.
- **Key settings:**
  - `label`, `prompt`.
  - `options` — the choices (at least 2).
  - `dots` — how many dots each person gets.

### Ranking
Drag items into priority order; aggregated by Borda count.

- **What participants do:** Drag a list of items into their preferred order.
- **Facilitator / projector:** Visible to everyone, projectable. Shows the aggregated ranking (top items get more points).
- **Key settings:**
  - `label`, `prompt`.
  - `items` — the things to rank (at least 2).

### Scale
Rate one or more statements on a numeric scale; shows the mean.

- **What participants do:** Move a slider for each statement.
- **Facilitator / projector:** Visible to everyone, projectable. Shows the mean and response count per statement.
- **Key settings:**
  - `label`.
  - `statements` — the statements to rate (at least 1).
  - `min` / `max` — the scale range (default 1–5).
  - `labels` — optional text labels for the two ends.

### Gradient of agreement
Consent / gradient of agreement: each person places themselves on a scale of support, so partial dissent surfaces instead of collapsing into a fake yes/no.

- **What participants do:** Pick a level on an ordered support scale. Selecting a low/dissent level prompts (or requires) a written reason.
- **Facilitator / projector:** Projector shows a horizontal gradient bar with the dissent band tinted and a dissent count. Written reasons go only to the facilitator/cohost/admin — never to the projector.
- **Key settings:**
  - `label`, `proposal` — the proposal being decided.
  - `scale` — `fist5` (six levels), `kaner8` (nine levels), or `consent` (three levels).
  - `requireReasonBelow` — levels at or below this number require a written reason.

### Idea marketplace
Invest a budget across ideas from an earlier phase to predict which will succeed — a lightweight prediction market. **Reads an earlier phase.**

- **What participants do:** Spend a credit budget across ideas drawn from an earlier capture phase, using +/− steppers, to back the ones they predict will succeed. (Author names are never shown.)
- **Facilitator / projector:** Projector shows a leaderboard bar chart of the top-funded ideas. The leaderboard is hidden from participants unless you turn it on.
- **Key settings:**
  - `label`, `prompt`.
  - `sourcePhaseId` — the earlier phase whose submissions are the ideas (**required**).
  - `budget` — credits each person gets.
  - `maxPerIdea` — optional cap per idea.
  - `currencyLabel` — what to call the credits.
  - `showLeaderboardLive` — show the leaderboard to participants during voting.
  - `allowSelfInvest` — whether people can invest in their own idea.

### 2×2 matrix
Plot items by two criteria (e.g. impact vs. effort) into quadrants.

- **What participants do:** Add an item and place it on the grid by two axes.
- **Facilitator / projector:** Visible to everyone, projectable, live.
- **Key settings:**
  - `label`, `prompt`.
  - `xLabel` / `yLabel` — the two-ended labels for each axis.
  - `min` / `max` — the numeric range of each axis (default 0–10).

### Spectrogram
An anonymous human spectrogram — everyone places themselves on a line between two poles; shows the live distribution and the before→after shift.

- **What participants do:** Drag a slider to place themselves anonymously between two poles, optionally with a reason. See the live room distribution.
- **Facilitator / projector:** Projector shows the line with a live histogram, mean marker, and (when enabled) the before→after shift. Facilitator gets a console with mean/count and Before/After stage controls.
- **Key settings:**
  - `label`, `statement`.
  - `poleLabels` — the two end labels.
  - `mode` — `continuous` or `buckets`.
  - `buckets` — number of buckets (when in bucket mode).
  - `allowReasons` — let people add a reason.
  - `beforeAfter` — capture a before-and-after shift.

### 25/10 Crowd Sourcing
Everyone writes one bold idea, then ideas detach from their authors and get blind-scored 1–5 over several passes — the strongest rise.

- **What participants do:** First write one bold idea. Then, over several scoring passes, each person is handed an anonymous card they didn't write and scores it.
- **Facilitator / projector:** Facilitator drives the passes ("Start scoring →" / "Next pass →"). Projector and facilitator see a descending top-10 leaderboard by total score.
- **Key settings:**
  - `label`, `prompt` — the bold-idea prompt.
  - `maxScore` — top of the scoring scale (default 5).
  - `passes` — number of scoring rounds (default 5).

### Min Specs
Generate the maximum list of rules/musts, then subtract — keep only the rules you genuinely can't succeed without.

- **What participants do:** In the EXPAND phase, add candidate rules. In the TRIM phase, mark each rule "Essential (keep)" or "Could live without (cut)".
- **Facilitator / projector:** Facilitator toggles between expand and trim. Projector shows the full list while expanding, then highlights survivors and dims the cut rules while trimming. (A rule survives when keeps ≥ cuts.)
- **Key settings:**
  - `label`, `prompt` — "what must be true to succeed?"

---

## Ideate & critique

Generating and challenging ideas.

### Brainwrite
Silent round-robin build-on: everyone adds a line to an idea card someone else started, then rotates — no talking.

- **What participants do:** Silently add one line to an anonymous idea "card" started by someone else, then get rotated to a different card next round.
- **Facilitator / projector:** See an anonymous aggregate overview — how many cards are in play, total lines, and the longest growing chains.
- **Key settings:**
  - `label`, `prompt`.
  - `maxLen` — character limit per line (default 200).

### Redistribute
Hands each person someone else's anonymous idea to critique, defend, or improve — legitimises dissent and counters groupthink. **Reads an earlier phase.**

- **What participants do:** Each person is handed one anonymous idea (written by someone else) and writes a single response framed by the mode.
- **Facilitator / projector:** See each source idea side by side with the responses it drew. Authorship is never revealed.
- **Key settings:**
  - `label`, `prompt`.
  - `sourcePhaseId` — the earlier phase whose ideas get redistributed (**required**).
  - `mode` — `critique`, `defend`, or `improve`.
  - `requireResponse` — make a response mandatory.

### Lightning talks
A strict timeboxed speaker queue with an accountable advance — sign up, see who's next, share one countdown.

- **What participants do:** Join or leave the speaker queue (with an optional topic), see their position and who's up, and get a "You're up" countdown when it's their turn.
- **Facilitator / projector:** Facilitator drives "Next speaker" (participants can't). Projector shows "Now: handle — topic", who's next, the remaining queue, and a shared live countdown.
- **Key settings:**
  - `label`.
  - `secondsPerSpeaker` — time per speaker (default 180).
  - `queueMode` — `signup` or `random`.
  - `topicPrompt` — optional topic question at signup.

### Q&A + upvoting
Crowd questions, surfaced by upvotes — for AMAs and town-halls.

- **What participants do:** Submit questions and upvote others' questions (tap to toggle).
- **Facilitator / projector:** Visible to everyone, projectable. Questions are sorted by upvotes.
- **Key settings:**
  - `label`, `prompt`.

### Word cloud
Collect short words; render a live frequency cloud.

- **What participants do:** Submit a few short words.
- **Facilitator / projector:** Visible to everyone, projectable. Shows a live frequency cloud.
- **Key settings:**
  - `label`, `prompt`.
  - `maxWords` — how many words each person may submit (default 3).

---

## AI

These modules use Claude. The AI runs only when the facilitator or cohost taps generate; participants can never trigger it.

### Devil's advocate
AI red-teams the room's emerging view — grounded counterarguments to break confirmation bias. **Needs AI key. Reads an earlier phase.**

- **What participants do:** Read a list of AI-generated objections (never attributed to any person).
- **Facilitator / projector:** Facilitator taps "Generate objections". Projector shows one objection at a time, large.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — the phase whose submissions are the emerging view (**required**).
  - `target` — `group` or `ai-recommendation`.
  - `maxObjections` — how many to generate (default 3).

### Tension map
AI surfaces the live disagreements in the room's contributions — the axes of tension. **Needs AI key. Reads an earlier phase.**

- **What participants do:** See the tensions as pole-A ←→ pole-B with an intensity bar (example phrases are stripped for privacy).
- **Facilitator / projector:** Facilitator taps "Map the tensions" and sees full detail including de-identified example phrases plus a suggested discussion prompt. Projector shows the tensions without the examples.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — the phase whose submissions are analysed (**required**).
  - `topNTensions` — how many axes to surface (default 4).

### Synthesis
AI between-phase live synthesis — neutral bullets plus the one key tension, which the facilitator reviews privately and promotes to the room. **Needs AI key. Reads an earlier phase (optional).**

- **What participants do:** See nothing until the facilitator promotes the summary (a calm "the facilitator is summarising…" screen), then see the bullets and the key tension.
- **Facilitator / projector:** Facilitator taps "Synthesize", reviews privately, then "Promote to room". Projector shows the bullets and tension with a Live / In review badge.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — the phase to summarise; **leave blank to summarise all submissions in the session**.
  - `bulletCount` — number of bullets (default 5).

### Persona panel
A panel of synthetic AI personas reacts in-character to the room's idea — pressure-test before you build. Not real user data. **Needs AI key. Reads an earlier phase.**

- **What participants do:** View read-only reaction cards (with an honesty banner reminding everyone these are synthetic). They don't submit here.
- **Facilitator / projector:** Facilitator generates the panel; each persona returns a short reaction, a would-adopt score (1–5), and objections. Projector shows an average would-adopt gauge, a per-persona bar chart, and the reaction cards.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — the phase whose submissions are the idea being reacted to (**required**).
  - `personas` — the list of personas, each with a `name` and `description`.
  - `societyMode` — let personas also react to each other.

### Empty chair
Give voice to an absent stakeholder — the room asks an AI persona questions and it answers in character. **Needs AI key.**

- **What participants do:** Type questions to the absent stakeholder.
- **Facilitator / projector:** Facilitator sees the question queue and taps "Have them answer". Projector shows the persona and the question→answer pairs as a large dialogue. All roles see a synthetic-honesty note.
- **Key settings:**
  - `label`.
  - `persona.name` and `persona.description` — who the absent stakeholder is.

### Issue map
AI organises the room's contributions into a live map of issues and the positions people hold; the facilitator can focus and pin issues. **Needs AI key. Reads an earlier phase (optional).**

- **What participants do:** See the issue map; the focused issue is emphasised with its positions spelled out (other issues show only counts). They don't submit here.
- **Facilitator / projector:** Facilitator taps "Map the discussion" / "Re-cluster", can Focus an issue (broadcast to the room) and Pin issues so they survive a re-cluster verbatim. Projector shows the map with the focused issue zoomed.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — the phase to cluster; **leave blank to cluster all submissions in the session**.

### Prompt relay
The room co-builds one prompt for the AI — each person adds a segment — then the facilitator runs it. **Needs AI key.**

- **What participants do:** Pick a segment kind (e.g. audience, tone) and add text segments to a shared prompt.
- **Facilitator / projector:** Facilitator sees the assembled prompt plus contributor names (hidden from participants and the projector), then taps "Run the prompt"; the result goes to the whole room. Projector shows the prompt building up, then the AI result large.
- **Key settings:**
  - `label`, `task` — the underlying task the prompt serves.
  - `segmentKinds` — the segment types people can add (default: audience, tone, must include, must avoid, example).

### Prototype builder
Text-to-UI: the room describes an interface, the facilitator builds it, and Claude returns a clickable single-file prototype. **Needs AI key. Reads an earlier phase (optional).**

- **What participants do:** Add spec text describing the interface they want.
- **Facilitator / projector:** Facilitator sees the assembled spec and an inline preview, then taps "Build it" / "Rebuild"; Claude returns a single-file HTML prototype shown in a sandboxed frame. Projector shows the prototype large.
- **Key settings:**
  - `label`.
  - `sourcePhaseId` — an optional earlier capture phase whose submissions add to the spec.
  - `brief` — an optional starting description seeded by the facilitator.

---

## Analytics

### Participation equity
A facilitator-only dashboard of contributions per person — surfaces silent voices so you can rebalance airtime. Reads contribution data, never microphones.

- **What participants do:** Nothing — they only ever see a neutral "the facilitator is reviewing the session" placeholder.
- **Facilitator / projector:** Facilitator and cohost see a dashboard: summary stats, per-person contribution bars, who hasn't contributed yet, and recency. **Hidden from the projector**, and not projectable.
- **Key settings:**
  - `label`.
  - `anonymize` — hide names on the dashboard (on by default).
