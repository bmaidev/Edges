import { NextRequest, NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/blueprint?code=... -> the room's durably-saved build
// (name + phases), so the builder can RE-OPEN an existing build for editing
// instead of always starting blank. Any host tier may read it (cap `advance`);
// re-launching the edited build is still gated by `configure` (setPhases).
// Returns { blueprint: null } for a room that has never been built.
export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  const rec = await getRoom(room);
  if (!rec)
    return NextResponse.json({ error: "No such room" }, { status: 404 });
  const { ok } = await requireCapability(
    room,
    req.nextUrl.searchParams.get("code"),
    "advance",
  );
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ blueprint: rec.blueprint ?? null });
}
