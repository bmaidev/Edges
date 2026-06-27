import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import { getPublicState, roomSignature, setTimerSound } from "@/lib/store";
import { createRoom } from "@/lib/rooms";

// W1/C6 — room-wide timer-sound opt-out. Mirrors the projector-a11y toggle: it
// rides authoritative-apply (rev bump), surfaces on PublicState so every room
// surface can silence the chime, ticks the signature, and is host-gated (tier
// `timer`, so a cohost can set it but a participant cannot).

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-timer-sound";
});

async function seeded() {
  const { room, passcodes } = await createRoom("Test", "Topic");
  return { slug: room.slug, passcodes };
}

const hostReq = (slug: string, body: Record<string, unknown>) =>
  new NextRequest(`http://x/api/r/${slug}/host`, {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("setTimerSound — authoritative-apply + surface", () => {
  it("bumps rev, surfaces on PublicState, ticks the signature; default is sound-on", async () => {
    const { slug } = await seeded();
    const before = await getPublicState(null, slug, "projector");
    expect(before.timerSoundOff).toBe(false); // default: sound on
    const sig0 = await roomSignature(slug);

    const off = await setTimerSound(true, slug);
    expect(off.timerSoundOff).toBe(true);
    expect(off.rev!).toBeGreaterThan(before.rev);
    expect((await getPublicState(null, slug, "projector")).timerSoundOff).toBe(true);
    expect(await roomSignature(slug)).not.toBe(sig0);

    const on = await setTimerSound(false, slug);
    expect(on.timerSoundOff).toBe(false);
  });
});

describe("host route gating", () => {
  it("a cohost can mute the room timer (tier `timer`)", async () => {
    const { slug, passcodes } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "setTimerSound", code: passcodes.cohost, off: true }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).state.timerSoundOff).toBe(true);
  });

  it("an invalid code is forbidden", async () => {
    const { slug } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "setTimerSound", code: "nope", off: true }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(403);
  });
});
