import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import {
  addSubmission,
  deleteSubmission,
  endSession,
  getFacilitatorState,
  getPublicState,
  roomSignature,
  setPhase,
  setPhases,
  setSpotlight,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import type { PhaseInstance } from "@/lib/types";

// C4 — spotlight a participant response to the projector. The load-bearing
// guarantees: (1) it rides authoritative-apply (rev bump, no read-back),
// (2) it NEVER carries a name to the room, even from a named-to-room phase,
// (3) every relaunch/advance/end clears it.

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-spotlight";
});

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
  { id: "p2", moduleId: "capture", config: { label: "More", prompt: "Go" } },
];

async function seeded() {
  const { room, passcodes } = await createRoom("Test", "Topic");
  await setPhases(PHASES, "Test session", room.slug);
  // A submission with a REAL (non-anonymous) handle — the privacy trap.
  const sub = await addSubmission("Dana", "A bold idea", "p1", null, "tokDana", room.slug);
  return { slug: room.slug, passcodes, sub };
}

describe("setSpotlight — authoritative-apply", () => {
  it("writes the ref and bumps rev; clearing bumps again", async () => {
    const { slug, sub } = await seeded();
    const before = (await getPublicState(null, slug, "projector")).rev;
    const set = await setSpotlight({ kind: "submission", id: sub.id }, slug);
    expect(set.spotlight).toEqual({ kind: "submission", id: sub.id });
    expect(set.rev).toBeGreaterThan(before);
    const cleared = await setSpotlight(null, slug);
    expect(cleared.spotlight).toBeNull();
    expect(cleared.rev).toBeGreaterThan(set.rev ?? 0);
  });
});

describe("resolution + privacy", () => {
  it("resolves a live submission to room-safe text with NO handle", async () => {
    const { slug, sub } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.spotlight).toEqual({ text: "A bold idea", handle: null });
    // The underlying submission has a real handle — it must NOT leak to the room.
    expect(pub.spotlight?.handle).toBeNull();
  });

  it("a deleted submission makes the overlay vanish cleanly (null, no throw)", async () => {
    const { slug, sub } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    await deleteSubmission(sub.id, slug);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.spotlight).toBeNull();
  });

  it("a literal spotlight shows its text, still handle-free", async () => {
    const { slug } = await seeded();
    await setSpotlight({ kind: "literal", text: "On the wall" }, slug);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.spotlight).toEqual({ text: "On the wall", handle: null });
  });
});

describe("role scoping", () => {
  it("only the facilitator state carries the raw ref; participants get resolved text only", async () => {
    const { slug, sub } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const fac = await getFacilitatorState(slug);
    expect(fac.spotlightRef).toEqual({ kind: "submission", id: sub.id });
    const part = (await getPublicState("tokDana", slug, "participant")) as {
      spotlightRef?: unknown;
      spotlight?: unknown;
    };
    expect(part.spotlightRef).toBeUndefined();
    expect(part.spotlight).toEqual({ text: "A bold idea", handle: null });
  });
});

describe("auto-clear", () => {
  it("advancing the phase clears the spotlight", async () => {
    const { slug, sub } = await seeded();
    await setPhase("p1", slug);
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const written = await setPhase("p2", slug);
    expect(written.spotlight).toBeNull();
  });

  it("relaunching a sequence clears the spotlight", async () => {
    const { slug, sub } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const written = await setPhases(PHASES, "Again", slug);
    expect(written.spotlight).toBeNull();
  });

  it("ending the session clears the spotlight", async () => {
    const { slug, sub } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    await endSession(slug);
    const pub = await getPublicState(null, slug, "projector");
    expect(pub.spotlight).toBeNull();
  });
});

describe("roomSignature ticks", () => {
  it("changes on set, replace-with-different-ref, and clear", async () => {
    const { slug, sub } = await seeded();
    const sub2 = await addSubmission("Eli", "Another", "p1", null, "tokEli", slug);
    const base = await roomSignature(slug);
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const set = await roomSignature(slug);
    expect(set).not.toBe(base);
    await setSpotlight({ kind: "submission", id: sub2.id }, slug);
    const replaced = await roomSignature(slug);
    expect(replaced).not.toBe(set);
    await setSpotlight(null, slug);
    const cleared = await roomSignature(slug);
    expect(cleared).not.toBe(replaced);
  });
});

describe("host route gating + parse", () => {
  function hostReq(slug: string, body: Record<string, unknown>) {
    return new NextRequest(`http://x/api/r/${slug}/host`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("a cohost can spotlight; the response carries resolved room-safe text", async () => {
    const { slug, sub, passcodes } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "spotlight", code: passcodes.cohost, id: sub.id }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.state.spotlight).toEqual({ text: "A bold idea", handle: null });
  });

  it("no/invalid host code is forbidden (participants can't spotlight)", async () => {
    const { slug, sub } = await seeded();
    const res = await hostPOST(
      hostReq(slug, { command: "spotlight", code: "not-a-real-code", id: sub.id }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(403);
  });

  it("a payload with neither id nor text clears, without throwing", async () => {
    const { slug, sub, passcodes } = await seeded();
    await setSpotlight({ kind: "submission", id: sub.id }, slug);
    const res = await hostPOST(
      hostReq(slug, { command: "spotlight", code: passcodes.facilitator }),
      { params: { room: slug } },
    );
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.state.spotlight).toBeNull();
  });
});
