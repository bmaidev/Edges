import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  dispatchAction,
  getFacilitatorState,
  getPublicState,
  readVotes,
  setPhases,
  setPhase,
} from "@/lib/store";
import type { PhaseInstance } from "@/lib/types";
import type { MediaCard, MediaView } from "@/lib/modules/defs/media.server";

// The media (presentation) module: a facilitator-driven deck of image/video
// cards shown on the projector. Covers config seeding, the deck-edit guard,
// role gating, and the index lock that stops a double-tapped "Next" skipping.

const card = (id: string): MediaCard => ({
  id,
  kind: "image",
  url: `https://example.com/${id}.jpg`,
  title: id,
});

function phase(cards?: MediaCard[]): PhaseInstance {
  return { id: "m1", moduleId: "media", config: { label: "Slides", cards } };
}

async function setup(cards?: MediaCard[]) {
  const { room } = await createRoom("Test", "Topic");
  await setPhases([phase(cards)], "Test session", room.slug);
  await setPhase("m1", room.slug);
  return room.slug;
}

const index = async (roomId: string) =>
  ((await readVotes("m1", roomId))["__index__"] as number) ?? 0;

describe("media module", () => {
  it("seeds the deck from config and shows the first card to the room", async () => {
    const roomId = await setup([card("a"), card("b")]);
    const view = (await getPublicState(null, roomId, "projector")).view
      ?.data as MediaView;
    expect(view.total).toBe(2);
    expect(view.index).toBe(0);
    expect(view.card?.id).toBe("a");
    // The projector/participant view never carries the whole deck.
    expect(view.deck).toBeUndefined();
  });

  it("gives the facilitator the full deck to manage", async () => {
    const roomId = await setup([card("a"), card("b")]);
    const fac = await getFacilitatorState(roomId);
    const view = fac.view?.data as MediaView;
    expect(view.deck?.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("setDeck replaces the deck and drops unsafe URLs", async () => {
    const roomId = await setup();
    const res = await dispatchAction(
      roomId,
      {
        type: "setDeck",
        payload: {
          deck: [
            card("good"),
            { id: "bad", kind: "image", url: "javascript:alert(1)" },
            { id: "vid", kind: "video", url: "https://youtu.be/abc123" },
          ],
        },
      },
      "facilitator",
    );
    expect(res.ok).toBe(true);
    const fac = await getFacilitatorState(roomId);
    const ids = (fac.view?.data as MediaView).deck?.map((c) => c.id);
    expect(ids).toEqual(["good", "vid"]); // the javascript: card was rejected
  });

  it("advances by exactly 1 under 5 concurrent Next taps", async () => {
    const roomId = await setup([card("a"), card("b"), card("c"), card("d"), card("e")]);
    expect(await index(roomId)).toBe(0);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        dispatchAction(roomId, { type: "next" }, "facilitator"),
      ),
    );
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(await index(roomId)).toBe(1);
  });

  it("clamps the index at the deck edges", async () => {
    const roomId = await setup([card("a"), card("b")]);
    await dispatchAction(roomId, { type: "prev" }, "facilitator"); // already at 0
    expect(await index(roomId)).toBe(0);
    await dispatchAction(roomId, { type: "next" }, "facilitator");
    await dispatchAction(roomId, { type: "next" }, "facilitator"); // past the end
    expect(await index(roomId)).toBe(1);
  });

  it("rejects deck edits and navigation from participants", async () => {
    const roomId = await setup([card("a"), card("b")]);
    const edit = await dispatchAction(
      roomId,
      { type: "setDeck", payload: { deck: [card("x")] }, token: "t0" },
      "participant",
    );
    expect(edit.ok).toBe(false);
    const nav = await dispatchAction(
      roomId,
      { type: "next", token: "t0" },
      "participant",
    );
    expect(nav.ok).toBe(false);
    expect(await index(roomId)).toBe(0);
  });
});
