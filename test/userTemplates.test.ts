import { describe, expect, it } from "vitest";
import {
  deleteDesign,
  getDesign,
  listDesignMeta,
  renameDesign,
  saveDesign,
  validatePhases,
} from "@/lib/userTemplates";
import { getDb } from "@/lib/rooms";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspaces";

// B4 — user templates. The security-critical guarantee: a design can arrive from
// an untrusted import, so every phase is re-validated against its module schema
// and REBUILT as exactly {id, moduleId, config} — never the caller's object.

const GOOD = [
  { id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } },
];

describe("validatePhases", () => {
  it("accepts valid phases and rebuilds them to {id, moduleId, config}", () => {
    const r = validatePhases(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.phases[0]).toEqual({ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } });
  });

  it("strips injected top-level phase keys (the import attack surface)", () => {
    const evil = [
      { id: "p1", moduleId: "capture", config: { label: "X", prompt: "Y" }, __evil: "rm -rf", advanced: true },
    ];
    const r = validatePhases(evil);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.phases[0]).not.toHaveProperty("__evil");
      expect(r.phases[0]).not.toHaveProperty("advanced");
      expect(Object.keys(r.phases[0]).sort()).toEqual(["config", "id", "moduleId"]);
    }
  });

  it("rejects an unknown module", () => {
    const r = validatePhases([{ id: "p1", moduleId: "totally-fake", config: {} }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unknown module/);
  });

  it("rejects a phase with an invalid config shape", () => {
    const r = validatePhases([{ id: "p1", moduleId: "capture", config: 123 }]);
    expect(r.ok).toBe(false);
  });

  it("rejects an empty design", () => {
    expect(validatePhases([]).ok).toBe(false);
    expect(validatePhases("nope").ok).toBe(false);
  });
});

describe("save / list / get / delete", () => {
  it("round-trips a saved design (list shows metadata only)", async () => {
    const res = await saveDesign("My Flow", GOOD);
    expect(res.ok).toBe(true);
    const id = res.ok ? res.id : "";
    const meta = await listDesignMeta();
    const found = meta.find((m) => m.id === id);
    expect(found).toMatchObject({ name: "My Flow", phaseCount: 1 });
    expect(found).not.toHaveProperty("phases"); // metadata only
    const full = await getDesign(id);
    expect(full?.phases).toHaveLength(1);
    expect(await deleteDesign(id)).toBe(true);
    expect(await getDesign(id)).toBeNull();
  });

  it("rejects saving an invalid design", async () => {
    const res = await saveDesign("Bad", [{ moduleId: "nope", config: {} }]);
    expect(res.ok).toBe(false);
  });

  it("A5 — renameDesign changes the name in place, keeping the phases", async () => {
    const res = await saveDesign("Old name", GOOD);
    const id = res.ok ? res.id : "";
    expect(await renameDesign(id, "New name")).toBe(true);
    const full = await getDesign(id);
    expect(full?.name).toBe("New name");
    expect(full?.phases).toHaveLength(1); // phases untouched
    // unknown id / blank name are no-ops.
    expect(await renameDesign("d-nope", "X")).toBe(false);
    expect(await renameDesign(id, "   ")).toBe(false);
  });

  it("B4 — a room-scoped design appears only in its own room's library", async () => {
    const before = await listDesignMeta();
    const g = await saveDesign("Global one", GOOD, { scope: "global" });
    const r = await saveDesign("Room one", GOOD, { scope: "room", roomSlug: "room-A" });
    expect(g.ok && r.ok).toBe(true);
    const gid = g.ok ? g.id : "";
    const rid = r.ok ? r.id : "";

    // Room A sees both global + its own room-scoped design (default workspace).
    const inA = await listDesignMeta(DEFAULT_WORKSPACE_ID, "room-A");
    expect(inA.find((m) => m.id === gid)?.scope).toBe("global");
    expect(inA.find((m) => m.id === rid)?.scope).toBe("room");

    // Room B sees the global one but NOT room-A's room-scoped design.
    const inB = await listDesignMeta(DEFAULT_WORKSPACE_ID, "room-B");
    expect(inB.some((m) => m.id === gid)).toBe(true);
    expect(inB.some((m) => m.id === rid)).toBe(false);

    // With no room context, only global designs (+ legacy scope-less = global).
    const globalOnly = await listDesignMeta();
    expect(globalOnly.some((m) => m.id === gid)).toBe(true);
    expect(globalOnly.some((m) => m.id === rid)).toBe(false);
    expect(globalOnly.length).toBeGreaterThanOrEqual(before.length + 1);
  });

  it("two concurrent saves both survive the shared global index", async () => {
    const before = (await listDesignMeta()).length;
    const [a, b] = await Promise.all([
      saveDesign("A", GOOD),
      saveDesign("B", GOOD),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect((await listDesignMeta()).length).toBe(before + 2);
  });
});

describe("getDb", () => {
  it("is the same durable backend rooms.ts uses", async () => {
    const db = getDb();
    await db.set("rooms:__probe__", { v: 1 });
    expect(await db.get("rooms:__probe__")).toEqual({ v: 1 });
  });
});
