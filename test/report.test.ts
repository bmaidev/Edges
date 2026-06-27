import { beforeAll, describe, expect, it } from "vitest";
import {
  archiveRoom,
  buildReport,
  createRoomWithSlug,
  freshPasscodes,
  getArchive,
} from "@/lib/rooms";
import {
  addParticipant,
  addSubmission,
  createPattern,
  listParticipants,
  listSubmissions,
  replaceState,
} from "@/lib/store";
import { reportToMarkdown } from "@/lib/report/markdown";

// F1 — client-ready report exports. In-memory store, no AI key (so the
// structural fallback report is exercised — the path most users without a key hit).
const ADMIN = "test-super-admin-F1";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

async function seedRoom(slug: string) {
  const { hashes } = freshPasscodes();
  await createRoomWithSlug(slug, "Strategy Offsite", "What should we do?", {
    passcodeHashes: hashes,
  });
  await replaceState(
    {
      mode: null,
      sessionName: "Blue Sky",
      phases: [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }],
      phaseId: "p1",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      topic: "What should we do?",
      ended: false,
    },
    slug,
  );
  await addParticipant("a", "Ada", slug);
  await addParticipant("b", "Bo", slug);
  await addSubmission("Ada", "ship the thing", "p1", null, "a", slug);
  await addSubmission("Bo", "rethink pricing", "p1", null, "b", slug);
  await createPattern("Momentum", [], slug);
}

describe("buildReport (mid-session, no wipe)", () => {
  it("builds a report from live data and does NOT wipe the room", async () => {
    const slug = "f1-build";
    await seedRoom(slug);
    const archive = await buildReport(slug);
    expect(archive).not.toBeNull();
    expect(archive!.report).not.toBeNull();
    expect(archive!.report!.summary.length).toBeGreaterThan(0); // fallback fills it
    expect(archive!.participantCount).toBe(2);
    // the live room is untouched — this is the whole point of buildReport.
    expect((await listParticipants(slug)).length).toBe(2);
    expect((await listSubmissions(slug)).length).toBe(2);
  });

  it("the fallback report (no AI) names the curated patterns", async () => {
    const slug = "f1-fallback";
    await seedRoom(slug);
    const a = await buildReport(slug);
    expect(a!.report!.themes.map((t) => t.title)).toContain("Momentum");
    expect(a!.report!.summary).toContain("2 contributions");
  });

  it("marks the no-AI fallback as 'structural' so the handover can caption it", async () => {
    const slug = "f1-kind";
    await seedRoom(slug);
    const a = await buildReport(slug);
    // No ANTHROPIC_API_KEY in the test env → the structural fallback is used.
    expect(a!.report!.kind).toBe("structural");
  });
});

describe("archive reuses the built report (no double work, no clobber)", () => {
  it("archiveRoom keeps the report buildReport already produced", async () => {
    const slug = "f1-reuse";
    await seedRoom(slug);
    const built = await buildReport(slug);
    const builtAt = built!.report!.generatedAt;
    const archived = await archiveRoom(slug);
    expect(archived!.report!.generatedAt).toBe(builtAt); // same report, not regenerated
    // and the archive persisted
    expect((await getArchive(slug))!.report!.generatedAt).toBe(builtAt);
  });
});

describe("public report token (F1)", () => {
  it("buildReport mints a stable, unguessable reportToken (reused on rebuild)", async () => {
    const slug = "f1-token";
    await seedRoom(slug);
    const a1 = await buildReport(slug);
    expect(a1!.reportToken).toMatch(/^[0-9a-f]{32}$/);
    const a2 = await buildReport(slug);
    expect(a2!.reportToken).toBe(a1!.reportToken); // stable across rebuilds
  });
});

describe("reportToMarkdown", () => {
  it("renders the synthesis and never leaks raw submission text", async () => {
    const slug = "f1-md";
    await seedRoom(slug);
    const a = await buildReport(slug);
    const md = reportToMarkdown(a!);
    expect(md).toContain("# Strategy Offsite");
    expect(md).toContain("2 people · 2 contributions");
    expect(md).toContain("Momentum");
    // submission text must NOT appear (synthesis only — privacy)
    expect(md).not.toContain("ship the thing");
    expect(md).not.toContain("rethink pricing");
  });
});
