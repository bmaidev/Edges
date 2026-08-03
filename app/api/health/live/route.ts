import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Process liveness is intentionally dependency-free. Use /api/health for
// readiness; it returns 503 when required durable storage is unavailable.
export function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
