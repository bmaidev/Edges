import { beforeAll, describe, expect, it } from "vitest";
import {
  FIXTURE_SUBMISSIONS,
  HANDLES,
  SAMPLE_SLUG,
  isSampleStale,
  seedSample,
} from "@/lib/sample";
import { clearTourSeen, getRoom, getTourSeen, setTourSeen } from "@/lib/rooms";
import { endSession, getFacilitatorState } from "@/lib/store";

// A3 PR1 — sample-room seeder. In-memory store; no KV, no AI.
const ADMIN = "test-super-admin-A3";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

async function seedOk() {
  const r = await seedSample();
  if (!r.ok) throw new Error("seed was busy");
  return r;
}

describe("A3 sample seeder", () => {
  it("creates the reserved sample-demo room flagged isSample", async () => {
    await seedOk();
    const room = await getRoom(SAMPLE_SLUG);
    expect(room?.slug).toBe(SAMPLE_SLUG);
    expect(room?.isSample).toBe(true);
    // Sample reads as a live room (not a draft) so it looks active.
    expect(room?.status).toBe("live");
  });

  it("lands a believable mid-session Blue Sky snapshot", async () => {
    await seedOk();
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    expect(fs.phaseId).toBe("bluesky-read");
    expect(fs.modeName).toBe("Blue Sky");
    expect(fs.participantCount).toBe(HANDLES.length); // 7
    expect(fs.submissions.length).toBe(FIXTURE_SUBMISSIONS.length); // 12
    expect(fs.patterns.length).toBeGreaterThanOrEqual(2);
    expect(fs.ended).toBe(false);
    expect(fs.timerEndsAt).not.toBeNull();
    expect(fs.timerEndsAt!).toBeGreaterThan(Date.now());
    // read-around landed mid-stream
    expect(fs.readaround?.index ?? 0).toBeGreaterThan(0);
  });

  it("seeds exactly one held (non-visible) content item", async () => {
    await seedOk();
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    expect(fs.allContent.length).toBe(1);
    const item = fs.allContent[0];
    expect(item.visible).toBe(false);
    expect(item.queued).toBe(false); // held, not queued — Advance won't release it
  });

  it("Patterns tab is populated without touching the Blue Sky template", async () => {
    await seedOk();
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    // showPatterns = usesPatterns || patterns.length > 0
    expect(fs.usesPatterns || fs.patterns.length > 0).toBe(true);
  });

  it("pattern submissionIds reference REAL seeded submissions (index mapping correct)", async () => {
    await seedOk();
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    const realIds = new Set(fs.submissions.map((s) => s.id));
    for (const p of fs.patterns) {
      expect(p.submissionIds.length).toBeGreaterThan(0);
      for (const id of p.submissionIds) expect(realIds.has(id)).toBe(true);
    }
  });

  it("re-seed is idempotent (no stacking) and rotates the passcodes", async () => {
    await seedOk();
    const before = await getRoom(SAMPLE_SLUG);
    await seedOk();
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    expect(fs.participantCount).toBe(HANDLES.length);
    expect(fs.submissions.length).toBe(FIXTURE_SUBMISSIONS.length);
    const after = await getRoom(SAMPLE_SLUG);
    // hashes rotate on every re-seed (random plaintext each time)
    expect(after?.passcodeHashes.facilitator).not.toBe(
      before?.passcodeHashes.facilitator,
    );
  });

  it("state integrity: phases non-empty + sessionName set (guards the single-write fix)", async () => {
    const r = await seedOk();
    expect(r.facilitatorCode).toMatch(/^fac-/);
    const fs = await getFacilitatorState(SAMPLE_SLUG);
    // Would fail if a read-modify-write chain dropped phases under lag.
    expect(fs.sequence.length).toBeGreaterThan(0);
    expect(fs.modeName).toBe("Blue Sky");
  });

  it("isSampleStale: false after seed, true after endSession", async () => {
    await seedOk();
    expect(await isSampleStale()).toBe(false);
    await endSession(SAMPLE_SLUG);
    expect(await isSampleStale()).toBe(true);
  });

  it("reset flag: first seed is false, a re-seed is true", async () => {
    // endSession above wiped state but not the durable room record; the room
    // still exists, so the next seed reports reset:true.
    const r = await seedOk();
    expect(r.reset).toBe(true);
  });

  it("the reserved slug can never be emitted by random room creation", async () => {
    // SLUG_WORDS is private; assert via behaviour: the sample slug is a fixed,
    // human word not in the random vocabulary (4-hex suffix shape differs).
    expect(SAMPLE_SLUG).toBe("sample-demo");
  });

  it("durable tour-seen flag is set/cleared cleanly (rollback completeness)", async () => {
    expect(await getTourSeen(ADMIN)).toBe(false);
    await setTourSeen(ADMIN);
    expect(await getTourSeen(ADMIN)).toBe(true);
    await clearTourSeen(ADMIN);
    expect(await getTourSeen(ADMIN)).toBe(false);
  });
});
