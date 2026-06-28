import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as keyGET,
  PUT as keyPUT,
  DELETE as keyDELETE,
} from "@/app/api/admin/ai-key/route";
import { createWorkspace, addMember, resolveAiKeyForWorkspace } from "@/lib/workspaces";

// Phase D3 — the BYO AI-key route. Owner-only set/clear; GET never leaks the key.

const SUPER = "test-super-admin-aikey-route";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
  process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret-d3";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const get = (qs: string) => keyGET(new NextRequest(`http://x/api/admin/ai-key${qs}`));
const put = (body: unknown) =>
  keyPUT(new NextRequest("http://x/api/admin/ai-key", { method: "PUT", body: JSON.stringify(body) }));
const del = (body: unknown) =>
  keyDELETE(new NextRequest("http://x/api/admin/ai-key", { method: "DELETE", body: JSON.stringify(body) }));

describe("ai-key route", () => {
  it("an owner sets a key; GET reports set+last4 but never the key; resolve uses it", async () => {
    const ws = await createWorkspace("KeyOrg");
    const res = await put({ code: ws.adminCode, key: "sk-ant-test-abcd1234" });
    expect(res.status).toBe(200);

    const info = await get(`?code=${encodeURIComponent(ws.adminCode)}`);
    const d = await info.json();
    expect(d.set).toBe(true);
    expect(d.last4).toBe("1234");
    expect(JSON.stringify(d)).not.toContain("sk-ant"); // never the plaintext

    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBe("sk-ant-test-abcd1234");
  });

  it("a non-owner member can't set or clear (403)", async () => {
    const ws = await createWorkspace("KeyOrg2");
    const dana = (await addMember(ws.workspace.id, "Dana", "member"))!;
    expect((await put({ code: dana.code, key: "sk-ant-aaaaaaaaaaaa" })).status).toBe(403);
    expect((await del({ code: dana.code })).status).toBe(403);
    // ...but a member CAN see whether a key is set
    expect((await get(`?code=${encodeURIComponent(dana.code)}`)).status).toBe(200);
  });

  it("rejects a non-key-shaped value", async () => {
    const ws = await createWorkspace("KeyOrg3");
    expect((await put({ code: ws.adminCode, key: "not-a-key" })).status).toBe(400);
  });

  it("DELETE falls the workspace back to the global baseline", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-global";
    const ws = await createWorkspace("KeyOrg4");
    const byo = "sk-ant-byo-key-1234567890";
    expect((await put({ code: ws.adminCode, key: byo })).status).toBe(200);
    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBe(byo);
    expect((await del({ code: ws.adminCode })).status).toBe(200);
    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBe("sk-ant-global");
  });
});
