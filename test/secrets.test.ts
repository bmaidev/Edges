import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, secretsConfigured } from "@/lib/secrets";
import {
  createWorkspace,
  clearWorkspaceAiKey,
  getWorkspaceAiKey,
  setWorkspaceAiKey,
  workspaceAiKeyInfo,
} from "@/lib/workspaces";

// Phase D1 — AES-256-GCM secret sealing + encrypted per-workspace AI key.

const SUPER = "test-super-admin-secrets";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
});
afterEach(() => {
  delete process.env.EDGES_SECRET_KEY;
});

describe("secrets (encrypt/decrypt)", () => {
  it("round-trips a secret with the master key set", () => {
    process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret";
    expect(secretsConfigured()).toBe(true);
    const sealed = encrypt("sk-ant-super-secret-123");
    expect(sealed.ciphertext).not.toContain("sk-ant"); // not plaintext
    expect(decrypt(sealed)).toBe("sk-ant-super-secret-123");
  });

  it("returns null on a tampered blob (auth-tag mismatch)", () => {
    process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret";
    const sealed = encrypt("secret");
    // Flip the first ciphertext hex digit to a GUARANTEED-different one (never a
    // no-op — a "replace last char with 0" can silently match an existing 0).
    const first = sealed.ciphertext[0];
    const flipped = (first === "a" ? "b" : "a") + sealed.ciphertext.slice(1);
    expect(decrypt({ ...sealed, ciphertext: flipped })).toBeNull();
  });

  it("a different master key cannot decrypt", () => {
    process.env.EDGES_SECRET_KEY = "master-key-number-one-aaaa";
    const sealed = encrypt("secret");
    process.env.EDGES_SECRET_KEY = "master-key-number-two-bbbb";
    expect(decrypt(sealed)).toBeNull();
  });

  it("secretsConfigured is false without a (long enough) master key", () => {
    expect(secretsConfigured()).toBe(false);
    process.env.EDGES_SECRET_KEY = "short";
    expect(secretsConfigured()).toBe(false);
  });
});

describe("workspace BYO AI key", () => {
  it("set → info shows set+last4 (never plaintext); getWorkspaceAiKey decrypts", async () => {
    process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret";
    const ws = await createWorkspace("KeyOrg");
    expect(await setWorkspaceAiKey(ws.workspace.id, "sk-ant-abcd1234")).toBe(true);

    const info = await workspaceAiKeyInfo(ws.workspace.id);
    expect(info).toEqual({ set: true, last4: "1234" });
    expect(JSON.stringify(info)).not.toContain("sk-ant");

    expect(await getWorkspaceAiKey(ws.workspace.id)).toBe("sk-ant-abcd1234");

    expect(await clearWorkspaceAiKey(ws.workspace.id)).toBe(true);
    expect(await workspaceAiKeyInfo(ws.workspace.id)).toEqual({ set: false, last4: null });
    expect(await getWorkspaceAiKey(ws.workspace.id)).toBeNull();
  });

  it("refuses to store a key when no master key is configured (fail-safe)", async () => {
    const ws = await createWorkspace("NoSecretOrg");
    expect(secretsConfigured()).toBe(false);
    expect(await setWorkspaceAiKey(ws.workspace.id, "sk-ant-x")).toBe(false);
    expect((await workspaceAiKeyInfo(ws.workspace.id)).set).toBe(false);
  });
});
