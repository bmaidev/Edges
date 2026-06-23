import type { ContentItem, Mode, ModeId } from "./types";

// The three session modes, defined as JSON-like sequences of phases over the
// shared primitives. The facilitator console drives any of these.

export const MODES: Record<ModeId, Mode> = {
  "case-dissection": {
    id: "case-dissection",
    name: "Case dissection",
    description:
      "Diagnose one real, anonymised case through different cybernetic lenses, then move from diagnosis to intervention.",
    phases: [
      { id: "lobby", primitive: "lobby", config: { label: "Lobby" } },
      {
        id: "case-brief",
        primitive: "content",
        config: {
          label: "The case",
          contentHeading: "The case",
          showContentTypes: ["case", "note"],
        },
      },
      {
        id: "lens-select",
        primitive: "allocate",
        config: {
          label: "Pick a lens",
          allocate: {
            kind: "lens",
            cap: 3,
            optionsFromContentType: "lens",
            header: "Pick a lens. First three to claim it form that triad.",
          },
        },
      },
      {
        id: "triad-diagnose",
        primitive: "capture",
        config: {
          label: "Triad diagnosis",
          prompt:
            "From the lens of [LENS], what's actually going on in this case? Be specific. What would a different lens miss?",
          placeholder: "Diagnose through your lens…",
          timerSeconds: 720,
          multiSubmit: true,
          tagWith: "lens",
          contentHeading: "The case",
          showContentTypes: ["case", "lens"],
        },
      },
      {
        id: "diagnosis-readaround",
        primitive: "readaround",
        config: {
          label: "Diagnosis read-around",
          readaround: { source: "submissions", sourcePhaseId: "triad-diagnose" },
        },
      },
      {
        id: "interventions",
        primitive: "capture",
        config: {
          label: "Interventions",
          prompt:
            "Given what surfaced, what would you actually do? Specific, not strategic.",
          placeholder: "What would you actually do?",
          timerSeconds: 600,
          multiSubmit: true,
          showContentTypes: ["case"],
        },
      },
      {
        id: "intervention-readaround",
        primitive: "readaround",
        config: {
          label: "Intervention read-around",
          readaround: { source: "submissions", sourcePhaseId: "interventions" },
        },
      },
      { id: "close", primitive: "close", config: { label: "Close" } },
    ],
  },

  "counter-mapping": {
    id: "counter-mapping",
    name: "Counter-mapping",
    description:
      "Map your team as the org chart shows it vs. as it actually works now. Interrogate the gap in pairs, then synthesise.",
    phases: [
      { id: "lobby", primitive: "lobby", config: { label: "Lobby" } },
      {
        id: "setup",
        primitive: "content",
        config: {
          label: "Setup",
          contentHeading: "Setup",
          showContentTypes: ["prompt", "note"],
        },
      },
      {
        id: "map-capture",
        primitive: "capture",
        config: {
          label: "Map capture",
          prompt:
            "Describe your team as it appears on the org chart. Just the bones.",
          placeholder: "The chart version…",
          prompt2:
            "Now describe how the team actually coordinates day-to-day, post-AI. Who talks to whom first? Where do drafts move? Who's quietly doing senior work?",
          placeholder2: "The reality version…",
          timerSeconds: 480,
          showContentTypes: ["prompt"],
        },
      },
      {
        id: "pair-coord",
        primitive: "coordinator",
        config: {
          label: "Pairs",
          coordinator: {
            kind: "pair",
            message:
              "You're paired with [PARTNER]. Find them in the room. Share your maps. Where is each of your charts lying?",
          },
        },
      },
      {
        id: "gap-capture",
        primitive: "capture",
        config: {
          label: "Gap interrogation",
          prompt:
            "What did you notice in your partner's gap? What did they notice in yours?",
          placeholder: "The gap…",
          timerSeconds: 300,
          multiSubmit: true,
          showContentTypes: ["prompt"],
        },
      },
      {
        id: "pattern-board",
        primitive: "readaround",
        config: {
          label: "Pattern board",
          readaround: { source: "patterns" },
        },
      },
      { id: "close", primitive: "close", config: { label: "Close" } },
    ],
  },

  provocation: {
    id: "provocation",
    name: "Provocation debate",
    description:
      "A sharp, one-sided claim. Self-allocate to Defend or Attack, steelman the position, debate, then capture where minds changed.",
    phases: [
      { id: "lobby", primitive: "lobby", config: { label: "Lobby" } },
      {
        id: "provocation",
        primitive: "content",
        config: {
          label: "The provocation",
          showContentTypes: ["prompt", "note", "argument"],
        },
      },
      {
        id: "side-select",
        primitive: "allocate",
        config: {
          label: "Pick a side",
          allocate: {
            kind: "side",
            fixedOptions: ["Defend", "Attack"],
            header:
              "Pick a side. Steelman the position even if you don't fully agree — that's the rule for the next 25 minutes.",
          },
        },
      },
      {
        id: "arg-prep",
        primitive: "capture",
        config: {
          label: "Argument prep",
          prompt:
            "Your three strongest arguments for [SIDE] the claim. One per submission. Steelman.",
          placeholder: "One argument…",
          timerSeconds: 480,
          multiSubmit: true,
          tagWith: "side",
          showContentTypes: ["prompt", "argument"],
        },
      },
      {
        id: "arg-readaround",
        primitive: "readaround",
        config: {
          label: "Argument read-around",
          readaround: { source: "submissions", sourcePhaseId: "arg-prep" },
        },
      },
      {
        id: "change-of-mind",
        primitive: "capture",
        config: {
          label: "Change of mind",
          prompt:
            "Where did you change your mind? What surfaced that's worth taking with you?",
          placeholder: "What surfaced…",
          timerSeconds: 180,
        },
      },
      { id: "close", primitive: "close", config: { label: "Close" } },
    ],
  },
};

export function getMode(id: ModeId | null): Mode | null {
  return id ? MODES[id] : null;
}

export function getPhase(modeId: ModeId | null, phaseId: string | null) {
  const mode = getMode(modeId);
  if (!mode || !phaseId) return null;
  return mode.phases.find((p) => p.id === phaseId) ?? null;
}

// ---- Starter content library ----------------------------------------------
// Pre-written content the facilitator loads with one tap, then edits before
// pushing. Shipped inline (no separate config file), per the spec.

type StarterItem = Pick<ContentItem, "type" | "title" | "body">;

export const STARTER_LIBRARY: Record<ModeId, StarterItem[]> = {
  "case-dissection": [
    {
      type: "lens",
      title: "Conway's law",
      body: "Organisations design systems that mirror their communication structure. What does this case's system imply about its team's communication?",
    },
    {
      type: "lens",
      title: "Requisite variety (Ashby)",
      body: "A controller needs at least as much variety as the system it controls. Where is the team under-varied for the problem it now faces?",
    },
    {
      type: "lens",
      title: "Coupling and decoupling",
      body: "What used to be loosely coupled and is now tightly coupled, or vice versa, because AI is in the loop?",
    },
    {
      type: "lens",
      title: "Observability",
      body: "What can the organisation no longer sense about its own work, now that AI sits between the work and the people who used to do it?",
    },
    {
      type: "lens",
      title: "Sociotechnical joint optimisation",
      body: "Where is the social side being optimised away because the technical side moves faster?",
    },
    {
      type: "case",
      title: "Case template",
      body: "Setting (3 sentences — sector, team size, what they do):\n\nThe change (3 sentences — what AI was introduced, how, by whom):\n\nWhat's actually happening now (5–6 sentences — the messy detail):\n\nThe unresolved tension (1–2 sentences):\n\nWhat the team is officially doing about it (1 sentence):\n\nWhat people are actually doing about it (1 sentence):",
    },
    {
      type: "case",
      title: "Case — federal policy department (drafting)",
      body: "**Setting.** A Commonwealth policy department. A ~40-person division writes regulatory advice and ministerial briefs. Work is mostly drafting, review, and clearance.\n\n**The change.** A generative AI assistant was rolled out for drafting and summarising consultation submissions, sponsored centrally with an \"AI use\" policy attached.\n\n**What's actually happening now.** Junior analysts produce a first draft in minutes instead of days. Senior reviewers now spend their time correcting subtle framing and risk-appetite errors the model doesn't feel. The old apprenticeship — learning to think by writing the brief — is quietly thinning. SES still sign off, but several admit they understand the underlying reasoning less than they used to. Turnaround is faster; confidence in the why is lower.\n\n**The unresolved tension.** Speed and volume vs. the slow accrual of judgement that made the division trustworthy.\n\n**Officially.** Policy says \"human in the loop, sensitive material stays in approved tools.\"\n\n**Actually.** People paste working drafts into whatever is fastest and trust the summary.",
    },
    {
      type: "case",
      title: "Case — university student support",
      body: "**Setting.** A large Australian university. A 25-person professional-services team handles student enquiries and admissions correspondence across several faculties.\n\n**The change.** Central IT introduced AI triage and reply-drafting for the student inbox to cut response times.\n\n**What's actually happening now.** Response times dropped sharply and the backlog cleared. But the team used to notice at-risk students from the tone of an email — a student spiralling, a quiet disclosure — and route them to support. AI normalises every reply into the same calm register, and those signals are getting smoothed away. Some academics have started routing around the official channel to reach a human. Nobody decided this; it drifted.\n\n**The unresolved tension.** Efficiency vs. the relational sensing that was doing real pastoral work nobody had named.\n\n**Officially.** \"AI handles tier-1; humans handle escalations.\"\n\n**Actually.** What counts as an escalation is silently narrowing as the queue stays clear.",
    },
    {
      type: "case",
      title: "Case — service-delivery agency (case notes)",
      body: "**Setting.** A large service-delivery agency. Frontline officers and a back-office team process complex claims with long, messy histories.\n\n**The change.** AI now summarises case notes so officers can get up to speed on a file quickly, and so shifts can hand over faster.\n\n**What's actually happening now.** Handovers between officers increasingly rely on the AI summary rather than the file. The thing a seasoned officer used to flag in the margins — \"this person is about to fall through a gap\" — gets flattened into a tidy paragraph. Decisions are faster and more consistent on the surface; internal reviews and appeals are creeping up. The officers who trust the summary least are the most experienced.\n\n**The unresolved tension.** Throughput and consistency vs. duty of care to the edge cases that don't summarise well.\n\n**Officially.** Summaries are \"decision support only.\"\n\n**Actually.** Under load, officers act on the summary without opening the file.",
    },
  ],
  "counter-mapping": [
    {
      type: "prompt",
      title: "Chart version",
      body: "Describe your team as it appears on the org chart. Just the bones — who reports to whom, who 'owns' what.",
    },
    {
      type: "prompt",
      title: "Reality version",
      body: "Now describe how the team actually coordinates day-to-day, post-AI. Who talks to whom first? Where do drafts move? Who reviews what? Who's quietly doing senior work?",
    },
    {
      type: "prompt",
      title: "The gap",
      body: "What does the gap between those two descriptions tell you?",
    },
    {
      type: "prompt",
      title: "Junior perspective (deepener)",
      body: "Redraw it from your most junior team member's perspective.",
    },
    {
      type: "prompt",
      title: "New coordination problem (deepener)",
      body: "What's a coordination problem your team didn't have a year ago?",
    },
    {
      type: "prompt",
      title: "Load-bearing AI (deepener)",
      body: "Where is AI now load-bearing for the team's coordination?",
    },
  ],
  provocation: [
    {
      type: "prompt",
      title: "Provocation 1",
      body: "Most attempts to 'integrate AI into teams' are making teams more fragile, not more capable.",
    },
    {
      type: "prompt",
      title: "Provocation 2",
      body: "The right unit of AI adoption is the individual, not the team. Teams are increasingly noise.",
    },
    {
      type: "prompt",
      title: "Provocation 3",
      body: "Performance management as a discipline is incompatible with AI-augmented work. We should stop doing it.",
    },
    {
      type: "prompt",
      title: "Provocation 4",
      body: "In an AI-augmented org, the role of the senior person isn't to do senior work — it's to absorb the consequences of AI getting it wrong.",
    },
    {
      type: "prompt",
      title: "Provocation 5",
      body: "Junior roles will become more interesting and more dangerous at the same time. The career ladder breaks.",
    },
    {
      type: "prompt",
      title: "Provocation — APS 'human in the loop'",
      body: "The APS's 'human in the loop' guidance is theatre — the loop has already been optimised out, and the policy exists so we don't have to admit it.",
    },
    {
      type: "prompt",
      title: "Provocation — university AI tools",
      body: "Australian universities should stop building institutional AI tools; staff and students are already more capable with the consumer tools the university can't see or govern.",
    },
    {
      type: "prompt",
      title: "Provocation — explainability in government",
      body: "In government, AI's biggest effect isn't productivity — it's that no senior person can any longer explain how a decision was actually made.",
    },
    {
      type: "prompt",
      title: "Provocation — frontline judgement",
      body: "Frontline service work is where AI does the most damage, because the thing it flattens — human judgement about edge cases — is the whole job.",
    },
    {
      type: "prompt",
      title: "Provocation — academic integrity",
      body: "Academic integrity policy is now unenforceable and universities know it; the honest move is to retire it, not keep performing enforcement.",
    },
  ],
};
