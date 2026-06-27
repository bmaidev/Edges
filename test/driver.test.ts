import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import {
  endSession,
  getFacilitatorState,
  getPublicState,
  getState,
  heartbeatHost,
  setDriver,
  setPhase,
  setPhases,
} from "@/lib/store";
import { createRoom } from "@/lib/rooms";
import { DRIVER_STALE_MS, isDriverLive } from "@/lib/presence";
import type { DriverInfo, HostPresence, PhaseInstance } from "@/lib/types";

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-driver";
});

// C5 fast-follow — the soft driving baton. The load-bearing correctness property:
// a claim lives on SessionState and bumps rev, so a stale poll can never revert it.

const PHASES: PhaseInstance[] = [
  { id: "p1", moduleId: "capture", config: { label: "One", prompt: "?" } },
  { id: "p2", moduleId: "capture", config: { label: "Two", prompt: "?" } },
];

const D = (id: string, name = "Sam", claimedAt = 1_000): DriverInfo => ({
  driverId: id,
  driverName: name,
  claimedAt,
});

describe("isDriverLive (pure)", () => {
  const roster: HostPresence[] = [
    { presenceId: "p1", name: "Sam", role: "facilitator", lastSeen: 1 },
  ];
  it("live only when present in the roster AND the claim is recent", () => {
    const now = 5_000;
    expect(isDriverLive(D("p1", "Sam", now - 1000), roster, now)).toBe(true);
    expect(isDriverLive(D("p1", "Sam", now - DRIVER_STALE_MS - 1), roster, now)).toBe(false); // stale time
    expect(isDriverLive(D("p9", "Ghost", now), roster, now)).toBe(false); // not in roster
    expect(isDriverLive(null, roster, now)).toBe(false);
  });
});

describe("setDriver — rev-bumped authoritative-apply", () => {
  it("claim then handoff each strictly increase rev", async () => {
    const { room } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    const r0 = (await getState(room.slug)).rev ?? 0;
    const r1 = await setDriver(D("a", "Ada"), room.slug);
    expect(r1.driver?.driverId).toBe("a");
    expect(r1.rev!).toBeGreaterThan(r0);
    const r2 = await setDriver(D("b", "Bo"), room.slug); // handoff
    expect(r2.driver?.driverId).toBe("b");
    expect(r2.rev!).toBeGreaterThan(r1.rev!);
    const r3 = await setDriver(null, room.slug); // release
    expect(r3.driver ?? null).toBeNull();
    expect(r3.rev!).toBeGreaterThan(r2.rev!);
  });
});

describe("take-over co-claim — one write, one rev", () => {
  it("setPhase with claimDriver changes phaseId AND driver in a single state", async () => {
    const { room } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    const written = await setPhase("p2", room.slug, { claimDriver: D("c", "Cy", 2_000) });
    expect(written.phaseId).toBe("p2");
    expect(written.driver?.driverId).toBe("c"); // both landed in ONE written state
  });
});

describe("derivation + scoping via getFacilitatorState", () => {
  it("exposes driver + driverStale to the host; never to participants", async () => {
    const { room } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    await heartbeatHost("p1", "Sam", "facilitator", room.slug); // make p1 a live console
    await setDriver(D("p1", "Sam", Date.now()), room.slug);
    const fac = await getFacilitatorState(room.slug);
    expect(fac.driver?.driverId).toBe("p1");
    expect(fac.driverStale).toBe(false);
    // a participant/projector view must never carry the baton (co-host names).
    const part = (await getPublicState("x", room.slug, "participant")) as { driver?: unknown };
    expect(part.driver).toBeUndefined();
    const proj = (await getPublicState(null, room.slug, "projector")) as { driver?: unknown };
    expect(proj.driver).toBeUndefined();
  });

  it("a driver whose console isn't in the roster reads as stale", async () => {
    const { room } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    await setDriver(D("ghost", "Ghost", Date.now()), room.slug); // no heartbeat → not live
    const fac = await getFacilitatorState(room.slug);
    expect(fac.driverStale).toBe(true);
  });
});

describe("host route — claim vs directed hand-off (C5)", () => {
  const req = (slug: string, body: Record<string, unknown>) =>
    new NextRequest(`http://x/api/r/${slug}/host`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("claimDriver takes the baton for the caller's own presence", async () => {
    const { room, passcodes } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    const res = await hostPOST(
      req(room.slug, { command: "claimDriver", code: passcodes.facilitator, driverId: "me-1", driverName: "Ada" }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).state.driver.driverId).toBe("me-1");
  });

  it("handoffDriver is a distinct directed verb keyed on toPresenceId/toName", async () => {
    const { room, passcodes } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    const res = await hostPOST(
      req(room.slug, { command: "handoffDriver", code: passcodes.facilitator, toPresenceId: "cohost-9", toName: "Bo" }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(200);
    const d = (await res.json()).state.driver;
    expect(d.driverId).toBe("cohost-9");
    expect(d.driverName).toBe("Bo");
  });

  it("handoffDriver without a target is a 400 (not silently a self-claim)", async () => {
    const { room, passcodes } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    const res = await hostPOST(
      req(room.slug, { command: "handoffDriver", code: passcodes.facilitator, driverId: "me-1" }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(400);
  });
});

describe("lifecycle", () => {
  it("ending the session clears the baton", async () => {
    const { room } = await createRoom("T", "t");
    await setPhases(PHASES, "S", room.slug);
    await setDriver(D("a", "Ada"), room.slug);
    await endSession(room.slug);
    expect((await getState(room.slug)).driver ?? null).toBeNull();
  });
});
