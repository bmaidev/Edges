import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, listRooms } from "@/lib/rooms";
import { computeAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics?code=ADMIN — cross-session rollup across all rooms.
// O(rooms): rolled up purely from the Room records (lastRun counts + design
// label), no per-room archive reads. Aggregate-only — never any participant data.
export async function GET(req: NextRequest) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(computeAnalytics(await listRooms()));
}
