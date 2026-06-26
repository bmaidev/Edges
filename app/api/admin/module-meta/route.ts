import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin } from "@/lib/rooms";
import { SERVER_MODULES } from "@/lib/modules/registry.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/module-meta?code=ADMIN -> { meta: { [id]: { name, description } } }
// Serialized module names/descriptions so the wizard can render an AI-proposed
// agenda as plain-language prose WITHOUT importing the server registry into
// client code (keeps the server/client module boundary intact). Super-admin gated.
export async function GET(req: NextRequest) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const meta: Record<string, { name: string; description: string }> = {};
  for (const [id, mod] of Object.entries(SERVER_MODULES)) {
    meta[id] = { name: mod.meta.name, description: mod.meta.description };
  }
  return NextResponse.json({ meta });
}
