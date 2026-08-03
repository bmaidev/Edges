import { describe, expect, it } from "vitest";
import {
  addParticipant,
  addSubmission,
  castVote,
  getPublicState,
  replaceState,
} from "@/lib/store";
import type { ModuleKind, SessionState } from "@/lib/types";

async function activate(
  room: string,
  moduleId: ModuleKind,
  config: Record<string, unknown>,
) {
  const state: SessionState = {
    mode: null,
    sessionName: "Privacy boundary",
    phases: [{ id: "p1", moduleId, config }],
    phaseId: "p1",
    timerEndsAt: null,
    timerRemainingMs: null,
    readaroundIndex: 0,
    topic: "Private workshop",
    ended: false,
  };
  await replaceState(state, room);
}

describe("central module visibility gate", () => {
  it("never returns a hidden facilitator-only view to participants or projectors", async () => {
    const room = "privacy-hidden-equity";
    await activate(room, "equity", { label: "Participation", anonymize: false });
    await addParticipant("tok-a", "Ada", room);
    await addSubmission("Ada", "private words", "source", null, "tok-a", room);

    expect((await getPublicState("tok-a", room, "participant")).view).toBeNull();
    expect((await getPublicState(null, room, "projector")).view).toBeNull();

    const facilitator = await getPublicState(null, room, "facilitator");
    expect(facilitator.view?.moduleId).toBe("equity");
    expect(JSON.stringify(facilitator.view)).toContain("Ada");
  });
});

describe("fishbowl question visibility", () => {
  it("shows question text to staff, projector, and seated speakers—not observers", async () => {
    const room = "privacy-fishbowl";
    await activate(room, "fishbowl", {
      label: "Fishbowl",
      innerSeats: 4,
      mode: "open",
      allowQuestions: true,
    });
    await addParticipant("speaker", "Speaker", room);
    await addParticipant("observer", "Observer", room);
    await castVote("p1", "speaker", { seated: true, since: 1 }, room);
    await addSubmission("Observer", "A private question", "p1", "question", "observer", room);

    const observer = await getPublicState("observer", room, "participant");
    expect(JSON.stringify(observer.view)).not.toContain("A private question");

    const speaker = await getPublicState("speaker", room, "participant");
    expect(JSON.stringify(speaker.view)).toContain("A private question");
    expect(JSON.stringify((await getPublicState(null, room, "projector")).view)).toContain(
      "A private question",
    );
  });
});
