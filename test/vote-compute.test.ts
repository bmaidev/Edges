import { describe, expect, it } from "vitest";
import { pollView, samplePollVotes } from "@/lib/modules/vote-compute";
import { getSampleView } from "@/lib/modules/sample-views";
import {
  addParticipant,
  castVote,
  getPublicState,
  setPhases,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import type { PhaseInstance } from "@/lib/types";

// B2 (Wave 3) — faithfulness. The in-builder preview and the live computeView
// share ONE pure shaper (pollView), so a preview can't drift from the real view.

describe("pollView (pure)", () => {
  it("counts single-choice votes + resolves the caller's pick", () => {
    const v = pollView(
      { options: ["A", "B"], question: "?", multi: false },
      { s1: "A", s2: "A", s3: "B", me: "A" },
      "me",
      "participant",
    );
    expect(v.counts).toEqual({ A: 3, B: 1 });
    expect(v.total).toBe(4);
    expect(v.mine).toEqual(["A"]);
  });

  it("hides counts from a participant until reveal=onAdvance, shows them to the host", () => {
    const cfg = { options: ["A", "B"], question: "?", reveal: "onAdvance" };
    const votes = { s1: "A", me: "B" };
    expect(pollView(cfg, votes, "me", "participant").counts).toBeNull();
    expect(pollView(cfg, votes, null, "facilitator").counts).toEqual({ A: 1, B: 1 });
  });

  it("ignores votes for options that aren't in the set", () => {
    const v = pollView({ options: ["A"] }, { s1: "A", s2: "ZZZ" }, null, "facilitator");
    expect(v.counts).toEqual({ A: 1 });
    expect(v.total).toBe(1); // the stray vote counted no real option
  });
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "poll", config: { label: "P", question: "Pick", options: ["A", "B", "C"] } },
];

describe("faithfulness: preview == live view", () => {
  it("the sample preview equals the live computeView over the SAME synthetic votes", async () => {
    const options = ["A", "B", "C"];
    const { room } = await createRoom("Faith", "Topic");
    await setPhases(PHASES, "T", room.slug);

    // Replay the exact synthetic votes the preview uses into a real room. "me" must
    // be a real participant for the live `mine` to resolve (the preview assumes it).
    const votes = samplePollVotes(options, false);
    await addParticipant("me", "Me", room.slug);
    for (const [token, value] of Object.entries(votes)) {
      await castVote("p1", token, value, room.slug);
    }

    // The live participant view, as "me" sees it.
    const pub = await getPublicState("me", room.slug, "participant");
    const live = pub.view?.data;

    // The in-builder preview for the same config.
    const preview = getSampleView("poll", { question: "Pick", options });

    expect(preview).toEqual(live); // byte-identical — no drift possible
  });

  it("still satisfies the config-reactive contract (options flow through)", () => {
    const v = getSampleView("poll", { options: ["Apple", "Pear", "Plum"] }) as {
      options: string[];
      counts: Record<string, number>;
      mine: string[];
    };
    expect(v.options).toEqual(["Apple", "Pear", "Plum"]);
    expect(Object.keys(v.counts)).toEqual(["Apple", "Pear", "Plum"]);
    expect(v.mine).toEqual(["Apple"]);
  });
});
