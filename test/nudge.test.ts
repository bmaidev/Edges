import { describe, expect, it } from "vitest";
import {
  addParticipant,
  getPublicState,
  replaceState,
  tryNudge,
} from "@/lib/store";
import type { SessionState } from "@/lib/types";

// C2 nudge fast-follow. In-memory store.

async function seedGather(room: string) {
  const phases: SessionState["phases"] = [
    { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
  ];
  await replaceState(
    {
      mode: null,
      sessionName: "T",
      phases,
      phaseId: "p1",
      timerEndsAt: null,
      timerRemainingMs: null,
      readaroundIndex: 0,
      topic: "",
      ended: false,
    },
    room,
  );
  await addParticipant("a", "A", room);
}

describe("tryNudge", () => {
  it("succeeds the first time, then is blocked by the cooldown", async () => {
    const room = "nudge-cd";
    await seedGather(room);
    expect(await tryNudge("p1", room)).toBe(true);
    expect(await tryNudge("p1", room)).toBe(false); // within 15s cooldown
  });
});

describe("getPublicState surfaces nudgedAt", () => {
  it("a gather phase carries nudgedAt after a nudge (and never counts the marker as a responder)", async () => {
    const room = "nudge-surface";
    await seedGather(room);
    expect((await getPublicState("a", room, "participant")).nudgedAt ?? null).toBeNull();
    await tryNudge("p1", room);
    const pub = await getPublicState("a", room, "participant");
    expect(typeof pub.nudgedAt).toBe("number");
    // the facilitator's responded count must NOT include the __nudge__ marker
    const fac = await getPublicState(null, room, "facilitator");
    expect(fac.participation?.responded).toBe(0);
  });

  it("a non-gather phase has nudgedAt null", async () => {
    const room = "nudge-nongather";
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases: [{ id: "c", moduleId: "close", config: { label: "Close" } }],
        phaseId: "c",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "",
        ended: false,
      },
      room,
    );
    expect((await getPublicState("a", room, "participant")).nudgedAt ?? null).toBeNull();
  });
});
