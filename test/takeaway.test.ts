import { beforeAll, describe, expect, it } from "vitest";
import {
  createRoomWithSlug,
  freshPasscodes,
  publishTakeaway,
} from "@/lib/rooms";
import {
  addParticipant,
  addSubmission,
  createPattern,
  getPublicState,
  getState,
  getTakeaway,
  listParticipants,
  listSubmissions,
  mutateActionItems,
  replaceState,
} from "@/lib/store";

// F3 — send the room a take-away. In-memory store, no AI (fallback report path).
const ADMIN = "test-super-admin-F3";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

async function seed(slug: string) {
  const { hashes } = freshPasscodes();
  await createRoomWithSlug(slug, "Quarterly Offsite", "topic", { passcodeHashes: hashes });
  await replaceState(
    {
      mode: null,
      sessionName: "Blue Sky",
      phases: [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      phaseId: "p1",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      topic: "topic",
      ended: false,
      actionItems: [],
    },
    slug,
  );
  await addParticipant("a", "Ada", slug);
  await addParticipant("b", "Bo", slug);
  await addSubmission("Ada", "ship the thing", "p1", null, "a", slug);
  await createPattern("Momentum", [], slug);
  await mutateActionItems({ kind: "add", text: "Book the venue", ownerName: "Sam" }, slug);
}

describe("publishTakeaway", () => {
  it("publishes a recap, ends the session, and wipes the live data — but keeps the recap", async () => {
    const slug = "f3-publish";
    await seed(slug);
    const res = await publishTakeaway(slug);
    expect(res?.token).toMatch(/^[0-9a-f]{32}$/); // random 16-byte hex, not a slug/token

    // state is ended + records the published token (snapshot written before flip)
    const st = await getState(slug);
    expect(st.ended).toBe(true);
    expect(st.publishedTakeaway?.token).toBe(res!.token);

    // live data wiped...
    expect((await listParticipants(slug)).length).toBe(0);
    expect((await listSubmissions(slug)).length).toBe(0);
    // ...but the recap survives.
    const snap = await getTakeaway(slug, res!.token);
    expect(snap).not.toBeNull();
    expect(snap!.participantCount).toBe(2);
    expect(snap!.submissionCount).toBe(1);
    expect(snap!.patterns).toContain("Momentum");
    expect(snap!.actionItems?.[0].text).toBe("Book the venue");
  });

  it("the SHARED recap body is synthesis-only — no raw responses, no handles", async () => {
    const slug = "f3-handlefree";
    await seed(slug);
    await publishTakeaway(slug);
    // the client-facing projector body (the shared, no-personal-token surface)
    const proj = await getPublicState(null, slug, "projector");
    const json = JSON.stringify(proj.takeaway);
    expect(json).not.toContain("ship the thing"); // raw submission text
    expect(json).not.toContain("Ada"); // a participant handle
    expect("contributions" in (proj.takeaway ?? {})).toBe(false); // raw array stripped
  });
});

describe("F3 anonymity — anonymous-phase contributions never enter the recap", () => {
  async function seedAnon(slug: string) {
    const { hashes } = freshPasscodes();
    await createRoomWithSlug(slug, "Offsite", "topic", { passcodeHashes: hashes });
    await replaceState(
      {
        mode: null,
        sessionName: "Mixed",
        phases: [
          { id: "p1", moduleId: "capture", config: { label: "Open ideas", prompt: "Go" } },
          { id: "p2", moduleId: "capture", config: { label: "Anon worries", prompt: "Go", anonymity: "anonymous" } },
        ],
        phaseId: "p2",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "topic",
        ended: false,
        actionItems: [],
      },
      slug,
    );
    await addParticipant("a", "Ada", slug);
    await addSubmission("Ada", "named-phase idea", "p1", null, "a", slug);
    await addSubmission("Ada", "SECRET anonymous worry", "p2", null, "a", slug);
  }

  it("excludes the participant's anonymous-phase text from their own recap", async () => {
    const slug = "f3-anon";
    await seedAnon(slug);
    const { token } = (await publishTakeaway(slug))!;
    // the durable snapshot must not store the anonymous-phase contribution at all
    const snap = await getTakeaway(slug, token);
    const snapJson = JSON.stringify(snap);
    expect(snapJson).not.toContain("SECRET anonymous worry");
    expect(snapJson).toContain("named-phase idea"); // the non-anonymous one is kept
    // and the participant's own recap reflects only the non-anonymous contribution
    const part = await getPublicState("a", slug, "participant");
    const partJson = JSON.stringify(part.takeaway);
    expect(partJson).not.toContain("SECRET anonymous worry");
    expect(partJson).toContain("named-phase idea");
  });
});

describe("getPublicState surfaces the recap to every role when ended", () => {
  it("participant + projector get the take-away (it's handle-free)", async () => {
    const slug = "f3-roles";
    await seed(slug);
    const { token } = (await publishTakeaway(slug))!;
    const part = await getPublicState("a", slug, "participant");
    expect(part.takeaway?.token).toBe(token);
    expect(part.takeaway?.participantCount).toBe(2);
    const proj = await getPublicState(null, slug, "projector");
    expect(proj.takeaway?.token).toBe(token);
  });

  it("null-degrades to a plain ended state when the snapshot is gone", async () => {
    const slug = "f3-null";
    await seed(slug);
    await publishTakeaway(slug);
    // simulate the snapshot expiring while the ended flag remains: point state at
    // a token with no snapshot.
    const st = await getState(slug);
    await replaceState({ ...st, publishedTakeaway: { token: "missing", publishedAt: 1 } }, slug);
    const pub = await getPublicState("a", slug, "participant");
    expect(pub.ended).toBe(true);
    expect(pub.takeaway).toBeNull(); // never a half card
  });
});

describe("F3 per-person contributions (leak gate)", () => {
  async function seedTwo(slug: string) {
    const { hashes } = freshPasscodes();
    await createRoomWithSlug(slug, "Workshop", "topic", { passcodeHashes: hashes });
    await replaceState(
      {
        mode: null,
        sessionName: "Blue Sky",
        phases: [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
        phaseId: "p1",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "topic",
        ended: false,
        actionItems: [],
      },
      slug,
    );
    await addParticipant("a", "Ada", slug);
    await addParticipant("b", "Bo", slug);
    await addSubmission("Ada", "ADA_ONLY_secret_idea", "p1", null, "a", slug);
    await addSubmission("Bo", "BO_ONLY_secret_idea", "p1", null, "b", slug);
  }

  it("each participant gets ONLY their own contributions; never another's", async () => {
    const slug = "f3-yours";
    await seedTwo(slug);
    await publishTakeaway(slug);
    const ada = await getPublicState("a", slug, "participant");
    const adaJson = JSON.stringify(ada);
    expect(ada.takeaway?.yourContributions?.map((c) => c.text)).toEqual(["ADA_ONLY_secret_idea"]);
    expect(adaJson).toContain("ADA_ONLY_secret_idea");
    expect(adaJson).not.toContain("BO_ONLY_secret_idea"); // never sees Bo's
    // the raw contributions array (with tokens + everyone's text) is never sent
    expect("contributions" in (ada.takeaway ?? {})).toBe(false);
  });

  it("the projector / no-token caller gets NO individual contributions", async () => {
    const slug = "f3-proj";
    await seedTwo(slug);
    await publishTakeaway(slug);
    const proj = await getPublicState(null, slug, "projector");
    const json = JSON.stringify(proj);
    expect(proj.takeaway?.yourContributions ?? []).toEqual([]);
    expect(json).not.toContain("ADA_ONLY_secret_idea");
    expect(json).not.toContain("BO_ONLY_secret_idea");
  });
});

describe("token security", () => {
  it("a token is room-scoped — it can't read another room's recap", async () => {
    const a = "f3-room-a";
    const b = "f3-room-b";
    await seed(a);
    await seed(b);
    const { token } = (await publishTakeaway(a))!;
    expect(await getTakeaway(a, token)).not.toBeNull();
    expect(await getTakeaway(b, token)).toBeNull(); // cross-room isolation
  });
});
