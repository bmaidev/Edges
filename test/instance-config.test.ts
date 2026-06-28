import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { instanceConfig } from "@/lib/instance-config";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as configGET } from "@/app/api/admin/config/route";
import { createWorkspace } from "@/lib/workspaces";

// Phase E1 — the operator config-check. Secret-free; super-admin-gated detail.

const ENV_KEYS = [
  "ADMIN_PASSCODE",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "ANTHROPIC_API_KEY",
  "EDGES_SECRET_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "SIGNUP_OPEN",
  "SIGNUP_CODE",
];
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("instanceConfig — secret-free booleans", () => {
  it("reports everything off in a bare env", () => {
    const c = instanceConfig();
    expect(c).toEqual({
      superAdmin: false,
      storage: { configured: false },
      ai: { baseline: false, byoEncryption: false },
      uploads: { blob: false },
      signup: "closed",
    });
  });

  it("reflects each feature when its env is set, and never leaks a value", () => {
    process.env.ADMIN_PASSCODE = "super-secret-admin";
    process.env.UPSTASH_REDIS_REST_URL = "https://x";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret";
    process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret";
    process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
    process.env.SIGNUP_CODE = "community";

    const c = instanceConfig();
    expect(c.superAdmin).toBe(true);
    expect(c.storage.configured).toBe(true);
    expect(c.ai).toEqual({ baseline: true, byoEncryption: true });
    expect(c.uploads.blob).toBe(true);
    expect(c.signup).toBe("code");

    // no secret VALUE appears anywhere in the report
    const blob = JSON.stringify(c);
    for (const v of ["super-secret-admin", "sk-ant-secret", "blob-secret", "community", "tok"])
      expect(blob).not.toContain(v);
  });
});

describe("/api/health", () => {
  it("is public and reports ok + storage liveness", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.ok).toBe(true);
    expect(typeof d.storage).toBe("boolean");
  });
});

describe("/api/admin/config", () => {
  it("is super-admin only", async () => {
    process.env.ADMIN_PASSCODE = "test-super-config";
    const ok = await configGET(
      new NextRequest(`http://x/api/admin/config?code=${encodeURIComponent("test-super-config")}`),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).superAdmin).toBe(true);

    // a workspace owner (not super-admin) is forbidden
    const ws = await createWorkspace("Org");
    const denied = await configGET(
      new NextRequest(`http://x/api/admin/config?code=${encodeURIComponent(ws.adminCode)}`),
    );
    expect(denied.status).toBe(403);

    const anon = await configGET(new NextRequest("http://x/api/admin/config"));
    expect(anon.status).toBe(403);
  });
});
