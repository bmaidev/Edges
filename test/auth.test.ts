import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  requireCapability,
  roleHasCapability,
} from "@/lib/auth";
import { createRoom } from "@/lib/rooms";

describe("roleHasCapability", () => {
  it("admin has every capability", () => {
    for (const cap of Array.from(CAPABILITIES.admin)) {
      expect(roleHasCapability("admin", cap)).toBe(true);
    }
    // explicit checks on the privileged extremes
    expect(roleHasCapability("admin", "configure")).toBe(true);
    expect(roleHasCapability("admin", "end")).toBe(true);
  });

  it("participant has none of the privileged capabilities", () => {
    expect(roleHasCapability("participant", "configure")).toBe(false);
    expect(roleHasCapability("participant", "end")).toBe(false);
    expect(roleHasCapability("participant", "advance")).toBe(false);
    expect(CAPABILITIES.participant.size).toBe(0);
  });

  it("facilitator has every cap incl. configure (A2: the magic-link runs the whole room)", () => {
    expect(roleHasCapability("facilitator", "configure")).toBe(true);
    expect(roleHasCapability("facilitator", "advance")).toBe(true);
    expect(roleHasCapability("facilitator", "end")).toBe(true);
    expect(roleHasCapability("facilitator", "reassign")).toBe(true);
  });

  it("cohost lacks configure/end/reassign but can drive the room", () => {
    expect(roleHasCapability("cohost", "configure")).toBe(false);
    expect(roleHasCapability("cohost", "end")).toBe(false);
    expect(roleHasCapability("cohost", "reassign")).toBe(false);
    // facilitator-ish caps it DOES hold
    expect(roleHasCapability("cohost", "advance")).toBe(true);
    expect(roleHasCapability("cohost", "timer")).toBe(true);
    expect(roleHasCapability("cohost", "inject")).toBe(true);
    expect(roleHasCapability("cohost", "curate")).toBe(true);
    expect(roleHasCapability("cohost", "cluster")).toBe(true);
    expect(roleHasCapability("cohost", "viewRaw")).toBe(true);
  });

  it("projector holds nothing", () => {
    expect(CAPABILITIES.projector.size).toBe(0);
  });
});

describe("requireCapability against a real room", () => {
  it("resolves real passcodes to roles and gates capabilities", async () => {
    const { room, passcodes } = await createRoom("Test Room", "A topic");
    const slug = room.slug;

    // Facilitator passcode -> facilitator role, passes an `advance` cap.
    const facAdvance = await requireCapability(slug, passcodes.facilitator, "advance");
    expect(facAdvance).toEqual({ ok: true, role: "facilitator" });

    // A2: facilitator now PASSES configure (can launch a custom build — no 403).
    const facConfigure = await requireCapability(slug, passcodes.facilitator, "configure");
    expect(facConfigure).toEqual({ ok: true, role: "facilitator" });

    // Cohost is REJECTED for configure (403-style), but resolves as cohost.
    const cohostConfigure = await requireCapability(slug, passcodes.cohost, "configure");
    expect(cohostConfigure).toEqual({ ok: false, role: "cohost" });

    // Admin passcode passes configure.
    const adminConfigure = await requireCapability(slug, passcodes.admin, "configure");
    expect(adminConfigure).toEqual({ ok: true, role: "admin" });
  });

  it("rejects a wrong or missing code (no role resolved)", async () => {
    const { room } = await createRoom("Test Room 2", "Another topic");
    const slug = room.slug;

    expect(await requireCapability(slug, "totally-wrong", "advance")).toEqual({
      ok: false,
      role: null,
    });
    expect(await requireCapability(slug, null, "advance")).toEqual({
      ok: false,
      role: null,
    });
    expect(await requireCapability(slug, undefined, "advance")).toEqual({
      ok: false,
      role: null,
    });
  });

  it("rejects any code against an unknown room", async () => {
    expect(await requireCapability("no-such-room", "fac-deadbeef", "advance")).toEqual({
      ok: false,
      role: null,
    });
  });
});
