import { NextResponse } from "next/server";
import { durableStorageConfigured, getDb } from "@/lib/rooms";
import { realtimeHealth } from "@/lib/realtime";
import { readinessStatus } from "@/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E — a PUBLIC liveness check for uptime monitors. No secrets, no config
// detail — just that the process is up and the datastore responds. (The detailed
// config report is super-admin-gated at /api/admin/config.)
//
// `realtime` is a non-secret capability flag (like `storage`): whether the push
// tier is wired up, split into server (can publish) and client (browser can
// subscribe) so an asymmetric setup is obvious at a glance. `mode` is "pusher"
// only when both halves are present; otherwise the app is on the polling
// fallback. Never exposes a key, id, or secret.
export async function GET() {
  let storage = false;
  try {
    storage = await getDb().ping();
  } catch {
    storage = false;
  }
  const configured = durableStorageConfigured();
  const readiness = readinessStatus({
    production: process.env.NODE_ENV === "production",
    configured,
    reachable: storage,
  });
  return NextResponse.json(
    { ok: readiness.ok, storage, storageConfigured: configured, realtime: realtimeHealth() },
    { status: readiness.status, headers: { "Cache-Control": "no-store" } },
  );
}
