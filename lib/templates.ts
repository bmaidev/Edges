// Research-grounded built-in session templates. Each is a ready-to-run phase
// sequence (PhaseInstance[]) the facilitator can launch in one tap — the cheap,
// high-evidence "methods as configuration" wins from the facilitation research
// (pre-mortem, anti-problem, 15% solutions, What³, Six Hats, etc.), plus a few
// that showcase the new modules. Launched via the host `setPhases` command;
// every config below satisfies its module's zod schema.

import type { PhaseInstance } from "./types";

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  tag: "decide" | "diverge" | "reflect" | "ai" | "dialogue";
  phases: PhaseInstance[];
}

const lobby: PhaseInstance = {
  id: "lobby",
  moduleId: "lobby",
  config: { label: "Lobby", message: "We'll begin shortly." },
};
const close: PhaseInstance = {
  id: "close",
  moduleId: "close",
  config: { label: "Close" },
};

export const TEMPLATES: SessionTemplate[] = [
  {
    id: "pre-mortem",
    name: "Pre-Mortem",
    description:
      "Prospective hindsight: imagine the project already failed, surface the causes, prioritise the real risks. ~30% more risks than asking 'what could go wrong'.",
    tag: "decide",
    phases: [
      lobby,
      {
        id: "premortem",
        moduleId: "capture",
        config: {
          label: "The failure headline",
          prompt:
            "It's 12 months from now and this project has failed badly. Write the headline — and the single biggest reason why.",
          placeholder: "The reason it failed was…",
          timerSeconds: 360,
          multiSubmit: true,
        },
      },
      {
        id: "premortem-read",
        moduleId: "readaround",
        config: {
          label: "Read the risks",
          readaround: { source: "submissions", sourcePhaseId: "premortem" },
        },
      },
      {
        id: "premortem-rank",
        moduleId: "scale",
        config: {
          label: "How likely / how bad?",
          statements: [
            "The risks we surfaced are likely",
            "We are currently doing too little about them",
          ],
          min: 1,
          max: 5,
          labels: ["not at all", "very much"],
        },
      },
      close,
    ],
  },
  {
    id: "anti-problem",
    name: "Anti-Problem (reverse brainstorm)",
    description:
      "Ask how to GUARANTEE failure — taboo truths surface in a playful frame — then invert into what to actually do.",
    tag: "diverge",
    phases: [
      lobby,
      {
        id: "anti",
        moduleId: "capture",
        config: {
          label: "How do we guarantee failure?",
          prompt:
            "How would we make absolutely certain this fails — or that the people we serve come to hate it? Be specific and a little gleeful.",
          placeholder: "To guarantee failure, we'd…",
          timerSeconds: 360,
          multiSubmit: true,
        },
      },
      {
        id: "anti-read",
        moduleId: "readaround",
        config: {
          label: "Read the sabotage",
          readaround: { source: "submissions", sourcePhaseId: "anti" },
        },
      },
      {
        id: "invert",
        moduleId: "capture",
        config: {
          label: "Now invert",
          prompt:
            "Pick the sharpest sabotage idea. What does inverting it tell us we should actually do — starting now?",
          placeholder: "Inverted, this means we should…",
          timerSeconds: 300,
          multiSubmit: true,
        },
      },
      close,
    ],
  },
  {
    id: "fifteen-percent",
    name: "15% Solutions",
    description:
      "Strip ambition to what each person can do THIS WEEK with no new budget or authority — turns vague enthusiasm into owned action.",
    tag: "decide",
    phases: [
      lobby,
      {
        id: "fifteen",
        moduleId: "capture",
        config: {
          label: "Your 15%",
          prompt:
            "What can YOU do this week — with no new budget, no new permission — to move this forward? Be concrete and small.",
          placeholder: "This week I can…",
          timerSeconds: 300,
          multiSubmit: true,
        },
      },
      {
        id: "fifteen-read",
        moduleId: "readaround",
        config: {
          label: "Commitments read-around",
          readaround: { source: "submissions", sourcePhaseId: "fifteen" },
        },
      },
      close,
    ],
  },
  {
    id: "what-cubed",
    name: "What³ (What / So What / Now What)",
    description:
      "A clean debrief arc: separate observation from interpretation from action, in three timed passes.",
    tag: "reflect",
    phases: [
      lobby,
      {
        id: "what",
        moduleId: "capture",
        config: {
          label: "What?",
          prompt: "What actually happened? Just the facts you observed — no interpretation yet.",
          timerSeconds: 240,
          multiSubmit: true,
        },
      },
      {
        id: "so-what",
        moduleId: "capture",
        config: {
          label: "So what?",
          prompt: "So what does it mean? Why does it matter?",
          timerSeconds: 240,
          multiSubmit: true,
        },
      },
      {
        id: "now-what",
        moduleId: "capture",
        config: {
          label: "Now what?",
          prompt: "Now what do we do? One concrete next step.",
          timerSeconds: 240,
          multiSubmit: true,
        },
      },
      {
        id: "what3-read",
        moduleId: "readaround",
        config: {
          label: "Next steps read-around",
          readaround: { source: "submissions", sourcePhaseId: "now-what" },
        },
      },
      close,
    ],
  },
  {
    id: "six-hats",
    name: "Six Thinking Hats (speed run)",
    description:
      "Parallel thinking — everyone wears the same hat at once, so critique stops feeling like attack. Six fast timed passes.",
    tag: "diverge",
    phases: [
      lobby,
      {
        id: "white",
        moduleId: "capture",
        config: { label: "⚪ White — facts", prompt: "White hat: just the facts and data. What do we know?", timerSeconds: 180, multiSubmit: true },
      },
      {
        id: "red",
        moduleId: "capture",
        config: { label: "🔴 Red — feelings", prompt: "Red hat: gut feelings and instincts, no justification needed.", timerSeconds: 150, multiSubmit: true },
      },
      {
        id: "black",
        moduleId: "capture",
        config: { label: "⚫ Black — risks", prompt: "Black hat: caution. What could go wrong? Where's the weakness?", timerSeconds: 180, multiSubmit: true },
      },
      {
        id: "yellow",
        moduleId: "capture",
        config: { label: "🟡 Yellow — benefits", prompt: "Yellow hat: optimism. What's the value? Why might it work?", timerSeconds: 180, multiSubmit: true },
      },
      {
        id: "green",
        moduleId: "capture",
        config: { label: "🟢 Green — ideas", prompt: "Green hat: creativity. New possibilities, wild alternatives.", timerSeconds: 180, multiSubmit: true },
      },
      {
        id: "blue",
        moduleId: "capture",
        config: { label: "🔵 Blue — next", prompt: "Blue hat: process. So what do we do next?", timerSeconds: 180, multiSubmit: true },
      },
      close,
    ],
  },
  {
    id: "rose-thorn-bud",
    name: "Rose / Thorn / Bud",
    description:
      "A fast retro: what's working (rose), what hurts (thorn), what's an emerging opportunity (bud).",
    tag: "reflect",
    phases: [
      lobby,
      {
        id: "rose",
        moduleId: "capture",
        config: { label: "🌹 Rose", prompt: "Rose: what's genuinely working well right now?", timerSeconds: 200, multiSubmit: true },
      },
      {
        id: "thorn",
        moduleId: "capture",
        config: { label: "🌵 Thorn", prompt: "Thorn: what's painful, stuck, or draining?", timerSeconds: 200, multiSubmit: true },
      },
      {
        id: "bud",
        moduleId: "capture",
        config: { label: "🌱 Bud", prompt: "Bud: what's an emerging opportunity worth nurturing?", timerSeconds: 200, multiSubmit: true },
      },
      {
        id: "rtb-read",
        moduleId: "readaround",
        config: { label: "Read-around", readaround: { source: "submissions", sourcePhaseId: "bud" } },
      },
      close,
    ],
  },
  {
    id: "idea-market",
    name: "Idea Marketplace",
    description:
      "Generate ideas, then invest a budget across them to predict which will succeed — aggregates dispersed judgement better than a show of hands.",
    tag: "decide",
    phases: [
      lobby,
      {
        id: "ideas",
        moduleId: "capture",
        config: {
          label: "Put ideas on the table",
          prompt: "What should we do? One idea per submission — keep them short and distinct.",
          timerSeconds: 360,
          multiSubmit: true,
        },
      },
      {
        id: "market",
        moduleId: "marketplace",
        config: {
          label: "Invest",
          prompt: "You have 100 credits. Invest in the ideas you predict will actually succeed.",
          sourcePhaseId: "ideas",
          budget: 100,
          maxPerIdea: 50,
          showLeaderboardLive: false,
        },
      },
      close,
    ],
  },
  {
    id: "red-team",
    name: "AI Red-Team a Plan",
    description:
      "State the plan, let the AI devil's-advocate attack the room's consensus, then take a consent temperature. (Needs an AI key; degrades to a plain consent check without one.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "plan",
        moduleId: "capture",
        config: {
          label: "The plan",
          prompt: "In a sentence or two: what are we proposing to do?",
          timerSeconds: 240,
          multiSubmit: true,
        },
      },
      {
        id: "devil",
        moduleId: "devil",
        config: { label: "Devil's advocate", sourcePhaseId: "plan", target: "group", maxObjections: 3 },
      },
      {
        id: "consent",
        moduleId: "gradient",
        config: {
          label: "Where do we land?",
          proposal: "Given the objections, we should proceed with the plan.",
          scale: "fist5",
          requireReasonBelow: 2,
        },
      },
      close,
    ],
  },
  {
    id: "world-cafe",
    name: "World Café",
    description:
      "Small tables explore one question; hosts stay, everyone else scatters to a new table each round — ideas cross-pollinate across the room.",
    tag: "dialogue",
    phases: [
      lobby,
      {
        id: "cafe",
        moduleId: "worldcafe",
        config: {
          label: "Café",
          prompt: "What would have to be true for us to succeed here? Build on what the last table left.",
          captureNotes: true,
        },
      },
      close,
    ],
  },
  {
    id: "shift-and-share",
    name: "Shift & Share",
    description:
      "Intact small groups tour a set of stations, one round each — a fast way to share many parallel ideas without death-by-presentation.",
    tag: "dialogue",
    phases: [
      lobby,
      {
        id: "tour",
        moduleId: "stations",
        config: {
          label: "Stations",
          stations: ["Station A", "Station B", "Station C", "Station D"],
          groupSize: 3,
          prompt: "At each station, react and add one thing the hosts should know.",
          captureNotes: true,
        },
      },
      close,
    ],
  },
  {
    id: "one-two-four-all",
    name: "1-2-4-All",
    description:
      "The same question worked alone → in pairs → in fours → whole group. The workhorse Liberating Structure for inclusive idea generation.",
    tag: "diverge",
    phases: [
      lobby,
      {
        id: "124",
        moduleId: "onetwofour",
        config: {
          label: "1-2-4-All",
          prompt: "What's the boldest thing we could do about this — and what's stopping us?",
          captureShared: true,
        },
      },
      close,
    ],
  },
  {
    id: "twentyfive-ten",
    name: "25/10 Crowd Sourcing",
    description:
      "Everyone writes one bold idea; ideas detach from authors and get blind-scored over five passes; the top ten surface. Beats a show of hands.",
    tag: "decide",
    phases: [
      lobby,
      {
        id: "crowd",
        moduleId: "twentyfive10",
        config: {
          label: "25/10",
          prompt: "If you were ten times bolder, what would you have us do? One idea, one sentence.",
          maxScore: 5,
          passes: 5,
        },
      },
      close,
    ],
  },
  {
    id: "min-specs",
    name: "Min Specs",
    description:
      "List every rule we think we must follow, then ruthlessly subtract — keep only the few whose removal would actually cause failure.",
    tag: "decide",
    phases: [
      lobby,
      {
        id: "specs",
        moduleId: "minspecs",
        config: {
          label: "Min Specs",
          prompt: "To achieve our goal, what are all the musts and must-nots we believe we have to honour?",
        },
      },
      close,
    ],
  },
  {
    id: "silent-storm",
    name: "Silent Brainwrite",
    description:
      "Silent round-robin building — no talking, no production-blocking, no dominance. Reliably out-produces verbal brainstorming.",
    tag: "diverge",
    phases: [
      lobby,
      {
        id: "brainwrite",
        moduleId: "brainwrite",
        config: { label: "Build in silence", prompt: "Build on the idea you're handed — add one line, then you'll be passed a new card." },
      },
      close,
    ],
  },
  {
    id: "blind-customer",
    name: "Blind-Customer Test",
    description:
      "Pitch the idea, then a panel of AI personas reacts in character so you can pressure-test it before building. (Needs an AI key.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "pitch",
        moduleId: "capture",
        config: { label: "The pitch", prompt: "In a few lines: what's the idea, and who's it for?", timerSeconds: 300, multiSubmit: true },
      },
      {
        id: "panel",
        moduleId: "persona",
        config: { label: "Customer panel", sourcePhaseId: "pitch", societyMode: false },
      },
      close,
    ],
  },
  {
    id: "empty-chair",
    name: "The Empty Chair",
    description:
      "Give the absent stakeholder a voice — the room interviews an AI standing in for a customer, regulator, or future user. (Needs an AI key.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "chair",
        moduleId: "emptychair",
        config: {
          label: "Empty chair",
          persona: {
            name: "A frontline service user",
            description:
              "Someone who depends on the service we're designing, with limited time and patience, who has been let down by systems before.",
          },
        },
      },
      close,
    ],
  },
  {
    id: "live-issue-map",
    name: "Live Issue Map",
    description:
      "The room contributes freely; the AI organises it into issues and the positions people hold, and the facilitator focuses the room one issue at a time. (Needs an AI key.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "voices",
        moduleId: "capture",
        config: { label: "What's on your mind?", prompt: "What's the real issue here, from where you sit?", timerSeconds: 480, multiSubmit: true },
      },
      {
        id: "map",
        moduleId: "issuemap",
        config: { label: "Issue map", sourcePhaseId: "voices" },
      },
      close,
    ],
  },
  {
    id: "prompt-relay",
    name: "Prompt Relay",
    description:
      "The room co-builds one AI prompt — each person adds a constraint, audience, tone, or example — then runs it together. Builds shared prompt literacy. (Needs an AI key.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "relay",
        moduleId: "promptrelay",
        config: { label: "Build the prompt", task: "Draft a clear, compelling one-paragraph announcement of what we decided today." },
      },
      close,
    ],
  },
  {
    id: "prototype-it",
    name: "Prototype It Live",
    description:
      "Describe an interface in words; the AI builds a clickable prototype the room can react to in seconds. (Needs an AI key.)",
    tag: "ai",
    phases: [
      lobby,
      {
        id: "spec",
        moduleId: "capture",
        config: { label: "Describe the screen", prompt: "Describe the interface we should prototype — what's on it, what does it do?", timerSeconds: 360, multiSubmit: true },
      },
      {
        id: "build",
        moduleId: "builder",
        config: { label: "Build", sourcePhaseId: "spec", brief: "A simple, clean single-screen prototype." },
      },
      close,
    ],
  },
  {
    id: "psych-safety-pulse",
    name: "Psychological-Safety Pulse",
    description:
      "An anonymous start-and-end read on team safety (Edmondson's items), so you can see whether the session itself moved the needle.",
    tag: "reflect",
    phases: [
      lobby,
      {
        id: "ps-start",
        moduleId: "scale",
        config: {
          label: "Pulse — start",
          statements: [
            "It's safe to take a risk or admit a mistake on this team",
            "People here can bring up problems and tough issues",
            "It's easy to ask others here for help",
          ],
          min: 1,
          max: 5,
          labels: ["strongly disagree", "strongly agree"],
        },
      },
      {
        id: "ps-work",
        moduleId: "capture",
        config: { label: "What would make it safer?", prompt: "What's one thing that would make it easier to speak up here?", anonymity: "anonymous", timerSeconds: 300, multiSubmit: true },
      },
      {
        id: "ps-end",
        moduleId: "scale",
        config: {
          label: "Pulse — end",
          statements: [
            "It's safe to take a risk or admit a mistake on this team",
            "People here can bring up problems and tough issues",
            "It's easy to ask others here for help",
          ],
          min: 1,
          max: 5,
          labels: ["strongly disagree", "strongly agree"],
        },
      },
      close,
    ],
  },
  {
    id: "high-risk-ai",
    name: "High-Risk AI (CoLab)",
    description:
      "Companion layer for 'Getting Hands-On With High-Risk AI'. The assessment + control stations run in the case-study system; this is the off-the-record room layer: the Station-3 fairness call, the closing vote on the five questions, and an anonymous commitment capture.",
    tag: "decide",
    phases: [
      {
        id: "lobby",
        moduleId: "lobby",
        config: {
          label: "Lobby",
          message: "Phones out — scan the screen to join. No app, nothing stored.",
        },
      },
      {
        id: "bias-call",
        moduleId: "poll",
        config: {
          label: "Your fairness call",
          question:
            "Station 3 — your call on the item that scored one group lower for reasons that don't look like competence:",
          options: [
            "🟥 Retire it — pull from production now",
            "🟨 Re-author it — keep the construct, fix the wording",
            "🟧 Field-test it alongside the current item",
            "🟩 Keep it, with monitoring",
          ],
          reveal: "onAdvance",
        },
      },
      {
        id: "the-one",
        moduleId: "poll",
        config: {
          label: "The one you'd require",
          question:
            "The ONE question you'd require answered before you'd sign off on a system like this:",
          options: [
            "1 · Can it show its evidence?",
            "2 · Who can steer it — and is that on the record?",
            "3 · Who makes the final call — model or person?",
            "4 · How would we know if it's quietly unfair?",
            "5 · If challenged in a year, what would the record show?",
          ],
          reveal: "onAdvance",
        },
      },
      {
        id: "why",
        moduleId: "capture",
        config: {
          label: "Why that one",
          prompt:
            "Which question did you pick, and why that one? And one thing you want to follow up on.",
          placeholder: "The one I'd require is… because…",
          anonymity: "anonymous",
          multiSubmit: true,
          timerSeconds: 240,
        },
      },
      close,
    ],
  },
];

export function getTemplate(id: string): SessionTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
