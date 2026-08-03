import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  getPublicState,
  setPhase,
  setPhases,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";
import type { LightningView } from "@/lib/modules/defs/lightning.server";

const PHASE: PhaseInstance = {
  id: "talks",
  moduleId: "lightning",
  config: {
    label: "Lightning talks",
    secondsPerSpeaker: 60,
    queueMode: "signup",
  },
};

async function setup() {
  const { room } = await createRoom("Lightning test", "Demos");
  await setPhases([PHASE], "Talks", room.slug);
  await addParticipant("p1", "First", room.slug);
  await addParticipant("p2", "Second", room.slug);
  await setPhase(PHASE.id, room.slug);
  await dispatchAction(
    room.slug,
    { type: "join", token: "p1", payload: { topic: "One" } },
    "participant",
  );
  await dispatchAction(
    room.slug,
    { type: "join", token: "p2", payload: { topic: "Two" } },
    "participant",
  );
  return room.slug;
}

async function view(room: string): Promise<LightningView> {
  return (await getPublicState(null, room, "facilitator")).view
    ?.data as LightningView;
}

describe("lightning talks progression", () => {
  it("starts and times the first speaker before advancing them", async () => {
    const room = await setup();
    const before = await view(room);
    expect(before.current?.handle).toBe("First");
    expect(before.startedAt).toBeUndefined();

    expect(
      (await dispatchAction(room, { type: "next" }, "facilitator")).ok,
    ).toBe(true);
    const started = await view(room);
    expect(started.current?.handle).toBe("First");
    expect(started.startedAt).toEqual(expect.any(Number));

    expect(
      (await dispatchAction(room, { type: "next" }, "facilitator")).ok,
    ).toBe(true);
    const advanced = await view(room);
    expect(advanced.current?.handle).toBe("Second");
    expect(advanced.startedAt).toEqual(expect.any(Number));
  });

  it("cannot skip speakers under simultaneous lead/cohost taps", async () => {
    const room = await setup();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatchAction(room, { type: "next" }, "facilitator"),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const started = await view(room);
    expect(started.current?.handle).toBe("First");
    expect(started.startedAt).toEqual(expect.any(Number));
  });
});
