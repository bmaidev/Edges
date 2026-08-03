import type { ModuleKind } from "@/lib/types";

export type ModuleComplexity = "starter" | "guided" | "advanced";
export type TextOutput = "none" | "always" | "when-configured";

export interface ModuleExperience {
  complexity: ModuleComplexity;
  input: string;
  output: string;
  watchFor: string;
  textOutput: TextOutput;
}

// The method contract in facilitator language. This is deliberately exhaustive:
// adding a runtime module without explaining its input, output, level of craft,
// and main facilitation risk is a compile-time error.
export const MODULE_EXPERIENCE = {
  lobby: {
    complexity: "starter",
    input: "A welcome message and the people arriving",
    output: "A calm, shared starting point and an arrival count",
    watchFor:
      "Move on once the expected room is present; a lobby should reassure, not stall.",
    textOutput: "none",
  },
  content: {
    complexity: "starter",
    input: "Facilitator-curated notes, prompts, or reference material",
    output: "Shared context everyone can read from the same source",
    watchFor:
      "Keep it brief enough to scan; long reading belongs before the session.",
    textOutput: "none",
  },
  media: {
    complexity: "starter",
    input: "Images, PDF pages, or a trusted video URL",
    output: "A facilitator-controlled presentation on the room screen",
    watchFor:
      "Load and rehearse the deck before people arrive, especially video playback.",
    textOutput: "none",
  },
  ambient: {
    complexity: "starter",
    input: "A break, hold, breathing, countdown, or cue-card scene",
    output: "A deliberate pause without losing the room",
    watchFor:
      "Tell people when you will resume; an unexplained holding screen feels broken.",
    textOutput: "none",
  },
  capture: {
    complexity: "starter",
    input:
      "One clear question, optionally with reference material or a second prompt",
    output: "Room-authored ideas, observations, or reflections",
    watchFor:
      "Ask one thing at a time and choose anonymity before responses arrive.",
    textOutput: "always",
  },
  allocate: {
    complexity: "guided",
    input: "A set of meaningful choices or lenses",
    output:
      "A visible distribution and an allocation stored for later activities",
    watchFor:
      "Avoid choices that imply status; explain what the allocation changes next.",
    textOutput: "none",
  },
  coordinator: {
    complexity: "guided",
    input: "The current roster and, for lens triads, an earlier allocation",
    output: "Private pair or triad instructions for each person",
    watchFor:
      "Plan for odd numbers and make the physical way to find partners explicit.",
    textOutput: "none",
  },
  readaround: {
    complexity: "guided",
    input: "Earlier room contributions or facilitator-created patterns",
    output: "A paced, shared reading of one item at a time",
    watchFor:
      "Curate or timebox large sets so reading does not become a passive trudge.",
    textOutput: "none",
  },
  close: {
    complexity: "starter",
    input: "A closing message and each participant's own contributions",
    output: "A clear ending and a personal copyable keepsake",
    watchFor:
      "Name the next step; gratitude without closure leaves action ambiguous.",
    textOutput: "none",
  },
  poll: {
    complexity: "starter",
    input: "One decision-shaped question and distinct answer options",
    output: "A count and distribution of the room's choices",
    watchFor:
      "Options must be mutually understandable; hide results when social influence matters.",
    textOutput: "none",
  },
  dotvote: {
    complexity: "starter",
    input: "A shortlist of viable options and a dot budget",
    output: "A prioritised option set with strength of preference",
    watchFor:
      "Use it to narrow, not to pretend popularity alone is a decision.",
    textOutput: "none",
  },
  rank: {
    complexity: "starter",
    input: "A short set of comparable items",
    output: "An aggregate priority order",
    watchFor:
      "Keep the list short and comparable; ranking unlike things creates false precision.",
    textOutput: "none",
  },
  scale: {
    complexity: "starter",
    input: "One or more statements and meaningful scale anchors",
    output: "Per-statement distributions and averages",
    watchFor:
      "Label both ends; an unlabeled number means different things to different people.",
    textOutput: "none",
  },
  wordcloud: {
    complexity: "starter",
    input: "A prompt that genuinely calls for short words or phrases",
    output: "A live frequency cloud and quick room pulse",
    watchFor: "Do not use frequency as evidence of importance or agreement.",
    textOutput: "none",
  },
  qna: {
    complexity: "starter",
    input: "An invitation for questions",
    output: "Room-authored questions ordered by peer interest",
    watchFor:
      "State how unanswered questions will be handled so voting does not become a dead end.",
    textOutput: "always",
  },
  matrix: {
    complexity: "guided",
    input: "Two independent criteria with clear low and high anchors",
    output: "Participant-authored items positioned on a shared 2×2 map",
    watchFor:
      "Choose genuinely independent axes and discuss outliers instead of averaging them away.",
    textOutput: "none",
  },
  brainwrite: {
    complexity: "guided",
    input: "A generative prompt and seed ideas passed between people",
    output: "Room-authored idea chains that build without airtime dominance",
    watchFor:
      "Keep rounds brisk and ask for additions, not editorial criticism.",
    textOutput: "always",
  },
  marketplace: {
    complexity: "guided",
    input: "Ideas from an earlier phase and a credit budget",
    output: "A portfolio-style signal of confidence across ideas",
    watchFor:
      "Explain the currency metaphor and whether self-investment is strategically useful.",
    textOutput: "none",
  },
  redistribute: {
    complexity: "guided",
    input: "Contributions from an earlier phase redistributed to new people",
    output: "Fresh critiques, defences, or improvements as room-authored text",
    watchFor:
      "Frame critique as service to the idea, never a judgement of its author.",
    textOutput: "always",
  },
  spectrogram: {
    complexity: "guided",
    input: "A polarising statement with two honest endpoints",
    output:
      "A distribution of positions, optional reasons, and before/after movement",
    watchFor:
      "Invite movement and curiosity; do not turn the line into opposing camps.",
    textOutput: "none",
  },
  gradient: {
    complexity: "guided",
    input: "A concrete proposal and a chosen consent scale",
    output: "Degrees of support plus concerns at the dissent end",
    watchFor:
      "Use concerns to improve the proposal; never treat the mean as consent.",
    textOutput: "none",
  },
  lightning: {
    complexity: "guided",
    input: "A speaker queue and a strict per-speaker timebox",
    output: "A visible, accountable sequence of concise talks",
    watchFor:
      "Protect the timebox equally and decide how questions will be handled afterward.",
    textOutput: "none",
  },
  fishbowl: {
    complexity: "advanced",
    input:
      "A discussion question, inner seats, and an explicit seat-changing protocol",
    output: "A focused public dialogue with optional audience questions",
    watchFor:
      "Explain how people enter and leave the bowl; otherwise the same voices stay central.",
    textOutput: "when-configured",
  },
  openspace: {
    complexity: "advanced",
    input: "Participant-proposed topics, available spaces, and time slots",
    output: "A participant-owned agenda and room-authored session proposals",
    watchFor:
      "Make the law of mobility explicit and leave enough time for agenda creation.",
    textOutput: "always",
  },
  consult: {
    complexity: "advanced",
    input: "Real participant challenges and protected consulting rounds",
    output: "Targeted peer advice captured as room-authored text",
    watchFor:
      "Enforce the client's listen-only period; premature dialogue weakens the method.",
    textOutput: "always",
  },
  devil: {
    complexity: "advanced",
    input: "Earlier room input and an available AI connection",
    output: "AI-generated objections plus the room's response signal",
    watchFor:
      "Treat objections as prompts for judgement, not as authoritative risk findings.",
    textOutput: "none",
  },
  friction: {
    complexity: "advanced",
    input: "Earlier room input and an available AI connection",
    output: "A structured map of tensions for the room to evaluate",
    watchFor:
      "Check the map against lived context; AI can make weak tensions sound definitive.",
    textOutput: "none",
  },
  synthesis: {
    complexity: "guided",
    input: "One earlier phase or all room contributions, plus AI",
    output: "A reviewable synthesis that can be promoted to the room",
    watchFor: "Review before sharing and regenerate after material new input.",
    textOutput: "none",
  },
  needs: {
    complexity: "advanced",
    input: "Earlier contributions and an available AI connection",
    output: "Facilitator-only hypotheses about latent needs",
    watchFor:
      "Call these hypotheses, not research; validate them with the people affected.",
    textOutput: "none",
  },
  equity: {
    complexity: "advanced",
    input: "Participation activity accumulated during the session",
    output: "A facilitator-only distribution of participation",
    watchFor:
      "Use the signal to change invitations and structure, never to grade individuals.",
    textOutput: "none",
  },
  prework: {
    complexity: "starter",
    input: "A clear asynchronous prompt and a short explanatory brief",
    output: "Room-authored input gathered before the live session",
    watchFor:
      "Give a deadline and explain how the contribution will be used live.",
    textOutput: "always",
  },
  worldcafe: {
    complexity: "advanced",
    input: "A rich question, table groups, hosts, and multiple rounds",
    output: "Cross-pollinated conversation with optional captured table notes",
    watchFor:
      "Brief table hosts to connect rounds rather than repeat each conversation.",
    textOutput: "when-configured",
  },
  stations: {
    complexity: "advanced",
    input: "Distinct stations, stable groups, and a rotation cadence",
    output: "Broad exposure across stations with optional captured notes",
    watchFor:
      "Allow movement time and make each station valuable in any order.",
    textOutput: "when-configured",
  },
  onetwofour: {
    complexity: "guided",
    input: "One strong question and widening individual-to-group rounds",
    output: "Broadly owned ideas with optional shared outputs from each stage",
    watchFor:
      "Protect the silent one-minute start; it is what equalises participation.",
    textOutput: "when-configured",
  },
  twentyfive10: {
    complexity: "guided",
    input: "One bold idea from each person and repeated blind scoring",
    output: "Room-authored ideas with a distributed boldness score",
    watchFor:
      "Keep authorship hidden during scoring and explain that 25/10 is a signal, not proof.",
    textOutput: "always",
  },
  minspecs: {
    complexity: "guided",
    input: "Candidate rules or requirements from the room",
    output: "A minimal set of room-authored must-do constraints",
    watchFor:
      "Test what can be removed; this is subtraction, not another requirements list.",
    textOutput: "always",
  },
  persona: {
    complexity: "advanced",
    input: "Earlier room input, carefully framed personas, and AI",
    output: "Synthetic reactions and a room evaluation signal",
    watchFor:
      "Personas are lenses, never substitutes for real affected people or user research.",
    textOutput: "none",
  },
  emptychair: {
    complexity: "advanced",
    input: "An absent stakeholder description, room questions, and AI",
    output: "A synthetic stakeholder response and room-authored questions",
    watchFor:
      "Name the voice as simulated and record what must later be validated with real people.",
    textOutput: "when-configured",
  },
  issuemap: {
    complexity: "advanced",
    input: "One earlier phase or all contributions, plus AI",
    output: "A structured issue-and-relationship map for room review",
    watchFor:
      "Use the map to expose relationships, not to imply a single correct diagnosis.",
    textOutput: "none",
  },
  promptrelay: {
    complexity: "guided",
    input: "A concrete task and one assigned prompt segment per participant",
    output: "Room-authored prompt ingredients and an AI-composed draft",
    watchFor:
      "Review the composed output against the original task before treating it as done.",
    textOutput: "always",
  },
  builder: {
    complexity: "advanced",
    input: "A prototype brief, optional earlier ideas, and AI",
    output: "A reviewable, clickable HTML prototype",
    watchFor:
      "Use it to learn, not to promise production feasibility, accessibility, or security.",
    textOutput: "always",
  },
  actions: {
    complexity: "starter",
    input: "A commitment prompt and optional owner names",
    output: "Private personal commitments plus a facilitator follow-up list",
    watchFor:
      "Make the next check-in explicit; captured actions without follow-through decay quickly.",
    textOutput: "always",
  },
} satisfies Record<ModuleKind, ModuleExperience>;

export interface ConfigFieldGuide {
  label: string;
  help: string;
  level?: "core" | "advanced";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  optionLabels?: Record<string, string>;
  tupleLabels?: [string, string];
}

const FIELDS: Record<string, ConfigFieldGuide> = {
  label: {
    label: "Phase name",
    help: "The short name facilitators see in the run sequence.",
  },
  message: {
    label: "Message",
    help: "The main message shown to the room.",
    placeholder: "Write the one thing people need to know…",
  },
  contentHeading: {
    label: "Content heading",
    help: "An optional heading above the reference material.",
    level: "advanced",
  },
  showContentTypes: {
    label: "Content to show",
    help: "Limit the shared reference material to these content types.",
    level: "advanced",
  },
  cards: {
    label: "Presentation cards",
    help: "Seed the deck here, or use the visual deck uploader while facilitating.",
    level: "advanced",
  },
  prompt: {
    label: "Question or prompt",
    help: "Use plain language and ask for one kind of response at a time.",
    placeholder: "What would be most useful to surface?",
  },
  prompt2: {
    label: "Second prompt",
    help: "Use only when two linked responses are essential.",
    level: "advanced",
  },
  placeholder: {
    label: "Answer hint",
    help: "A short example of the shape of a useful response—not an answer to copy.",
    level: "advanced",
  },
  placeholder2: {
    label: "Second answer hint",
    help: "A short hint for the second response box.",
    level: "advanced",
  },
  timerSeconds: {
    label: "Timebox",
    help: "The planned duration for this phase.",
    level: "advanced",
    min: 30,
    max: 14400,
    step: 30,
  },
  multiSubmit: {
    label: "Allow more than one response",
    help: "Let each person add several distinct contributions.",
    level: "advanced",
  },
  tagWith: {
    label: "Tag responses with",
    help: "Attach each person's current lens or side for later comparison.",
    level: "advanced",
    optionLabels: { lens: "Their lens", side: "Their side" },
  },
  anonymity: {
    label: "Identity handling",
    help: "Named shows authors; anonymous hides names; strict anonymity also removes the participant link.",
    level: "advanced",
    optionLabels: {
      named: "Named",
      anonymous: "Anonymous to the room",
      "anonymous-strict": "Strictly anonymous",
    },
  },
  constraintDeck: {
    label: "Live constraint cards",
    help: "Optional prompts you can inject mid-activity to stretch the room's thinking.",
    level: "advanced",
  },
  kind: { label: "Type", help: "Choose the behaviour this module should use." },
  cap: {
    label: "Maximum people per choice",
    help: "Leave empty for no capacity limit.",
    level: "advanced",
    min: 1,
    max: 500,
    step: 1,
  },
  optionsFromContentType: {
    label: "Build choices from content",
    help: "Use previously loaded content as the choices instead of a fixed list.",
    level: "advanced",
  },
  fixedOptions: {
    label: "Choices",
    help: "One clear, distinct choice per line.",
  },
  header: {
    label: "Instruction",
    help: "Tell people what they are choosing and what it will affect.",
  },
  coordinator: {
    label: "Coordination",
    help: "Controls how people are matched and what each person sees.",
  },
  readaround: {
    label: "Read-around source",
    help: "Controls what the facilitator will pace through.",
  },
  source: {
    label: "Source type",
    help: "Choose contributions or facilitator-curated patterns.",
  },
  sourcePhaseId: {
    label: "Takes input from",
    help: "Connect this module to an earlier phase, or use all prior input where supported.",
  },
  question: {
    label: "Question",
    help: "Make the decision or distinction the room is responding to explicit.",
    placeholder: "What do we need to decide?",
  },
  options: {
    label: "Answer options",
    help: "One distinct option per line; avoid overlaps and hidden catch-all choices.",
  },
  multi: {
    label: "Allow multiple choices",
    help: "Use only when more than one answer can genuinely be true.",
    level: "advanced",
  },
  reveal: {
    label: "Show results",
    help: "Hide results until advance when early votes could influence later voters.",
    level: "advanced",
    optionLabels: {
      live: "Live as people vote",
      onAdvance: "After the facilitator advances",
    },
  },
  dots: {
    label: "Dots per person",
    help: "A smaller budget forces clearer trade-offs.",
    min: 1,
    max: 20,
    step: 1,
  },
  items: {
    label: "Items to rank",
    help: "Use a short list of things that are genuinely comparable.",
  },
  statements: {
    label: "Statements to rate",
    help: "One precise statement per line.",
  },
  min: {
    label: "Minimum value",
    help: "The numeric value at the low end of the scale.",
    level: "advanced",
  },
  max: {
    label: "Maximum value",
    help: "The numeric value at the high end of the scale.",
    level: "advanced",
  },
  labels: {
    label: "Scale anchors",
    help: "Name what the low and high ends mean.",
    tupleLabels: ["Low end", "High end"],
  },
  maxWords: {
    label: "Words per person",
    help: "Keep this low so the cloud remains a quick pulse.",
    min: 1,
    max: 10,
    step: 1,
  },
  xLabel: {
    label: "Horizontal axis",
    help: "Name the low and high ends of the horizontal criterion.",
    tupleLabels: ["Left / low", "Right / high"],
  },
  yLabel: {
    label: "Vertical axis",
    help: "Name the low and high ends of the vertical criterion.",
    tupleLabels: ["Bottom / low", "Top / high"],
  },
  maxLen: {
    label: "Maximum response length",
    help: "Keep responses concise enough to scan and use live.",
    level: "advanced",
    min: 20,
    max: 2000,
    step: 10,
  },
  budget: {
    label: "Credits per person",
    help: "The total portfolio budget each person can invest.",
    min: 1,
    max: 10000,
    step: 1,
  },
  maxPerIdea: {
    label: "Maximum per idea",
    help: "Optionally prevent a person putting their entire budget into one idea.",
    level: "advanced",
    min: 1,
    max: 10000,
    step: 1,
  },
  currencyLabel: {
    label: "Currency name",
    help: "A simple label such as credits, tokens, or points.",
    level: "advanced",
  },
  showLeaderboardLive: {
    label: "Show the leaderboard live",
    help: "Turn off when visible investment could create a bandwagon effect.",
    level: "advanced",
  },
  allowSelfInvest: {
    label: "Allow investment in your own idea",
    help: "Enable when conviction is part of the exercise; disable for independent judgement.",
    level: "advanced",
  },
  mode: {
    label: "Method",
    help: "Choose the interaction pattern the room will use.",
  },
  requireResponse: {
    label: "Require a response",
    help: "Use when every redistributed item must receive a considered reply.",
    level: "advanced",
  },
  statement: {
    label: "Statement",
    help: "Write a claim people can meaningfully position themselves against.",
  },
  poleLabels: {
    label: "Position anchors",
    help: "Name both ends without making one sound socially preferable.",
    tupleLabels: ["Left end", "Right end"],
  },
  buckets: {
    label: "Number of bands",
    help: "Used only in banded mode; fewer bands are easier to read live.",
    level: "advanced",
    min: 2,
    max: 12,
    step: 1,
  },
  allowReasons: {
    label: "Invite a reason",
    help: "Let people briefly explain their position to the facilitator.",
    level: "advanced",
  },
  beforeAfter: {
    label: "Measure before and after",
    help: "Capture movement after discussion instead of only a single snapshot.",
    level: "advanced",
  },
  proposal: {
    label: "Proposal",
    help: "State the concrete proposal exactly as people are being asked to support.",
  },
  scale: {
    label: "Agreement scale",
    help: "Choose the language that matches your decision practice.",
  },
  requireReasonForConcern: {
    label: "Require context for concerns",
    help: "People choosing a concern or objection must briefly explain it so the group can work with it.",
    level: "advanced",
  },
  secondsPerSpeaker: {
    label: "Seconds per speaker",
    help: "Use a firm, realistic timebox and apply it equally.",
    min: 15,
    max: 3600,
    step: 15,
  },
  queueMode: {
    label: "Speaker order",
    help: "Sign-up rewards readiness; random order reduces first-mover advantage.",
    optionLabels: { signup: "Sign-up order", random: "Stable random order" },
  },
  topicPrompt: {
    label: "Topic hint",
    help: "Optional text shown when someone joins the speaker queue.",
    level: "advanced",
  },
  innerSeats: {
    label: "Inner-circle seats",
    help: "Leave at least two seats and make the exchange protocol explicit.",
    min: 2,
    max: 50,
    step: 1,
  },
  allowQuestions: {
    label: "Let the outer circle submit questions",
    help: "Creates a written channel without interrupting the inner dialogue.",
    level: "advanced",
  },
  slots: {
    label: "Time slots",
    help: "The number of agenda rounds available.",
    min: 1,
    max: 20,
    step: 1,
  },
  spaces: {
    label: "Available spaces",
    help: "One physical or virtual meeting space per line.",
  },
  format: {
    label: "Consulting format",
    help: "Troika uses trios; Wise Crowds uses a larger consultant group.",
  },
  phaseSeconds: {
    label: "Round timing",
    help: "Set separate timeboxes for presenting and listen-only advice.",
  },
  present: {
    label: "Presenting seconds",
    help: "Time for the client to describe the challenge and answer clarifying questions.",
    min: 30,
    max: 1800,
    step: 30,
  },
  advise: {
    label: "Advice seconds",
    help: "Time for the client to listen silently while consultants work.",
    min: 30,
    max: 3600,
    step: 30,
  },
  target: {
    label: "What to challenge",
    help: "Aim objections at the group's input or an AI-generated recommendation.",
  },
  maxObjections: {
    label: "Maximum objections",
    help: "A small number keeps the critique usable rather than overwhelming.",
    level: "advanced",
    min: 1,
    max: 10,
    step: 1,
  },
  topNTensions: {
    label: "Tensions to surface",
    help: "Limit the map to the few tensions worth discussing live.",
    level: "advanced",
    min: 1,
    max: 12,
    step: 1,
  },
  bulletCount: {
    label: "Synthesis points",
    help: "Choose how concise the generated synthesis should be.",
    level: "advanced",
    min: 1,
    max: 12,
    step: 1,
  },
  anonymize: {
    label: "Hide participant names",
    help: "Keep this on unless naming people is necessary and psychologically safe.",
    level: "advanced",
  },
  brief: {
    label: "Brief",
    help: "Give enough context, constraints, and intended audience to make the activity useful.",
  },
  tables: {
    label: "Number of tables",
    help: "Leave empty to size tables automatically from the live room.",
    level: "advanced",
    min: 1,
    max: 50,
    step: 1,
  },
  captureNotes: {
    label: "Capture group notes",
    help: "Save a short written output from each round for later use.",
    level: "advanced",
  },
  stations: {
    label: "Stations",
    help: "One distinct station name or topic per line.",
  },
  groupSize: {
    label: "People per group",
    help: "Small groups increase airtime; larger groups reduce the number of stations needed.",
    level: "advanced",
    min: 2,
    max: 20,
    step: 1,
  },
  captureShared: {
    label: "Capture each group's shared answer",
    help: "Keeps the outputs from pairs, fours, and the whole group for later phases.",
    level: "advanced",
  },
  maxScore: {
    label: "Highest score",
    help: "The maximum score a person can give each idea.",
    level: "advanced",
    min: 2,
    max: 10,
    step: 1,
  },
  passes: {
    label: "Scoring rounds",
    help: "More passes improve coverage but take longer.",
    min: 1,
    max: 10,
    step: 1,
  },
  personas: {
    label: "Personas",
    help: "Use distinct, evidence-informed lenses and avoid demographic caricatures.",
  },
  societyMode: {
    label: "Let personas interact",
    help: "Ask the synthetic panel to respond as a group rather than separately.",
    level: "advanced",
  },
  persona: {
    label: "Absent stakeholder",
    help: "Describe the perspective that is missing from the room.",
  },
  name: { label: "Name", help: "A short, recognisable name for this item." },
  description: {
    label: "Description",
    help: "Describe goals, context, constraints, and perspective without stereotyping.",
  },
  task: {
    label: "Shared task",
    help: "State the concrete output the completed prompt should produce.",
  },
  segmentKinds: {
    label: "Prompt segments",
    help: "One useful prompt ingredient per participant, in the order they will be assembled.",
  },
  askOwner: {
    label: "Let people name an owner",
    help: "Turn off when every commitment should default to its author.",
    level: "advanced",
  },
  maxItems: {
    label: "Commitments per person",
    help: "A small cap keeps the close focused on actions people can genuinely carry.",
    level: "advanced",
    min: 1,
    max: 20,
    step: 1,
  },
  scene: {
    label: "Scene",
    help: "Choose the visual and pacing treatment for the pause.",
  },
  note: {
    label: "Public note",
    help: "Optional text shown on the holding screen.",
    level: "advanced",
  },
  nextStep: {
    label: "What happens next",
    help: "Tell people what to do, expect, or take with them after the session.",
  },
  id: {
    label: "Internal ID",
    help: "A stable identifier used to keep this item distinct.",
    level: "advanced",
  },
  url: { label: "Media URL", help: "Use a trusted HTTPS image or video URL." },
  title: { label: "Title", help: "An optional human-readable title." },
};

const OVERRIDES: Partial<
  Record<`${ModuleKind}.${string}`, Partial<ConfigFieldGuide>>
> = {
  "ambient.kind": {
    label: "Pause type",
    optionLabels: { break: "Break", hold: "Hold" },
  },
  "allocate.kind": {
    label: "Allocate by",
    optionLabels: { lens: "Lens", side: "Side" },
  },
  "coordinator.kind": {
    label: "Grouping",
    optionLabels: { pair: "Pairs", "lens-triad": "Triads by lens" },
  },
  "readaround.source": {
    optionLabels: {
      submissions: "Room contributions",
      patterns: "Facilitator patterns",
    },
  },
  "redistribute.mode": {
    optionLabels: {
      critique: "Constructive critique",
      defend: "Build the defence",
      improve: "Improve the idea",
    },
  },
  "spectrogram.mode": {
    optionLabels: { continuous: "Continuous line", buckets: "Discrete bands" },
  },
  "media.kind": {
    label: "Media type",
    optionLabels: { image: "Image", video: "Video" },
  },
};

function sentenceCase(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function configFieldGuide(
  moduleId: ModuleKind,
  path: readonly string[],
): ConfigFieldGuide {
  const key = path[path.length - 1] ?? "setting";
  const base = FIELDS[key] ?? {
    label: sentenceCase(key),
    help: `Fine-tune the ${sentenceCase(key).toLowerCase()} for this phase.`,
    level: "advanced" as const,
  };
  return { ...base, ...(OVERRIDES[`${moduleId}.${key}`] ?? {}) };
}

export function canFeedForward(
  moduleId: ModuleKind,
  config?: Record<string, unknown>,
): boolean {
  const kind = MODULE_EXPERIENCE[moduleId].textOutput;
  if (kind === "always") return true;
  if (kind === "none") return false;
  if (moduleId === "fishbowl") return config?.allowQuestions !== false;
  if (moduleId === "worldcafe" || moduleId === "stations")
    return config?.captureNotes !== false;
  if (moduleId === "onetwofour") return config?.captureShared !== false;
  if (moduleId === "emptychair") return true;
  return false;
}
