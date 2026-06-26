import { NextRequest, NextResponse } from "next/server";
import {
  getFacilitatorState,
  getPublicState,
  touchParticipant,
} from "@/lib/store";
import { getRoom, resolveRole } from "@/lib/rooms";
import type { RoomBranding } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/r/[room]/state?token=...   -> participant view
// GET /api/r/[room]/state?code=...    -> role-scoped (facilitator/cohost/admin)
// GET /api/r/[room]/state?role=projector&code=... -> projector view
export async function GET(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  const roomRec = await getRoom(room);
  if (!roomRec)
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  // Room branding (logo + custom copy) for the join/lobby/QR surfaces.
  const t = roomRec.theme;
  const branding: RoomBranding | null =
    t && (t.logoUrl || t.headline || t.tagline)
      ? { logoUrl: t.logoUrl, headline: t.headline, tagline: t.tagline }
      : null;
  // The room record's topic is the source of truth (the session store's topic
  // is a legacy default); surface it to every role.
  const topic = roomRec.topic || undefined;

  const code = req.nextUrl.searchParams.get("code");
  const token = req.nextUrl.searchParams.get("token");
  const wantProjector = req.nextUrl.searchParams.get("role") === "projector";

  const headers = { "Cache-Control": "no-store" };

  if (code) {
    const role = await resolveRole(room, code);
    // Any valid passcode tier (admin/facilitator/cohost) gets the raw view.
    if (role && role !== "participant" && role !== "projector") {
      const state = await getFacilitatorState(room);
      return NextResponse.json({ ...state, topic: topic ?? state.topic, role, branding }, { headers });
    }
    // a valid code but projector-style read, or invalid → fall through to public
  }

  if (wantProjector) {
    const state = await getPublicState(null, room, "projector");
    return NextResponse.json({ ...state, topic: topic ?? state.topic, role: "projector", branding }, { headers });
  }

  // C2 — record liveness for the presence signal. Fire-and-forget (throttled to
  // one write per token per 15s) so it never adds latency or fails the poll.
  if (token) void touchParticipant(token, room).catch(() => {});
  const state = await getPublicState(token, room, "participant");
  return NextResponse.json({ ...state, topic: topic ?? state.topic, role: "participant", branding }, { headers });
}
