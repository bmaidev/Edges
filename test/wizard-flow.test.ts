import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import {
  checkSuperAdmin,
  createRoom,
  getRoom,
  resolveRole,
  updateRoom,
} from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { GET as capabilitiesGET } from "@/app/api/admin/capabilities/route";
import { GET as moduleMetaGET } from "@/app/api/admin/module-meta/route";

// A1 — create-workshop wizard. The wizard is orchestration of shipped endpoints;
// these cover the load-bearing backend facts it relies on.
const ADMIN = "test-super-admin-A1";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

describe("A1 wizard backend", () => {
  it("super-admin resolves to admin on every room and satisfies `configure` (the footgun fix)", async () => {
    const { room } = await createRoom("Wizard room", "topic");
    expect(checkSuperAdmin(ADMIN)).toBe(true);
    expect(await resolveRole(room.slug, ADMIN)).toBe("admin");
    // configure is what a custom build (setPhases) needs — the wizard's super-admin
    // code grants it on any room, so the AI/custom lane launches with no 403.
    expect((await requireCapability(room.slug, ADMIN, "configure")).ok).toBe(true);
    expect((await requireCapability(room.slug, ADMIN, "advance")).ok).toBe(true);
  });

  it("createRoom returns four passcodes; the room starts as a draft", async () => {
    const { room, passcodes } = await createRoom("Wizard room", "topic");
    expect(room.status).toBe("draft");
    expect(Object.keys(passcodes).sort()).toEqual([
      "admin",
      "cohost",
      "facilitator",
      "projector",
    ]);
  });

  it("theme + status:live persist; getRoom reflects them and carries topic", async () => {
    const { room } = await createRoom("Wizard room", "Strategy day");
    await updateRoom(room.slug, {
      theme: { palette: {}, headline: "Hi there" },
      status: "live",
    });
    const r = await getRoom(room.slug);
    expect(r?.status).toBe("live");
    expect(r?.theme?.headline).toBe("Hi there");
    expect(r?.topic).toBe("Strategy day");
  });

  it("capabilities endpoint returns { aiAvailable:false } with no API key (verify stays green)", async () => {
    const res = await capabilitiesGET(
      new NextRequest(`http://x/api/admin/capabilities?code=${ADMIN}`),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).aiAvailable).toBe(false);
  });

  it("capabilities endpoint rejects a wrong code", async () => {
    const res = await capabilitiesGET(
      new NextRequest(`http://x/api/admin/capabilities?code=nope`),
    );
    expect(res.status).toBe(403);
  });

  it("module-meta endpoint returns a serializable {id:{name,description}} map", async () => {
    const res = await moduleMetaGET(
      new NextRequest(`http://x/api/admin/module-meta?code=${ADMIN}`),
    );
    const d = await res.json();
    expect(typeof d.meta.capture.name).toBe("string");
    expect(typeof d.meta.poll.description).toBe("string");
  });

  it("no wizard file imports server-only module code (boundary intact)", () => {
    const dir = "components/wizard";
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(`${dir}/${f}`, "utf8");
      expect(src.includes("registry.server")).toBe(false);
      expect(/from "[^"]*\.server"/.test(src)).toBe(false);
    }
  });
});
