import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionMetrics,
  listRooms,
  listSessionMetrics,
} from "@/lib/rooms";
import { resolveAdminContext } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";
import { computeMethodMetrics, metricsToCsv } from "@/lib/session-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/analytics?code=ADMIN — cross-session rollup across all rooms
// (lastRun counts + design label) PLUS the F4 de-identified method-engagement /
// ended-early summary from the durable SessionMetrics index. Aggregate-only,
// N<3-suppressed — never any participant data.
//   ?export=csv  → the raw (de-identified) metrics as a CSV download
//   ?export=json → the raw metrics as JSON
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
  );
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const exportAs = req.nextUrl.searchParams.get("export");
  if (exportAs === "csv" || exportAs === "json") {
    const metrics = await listSessionMetrics(ctx.workspaceId);
    if (exportAs === "csv") {
      return new NextResponse(metricsToCsv(metrics), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="edges-metrics.csv"',
        },
      });
    }
    return new NextResponse(JSON.stringify(metrics, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="edges-metrics.json"',
      },
    });
  }

  const [rooms, metrics] = await Promise.all([
    listRooms(ctx.workspaceId),
    listSessionMetrics(ctx.workspaceId),
  ]);
  return NextResponse.json({
    ...computeAnalytics(rooms),
    metrics: computeMethodMetrics(metrics),
  });
}

// POST { action: "clear" } — wipe THIS workspace's metrics history.
export async function POST(req: NextRequest) {
  const ctx = await resolveAdminContext(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
  );
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "clear") {
    await clearSessionMetrics(ctx.workspaceId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
