// B5 — rehearsal / dry-run. A facilitator walks their built session solo, with a
// synthetic cast, in a structurally-ISOLATED shadow room that leaves zero real
// data. Isolation is free and total: roomKeys(roomId) namespaces every store key
// by the room id, and every LIVE route (/host, /state, /stream, /action, /join)
// gates on getRoom() returning a real Room record — the shadow id has none, so
// they all 404 it. Only the rehearse route (authed on the live slug, operating on
// the shadow id) can touch it.

import {
  addParticipant,
  addSubmission,
  addWord,
  castVote,
  purgeRoom,
  setPhases,
} from "./store";
import { getServerModule } from "./modules/registry.server";
import type { PhaseInstance } from "./types";

const TAG = "::rehearsal:";

// `word-xxxx` is the only real slug shape, so `::` can never collide with one.
export function shadowRoomId(slug: string, nonce: string): string {
  return `${slug}${TAG}${nonce.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
}
export function isRehearsalRoom(id: string): boolean {
  return id.includes(TAG);
}

const CAST = ["Ada", "Bo", "Cy", "Dev", "Eli", "Fae", "Gus", "Hana", "Ivo", "Jo", "Kit", "Lun"];
const SAMPLES = [
  "A bold idea worth testing.",
  "What if we flipped the model entirely?",
  "The real constraint here is time, not money.",
  "Start smaller and learn faster.",
  "Name the elephant in the room.",
  "Double down on what's already working.",
  "We're solving the wrong problem.",
  "Give it to the people closest to it.",
];

export const MIN_CAST = 4;
export const MAX_CAST = 12;

const WORDS = ["clarity", "focus", "trust", "momentum", "energy", "calm", "speed", "care"];
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// B5 — canned-AI: the AI-synthesis modules cache their result as votes["__ai__"]
// ({ <items>, generatedAt, inputCount }) and computeView is a pure read of it. So
// rehearsing one with NO real AI call (free + instant) just means seeding a
// plausible canned result here — the dry-run then previews the synthesis exactly
// as the room would see it. A "use real AI" toggle skips this so a real generate
// can run (when an API key is present).
const CANNED_AI: Record<string, () => Record<string, unknown>> = {
  synthesis: () => ({
    bullets: [
      "The room keeps returning to trust as the unlock",
      "Speed and quality are framed as a trade-off no one wants",
    ],
    tension: "Move fast vs. get it right",
  }),
  needs: () => ({
    needs: [
      {
        need: "Confidence the work will land",
        jtbd: "When I commit to a plan, I want early signal it's working, so I can adjust without losing face.",
        evidence: ["“we never know if it's working until too late”"],
        confidence: "high",
      },
    ],
  }),
  devil: () => ({
    objections: [
      { title: "Who actually owns this?", body: "With no single accountable person, the plan stalls at the first resistance." },
      { title: "What if adoption is only partial?", body: "A half-adopted change can be worse than today." },
    ],
  }),
  friction: () => ({
    tensions: [
      { axis: "Speed vs. rigor", tension: "The room wants to move fast but fears shipping something half-baked.", poleA: "Ship and learn", poleB: "Get it right first", intensity: 4 },
    ],
  }),
};

async function seedAiResult(shadowId: string, phase: PhaseInstance, inputCount: number): Promise<void> {
  const make = CANNED_AI[phase.moduleId];
  if (!make) return;
  await castVote(phase.id, "__ai__", { ...make(), generatedAt: 0, inputCount }, shadowId);
}

// B5 — per-module response seeding: cast plausible, DETERMINISTIC votes (keyed by
// the real cast tokens) for a vote-gather phase, so a rehearsed poll/scale/etc.
// previews a POPULATED result instead of a blank "nobody voted yet" screen. Reuses
// the phase's own config (options/items/statements), so the tally is config-true.
async function seedVotePhase(
  shadowId: string,
  phase: PhaseInstance,
  voters: string[],
): Promise<void> {
  const c = phase.config as Record<string, unknown>;
  const cast = (token: string, value: unknown) => castVote(phase.id, token, value, shadowId);
  switch (phase.moduleId) {
    case "poll": {
      const opts = strArr(c.options);
      if (!opts.length) return;
      const multi = Boolean(c.multi);
      await Promise.all(
        voters.map((t, i) => cast(t, multi ? [opts[i % opts.length]] : opts[i % opts.length])),
      );
      break;
    }
    case "dotvote": {
      const opts = strArr(c.options);
      const dots = typeof c.dots === "number" ? c.dots : 3;
      if (!opts.length) return;
      await Promise.all(
        voters.map((t, i) => cast(t, { [opts[i % opts.length]]: Math.min(dots, 1 + (i % dots)) })),
      );
      break;
    }
    case "rank": {
      const items = strArr(c.items);
      if (items.length < 2) return;
      await Promise.all(voters.map((t, i) => cast(t, i % 2 ? [...items].reverse() : items)));
      break;
    }
    case "scale": {
      const statements = strArr(c.statements);
      const max = typeof c.max === "number" ? c.max : 5;
      const min = typeof c.min === "number" ? c.min : 1;
      if (!statements.length) return;
      await Promise.all(
        voters.map((t, i) => cast(t, statements.map((_, j) => min + ((i + j) % Math.max(1, max - min + 1))))),
      );
      break;
    }
    case "matrix": {
      await Promise.all(
        voters.map((t, i) => cast(t, { text: SAMPLES[i % SAMPLES.length].slice(0, 30), x: (i * 2) % 10, y: (i * 3) % 10 })),
      );
      break;
    }
    case "wordcloud": {
      await Promise.all(voters.map((t, i) => addWord(phase.id, t, WORDS[i % WORDS.length], shadowId)));
      break;
    }
  }
}

// Seed the shadow room: the active sequence + a synthetic roster + sample text
// contributions for every submissions-gather phase (so capture/brainstorm/read-
// around reads as populated, and rotation phases form real groups), AND (B5)
// config-true synthetic tallies for every vote-gather phase (poll/dotvote/rank/
// scale/matrix/wordcloud), so a rehearsed vote previews a populated result rather
// than a blank screen. Votes come from ~75% of the cast so "responded < present"
// reads realistically.
export async function seedRehearsal(
  shadowId: string,
  phases: PhaseInstance[],
  castSize: number,
  // B5 — seed canned AI results by default (free/instant preview); pass false to
  // leave AI phases empty so a real generate can run during the rehearsal.
  opts: { cannedAi?: boolean } = {},
): Promise<{ tokens: string[]; handles: string[] }> {
  const cannedAi = opts.cannedAi !== false;
  const n = Math.max(MIN_CAST, Math.min(castSize, MAX_CAST));
  await setPhases(phases, "Rehearsal", shadowId);
  const tokens: string[] = [];
  const handles: string[] = [];
  for (let i = 0; i < n; i++) {
    const token = `rh-${i}`;
    await addParticipant(token, CAST[i % CAST.length], shadowId);
    tokens.push(token);
    handles.push(CAST[i % CAST.length]);
  }
  // ~75% of the cast respond, so the rehearsal shows a realistic "M of N in".
  const voters = tokens.slice(0, Math.max(1, Math.round(n * 0.75)));
  for (const p of phases) {
    const mod = getServerModule(p.moduleId);
    if (mod?.capabilities.gatherSource === "submissions") {
      const count = Math.min(6, n);
      for (let i = 0; i < count; i++) {
        await addSubmission(handles[i], SAMPLES[i % SAMPLES.length], p.id, null, tokens[i], shadowId);
      }
    } else if (mod?.capabilities.gatherSource === "votes") {
      await seedVotePhase(shadowId, p, voters);
    }
    // Canned AI result for the synthesis modules (so the dry-run shows the output).
    if (cannedAi && mod?.capabilities.usesAi) {
      await seedAiResult(shadowId, p, voters.length);
    }
  }
  return { tokens, handles };
}

// Tear down a rehearsal shadow room — guarded so it can NEVER purge a real room.
export async function tearDownRehearsal(shadowId: string): Promise<void> {
  if (!isRehearsalRoom(shadowId)) return;
  await purgeRoom(shadowId);
}
