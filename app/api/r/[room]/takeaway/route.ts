import { NextRequest, NextResponse } from "next/server";
import { getTakeaway } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/takeaway?k=<token> -> the handle-free recap, or 410 when the
// token is unknown/expired (so a stale link can't be served from edge cache past
// the 24h TTL). Token is room-scoped: a token from room A can't read room B.
export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const token = req.nextUrl.searchParams.get("k") ?? "";
  const snapshot = await getTakeaway(params.room, token);
  if (!snapshot)
    return NextResponse.json(
      { error: "This recap has expired or doesn't exist." },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.json(
    // F3 — strip the raw contributions; the public API serves the shared body only.
    { takeaway: { ...snapshot, contributions: undefined, token } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
