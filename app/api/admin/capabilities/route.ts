import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin } from "@/lib/rooms";
import { aiAvailable } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/capabilities?code=ADMIN -> { aiAvailable }
// Lets the create-workshop wizard hide the AI design lane cleanly when no
// ANTHROPIC_API_KEY is set. Super-admin gated; note it can NOT surface "no admin
// passcode configured" (a gated endpoint rejects everyone when unset) — the
// wizard's unauthenticated gate shows that message instead.
export async function GET(req: NextRequest) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ aiAvailable: aiAvailable() });
}
