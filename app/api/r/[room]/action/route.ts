import { NextRequest, NextResponse } from "next/server";
import { dispatchAction } from "@/lib/store";
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

  const result = await dispatchAction(params.room, body, "participant");
  if (!result.ok)
    return NextResponse.json(
      { error: result.reason ?? "rejected" },
      { status: result.status },
    );
  return NextResponse.json({ ok: true });
}
