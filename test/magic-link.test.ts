import { describe, expect, it } from "vitest";
import {
  createRoom,
  regenerateRoleCode,
  resolveRole,
  updateRoom,
} from "@/lib/rooms";
import { CAPABILITIES, requireCapability, roleHasCapability } from "@/lib/auth";

// A2 — named roles + magic links. The room now mints a fourth read-only
// "projector" tier, single-role passcodes can be regenerated atomically, and the
// facilitator role gained `configure` (so the magic-link facilitator can launch
// a custom build with no admin code — the bug this kills).

describe("A2 rooms: projector tier + create", () => {
  it("mints all four tiers at creation (hashes + plaintext)", async () => {
    const { room, passcodes } = await createRoom("T", "topic");
    expect(Object.keys(passcodes).sort()).toEqual(
      ["admin", "cohost", "facilitator", "projector"],
    );
    for (const t of ["admin", "facilitator", "cohost", "projector"] as const) {
      expect(typeof passcodes[t]).toBe("string");
      expect(room.passcodeHashes[t]).toBeTruthy();
    }
  });

  it("resolves each tier to its role, including projector", async () => {
    const { room, passcodes } = await createRoom("T", "topic");
    expect(await resolveRole(room.slug, passcodes.facilitator)).toBe("facilitator");
    expect(await resolveRole(room.slug, passcodes.cohost)).toBe("cohost");
    expect(await resolveRole(room.slug, passcodes.projector)).toBe("projector");
    expect(await resolveRole(room.slug, "nope-not-a-code")).toBeNull();
  });
});

describe("A2 regenerate: surgical + atomic", () => {
  it("rotates only the targeted role; the old code 403s, others survive", async () => {
    const { room, passcodes } = await createRoom("T", "topic");
    const res = await regenerateRoleCode(room.slug, "facilitator");
    expect(res?.code).toBeTruthy();

    // old facilitator code is dead; new one works; the others are untouched.
    expect(await resolveRole(room.slug, passcodes.facilitator)).toBeNull();
    expect(await resolveRole(room.slug, res!.code)).toBe("facilitator");
    expect(await resolveRole(room.slug, passcodes.cohost)).toBe("cohost");
    expect(await resolveRole(room.slug, passcodes.projector)).toBe("projector");
    expect(await resolveRole(room.slug, passcodes.admin)).toBe("admin");
  });

  it("survives two concurrent rotations of different tiers (lock/atomicity)", async () => {
    const { room, passcodes } = await createRoom("T", "topic");
    const [fac, co] = await Promise.all([
      regenerateRoleCode(room.slug, "facilitator"),
      regenerateRoleCode(room.slug, "cohost"),
    ]);
    // both new codes resolve (neither rotation clobbered the other)...
    expect(await resolveRole(room.slug, fac!.code)).toBe("facilitator");
    expect(await resolveRole(room.slug, co!.code)).toBe("cohost");
    // ...and both old codes are dead.
    expect(await resolveRole(room.slug, passcodes.facilitator)).toBeNull();
    expect(await resolveRole(room.slug, passcodes.cohost)).toBeNull();
  });
});

describe("A2 capabilities", () => {
  it("facilitator now has configure; cohost does not; projector has none", () => {
    expect(roleHasCapability("facilitator", "configure")).toBe(true);
    expect(roleHasCapability("facilitator", "end")).toBe(true);
    expect(roleHasCapability("cohost", "configure")).toBe(false);
    expect(CAPABILITIES.projector.size).toBe(0);
  });

  it("a facilitator passcode passes the configure gate (custom-build launch)", async () => {
    const { room, passcodes } = await createRoom("T", "topic");
    const r = await requireCapability(room.slug, passcodes.facilitator, "configure");
    expect(r.ok).toBe(true);
    expect(r.role).toBe("facilitator");
    // cohost still blocked from configure.
    const c = await requireCapability(room.slug, passcodes.cohost, "configure");
    expect(c.ok).toBe(false);
  });
});

describe("A2 legacy rooms (no projector hash) degrade gracefully", () => {
  it("resolveRole guards a missing projector hash; regenerate mints it on demand", async () => {
    const { room } = await createRoom("T", "topic");
    // Simulate a pre-A2 room: strip the projector hash.
    await updateRoom(room.slug, {
      passcodeHashes: {
        admin: room.passcodeHashes.admin,
        facilitator: room.passcodeHashes.facilitator,
        cohost: room.passcodeHashes.cohost,
      },
    });
    // No crash; a random projector-style code resolves to null.
    expect(await resolveRole(room.slug, "scr-whatever")).toBeNull();
    // Regenerate mints the projector hash on demand; the new code then resolves.
    const res = await regenerateRoleCode(room.slug, "projector");
    expect(res?.code).toBeTruthy();
    expect(await resolveRole(room.slug, res!.code)).toBe("projector");
  });
});
