import { NextRequest, NextResponse } from "next/server";
import {
  checkSuperAdmin,
  createRoom,
  listRooms,
  SlugError,
  SlugTakenError,
} from "@/lib/rooms";

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

// POST /api/admin/rooms { name, topic, templateId?, slug?, code } -> creates a
// room and returns the three tier passcodes ONCE (never persisted in plaintext).
// A4 — an optional chosen `slug` is validated + claimed atomically.
export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    topic?: string;
    templateId?: string;
    slug?: string;
    code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!checkSuperAdmin(body.code))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { room, passcodes } = await createRoom(
      body.name ?? "Untitled room",
      body.topic ?? "",
      body.templateId ?? null,
      body.slug ?? null,
    );
    return NextResponse.json({
      slug: room.slug,
      name: room.name,
      passcodes, // plaintext, shown once
    });
  } catch (e) {
    if (e instanceof SlugTakenError)
      return NextResponse.json(
        { error: "taken", suggestion: e.suggestion },
        { status: 409 },
      );
    if (e instanceof SlugError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
