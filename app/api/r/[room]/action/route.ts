import { NextRequest, NextResponse } from "next/server";
import { claimAction, dispatchAction, touchParticipant } from "@/lib/store";
import { getRoom } from "@/lib/rooms";
import type { ModuleAction } from "@/lib/modules/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// dispatchAction can route to a module that triggers AI; give it headroom.
export const maxDuration = 60;

// POST /api/r/[room]/action { type, token?, handle?, payload }
export async function POST(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  if (!(await getRoom(params.room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  let body: ModuleAction;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body || typeof body.type !== "string")
    return NextResponse.json({ error: "Missing action type" }, { status: 400 });

  // H1 — idempotent replay: if this send was already processed (a queued retry of
  // a send whose response was lost), acknowledge it without re-applying.
  const dedupeId = (body as { dedupeId?: unknown }).dedupeId;
  if (typeof dedupeId === "string" && dedupeId) {
    const fresh = await claimAction(params.room, dedupeId);
    if (!fresh) return NextResponse.json({ ok: true, deduped: true });
  }

  // H1 — acting is liveness: refresh the heartbeat so room-health reflects
  // people who are engaging but between polls. Fire-and-forget, throttled.
  if (typeof body.token === "string")
    void touchParticipant(body.token, params.room).catch(() => {});

  const result = await dispatchAction(params.room, body, "participant");
  if (!result.ok)
    return NextResponse.json(
      { error: result.reason ?? "rejected" },
      { status: result.status },
    );
  return NextResponse.json({ ok: true });
}
