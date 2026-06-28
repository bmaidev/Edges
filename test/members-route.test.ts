import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as membersGET,
  POST as membersPOST,
  DELETE as membersDELETE,
} from "@/app/api/admin/members/route";
import { createWorkspace, addMember, resolveWorkspace } from "@/lib/workspaces";

// Phase C2 — member management API. Listing is open to any member; adding/revoking
// is owner-only; everything is workspace-scoped; hashes never leave.

const SUPER = "test-super-admin-members-route";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});

const get = (qs: string) =>
  membersGET(new NextRequest(`http://x/api/admin/members${qs}`));
const post = (body: unknown) =>
  membersPOST(new NextRequest("http://x/api/admin/members", { method: "POST", body: JSON.stringify(body) }));
const del = (body: unknown) =>
  membersDELETE(new NextRequest("http://x/api/admin/members", { method: "DELETE", body: JSON.stringify(body) }));

describe("members route — owner gating", () => {
  it("an owner adds a member; the new code resolves with the chosen role", async () => {
    const ws = await createWorkspace("Org");
    const res = await post({ code: ws.adminCode, name: "Dana", role: "member" });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.member.name).toBe("Dana");
    expect(d.code).toMatch(/^wsm-/);
    expect(d.link).toContain("/admin#k=");
    const r = await resolveWorkspace(d.code);
    expect(r.workspaceId).toBe(ws.workspace.id);
    expect(r.role).toBe("member");
  });

  it("a non-owner member is 403 on add and revoke", async () => {
    const ws = await createWorkspace("Org2");
    const dana = (await addMember(ws.workspace.id, "Dana", "member"))!;
    // Dana (a member, not owner) tries to add / revoke
    expect((await post({ code: dana.code, name: "Sneaky", role: "member" })).status).toBe(403);
    expect((await del({ code: dana.code, memberId: dana.member.id })).status).toBe(403);
  });

  it("a member CAN list the roster, but it never includes code hashes", async () => {
    const ws = await createWorkspace("Org3");
    await addMember(ws.workspace.id, "A", "member");
    const dana = (await addMember(ws.workspace.id, "Dana", "member"))!;
    const res = await get(`?code=${encodeURIComponent(dana.code)}`);
    expect(res.status).toBe(200);
    const txt = JSON.stringify(await res.json());
    expect(txt).toContain("Dana");
    expect(txt).not.toContain("codeHash");
  });

  it("an owner revokes a member → their code stops resolving", async () => {
    const ws = await createWorkspace("Org4");
    const temp = (await addMember(ws.workspace.id, "Temp", "member"))!;
    expect((await resolveWorkspace(temp.code)).role).toBe("member");
    const res = await del({ code: ws.adminCode, memberId: temp.member.id });
    expect(res.status).toBe(200);
    expect((await resolveWorkspace(temp.code)).workspaceId).toBeNull();
  });

  it("an unknown/forbidden code is 403", async () => {
    expect((await get("?code=nope")).status).toBe(403);
    expect((await post({ code: "nope", name: "X" })).status).toBe(403);
  });
});
