import { NextResponse } from "next/server";
import { getDb } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E — a PUBLIC liveness check for uptime monitors. No secrets, no config
// detail — just that the process is up and the datastore responds. (The detailed
// config report is super-admin-gated at /api/admin/config.)
export async function GET() {
  let storage = false;
  try {
    await getDb().get("__health__");
    storage = true;
  } catch {
    storage = false;
  }
  return NextResponse.json(
    { ok: true, storage },
    { headers: { "Cache-Control": "no-store" } },
  );
}
