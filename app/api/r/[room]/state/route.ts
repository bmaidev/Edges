import { NextRequest, NextResponse } from "next/server";
import {
  getFacilitatorState,
  getPublicState,
  heartbeatHost,
  heartbeatProjector,
  touchParticipant,
} from "@/lib/store";
import { getRoom, resolveRedirect, resolveRole } from "@/lib/rooms";
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
  if (!roomRec) {
    // A4 — the room may have been renamed; old links/QRs redirect to the new slug.
    const target = await resolveRedirect(room);
    if (target)
      return NextResponse.json(
        { redirect: `/r/${target}` },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    return NextResponse.json({ error: "No such room" }, { status: 404 });
  }

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
      // C5 — record this host console's presence. Fire-and-forget + throttled,
      // so it never adds latency. The role is the SERVER-resolved tier — the
      // client's `pid`/`pname` only identify + label the console, never its power.
      const pid = req.nextUrl.searchParams.get("pid");
      if (pid)
        void heartbeatHost(
          pid,
          req.nextUrl.searchParams.get("pname") ?? "",
          role,
          room,
        ).catch(() => {});
      const state = await getFacilitatorState(room);
      return NextResponse.json({ ...state, topic: topic ?? state.topic, role, branding }, { headers });
    }
    // a valid code but projector-style read, or invalid → fall through to public
  }

  if (wantProjector) {
    // H2 — the big screen's own poll is its heartbeat (throttled, fire-and-forget),
    // so pre-flight can tell a live projector from a lost one.
    void heartbeatProjector(room).catch(() => {});
    const state = await getPublicState(null, room, "projector");
    return NextResponse.json({ ...state, topic: topic ?? state.topic, role: "projector", branding }, { headers });
  }

  // C2 — record liveness for the presence signal. Fire-and-forget (throttled to
  // one write per token per 15s) so it never adds latency or fails the poll.
  if (token) void touchParticipant(token, room).catch(() => {});
  const state = await getPublicState(token, room, "participant");
  return NextResponse.json({ ...state, topic: topic ?? state.topic, role: "participant", branding }, { headers });
}
