import { NextRequest, NextResponse } from "next/server";
import {
  deleteRoom,
  getArchive,
  getRoom,
  regenerateRoleCode,
  renameRoom,
  updateRoom,
  type Room,
} from "@/lib/rooms";
import type { RoomTheme, ShareableTier } from "@/lib/rooms";
import { resolveAdminContext } from "@/lib/auth";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase A — gate by workspace AND assert the room belongs to it. A 404 (not 403)
// on a cross-workspace slug avoids disclosing that the room exists in another
// tenant. Returns the room on success, or a ready NextResponse on failure.
async function authRoom(
  code: string | null | undefined,
  requestedWorkspace: string | null | undefined,
  slug: string,
): Promise<{ room: Room } | { error: NextResponse }> {
  const ctx = await resolveAdminContext(code, requestedWorkspace);
  if (!ctx.ok)
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const room = await getRoom(slug);
  if (!room || (room.workspaceId ?? DEFAULT_WORKSPACE_ID) !== ctx.workspaceId)
    return { error: NextResponse.json({ error: "No such room" }, { status: 404 }) };
  return { room };
}

// GET /api/admin/rooms/[slug]?code=ADMIN -> room meta + archive (report).
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const g = await authRoom(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
    params.slug,
  );
  if ("error" in g) return g.error;
  const { room } = g;
  const archive = await getArchive(params.slug);
  return NextResponse.json({
    room: { slug: room.slug, name: room.name, topic: room.topic, status: room.status, theme: room.theme },
    archive,
    // Per-tier existence only — never hashes or plaintext. Lets the Access panel
    // know whether a legacy room needs a "Regenerate to get a shareable link".
    tiers: {
      facilitator: Boolean(room.passcodeHashes.facilitator),
      cohost: Boolean(room.passcodeHashes.cohost),
      projector: Boolean(room.passcodeHashes.projector),
    },
  });
}

// POST /api/admin/rooms/[slug] { code, action:"regenerate"|"rename", … } ->
// rotate one role's passcode, or change the room's address. The admin tier is not
// a shareable link, so it cannot be regenerated here.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  let body: { code?: string; action?: string; role?: string; slug?: string; workspace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const g = await authRoom(body.code, body.workspace, params.slug);
  if ("error" in g) return g.error;

  // A4 — change the room's address (slug). Non-live rooms only; old links/QRs
  // redirect to the new slug. The record (+ a draft's session state) moves.
  if (body.action === "rename") {
    const res = await renameRoom(params.slug, body.slug ?? "");
    if (!res.ok)
      return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true, slug: res.slug });
  }

  if (body.action !== "regenerate")
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const role = body.role;
  if (role !== "facilitator" && role !== "cohost" && role !== "projector")
    return NextResponse.json(
      { error: "role must be facilitator, cohost, or projector" },
      { status: 400 },
    );

  const res = await regenerateRoleCode(params.slug, role as ShareableTier);
  if (!res) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true, code: res.code });
}

// PATCH /api/admin/rooms/[slug] { code, name?, theme?, status? } -> update room.
// A4 — the display name is freely editable (the slug is not — it's the room's
// primary key). Renaming the name never touches the slug, passcodes, or links.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  let body: {
    code?: string;
    name?: string;
    theme?: RoomTheme;
    status?: "draft" | "live" | "archived";
    workspace?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const g = await authRoom(body.code, body.workspace, params.slug);
  if ("error" in g) return g.error;

  const patch: {
    name?: string;
    theme?: RoomTheme;
    status?: "draft" | "live" | "archived";
  } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (!name)
      return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = name;
  }
  if (body.theme) patch.theme = body.theme;
  if (body.status) patch.status = body.status;
  const room = await updateRoom(params.slug, patch);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/rooms/[slug]?code=ADMIN -> permanently delete the room.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const g = await authRoom(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
    params.slug,
  );
  if ("error" in g) return g.error;
  const ok = await deleteRoom(params.slug);
  if (!ok) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
