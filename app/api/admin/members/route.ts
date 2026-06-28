import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import { addMember, listMembers, removeMember } from "@/lib/workspaces";
import { adminMagicLink } from "@/lib/magicLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase C2 — member management within a workspace. Listing is open to any member
// (the roster is shared); adding/revoking is OWNER-ONLY. Everything is scoped to
// the caller's own workspace via resolveAdminContext (a member can't touch
// another tenant). Code hashes are NEVER returned — a new member's plaintext is
// shown ONCE as a bookmarkable sign-in link.

function ownerGate(ctx: { ok: boolean; role: string | null; isSuperAdmin: boolean }) {
  return ctx.ok && (ctx.isSuperAdmin || ctx.role === "owner");
}

// GET /api/admin/members?code=… -> [{ id, name, role, createdAt }] (any member).
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
  );
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ members: await listMembers(ctx.workspaceId) });
}

// POST { code, name, role } -> add a member (OWNER), returning their code + link once.
export async function POST(req: NextRequest) {
  let body: { code?: string; name?: string; role?: string; workspace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code, body.workspace);
  if (!ownerGate(ctx))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const name = (body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "Give the member a name." }, { status: 400 });
  const role = body.role === "owner" ? "owner" : "member";

  const res = await addMember(ctx.workspaceId, name, role);
  if (!res) return NextResponse.json({ error: "No such workspace" }, { status: 404 });
  return NextResponse.json({
    member: res.member,
    code: res.code, // shown once
    link: adminMagicLink(req.nextUrl.origin, res.code),
  });
}

// DELETE { code, memberId } -> revoke a member (OWNER).
export async function DELETE(req: NextRequest) {
  let body: { code?: string; memberId?: string; workspace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code, body.workspace);
  if (!ownerGate(ctx))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ok = await removeMember(ctx.workspaceId, String(body.memberId ?? ""));
  if (!ok) return NextResponse.json({ error: "No such member" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
