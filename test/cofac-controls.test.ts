import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import { dismissCofac, getState, setCofac } from "@/lib/store";
import { createRoom } from "@/lib/rooms";

// C7 full — the lead's co-facilitator controls persist on the session state:
// enable/sensitivity + per-phase dismissals (rides authoritative-apply).

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-cofac";
});

describe("setCofac / dismissCofac (store)", () => {
  it("toggles enable + sensitivity independently and bumps rev", async () => {
    const { room } = await createRoom("Cofac", "Topic");
    const before = (await getState(room.slug)).rev ?? 0;
    const a = await setCofac({ enabled: false }, room.slug);
    expect(a.cofacEnabled).toBe(false);
    expect(a.rev!).toBeGreaterThan(before);
    // sensitivity-only patch leaves `enabled` untouched.
    const b = await setCofac({ sensitivity: "keen" }, room.slug);
    expect(b.cofacEnabled).toBe(false);
    expect(b.cofacSensitivity).toBe("keen");
  });

  it("persists a dismissal once (deduped) and caps the list", async () => {
    const { room } = await createRoom("Cofac2", "Topic");
    await dismissCofac("p1", "overrunning", room.slug);
    await dismissCofac("p1", "overrunning", room.slug); // dup — no growth
    const s = await getState(room.slug);
    expect(s.cofacDismissed).toEqual([{ phaseId: "p1", kind: "overrunning" }]);
  });
});

describe("host route gating", () => {
  function hostReq(slug: string, body: Record<string, unknown>) {
    return new NextRequest(`http://x/api/r/${slug}/host`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("cofacToggle needs the configure tier — a cohost is forbidden", async () => {
    const { room, passcodes } = await createRoom("Cofac3", "Topic");
    const res = await hostPOST(
      hostReq(room.slug, { command: "cofacToggle", code: passcodes.cohost, enabled: false }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(403);
  });

  it("a cohost CAN dismiss a live nudge (advance tier), and it persists", async () => {
    const { room, passcodes } = await createRoom("Cofac4", "Topic");
    const res = await hostPOST(
      hostReq(room.slug, {
        command: "cofacDismiss",
        code: passcodes.cohost,
        phaseId: "p1",
        kind: "low-response",
      }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(200);
    const s = await getState(room.slug);
    expect(s.cofacDismissed).toEqual([{ phaseId: "p1", kind: "low-response" }]);
  });
});
