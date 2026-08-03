import { NextRequest, NextResponse } from "next/server";

function storageConfigured(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

// Production must never silently serve live rooms from process-local memory.
// Keep liveness/readiness reachable so an orchestrator can diagnose the failure.
export function middleware(req: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    !storageConfigured() &&
    !req.nextUrl.pathname.startsWith("/api/health")
  ) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Durable storage is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse("Service unavailable: durable storage is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/r/:path*", "/start"],
};
