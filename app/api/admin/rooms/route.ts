import { NextRequest, NextResponse } from "next/server";
import {
  blueprintSummary,
  createRoom,
  duplicateRoom,
  getRoom,
  listRooms,
  SlugError,
  SlugTakenError,
} from "@/lib/rooms";
import { resolveAdminContext } from "@/lib/auth";
import { DEFAULT_WORKSPACE_ID, getWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/rooms?code=ADMIN[&workspace=ID] -> list the workspace's rooms.
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
  );
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rooms = await listRooms(ctx.workspaceId);
  const ws = await getWorkspace(ctx.workspaceId);
  return NextResponse.json({
    // Phase A4/C — which workspace this code administers + the caller's role, so
    // the portal can show the active tenant + the right (owner-only) controls.
    context: {
      workspaceId: ctx.workspaceId,
      name: ws?.name ?? ctx.workspaceId,
      isSuperAdmin: ctx.isSuperAdmin,
      role: ctx.role,
    },
    rooms: rooms.map((r) => ({
      slug: r.slug,
      name: r.name,
      topic: r.topic,
      status: r.status,
      createdAt: r.createdAt,
      templateId: r.templateId,
      isSample: Boolean(r.isSample),
      // A5 — design + last-run memory for the grouped list (chips, counts). Read
      // straight off the Room record; no per-room archive fan-out.
      blueprint: r.blueprint
        ? { chips: blueprintSummary(r.blueprint.phases), phaseCount: r.blueprint.phases.length }
        : null,
      lastRun: r.lastRun ?? null,
      // C3 — attribution for the shared rooms list ("created by <name>").
      createdBy: r.createdBy?.name ?? null,
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
    duplicateOf?: string;
    code?: string;
    workspace?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code, body.workspace);
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A5 — duplicate an existing room's DESIGN into a fresh room (new passcodes,
  // no participant data carried over). The source must belong to THIS workspace.
  if (body.duplicateOf) {
    const src = await getRoom(body.duplicateOf);
    if (!src || (src.workspaceId ?? DEFAULT_WORKSPACE_ID) !== ctx.workspaceId)
      return NextResponse.json({ error: "No such room" }, { status: 404 });
    const dup = await duplicateRoom(body.duplicateOf);
    if (!dup)
      return NextResponse.json({ error: "No such room" }, { status: 404 });
    return NextResponse.json({
      slug: dup.room.slug,
      name: dup.room.name,
      passcodes: dup.passcodes,
    });
  }

  try {
    const { room, passcodes } = await createRoom(
      body.name ?? "Untitled room",
      body.topic ?? "",
      body.templateId ?? null,
      body.slug ?? null,
      ctx.workspaceId,
      ctx.memberName ? { memberId: ctx.memberId, name: ctx.memberName } : undefined,
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
