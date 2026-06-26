import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, getRoom } from "@/lib/rooms";
import { SAMPLE_SLUG, isSampleStale, seedSample } from "@/lib/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Seeding does ~25 sequential KV writes; give it room under the 30s lock TTL.
export const maxDuration = 30;

// POST /api/admin/sample { code } -> seed-or-reset the reserved demo room.
// Super-admin gated. Idempotent (full reset). Returns the freshly minted sample
// facilitator code in plaintext ONCE — never a source constant. 409 if a
// concurrent seed holds the lock.
export async function POST(req: NextRequest) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const r = await seedSample();
  if (!r.ok)
    return NextResponse.json(
      { error: "A reset is already in progress — try again." },
      { status: 409 },
    );
  return NextResponse.json({
    slug: r.slug,
    facilitatorCode: r.facilitatorCode, // plaintext, shown once
    reset: r.reset,
  });
}

// GET /api/admin/sample?code=ADMIN -> { exists, stale } so /admin can choose
// open-vs-reseed without a blind write.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!checkSuperAdmin(code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const exists = Boolean(await getRoom(SAMPLE_SLUG));
  const stale = exists ? await isSampleStale() : false;
  return NextResponse.json({ exists, stale });
}
