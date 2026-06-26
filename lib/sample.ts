// Pure, AI-free seeder for the reserved demo room (`sample-demo`): a believable
// mid-session Blue Sky snapshot a facilitator can poke — Run / Advance /
// Patterns / Content / End — against fake data they cannot break. Everything is
// hardcoded fixtures (no real-person data), and the whole session-state portion
// lands in ONE replaceState write so it can't tear under eventual consistency.

import {
  createRoomWithSlug,
  freshPasscodes,
  getRoom,
} from "./rooms";
import {
  addContent,
  addParticipant,
  addSubmission,
  createPattern,
  endSession,
  getState,
  listSubmissions,
  replaceState,
  withLock,
} from "./store";
import { TEMPLATES } from "./templates";

export const SAMPLE_SLUG = "sample-demo";

// Seven fake attendees — enough to feel like a room, varied handles incl. one
// "Anonymous" so the anonymity affordance is visible.
export const HANDLES = [
  "Priya",
  "Marcus",
  "Anonymous",
  "Lena",
  "Theo",
  "Sam",
  "Devi",
];

// Twelve messy, human, mid-session Blue Sky contributions for `bluesky-ideas` —
// uneven length, lowercase, half-thoughts: what real ideation actually looks like.
export const FIXTURE_SUBMISSIONS = [
  "ditch the annual plan entirely and just fund whatever has momentum each quarter",
  "a physical space where any team can grab a room for a week to prototype",
  "What if onboarding was a two-week paid 'try the job' for both sides?",
  "open-source our internal tools, the community would harden them faster than we can",
  "no email. just don't. async docs + a weekly readout and that's it",
  "give every person a small 'curiosity budget' to spend on anything, no approval",
  "a real apprenticeship track — hire for hunger, not credentials",
  "kill the quarterly review, replace with a one-page letter to future-us",
  "embed a customer in the team for a month, properly, not a survey",
  "free childcare on-site. seriously. it would change who can even work here",
  "a 'kill list' — one thing we stop doing every month, celebrated not hidden",
  "rotate everyone through support for a week a year, exec included",
];

// Two-to-three pre-clustered patterns, referencing submissions by INDEX into
// FIXTURE_SUBMISSIONS (the seeder maps these to the real submission ids it gets
// back). So the Patterns tab is populated WITHOUT touching the Blue Sky template.
export const PATTERN_FIXTURES: { name: string; indices: number[] }[] = [
  { name: "Radical autonomy", indices: [0, 5, 7, 10] },
  { name: "Porous boundaries", indices: [2, 8, 11] },
  { name: "Build in the open", indices: [1, 3, 6] },
];

const SAMPLE_TOPIC = "If every constraint vanished, what would we do?";

export type SeedResult =
  | { ok: true; slug: string; facilitatorCode: string; reset: boolean }
  | { ok: false; busy: true };

// Seed-or-reset the demo. Idempotent: a re-seed fully wipes then re-lays the
// fixtures (no stacking) and ROTATES the sample passcodes. Returns the freshly
// minted facilitator code so the admin can deep-link straight into a live-looking
// host console with no extra passcode entry.
export async function seedSample(): Promise<SeedResult> {
  const { plain, hashes } = freshPasscodes();
  const existed = Boolean(await getRoom(SAMPLE_SLUG));

  // Upsert the durable room record (rotates hashes on every re-seed).
  await createRoomWithSlug(SAMPLE_SLUG, "Sample workshop", SAMPLE_TOPIC, {
    isSample: true,
    passcodeHashes: hashes,
  });

  // Explicit 30s TTL: ~25 sequential KV writes can exceed the 5s default and a
  // mid-seed lock expiry would let a double-tap interleave/stack participants.
  const locked = await withLock(
    SAMPLE_SLUG,
    "sample-seed",
    async () => {
      // Full wipe first so a re-seed converges (never stacks) and lands clean.
      await endSession(SAMPLE_SLUG);

      for (let i = 0; i < HANDLES.length; i++) {
        await addParticipant(`sample-tok-${i}`, HANDLES[i], SAMPLE_SLUG);
      }

      const subIds: string[] = [];
      for (let i = 0; i < FIXTURE_SUBMISSIONS.length; i++) {
        const handle = HANDLES[i % HANDLES.length];
        const sub = await addSubmission(
          handle,
          FIXTURE_SUBMISSIONS[i],
          "bluesky-ideas",
          null,
          null,
          SAMPLE_SLUG,
        );
        subIds.push(sub.id);
      }

      for (let i = 0; i < PATTERN_FIXTURES.length; i++) {
        const pf = PATTERN_FIXTURES[i];
        const ids = pf.indices
          .filter((n) => n >= 0 && n < subIds.length)
          .map((n) => subIds[n]);
        await createPattern(pf.name, ids, SAMPLE_SLUG);
      }

      // Held (NOT queued): so pressing Advance doesn't auto-release it. The
      // tour's inject step is then the first content the facilitator sees appear.
      await addContent(
        "note",
        "Facilitator note",
        "Pre-loaded so you can see the Content panel. Inject your own item to watch it appear live for the room.",
        "hold",
        SAMPLE_SLUG,
      );

      // ONE whole-object state write — no getState between seed writes, so this
      // can't tear under replica lag. Land mid read-around with a running timer.
      const bluesky = TEMPLATES.find((t) => t.id === "blue-sky");
      await replaceState(
        {
          mode: null,
          sessionName: "Blue Sky",
          phases: bluesky?.phases ?? [],
          phaseId: "bluesky-read",
          readaroundIndex: 2,
          timerEndsAt: Date.now() + 5 * 60_000,
          topic: SAMPLE_TOPIC,
          ended: false,
        },
        SAMPLE_SLUG,
      );
    },
    { ttlSeconds: 30 },
  );

  if (!locked.ok) return { ok: false, busy: true };
  return {
    ok: true,
    slug: SAMPLE_SLUG,
    facilitatorCode: plain.facilitator,
    reset: existed,
  };
}

// Stale = empty (TTL lapsed) or already ended — so the tour can auto-reseed a
// day-old demo cleanly instead of dead-ending on an empty room.
export async function isSampleStale(
  slug: string = SAMPLE_SLUG,
): Promise<boolean> {
  const [state, subs] = await Promise.all([
    getState(slug),
    listSubmissions(slug),
  ]);
  return Boolean(state.ended) || subs.length === 0;
}
