import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as signupGET, POST as signupPOST } from "@/app/api/signup/route";
import { signupAllowed, signupPolicy } from "@/lib/signup";
import { getDb } from "@/lib/rooms";
import { resolveWorkspace } from "@/lib/workspaces";

// Phase B2 — public self-service signup, soft-gated by env. closed (default) /
// code-gated (SIGNUP_CODE) / fully open (SIGNUP_OPEN=true).

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-signup";
});

afterEach(async () => {
  delete process.env.SIGNUP_OPEN;
  delete process.env.SIGNUP_CODE;
  await getDb().set("signup:recent", []); // reset the rate window
});

const post = (body: unknown) =>
  signupPOST(
    new NextRequest("http://x/api/signup", { method: "POST", body: JSON.stringify(body) }),
  );

describe("signupPolicy / signupAllowed", () => {
  it("closed by default; open with SIGNUP_OPEN; code with SIGNUP_CODE", () => {
    expect(signupPolicy()).toBe("closed");
    expect(signupAllowed()).toBe(false);

    process.env.SIGNUP_CODE = "let-me-in";
    expect(signupPolicy()).toBe("code");
    expect(signupAllowed("let-me-in")).toBe(true);
    expect(signupAllowed("wrong")).toBe(false);
    expect(signupAllowed()).toBe(false);

    process.env.SIGNUP_OPEN = "true"; // open wins over code
    expect(signupPolicy()).toBe("open");
    expect(signupAllowed()).toBe(true);
  });
});

describe("GET /api/signup", () => {
  it("reports the policy", async () => {
    const res = await signupGET();
    expect((await res.json()).policy).toBe("closed");
  });
});

describe("POST /api/signup", () => {
  it("closed → 403, no workspace created", async () => {
    const res = await post({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  it("code mode → wrong/absent code 403; right code creates a resolvable workspace", async () => {
    process.env.SIGNUP_CODE = "alliance-2026";
    expect((await post({ name: "X", code: "wrong" })).status).toBe(403);
    expect((await post({ name: "X" })).status).toBe(403);

    const ok = await post({ name: "AI Collab Alliance", code: "alliance-2026" });
    expect(ok.status).toBe(200);
    const d = await ok.json();
    expect(d.name).toBe("AI Collab Alliance");
    expect(d.adminCode).toMatch(/^wsa-[0-9a-f]+$/);
    expect(d.link).toContain(`/admin#k=${encodeURIComponent(d.adminCode)}`);
    // the new workspace resolves to its own id, isolated (not super-admin)
    const r = await resolveWorkspace(d.adminCode);
    expect(r.workspaceId).toBe(d.id);
    expect(r.isSuperAdmin).toBe(false);
  });

  it("open mode → creates without a code; rejects a nameless request", async () => {
    process.env.SIGNUP_OPEN = "true";
    expect((await post({ name: "" })).status).toBe(400);
    const ok = await post({ name: "Dana's workshops" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).adminCode).toBeTruthy();
  });

  it("the soft rate cap rejects past the window (429)", async () => {
    process.env.SIGNUP_OPEN = "true";
    // pre-fill the window to the cap
    await getDb().set("signup:recent", Array.from({ length: 20 }, () => Date.now()));
    const res = await post({ name: "One too many" });
    expect(res.status).toBe(429);
  });
});
