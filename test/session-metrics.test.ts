import { describe, expect, it } from "vitest";
import {
  MIN_N,
  computeMethodMetrics,
  metricsToCsv,
  type SessionMetrics,
} from "@/lib/session-metrics";
import {
  captureSessionMetrics,
  clearSessionMetrics,
  createRoom,
  listSessionMetrics,
} from "@/lib/rooms";
import { addSubmission, castVote, setPhases, setPhase } from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

// F4 — the de-identified evidence layer. Content-free counts; N<3 suppression so a
// tiny room can't be singled out.

const m = (over: Partial<SessionMetrics>): SessionMetrics => ({
  slug: "s",
  name: "S",
  endedAt: 1,
  design: "Custom",
  participantCount: 5,
  endedEarly: false,
  phases: [],
  ...over,
});

describe("computeMethodMetrics", () => {
  it("suppresses sessions under the N<3 floor", () => {
    const out = computeMethodMetrics([
      m({ participantCount: 2, phases: [{ moduleId: "poll", responded: 2 }] }),
      m({ participantCount: 5, phases: [{ moduleId: "poll", responded: 4 }] }),
    ]);
    expect(out.totalSessions).toBe(2);
    expect(out.countedSessions).toBe(1);
    expect(out.suppressed).toBe(1);
    // only the N>=3 session feeds engagement (4/5 = 0.8)
    expect(out.methods).toEqual([{ moduleId: "poll", sessions: 1, avgEngagement: 0.8 }]);
  });

  it("averages engagement per module across counted sessions, most-used first", () => {
    const out = computeMethodMetrics([
      m({ participantCount: 10, phases: [{ moduleId: "capture", responded: 8 }, { moduleId: "poll", responded: 5 }] }),
      m({ participantCount: 10, phases: [{ moduleId: "capture", responded: 6 }] }),
    ]);
    // capture: (0.8 + 0.6)/2 = 0.7 over 2 sessions; poll: 0.5 over 1
    expect(out.methods[0]).toEqual({ moduleId: "capture", sessions: 2, avgEngagement: 0.7 });
    expect(out.methods[1]).toEqual({ moduleId: "poll", sessions: 1, avgEngagement: 0.5 });
  });

  it("computes the ended-early rate over counted sessions only", () => {
    const out = computeMethodMetrics([
      m({ participantCount: 5, endedEarly: true }),
      m({ participantCount: 5, endedEarly: false }),
      m({ participantCount: 2, endedEarly: true }), // suppressed, ignored
    ]);
    expect(out.endedEarlyRate).toBe(0.5);
  });

  it("never lets engagement exceed 1 (responded capped at present)", () => {
    const out = computeMethodMetrics([
      m({ participantCount: 3, phases: [{ moduleId: "qna", responded: 9 }] }),
    ]);
    expect(out.methods[0].avgEngagement).toBe(1);
  });
});

describe("metricsToCsv", () => {
  it("is one header + one row per session, escaping commas/quotes", () => {
    const csv = metricsToCsv([
      m({ name: "Town, hall", design: "1-2-4-All", participantCount: 5, phases: [{ moduleId: "poll", responded: 4 }] }),
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("endedAt,name,design,participantCount,endedEarly,phases");
    expect(lines[1]).toContain('"Town, hall"');
    expect(lines[1]).toContain("poll:4");
  });
});

describe("captureSessionMetrics (durable, content-free)", () => {
  const PHASES: PhaseInstance[] = [
    { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
    { id: "p2", moduleId: "poll", config: { label: "Vote", options: ["A", "B"] } },
  ];

  it("captures per-phase responder counts (submissions ∪ votes), no content", async () => {
    await clearSessionMetrics();
    const { room } = await createRoom("Metrics", "Topic");
    await setPhases(PHASES, "S", room.slug);
    // 3 submitters on p1; 2 distinct voters on p2 (+ a reserved marker that must NOT count).
    // Distinctive text so the "content-free" assertion can't collide with a random slug.
    await addSubmission("Ada", "ZZ_secret_one", "p1", null, "t1", room.slug);
    await addSubmission("Bo", "ZZ_secret_two", "p1", null, "t2", room.slug);
    await addSubmission("Cy", "ZZ_secret_three", "p1", null, "t3", room.slug);
    await castVote("p2", "t1", "A", room.slug);
    await castVote("p2", "t2", "B", room.slug);
    await castVote("p2", "__constraint__", 1, room.slug); // marker — excluded
    await setPhase("p1", room.slug); // archived NOT on the last phase → endedEarly

    await captureSessionMetrics(room.slug);
    const all = await listSessionMetrics();
    const rec = all.find((r) => r.slug === room.slug);
    expect(rec).toBeTruthy();
    expect(rec!.phases).toEqual([
      { moduleId: "capture", responded: 3 },
      { moduleId: "poll", responded: 2 }, // marker excluded
    ]);
    expect(rec!.endedEarly).toBe(true);
    // content-free: no submission text anywhere in the record.
    expect(JSON.stringify(rec)).not.toContain("ZZ_secret");
    expect(MIN_N).toBe(3);
  });

  it("clearSessionMetrics wipes the history", async () => {
    const { room } = await createRoom("M2", "T");
    await setPhases(PHASES, "S", room.slug);
    await captureSessionMetrics(room.slug);
    expect((await listSessionMetrics()).length).toBeGreaterThan(0);
    await clearSessionMetrics();
    expect(await listSessionMetrics()).toEqual([]);
  });
});
