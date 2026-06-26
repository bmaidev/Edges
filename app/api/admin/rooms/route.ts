import { NextRequest, NextResponse } from "next/server";
import { checkSuperAdmin, createRoom, listRooms } from "@/lib/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms?code=ADMIN -> list rooms (no passcode hashes exposed).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!checkSuperAdmin(code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rooms = await listRooms();
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      slug: r.slug,
      name: r.name,
      topic: r.topic,
      status: r.status,
      createdAt: r.createdAt,
      templateId: r.templateId,
      isSample: Boolean(r.isSample),
    })),
  });
}

// POST /api/admin/rooms { name, topic, templateId?, code } -> creates a room
// and returns the three tier passcodes ONCE (never persisted in plaintext).
export async function POST(req: NextRequest) {
  let body: { name?: string; topic?: string; templateId?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { room, passcodes } = await createRoom(
    body.name ?? "Untitled room",
    body.topic ?? "",
    body.templateId ?? null,
  );
  return NextResponse.json({
    slug: room.slug,
    name: room.name,
    passcodes, // plaintext, shown once
  });
}
