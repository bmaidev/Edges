import { describe, expect, it } from "vitest";
import {
  getState,
  replaceState,
  setProjectorA11y,
  setSpotlight,
  setTimerSound,
} from "@/lib/store";

describe("room-wide state serialization", () => {
  it("preserves unrelated simultaneous host/co-host mutations", async () => {
    const room = "state-concurrency";
    await replaceState(
      {
        mode: null,
        phaseId: "p1",
        phases: [{ id: "p1", moduleId: "capture", config: { label: "Ideas" } }],
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "",
        ended: false,
      },
      room,
    );

    const results = await Promise.all([
      setSpotlight({ kind: "submission", id: "sub-1" }, room),
      setProjectorA11y(true, room),
      setTimerSound(true, room),
    ]);

    const state = await getState(room);
    expect(state.spotlight).toEqual({ kind: "submission", id: "sub-1" });
    expect(state.projectorA11y).toBe(true);
    expect(state.timerSoundOff).toBe(true);
    expect(new Set(results.map((result) => result.rev)).size).toBe(3);
  });
});
