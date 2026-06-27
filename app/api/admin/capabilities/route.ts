import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import { aiAvailable } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/capabilities?code=ADMIN -> { aiAvailable }
// Lets the create-workshop wizard hide the AI design lane cleanly when no
// ANTHROPIC_API_KEY is set. Super-admin gated; note it can NOT surface "no admin
// passcode configured" (a gated endpoint rejects everyone when unset) — the
// wizard's unauthenticated gate shows that message instead.
export async function GET(req: NextRequest) {
  if (!(await resolveAdminContext(req.nextUrl.searchParams.get("code"))).ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ aiAvailable: aiAvailable() });
}
