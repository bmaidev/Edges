import { NextRequest, NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { getDesign, listDesignMeta } from "@/lib/userTemplates";
import { DEFAULT_WORKSPACE_ID } from "@/lib/workspaces";
import { requestCode } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/designs + X-Edges-Code -> the shared user-template library
// (metadata only — never the full phase configs). Any host tier can list + launch
// (cap `advance`); curating the library (save/delete) is gated separately.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ room: string }> },
) {
  const { room } = await params;
  const rec = await getRoom(room);
  if (!rec)
    return NextResponse.json({ error: "No such room" }, { status: 404 });
  const { ok } = await requireCapability(
    room,
    requestCode(req),
    "advance",
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // ?id= → the full design (phases), to load into the builder for tweaking.
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const design = await getDesign(id);
    if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ design });
  }
  // B4 — show global designs + THIS room's room-scoped ones, WITHIN the room's
  // own workspace (Phase A — a room never sees another tenant's library).
  return NextResponse.json({
    designs: await listDesignMeta(rec.workspaceId ?? DEFAULT_WORKSPACE_ID, room),
  });
}
