import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  getFacilitatorState,
  getPublicState,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";

interface PollViewData {
  question: string;
  options: string[];
  multi: boolean;
  total: number;
  counts: Record<string, number> | null;
  mine: string[] | null;
}

async function setup(config: Record<string, unknown>) {
  const { room } = await createRoom("Test", "Topic");
  const phase: PhaseInstance = { id: "poll1", moduleId: "poll", config };
  await setPhases([phase], "Test session", room.slug);
  await setPhase(phase.id, room.slug);
  return room.slug;
}

function pollData(state: { view: { data: unknown } | null }): PollViewData {
  return state.view!.data as PollViewData;
}

describe("poll module", () => {
  it("tallies a vote dispatched through the store", async () => {
    const roomId = await setup({
      label: "Poll",
      question: "Pick",
      options: ["Yes", "No"],
    });
    await addParticipant("t1", "A", roomId);
    const res = await dispatchAction(
      roomId,
      { type: "vote", token: "t1", payload: { choice: "Yes" } },
      "participant",
    );
    expect(res.ok).toBe(true);

    const fac = await getFacilitatorState(roomId);
    const data = pollData(fac);
    expect(data.total).toBe(1);
    expect(data.counts).toEqual({ Yes: 1, No: 0 });
  });

  it("gates live results from participants until reveal (reveal=onAdvance)", async () => {
    const roomId = await setup({
      label: "Poll",
      question: "Pick",
      options: ["Yes", "No"],
      reveal: "onAdvance",
    });
    await addParticipant("t1", "A", roomId);
    await dispatchAction(
      roomId,
      { type: "vote", token: "t1", payload: { choice: "Yes" } },
      "participant",
    );

    // Participant view: counts withheld (null), but their own pick echoes back.
    const pub = await getPublicState("t1", roomId, "participant");
    const pdata = pollData(pub);
    expect(pdata.counts).toBeNull();
    expect(pdata.mine).toEqual(["Yes"]);

    // Facilitator / projector view: counts visible.
    const fac = await getFacilitatorState(roomId);
    expect(pollData(fac).counts).toEqual({ Yes: 1, No: 0 });
    const proj = await getPublicState(null, roomId, "projector");
    expect(pollData(proj).counts).toEqual({ Yes: 1, No: 0 });
  });

  it("shows live counts to participants when reveal=live (default)", async () => {
    const roomId = await setup({
      label: "Poll",
      question: "Pick",
      options: ["Yes", "No"],
    });
    await addParticipant("t1", "A", roomId);
    await dispatchAction(
      roomId,
      { type: "vote", token: "t1", payload: { choice: "No" } },
      "participant",
    );
    const pub = await getPublicState("t1", roomId, "participant");
    expect(pollData(pub).counts).toEqual({ Yes: 0, No: 1 });
  });

  it("supports multi-select", async () => {
    const roomId = await setup({
      label: "Poll",
      question: "Pick any",
      options: ["A", "B", "C"],
      multi: true,
    });
    await addParticipant("t1", "P", roomId);
    const res = await dispatchAction(
      roomId,
      { type: "vote", token: "t1", payload: { choices: ["A", "C"] } },
      "participant",
    );
    expect(res.ok).toBe(true);
    const fac = await getFacilitatorState(roomId);
    const data = pollData(fac);
    expect(data.counts).toEqual({ A: 1, B: 0, C: 1 });
    // One voter, regardless of how many options they ticked.
    expect(data.total).toBe(1);
  });
});
