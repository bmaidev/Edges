import { describe, expect, it } from "vitest";
import { computeAnalytics } from "@/lib/analytics";
import type { Room } from "@/lib/rooms";

// F4 — the pure cross-session rollup. Aggregate-only, O(rooms), derived from the
// A5 lastRun counts already on the Room record.

const hashes = { admin: "a", facilitator: "f", cohost: "c" };
function room(over: Partial<Room>): Room {
  return {
    slug: "s",
    name: "R",
    topic: "t",
    templateId: null,
    status: "archived",
    createdAt: 1,
    passcodeHashes: hashes,
    ...over,
  } as Room;
}
// 2026-06-15 and 2026-07-02 (UTC) for deterministic month buckets.
const JUN = Date.UTC(2026, 5, 15);
const JUL = Date.UTC(2026, 6, 2);

describe("computeAnalytics", () => {
  it("rolls up totals + averages over rooms that actually ran", () => {
    const a = computeAnalytics([
      room({ templateId: "blue-sky", lastRun: { endedAt: JUN, participantCount: 10, submissionCount: 40 } }),
      room({ templateId: "blue-sky", lastRun: { endedAt: JUL, participantCount: 20, submissionCount: 60 } }),
      room({ status: "draft" }), // never ran — excluded from run stats
    ]);
    expect(a.sessionsRun).toBe(2);
    expect(a.totalParticipants).toBe(30);
    expect(a.avgParticipants).toBe(15);
    expect(a.totalContributions).toBe(100);
    expect(a.avgContributions).toBe(50);
    expect(a.totalRooms).toBe(3);
  });

  it("excludes rooms without a lastRun (and the sample room) from run stats", () => {
    const a = computeAnalytics([
      room({ lastRun: { endedAt: JUN, participantCount: 5, submissionCount: 5 } }),
      room({}), // no lastRun
      room({ isSample: true, lastRun: { endedAt: JUN, participantCount: 99, submissionCount: 99 } }),
    ]);
    expect(a.sessionsRun).toBe(1);
    expect(a.totalParticipants).toBe(5); // sample's 99 not counted
    expect(a.totalRooms).toBe(2); // sample excluded
  });

  it("buckets sessions by UTC month, ascending", () => {
    const a = computeAnalytics([
      room({ lastRun: { endedAt: JUL, participantCount: 2, submissionCount: 1 } }),
      room({ lastRun: { endedAt: JUN, participantCount: 3, submissionCount: 1 } }),
      room({ lastRun: { endedAt: JUN, participantCount: 4, submissionCount: 1 } }),
    ]);
    expect(a.trend).toEqual([
      { month: "2026-06", sessions: 2, participants: 7 },
      { month: "2026-07", sessions: 1, participants: 2 },
    ]);
  });

  it("tallies most-used designs (blueprint name > templateId > Custom)", () => {
    const a = computeAnalytics([
      room({ blueprint: { name: "My Retro", phases: [], savedAt: 1 }, lastRun: { endedAt: JUN, participantCount: 1, submissionCount: 0 } }),
      room({ blueprint: { name: "My Retro", phases: [], savedAt: 1 }, lastRun: { endedAt: JUN, participantCount: 1, submissionCount: 0 } }),
      room({ templateId: "blue-sky", lastRun: { endedAt: JUN, participantCount: 1, submissionCount: 0 } }),
      room({ lastRun: { endedAt: JUN, participantCount: 1, submissionCount: 0 } }), // → "Custom"
    ]);
    expect(a.topTemplates[0]).toEqual({ name: "My Retro", count: 2 });
    expect(a.topTemplates.map((t) => t.name)).toContain("blue-sky");
    expect(a.topTemplates.map((t) => t.name)).toContain("Custom");
  });

  it("empty input → zeroed analytics (no divide-by-zero)", () => {
    const a = computeAnalytics([]);
    expect(a).toMatchObject({
      sessionsRun: 0,
      totalParticipants: 0,
      avgParticipants: 0,
      avgContributions: 0,
      trend: [],
      topTemplates: [],
    });
  });
});
