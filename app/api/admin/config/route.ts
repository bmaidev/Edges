import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import { instanceConfig } from "@/lib/instance-config";
import { requestCode } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E — the operator's instance config report (SECRET-FREE booleans + the
// signup mode). Super-admin only: it's an ops view, not per-workspace, and tells
// the operator exactly what their deploy has enabled so they can verify it.
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(requestCode(req));
  if (!ctx.ok || !ctx.isSuperAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(instanceConfig());
}
