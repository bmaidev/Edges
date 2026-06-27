import { describe, expect, it } from "vitest";
import { createRoom } from "@/lib/rooms";
import {
  addParticipant,
  dispatchAction,
  getPublicState,
  listSubmissions,
  setPhase,
  setPhases,
} from "@/lib/store";
import { resolveAttribution } from "@/lib/modules/attribution";
import type { PhaseInstance } from "@/lib/types";

// W1/D1 — anonymous-strict: the provably off-the-record tier. Unlike "anonymous"
// (which only hides the displayed handle), strict ALSO drops the participant
// token at write, so there is no link left for even a facilitator to follow.

function phase(anonymity: string): PhaseInstance {
  return {
    id: "p1",
    moduleId: "capture",
    config: { label: "Off the record", prompt: "Say the hard thing", anonymity },
  };
}

async function seed(anonymity: string) {
  const { room } = await createRoom("T", "Topic");
  await setPhases([phase(anonymity)], "S", room.slug);
  await setPhase("p1", room.slug);
  await addParticipant("tok-a", "Ada", room.slug);
  return room.slug;
}

describe("anonymous-strict write path", () => {
  it("drops BOTH the handle and the token at write", async () => {
    const slug = await seed("anonymous-strict");
    const res = await dispatchAction(
      slug,
      { type: "submit", token: "tok-a", payload: { text: "a candid thing" } },
      "participant",
    );
    expect(res.ok).toBe(true);
    const subs = await listSubmissions(slug);
    expect(subs).toHaveLength(1);
    expect(subs[0].handle).toBe("Anonymous");
    // the crux: no token, so the token→handle map has nothing to join on.
    expect(subs[0].token).toBeNull();
  });

  it("plain 'anonymous' hides the handle but KEEPS the token (the weaker tier)", async () => {
    const slug = await seed("anonymous");
    await dispatchAction(
      slug,
      { type: "submit", token: "tok-a", payload: { text: "x" } },
      "participant",
    );
    const subs = await listSubmissions(slug);
    expect(subs[0].handle).toBe("Anonymous");
    expect(subs[0].token).toBe("tok-a"); // still linkable by a facilitator
  });
});

describe("resolveAttribution", () => {
  it("returns anonymous-strict when the phase is strict, regardless of module", () => {
    expect(resolveAttribution("capture", "submissions", "anonymous-strict")).toBe(
      "anonymous-strict",
    );
    expect(resolveAttribution("capture", "submissions", "anonymous")).toBe(
      "facilitators-only",
    );
    expect(resolveAttribution("capture", "submissions")).toBe("facilitators-only");
    expect(resolveAttribution(null, "none")).toBe("none");
  });
});

describe("participant-facing attribution", () => {
  it("a strict phase surfaces attribution=anonymous-strict on the public state", async () => {
    const slug = await seed("anonymous-strict");
    const pub = (await getPublicState("tok-a", slug, "participant")) as {
      attribution?: string;
    };
    expect(pub.attribution).toBe("anonymous-strict");
  });
});
