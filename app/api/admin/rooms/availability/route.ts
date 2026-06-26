import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, slugAvailable } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms/availability?code=ADMIN&slug=team-sync
// A4 — live "is this room address free?" check for the create form. Returns the
// normalised slug + availability (+ a free suggestion when it's taken).
export async function GET(req: NextRequest) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const desired = req.nextUrl.searchParams.get("slug") ?? "";
  return NextResponse.json(await slugAvailable(desired));
}
