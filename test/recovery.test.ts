import { describe, expect, it } from "vitest";
import {
  addContent,
  addSubmission,
  addWord,
  castVote,
  clearPhaseData,
  clearUndo,
  endSession,
  getState,
  listContent,
  readUndo,
  setPhase,
  undoLastAction,
  writeUndo,
} from "@/lib/store";
import {
  ghostDataCount,
  phaseAnswerCount,
  phaseVoteCount,
} from "@/components/recovery/recovery";
import type { FacilitatorState } from "@/lib/types";

// C3 — calm recovery controls. In-memory store, no KV/AI.

describe("clearPhaseData", () => {
  it("removes only the target phase's votes (incl. reserved markers), keeps others", async () => {
    const room = "rec-votes";
    await castVote("p1", "a", 1, room);
    await castVote("p1", "b", 1, room);
    await castVote("p1", "__constraint__", 1, room); // reserved marker
    await castVote("p2", "a", 1, room);
    await clearPhaseData("p1", room);
    // p1 fully gone (real + marker); p2 untouched.
    const { readVotes } = await import("@/lib/store");
    expect(Object.keys(await readVotes("p1", room)).length).toBe(0);
    expect(Object.keys(await readVotes("p2", room)).length).toBe(1);
  });

  it("filters submissions and words by phase", async () => {
    const room = "rec-subs";
    await addSubmission("A", "x", "p1", null, "a", room);
    await addSubmission("B", "y", "p1", null, "b", room);
    await addSubmission("C", "z", "p2", null, "c", room);
    await addWord("p1", "a", "alpha", room);
    await addWord("p2", "c", "gamma", room);
    await clearPhaseData("p1", room);
    const { listSubmissions, readWords } = await import("@/lib/store");
    const subs = await listSubmissions(room);
    expect(subs.map((s) => s.phaseId)).toEqual(["p2"]);
    expect((await readWords("p1", room)).length).toBe(0);
    expect((await readWords("p2", room)).length).toBe(1);
  });

  it("bumps rev so the cleared state pushes to clients", async () => {
    const room = "rec-rev";
    await addSubmission("A", "x", "p1", null, "a", room);
    const before = (await getState(room)).rev ?? 0;
    const after = await clearPhaseData("p1", room);
    expect(after.rev!).toBeGreaterThan(before);
  });
});

describe("direction-aware release (setPhase)", () => {
  it("release:false leaves queued content queued; release:true reveals it", async () => {
    const room = "rec-rel";
    await addContent("note", "T", "B", "queue", room);
    await setPhase("p2", room, { release: false });
    expect((await listContent(room)).every((c) => c.queued)).toBe(true);
    await setPhase("p3", room, { release: true });
    expect((await listContent(room)).every((c) => c.visible && !c.queued)).toBe(
      true,
    );
  });
});

describe("nav-only undo", () => {
  it("restores phase + re-queues released content, never resurrects cleared data", async () => {
    const room = "rec-undo";
    // a forward move released a content item; we're now on p2.
    const item = await addContent("note", "T", "B", "now", room);
    await addSubmission("A", "x", "p1", null, "a", room);
    await setPhase("p2", room, { release: false });
    await writeUndo(
      {
        prevPhaseId: "p1",
        prevTimerEndsAt: null,
        prevTimerRemainingMs: null,
        prevReadaroundIndex: 3,
        releasedIds: [item.id],
        label: "p2",
        at: 1,
      },
      room,
    );
    // meanwhile p1's data gets cleared (a confirmed clear is final)
    await clearPhaseData("p1", room);
    const { state, undone } = await undoLastAction(room);
    expect(undone).toBe(true);
    expect(state.phaseId).toBe("p1");
    expect(state.readaroundIndex).toBe(3);
    // released content was re-queued
    expect((await listContent(room)).find((c) => c.id === item.id)?.queued).toBe(
      true,
    );
    // cleared submission stays gone — undo is nav-only
    const { listSubmissions } = await import("@/lib/store");
    expect((await listSubmissions(room)).length).toBe(0);
    // snapshot consumed
    expect(await readUndo(room)).toBeNull();
  });

  it("undo with no snapshot is a calm no-op", async () => {
    const room = "rec-undo-empty";
    const { undone } = await undoLastAction(room);
    expect(undone).toBe(false);
  });

  it("bumps rev on restore", async () => {
    const room = "rec-undo-rev";
    await writeUndo(
      {
        prevPhaseId: "p1",
        prevTimerEndsAt: null,
        prevTimerRemainingMs: null,
        prevReadaroundIndex: 0,
        releasedIds: [],
        label: "p1",
        at: 1,
      },
      room,
    );
    const before = (await getState(room)).rev ?? 0;
    const { state } = await undoLastAction(room);
    expect(state.rev!).toBeGreaterThan(before);
  });
});

describe("undo lifecycle", () => {
  it("endSession wipes the undo snapshot", async () => {
    const room = "rec-end";
    await writeUndo(
      {
        prevPhaseId: "p1",
        prevTimerEndsAt: null,
        prevTimerRemainingMs: null,
        prevReadaroundIndex: 0,
        releasedIds: [],
        label: "p1",
        at: 1,
      },
      room,
    );
    await endSession(room);
    expect(await readUndo(room)).toBeNull();
  });

  it("clearUndo removes the snapshot", async () => {
    const room = "rec-clear-undo";
    await writeUndo(
      {
        prevPhaseId: "p1",
        prevTimerEndsAt: null,
        prevTimerRemainingMs: null,
        prevReadaroundIndex: 0,
        releasedIds: [],
        label: "p1",
        at: 1,
      },
      room,
    );
    await clearUndo(room);
    expect(await readUndo(room)).toBeNull();
  });
});

describe("pure recovery counters", () => {
  it("phaseAnswerCount counts only the phase's submissions", () => {
    const subs = [{ phaseId: "p1" }, { phaseId: "p1" }, { phaseId: "p2" }];
    expect(phaseAnswerCount(subs, "p1")).toBe(2);
  });
  it("phaseVoteCount excludes reserved __markers__", () => {
    const fields = ["p1::a", "p1::b", "p1::__constraint__", "p2::a"];
    expect(phaseVoteCount(fields, "p1")).toBe(2);
  });
});

describe("ghostDataCount (C3 leftover-answer detection)", () => {
  // A minimal FacilitatorState shape — only the fields ghostDataCount reads.
  const fs = (over: Partial<FacilitatorState>): FacilitatorState =>
    ({ phaseId: "p1", submissions: [], participation: null, ...over }) as FacilitatorState;

  it("flags stored answers when NO current participant produced them (responded 0)", () => {
    const s = fs({
      submissions: [{ phaseId: "p1" }, { phaseId: "p1" }] as FacilitatorState["submissions"],
      participation: { present: 3, responded: 0, typing: 0, quiet: 0 },
    });
    expect(ghostDataCount(s)).toBe(2);
  });

  it("stays silent during live collection (responders present)", () => {
    const s = fs({
      submissions: [{ phaseId: "p1" }, { phaseId: "p1" }] as FacilitatorState["submissions"],
      participation: { present: 3, responded: 2, typing: 0, quiet: 0 },
    });
    expect(ghostDataCount(s)).toBe(0);
  });

  it("is 0 when the phase holds nothing", () => {
    expect(ghostDataCount(fs({ submissions: [] }))).toBe(0);
  });

  it("counts only the ACTIVE phase's leftovers", () => {
    const s = fs({
      phaseId: "p2",
      submissions: [{ phaseId: "p1" }, { phaseId: "p2" }] as FacilitatorState["submissions"],
      participation: { present: 1, responded: 0, typing: 0, quiet: 0 },
    });
    expect(ghostDataCount(s)).toBe(1);
  });

  it("is 0 with no active phase", () => {
    expect(ghostDataCount(fs({ phaseId: null }))).toBe(0);
  });
});
