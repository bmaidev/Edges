import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, getArchive, getRoom, updateRoom } from "@/lib/rooms";
import type { RoomTheme } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms/[slug]?code=ADMIN -> room meta + archive (report).
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const room = await getRoom(params.slug);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  const archive = await getArchive(params.slug);
  return NextResponse.json({
    room: { slug: room.slug, name: room.name, status: room.status, theme: room.theme },
    archive,
  });
}

// PATCH /api/admin/rooms/[slug] { code, theme?, status? } -> update room.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  let body: { code?: string; theme?: RoomTheme; status?: "draft" | "live" | "archived" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patch: { theme?: RoomTheme; status?: "draft" | "live" | "archived" } = {};
  if (body.theme) patch.theme = body.theme;
  if (body.status) patch.status = body.status;
  const room = await updateRoom(params.slug, patch);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
