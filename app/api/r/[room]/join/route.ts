import { NextRequest, NextResponse } from "next/server";
import { addParticipant } from "@/lib/store";
import { getRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/r/[room]/join { handle } -> { participantToken }
export async function POST(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  if (!(await getRoom(params.room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  let handle = "Anonymous";
  try {
    const body = await req.json();
    if (typeof body?.handle === "string" && body.handle.trim())
      handle = body.handle.trim().slice(0, 40);
  } catch {
    // default
  }

  const participantToken = globalThis.crypto.randomUUID();
  await addParticipant(participantToken, handle, params.room);
  return NextResponse.json({ participantToken });
}
