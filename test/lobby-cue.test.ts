import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import {
  getPublicState,
  roomSignature,
  setLobbyCue,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";

// E1 — author the front-of-room lobby: the begin-cue line + a count-visibility
// privacy toggle. Load-bearing guarantees: (1) it rides authoritative-apply
// (rev bump, no read-back), (2) a partial patch leaves the untouched key alone,
// (3) the count defaults to visible until explicitly turned off, (4) cohost can
// author it (tier `timer`) but a participant cannot.

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-lobby-cue";
});

async function seeded() {
  const { room, passcodes } = await createRoom("Test", "Topic");
  return { slug: room.slug, passcodes };
}

describe("setLobbyCue — authoritative-apply + partial patch", () => {
  it("writes the cue and bumps rev", async () => {
    const { slug } = await seeded();
    const before = (await getPublicState(null, slug, "projector")).rev;
    const written = await setLobbyCue({ cue: "Find a seat" }, slug);
    expect(written.lobbyCue).toBe("Find a seat");
    expect(written.rev).toBeGreaterThan(before);
  });

  it("count defaults to visible; an empty/blank cue clears to null", async () => {
    const { slug } = await seeded();
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.lobbyCountVisible).toBe(true); // default
    expect(pub.lobbyCue).toBeNull();
    const cleared = await setLobbyCue({ cue: "" }, slug);
    expect(cleared.lobbyCue).toBeNull();
  });

  it("a count-only patch leaves an already-authored cue intact", async () => {
    const { slug } = await seeded();
    await setLobbyCue({ cue: "Welcome in" }, slug);
    const written = await setLobbyCue({ countVisible: false }, slug);
    expect(written.lobbyCue).toBe("Welcome in"); // untouched
    expect(written.lobbyCountVisible).toBe(false);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.lobbyCue).toBe("Welcome in");
    expect(pub.lobbyCountVisible).toBe(false);
  });

  it("clamps an over-long cue to 200 chars", async () => {
    const { slug } = await seeded();
    const written = await setLobbyCue({ cue: "x".repeat(500) }, slug);
    expect(written.lobbyCue?.length).toBe(200);
  });
});

describe("roomSignature ticks", () => {
  it("changes on a cue edit and on a count-visibility toggle", async () => {
    const { slug } = await seeded();
    const base = await roomSignature(slug);
    await setLobbyCue({ cue: "Begin shortly" }, slug);
    const afterCue = await roomSignature(slug);
    expect(afterCue).not.toBe(base);
    await setLobbyCue({ countVisible: false }, slug);
    const afterToggle = await roomSignature(slug);
    expect(afterToggle).not.toBe(afterCue);
  });
});

describe("host route gating", () => {
  function hostReq(slug: string, body: Record<string, unknown>) {
    return new NextRequest(`http://x/api/r/${slug}/host`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("a cohost can author the lobby (tier `timer`)", async () => {
    const { slug, passcodes } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "setLobbyCue", code: passcodes.cohost, cue: "Take a seat", countVisible: false }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.state.lobbyCue).toBe("Take a seat");
    expect(d.state.lobbyCountVisible).toBe(false);
  });

  it("no/invalid host code is forbidden", async () => {
    const { slug } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "setLobbyCue", code: "not-a-real-code", cue: "x" }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(403);
  });
});
