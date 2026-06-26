import { NextRequest, NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { getDesign, listDesignMeta } from "@/lib/userTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/designs?code=... -> the shared user-template library
// (metadata only — never the full phase configs). Any host tier can list + launch
// (cap `advance`); curating the library (save/delete) is gated separately.
export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  if (!(await getRoom(room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });
  const { ok } = await requireCapability(
    room,
    req.nextUrl.searchParams.get("code"),
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
  return NextResponse.json({ designs: await listDesignMeta() });
}
