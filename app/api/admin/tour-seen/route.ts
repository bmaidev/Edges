import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, getTourSeen, setTourSeen } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The one durable, non-PII onboarding flag — keyed by sha256(adminCode) so the
// admin who has toured isn't re-nagged across devices. Super-admin gated.

// GET /api/admin/tour-seen?code=ADMIN -> { seen }
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!checkSuperAdmin(code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ seen: await getTourSeen(code!) });
}

// POST /api/admin/tour-seen { code } -> mark the tour as seen.
export async function POST(req: NextRequest) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await setTourSeen(body.code!);
  return NextResponse.json({ ok: true });
}
