import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as hostPOST } from "@/app/api/r/[room]/host/route";
import { saveDesign, getDesign } from "@/lib/userTemplates";
import { encodeDesign } from "@/lib/design-share";
import { createRoom } from "@/lib/rooms";

// B4 — the share envelope through the host route: export (any host), preview
// (any host, no save), import (configure tier + the zod security gate, scoped per workspace).

beforeAll(() => {
  process.env.ADMIN_PASSCODE = "test-super-admin-share";
});

function req(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://x/api/r/${slug}/host`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const GOOD = [{ id: "p1", moduleId: "capture", config: { label: "Ideas", prompt: "Go" } }];

describe("export / preview / import round-trip", () => {
  it("exports a saved design, previews it (no save), then imports it (configure tier)", async () => {
    const { room, passcodes } = await createRoom("Share", "Topic");
    const saved = await saveDesign("Exportable", GOOD);
    const id = saved.ok ? saved.id : "";

    // Export — any host tier.
    const exp = await hostPOST(
      req(room.slug, { command: "exportDesign", code: passcodes.cohost, id }),
      { params: { room: room.slug } },
    );
    expect(exp.status).toBe(200);
    const { code } = await exp.json();
    expect(typeof code).toBe("string");

    // Preview — decodes + revalidates, returns phase labels, saves nothing.
    const prev = await hostPOST(
      req(room.slug, { command: "previewImport", code: passcodes.cohost, shareCode: code }),
      { params: { room: room.slug } },
    );
    const pj = await prev.json();
    expect(pj.ok).toBe(true);
    expect(pj.name).toBe("Exportable");
    expect(pj.phases[0].label).toBe("Ideas");

    // Import — into THIS workspace's library, with the room's `configure` tier
    // (facilitator/admin). Phase A scoped the library per workspace, so this no
    // longer needs the super-admin passcode.
    const imp = await hostPOST(
      req(room.slug, { command: "importDesign", code: passcodes.facilitator, shareCode: code }),
      { params: { room: room.slug } },
    );
    const ij = await imp.json();
    expect(ij.ok).toBe(true);
    const reimported = await getDesign(ij.id);
    expect(reimported?.name).toBe("Exportable");
  });

  it("import is forbidden without the `configure` tier (a cohost can't)", async () => {
    const { room, passcodes } = await createRoom("Share2", "Topic");
    const code = encodeDesign({ name: "X", phases: GOOD });
    const res = await hostPOST(
      req(room.slug, { command: "importDesign", code: passcodes.cohost, shareCode: code }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(403);
  });

  it("a corrupted share code is rejected with a clear error (no save)", async () => {
    const { room, passcodes } = await createRoom("Share3", "Topic");
    const res = await hostPOST(
      req(room.slug, { command: "previewImport", code: passcodes.cohost, shareCode: "garbage!!!" }),
      { params: { room: room.slug } },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.ok).toBe(false);
  });
});
