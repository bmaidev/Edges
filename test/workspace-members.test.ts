import { beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  createWorkspace,
  listMembers,
  removeMember,
  resolveWorkspace,
  DEFAULT_WORKSPACE_ID,
} from "@/lib/workspaces";

// Phase C1 — named members + roles within a workspace. Members are additive: the
// bootstrap admin code stays an owner; named members layer on with their own codes.

const SUPER = "test-super-admin-members";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

describe("resolveWorkspace — role-aware", () => {
  it("the super-admin resolves as an owner of the default workspace", async () => {
    const r = await resolveWorkspace(SUPER);
    expect(r).toMatchObject({
      workspaceId: DEFAULT_WORKSPACE_ID,
      isSuperAdmin: true,
      role: "owner",
      memberId: null,
    });
  });

  it("the bootstrap workspace code resolves as an owner with no member identity", async () => {
    const ws = await createWorkspace("Org");
    const r = await resolveWorkspace(ws.adminCode);
    expect(r.workspaceId).toBe(ws.workspace.id);
    expect(r.role).toBe("owner");
    expect(r.memberId).toBeNull();
    expect(r.isSuperAdmin).toBe(false);
  });

  it("an unknown code resolves to a null context", async () => {
    const r = await resolveWorkspace("not-a-code");
    expect(r.workspaceId).toBeNull();
    expect(r.role).toBeNull();
  });
});

describe("addMember / listMembers / removeMember", () => {
  it("a named member's code resolves to its workspace + role + identity", async () => {
    const ws = await createWorkspace("Alliance");
    const added = await addMember(ws.workspace.id, "Dana", "member");
    expect(added).not.toBeNull();
    const { member, code } = added!;
    expect(member.name).toBe("Dana");
    expect(member.role).toBe("member");
    expect(code).toMatch(/^wsm-[0-9a-f]+$/);

    const r = await resolveWorkspace(code);
    expect(r.workspaceId).toBe(ws.workspace.id);
    expect(r.role).toBe("member");
    expect(r.memberId).toBe(member.id);
    expect(r.memberName).toBe("Dana");
    expect(r.isSuperAdmin).toBe(false);
  });

  it("an owner member resolves with the owner role", async () => {
    const ws = await createWorkspace("Org2");
    const { code } = (await addMember(ws.workspace.id, "Sam", "owner"))!;
    expect((await resolveWorkspace(code)).role).toBe("owner");
  });

  it("listMembers returns metadata only — never code hashes", async () => {
    const ws = await createWorkspace("Org3");
    await addMember(ws.workspace.id, "A", "member");
    await addMember(ws.workspace.id, "B", "owner");
    const list = await listMembers(ws.workspace.id);
    expect(list.map((m) => m.name).sort()).toEqual(["A", "B"]);
    expect(JSON.stringify(list)).not.toContain("codeHash");
  });

  it("revoking a member makes their code stop resolving", async () => {
    const ws = await createWorkspace("Org4");
    const { member, code } = (await addMember(ws.workspace.id, "Temp", "member"))!;
    expect((await resolveWorkspace(code)).role).toBe("member");
    expect(await removeMember(ws.workspace.id, member.id)).toBe(true);
    expect((await resolveWorkspace(code)).workspaceId).toBeNull();
    // the bootstrap owner code still works (additive — never the last owner)
    expect((await resolveWorkspace(ws.adminCode)).role).toBe("owner");
    // removing a non-existent member is a no-op false
    expect(await removeMember(ws.workspace.id, "m-nope")).toBe(false);
  });
});
