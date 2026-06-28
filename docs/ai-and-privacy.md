# AI Features & Privacy

This guide explains what the AI features do, who can trigger them, and how the
platform protects the people in your room. It is written for facilitators and
admins, and for anyone who simply wants to know where their words go.

The short version: every AI feature is optional, facilitator-controlled, and
grounded in your own room's topic and contributions. Participants never trigger
AI. Raw words stay with the facilitator. Nothing the room types is ever written
to a server log, and all session data deletes itself within 24 hours.

---

## 1. What needs an AI key

Every AI feature is powered by an Anthropic API key. There are two ways one can
be present:

- **The instance key** — set by whoever runs the platform as the
  `ANTHROPIC_API_KEY` environment variable (in Vercel project settings for
  production, or in `.env.local` for local development). This is the shared
  baseline that every workspace can use.
- **Your workspace's own key (bring-your-own)** — a workspace owner can paste
  their own Anthropic key in the admin console's **AI key** panel. When set, that
  workspace's AI usage runs on (and bills to) that key instead of the instance
  one. The key is **encrypted at rest** and never shown back; remove it any time
  to fall back to the instance default.

Either way, all AI calls go through one shared service, so a key being present
(workspace key first, otherwise the instance key) is the one and only switch that
turns AI on.

**If the key is not set, the platform still works fully.** Every AI feature
degrades gracefully: its button is hidden or shows "AI unavailable", and the
rest of the platform — capture, voting, clustering by hand, all the non-AI
modules, the room flow, archiving — runs exactly as normal. AI is additive, not
load-bearing.

The features that depend on the key are:

- **Setup assist** — "Suggest a session" and "Critique this design".
- **Cluster assist** — AI-suggested groupings of submissions.
- The **AI modules** you can place in a session: devil's-advocate, friction
  map, live synthesis, latent-needs miner, synthetic persona panel, empty
  chair, EchoMind issue-map, prompt-relay, and the text-to-UI builder.
- The **post-session report** generated when a room is archived.

The **participation-equity dashboard** is *not* in this list — it is pure
analytics (counting contributions), makes no AI call, and works with or without
a key. See section 4.

---

## 2. AI features, by lifecycle

Across every feature below, the same rules hold: a **facilitator (or cohost /
admin) triggers it** by pressing a button — "Suggest", "Generate", "Run",
"Build", "Refresh". **Participants never trigger an AI call.** Every prompt is
**grounded in the room's own topic and the room's own submissions** — the AI is
not answering from the open internet, it is working with what your room
actually said.

### Setup (designing the session)

- **Suggest a session** — You give a goal (and optionally time available and
  group size); the builder proposes a full, ordered sequence of real modules
  with sensible settings and a short rationale. It only proposes — you edit and
  launch. Any setting the AI suggests that wouldn't actually run is quietly
  replaced with a safe default, so what it hands you is always launchable.
- **Critique this design** — You hand it an assembled session; it returns
  concrete strengths and issues (missing convergence, no proper close, a phase
  that references an earlier one that isn't there, pacing problems). It is
  read-only advice; it never changes your design.

### During a session

- **Cluster assist** — Takes the current phase's submissions and proposes 3–5
  named clusters that capture the patterns underneath them. The facilitator
  reviews and decides; the AI never reorganises the room on its own.
- **Devil's-advocate / red-team** — Generates grounded counterarguments to the
  room's emerging view, so the group can stress-test its consensus. The
  objections are AI-authored (not anyone's personal submission), so they are
  safe to show the whole room.
- **Friction / tension map** — Surfaces the live disagreements in the room — the
  "the real tension here is…" — so you can move toward productive conflict
  rather than away from it. The de-identified example phrases behind each
  tension are facilitator-only; they are stripped before participants or the
  projector see anything.
- **Live synthesis (the "ghost co-author")** — Between phases, drafts a few
  plain, neutral bullets of what was just said plus the single biggest
  unresolved tension. The facilitator **reviews the draft privately, then
  promotes it** to the room and projector with one tap. Nothing reaches
  participants until the facilitator promotes it.
- **Latent-needs miner** — Reads raw capture text and infers the underlying
  needs nobody said out loud (jobs-to-be-done beneath the literal words). This
  goes *beyond* what people stated, so it is **strictly facilitator-only and
  off-the-record** — it is never shown to participants or the projector by
  design.
- **Synthetic persona panel** — A panel of AI personas reacts in character to
  the room's idea or pitch, so the group can pressure-test it against a spread
  of viewpoints. Outputs are AI simulations, safe to show the room, and carry
  an honesty banner (see below).
- **Empty chair** — Gives a voice to a stakeholder who isn't in the room (a
  customer, a regulator, a future user). Participants pose questions; the AI
  answers in character. It is an imagined stand-in, not the real stakeholder,
  and carries the same honesty banner.
- **EchoMind issue-map** — Organises the room's contributions into issues and
  positions on a shared live map. You can focus one issue (broadcast it to the
  room) and **pin issues so that re-clustering never discards them** —
  human-pinned structure is never overwritten by the AI.
- **Prompt-relay** — The room co-builds one prompt together, each person adding
  a segment (an audience, a tone, a constraint, an example). The facilitator
  assembles and runs it, and the result returns to the whole room. (Because
  participants co-author the prompt text, those segments are handled as data —
  see section 3.)
- **Text-to-UI builder** — The room describes an interface in words; the
  facilitator presses "Build it" and the AI returns a complete, self-contained
  HTML prototype the group can click. For safety the prototype is rendered only
  inside a **sandboxed iframe**: it can run its own JavaScript but cannot reach
  the parent app, its storage, or its cookies, and the model is told to make no
  network calls.

### Post-session (at archive time)

- **AI session report** — When a room is archived, the platform generates one
  whole-session synthesis from every phase's contributions plus the
  facilitator's curated patterns: a short **summary**, the key **themes**, the
  unresolved **tensions**, what the room **decided**, and concrete **next
  steps**. It is regenerated fresh from the raw contributions at archive time
  (so it doesn't depend on any in-session draft surviving), and it is written to
  be faithful to what was said rather than to invent. If there's no AI key or
  nothing to synthesise, the archive simply has no report and everything else is
  still saved.

---

## 3. How it's engineered for trust

- **Facilitator-triggered only, never automatic.** AI is never called on the
  ~2-second polling loop that keeps the room's screens up to date. It runs only
  when a facilitator (or cohost / admin) presses a button, and the code
  explicitly refuses AI actions from the participant role. The room is never
  silently sending its words to a model in the background.
- **Model tiering.** Heavy reasoning work — red-teaming, tension analysis,
  issue-mapping, latent-need inference, design suggestion and critique, the
  session report, and code/HTML generation — uses the stronger model. Short
  extraction and turn-taking tasks use the faster, cheaper one. You get
  appropriate quality without overspending on lightweight calls.
- **Graceful failure.** If the AI declines a request, returns nothing usable, or
  the call fails, the feature reports a plain-language message ("AI
  unavailable", "the response was cut off", "try again") and the session carries
  on. A failed AI call never breaks the room.
- **In-flight guard against double-spend.** While a generation is running for a
  phase, a second one is refused with "a generation is already running" (the
  guard auto-clears after 60 seconds). This sits on top of the button being
  disabled during a call, so an impatient double-click can't fire two paid
  requests.
- **Participant text is treated as data, not instructions.** In every room-facing
  module, submitted text is wrapped in a delimiter that tells the model the
  enclosed content is participant data to analyse — never commands to obey. This
  is a guard against prompt-injection, where someone might try to type
  instructions to hijack the AI. Large rooms are also capped to a sane number of
  most-recent items before being sent, so a 200-person room can't overflow the
  request.

---

## 4. Privacy model

These are properties of how the system is built, not just promises in copy.

- **No accounts, no PII.** There is no sign-up. A participant's handle is a
  freeform display name and defaults to **Anonymous** if left blank.
- **Raw submissions are facilitator-only.** Participants see curated and
  aggregated output — clusters, promoted summaries, shared maps — not each
  other's raw text. The full raw list is only ever handed to non-participant
  roles (facilitator, cohost, admin).
- **The latent-needs module is strictly off-the-record.** Because it infers
  beyond what people actually said, its output is facilitator-only by design and
  is never shown to participants or on the projector.
- **An "anonymous" capture option strips the handle entirely.** A facilitator can
  set a capture phase to anonymous, which removes the handle from stored
  submissions — so even the facilitator's raw view can't attribute who said
  what.
- **Submission text is never written to server logs.** The AI service logs only
  operational metrics for each call — how long it took, which model, the
  stop reason, and token counts — and never the prompt or the submission content
  itself. (For the same reason, the deployment guidance is to keep third-party
  analytics off.)
- **Everything self-deletes within 24 hours.** All live session data carries a
  24-hour time-to-live and expires automatically. Pressing **"End session"**
  wipes the participants, submissions, content, patterns, votes, and words
  immediately rather than waiting for the timer.
- **The end-of-session recap (take-away).** When a session ends, participants are
  shown a **recap they can keep for 24 hours** (and scan from the projector to
  take with them). This recap is the **synthesis only** — the summary, themes,
  decisions, next steps and any action items — and is **handle-free**: it never
  contains a raw response or attributes anything to a named person. It lives in
  the same 24-hour-TTL session store under a random, unguessable, room-scoped
  token and **self-destructs at 24 hours**; it is not indexed by search engines.
  The raw live data is still wiped at End exactly as above — only the
  de-identified synthesis is kept, and only for a day.
- **Synthetic outputs are clearly labelled.** The synthetic persona panel and the
  empty chair carry an honesty banner stating they are AI-generated stand-ins,
  not real users or the real stakeholder. They are useful for pressure-testing a
  spread of viewpoints, but they will confidently fill in answers to things they
  can't actually know — treat them as a thinking tool, not as user research.

> A note on what isn't private from whom: facilitators, cohosts, and admins can
> see raw submissions (except where a phase is set to anonymous, which hides
> them from everyone). The privacy guarantees above are about participants,
> the projector, and the outside world — not about hiding contributions from the
> people running the room.
