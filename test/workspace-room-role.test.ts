import { beforeAll, describe, expect, it } from "vitest";
import { createRoom, resolveRole } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { createWorkspace, addMember } from "@/lib/workspaces";

// Regression: a member of the room's OWNING workspace administers its rooms.
//
// Rooms are shared across a workspace, and the create-workshop wizard drives a
// freshly-created room with the WORKSPACE code (not the room's own admin
// passcode, which is never surfaced). Before the fix, resolveRole only knew the
// super-admin code and the room's own passcodes, so a non-super-admin owner or
// member 403'd ("Forbidden") at the wizard's Share step when it applied the
// chosen template/design (setTemplate / setPhases on the host route).

const SUPER = "test-super-admin-room-role";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

describe("workspace membership → room admin role", () => {
  it("the workspace owner code resolves to admin on its own room (and gets configure)", async () => {
    const { workspace, adminCode } = await createWorkspace("Owner Org");
    const { room } = await createRoom("R", "t", null, null, workspace.id);

    expect(await resolveRole(room.slug, adminCode)).toBe("admin");
    // `configure` is the capability the wizard's setPhases needs — the one that 403'd.
    const cap = await requireCapability(room.slug, adminCode, "configure");
    expect(cap.ok).toBe(true);
  });

  it("a named member code also administers the shared room", async () => {
    const { workspace } = await createWorkspace("Member Org");
    const dana = (await addMember(workspace.id, "Dana", "member"))!;
    const { room } = await createRoom("R", "t", null, null, workspace.id);

    expect(await resolveRole(room.slug, dana.code)).toBe("admin");
    expect((await requireCapability(room.slug, dana.code, "configure")).ok).toBe(true);
  });

  it("the super-admin still administers any workspace's room", async () => {
    const { workspace } = await createWorkspace("Some Org");
    const { room } = await createRoom("R", "t", null, null, workspace.id);
    expect(await resolveRole(room.slug, SUPER)).toBe("admin");
  });

  it("a DIFFERENT workspace's code gets no role (cross-tenant denied)", async () => {
    const a = await createWorkspace("Tenant A");
    const b = await createWorkspace("Tenant B");
    const { room } = await createRoom("R", "t", null, null, a.workspace.id);

    // B's owner code must not resolve to any role on A's room.
    expect(await resolveRole(room.slug, b.adminCode)).toBeNull();
    expect((await requireCapability(room.slug, b.adminCode, "configure")).ok).toBe(false);
  });

  it("an unknown code still resolves to null", async () => {
    const { workspace } = await createWorkspace("Org X");
    const { room } = await createRoom("R", "t", null, null, workspace.id);
    expect(await resolveRole(room.slug, "totally-bogus-code")).toBeNull();
  });
});
