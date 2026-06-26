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

// Seed the shadow room: the active sequence + a synthetic roster + sample text
// contributions for every submissions-gather phase (so a capture/brainstorm/
// read-around phase reads as populated, and rotation phases form real groups from
// the roster). Vote tallies are intentionally left empty — honestly the same as
// the first moment of a live vote.
export async function seedRehearsal(
  shadowId: string,
  phases: PhaseInstance[],
  castSize: number,
): Promise<{ tokens: string[]; handles: string[] }> {
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
  for (const p of phases) {
    const mod = getServerModule(p.moduleId);
    if (mod?.capabilities.gatherSource === "submissions") {
      const count = Math.min(6, n);
      for (let i = 0; i < count; i++) {
        await addSubmission(handles[i], SAMPLES[i % SAMPLES.length], p.id, null, tokens[i], shadowId);
      }
    }
  }
  return { tokens, handles };
}

// Tear down a rehearsal shadow room — guarded so it can NEVER purge a real room.
export async function tearDownRehearsal(shadowId: string): Promise<void> {
  if (!isRehearsalRoom(shadowId)) return;
  await purgeRoom(shadowId);
}
