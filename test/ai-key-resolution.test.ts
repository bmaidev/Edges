import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { aiAvailable, currentAiKey, runWithAiKey } from "@/lib/ai";
import {
  createWorkspace,
  resolveAiKeyForRoom,
  resolveAiKeyForWorkspace,
  setWorkspaceAiKey,
} from "@/lib/workspaces";
import { createRoom } from "@/lib/rooms";

// Phase D2 — the effective AI key flows through AsyncLocalStorage, set at the
// request boundary, with a global-env fallback. No call site changes.

const SUPER = "test-super-admin-ai-resolve";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = SUPER;
  process.env.EDGES_SECRET_KEY = "a-sufficiently-long-master-secret-for-d2";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("runWithAiKey / currentAiKey", () => {
  it("inside the wrap, currentAiKey is the wrapped key; outside it falls back to env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-global";
    expect(currentAiKey()).toBe("sk-ant-global"); // outside any wrap → env

    await runWithAiKey("sk-ant-workspace", () => {
      expect(currentAiKey()).toBe("sk-ant-workspace");
      expect(aiAvailable()).toBe(true);
      return Promise.resolve();
    });

    expect(currentAiKey()).toBe("sk-ant-global"); // restored after the wrap
  });

  it("a workspace key makes AI available even with no global env key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiAvailable()).toBe(false); // no key anywhere
    await runWithAiKey("sk-ant-byo", () => {
      expect(aiAvailable()).toBe(true);
      return Promise.resolve();
    });
  });
});

describe("resolveAiKeyForWorkspace / resolveAiKeyForRoom", () => {
  it("returns the workspace's BYO key when set, else the global env baseline", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-global";
    const ws = await createWorkspace("KeyOrg");
    const { room } = await createRoom("R", "t", null, null, ws.workspace.id);

    // no workspace key yet → falls back to the global baseline
    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBe("sk-ant-global");
    expect(await resolveAiKeyForRoom(room.slug)).toBe("sk-ant-global");

    // set a workspace key → it now takes precedence for that workspace's rooms
    await setWorkspaceAiKey(ws.workspace.id, "sk-ant-byo-key");
    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBe("sk-ant-byo-key");
    expect(await resolveAiKeyForRoom(room.slug)).toBe("sk-ant-byo-key");
  });

  it("returns null when neither a workspace key nor a global env key exists", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const ws = await createWorkspace("Keyless");
    expect(await resolveAiKeyForWorkspace(ws.workspace.id)).toBeNull();
  });
});
