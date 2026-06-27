import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  getPublicState,
  listSubmissions,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";
import type {
  ActionsFacilitatorView,
  ActionsParticipantView,
  ActionsProjectorView,
} from "@/lib/modules/defs/actions.server";

// F2 — yours-first commitments. Drive through the real dispatchAction + view
// paths. Load-bearing guarantees: (1) a participant sees ONLY their own items,
// (2) the per-person cap is enforced server-side, (3) the projector view is
// counts-only (a commitment never leaves the server verbatim to the big screen),
// (4) the facilitator gets the list with owners for follow-up.

const PHASE: PhaseInstance = {
  id: "act1",
  moduleId: "actions",
  config: { label: "Actions", prompt: "What will you do?", maxItems: 2 },
};

async function setup(config: Record<string, unknown> = PHASE.config) {
  const { room } = await createRoom("Test", "Topic");
  const phase = { ...PHASE, config };
  await setPhases([phase], "Test session", room.slug);
  await setPhase(phase.id, room.slug);
  await addParticipant("tok-a", "Alice", room.slug);
  await addParticipant("tok-b", "Bo", room.slug);
  return room.slug;
}

async function add(roomId: string, token: string, text: string, owner?: string) {
  return dispatchAction(
    roomId,
    { type: "add", token, payload: owner ? { text, owner } : { text } },
    "participant",
  );
}

describe("actions module — yours-first", () => {
  it("shows a participant only their OWN items", async () => {
    const roomId = await setup();
    expect((await add(roomId, "tok-a", "Ship the doc")).ok).toBe(true);
    expect((await add(roomId, "tok-b", "Call the vendor")).ok).toBe(true);

    const aView = (
      (await getPublicState("tok-a", roomId, "participant")).view as unknown as {
        data: ActionsParticipantView;
      }
    ).data;
    expect(aView.for).toBe("participant");
    expect(aView.mine.map((m) => m.text)).toEqual(["Ship the doc"]);
    // Bo's commitment never appears in Alice's view.
    expect(JSON.stringify(aView.mine)).not.toContain("Call the vendor");
    // But the soft room signal counts everyone.
    expect(aView.roomCount).toBe(2);
    expect(aView.contributorCount).toBe(2);
  });

  it("defaults the owner to the author's handle; an explicit owner overrides", async () => {
    const roomId = await setup();
    await add(roomId, "tok-a", "Default owner");
    await add(roomId, "tok-a", "Custom owner", "The whole team");
    const subs = await listSubmissions(roomId);
    const byText = Object.fromEntries(subs.map((s) => [s.text, s.tag]));
    expect(byText["Default owner"]).toBe("Alice");
    expect(byText["Custom owner"]).toBe("The whole team");
  });

  it("enforces the per-person cap server-side", async () => {
    const roomId = await setup(); // maxItems: 2
    expect((await add(roomId, "tok-a", "one")).ok).toBe(true);
    expect((await add(roomId, "tok-a", "two")).ok).toBe(true);
    const third = await add(roomId, "tok-a", "three");
    expect(third.ok).toBe(false);
    expect(third.reason).toBe("limit");
    // The cap is per-person — Bo can still add.
    expect((await add(roomId, "tok-b", "mine")).ok).toBe(true);
    const aView = (
      (await getPublicState("tok-a", roomId, "participant")).view as unknown as {
        data: ActionsParticipantView;
      }
    ).data;
    expect(aView.mine).toHaveLength(2);
    expect(aView.remaining).toBe(0);
  });

  it("rejects empty text", async () => {
    const roomId = await setup();
    const res = await add(roomId, "tok-a", "   ");
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("empty");
    expect(await listSubmissions(roomId)).toHaveLength(0);
  });

  it("the projector view is counts-only — never the words", async () => {
    const roomId = await setup();
    await add(roomId, "tok-a", "A private commitment text");
    await add(roomId, "tok-b", "Another secret plan");
    const pView = (
      (await getPublicState(null, roomId, "projector")).view as unknown as {
        data: ActionsProjectorView;
      }
    ).data;
    expect(pView.for).toBe("projector");
    expect(pView.roomCount).toBe(2);
    expect(pView.contributorCount).toBe(2);
    // No commitment text leaks onto the big screen.
    expect(JSON.stringify(pView)).not.toContain("A private commitment text");
    expect(JSON.stringify(pView)).not.toContain("Another secret plan");
  });

  it("the facilitator sees the list with owners, for follow-up", async () => {
    const roomId = await setup();
    await add(roomId, "tok-a", "Ship the doc", "Alice");
    await add(roomId, "tok-b", "Call the vendor", "Bo");
    const fView = (
      (await getPublicState(null, roomId, "facilitator")).view as unknown as {
        data: ActionsFacilitatorView;
      }
    ).data;
    expect(fView.for).toBe("facilitator");
    expect(fView.items).toHaveLength(2);
    expect(fView.contributorCount).toBe(2);
    const texts = fView.items.map((i) => i.text);
    expect(texts).toContain("Ship the doc");
    expect(texts).toContain("Call the vendor");
    expect(fView.items.map((i) => i.owner)).toContain("Alice");
  });
});
