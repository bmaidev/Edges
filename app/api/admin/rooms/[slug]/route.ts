import { NextRequest, NextResponse } from "next/server";
import {
  checkSuperAdmin,
  getArchive,
  getRoom,
  regenerateRoleCode,
  updateRoom,
} from "@/lib/rooms";
import type { RoomTheme, ShareableTier } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms/[slug]?code=ADMIN -> room meta + archive (report).
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!checkSuperAdmin(req.nextUrl.searchParams.get("code")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const room = await getRoom(params.slug);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  const archive = await getArchive(params.slug);
  return NextResponse.json({
    room: { slug: room.slug, name: room.name, topic: room.topic, status: room.status, theme: room.theme },
    archive,
    // Per-tier existence only — never hashes or plaintext. Lets the Access panel
    // know whether a legacy room needs a "Regenerate to get a shareable link".
    tiers: {
      facilitator: Boolean(room.passcodeHashes.facilitator),
      cohost: Boolean(room.passcodeHashes.cohost),
      projector: Boolean(room.passcodeHashes.projector),
    },
  });
}

// POST /api/admin/rooms/[slug] { code, action:"regenerate", role } -> rotate one
// role's passcode, returning the new plaintext ONCE. Super-admin gated. The
// admin tier is not a shareable link, so it cannot be regenerated here.
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  let body: { code?: string; action?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (body.action !== "regenerate")
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const role = body.role;
  if (role !== "facilitator" && role !== "cohost" && role !== "projector")
    return NextResponse.json(
      { error: "role must be facilitator, cohost, or projector" },
      { status: 400 },
    );

  const res = await regenerateRoleCode(params.slug, role as ShareableTier);
  if (!res) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true, code: res.code });
}

// PATCH /api/admin/rooms/[slug] { code, theme?, status? } -> update room.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  let body: { code?: string; theme?: RoomTheme; status?: "draft" | "live" | "archived" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patch: { theme?: RoomTheme; status?: "draft" | "live" | "archived" } = {};
  if (body.theme) patch.theme = body.theme;
  if (body.status) patch.status = body.status;
  const room = await updateRoom(params.slug, patch);
  if (!room) return NextResponse.json({ error: "No such room" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
