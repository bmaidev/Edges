import { NextRequest, NextResponse } from "next/server";
import { slugAvailable } from "@/lib/rooms";
import { resolveAdminContext } from "@/lib/auth";
import { requestCode } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms/availability?slug=team-sync + X-Edges-Code
// A4 — live "is this room address free?" check for the create form. Slugs are
// globally unique, so this is workspace-agnostic (any admin may check).
export async function GET(req: NextRequest) {
  if (!(await resolveAdminContext(requestCode(req))).ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const desired = req.nextUrl.searchParams.get("slug") ?? "";
  return NextResponse.json(await slugAvailable(desired));
}
