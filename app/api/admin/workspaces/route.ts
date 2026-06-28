import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import {
  DEFAULT_WORKSPACE_ID,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
} from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase A4 — workspace (tenant) management. ONLY the env super-admin may list or
// create workspaces; a workspace admin can't enumerate or mint other tenants.
// Managing a workspace's rooms is done by entering THAT workspace's admin code
// (the server scopes every admin route by the code — "the code is the key").

// GET /api/admin/workspaces?code=SUPER -> [{ id, name, createdAt }]
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(req.nextUrl.searchParams.get("code"));
  if (!ctx.ok || !ctx.isSuperAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ workspaces: await listWorkspaces() });
}

// POST /api/admin/workspaces { code: SUPER, name } -> create a workspace, return
// its admin code ONCE (only the hash is stored).
export async function POST(req: NextRequest) {
  let body: { code?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code);
  if (!ctx.ok || !ctx.isSuperAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const name = (body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "A workspace needs a name." }, { status: 400 });
  const { workspace, adminCode } = await createWorkspace(name);
  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
    adminCode, // plaintext, shown once
  });
}

// DELETE /api/admin/workspaces { code, workspaceId } -> permanently erase a
// workspace + ALL its data. Allowed for the super-admin, or for an OWNER of that
// workspace (its own code). The default workspace can never be deleted.
export async function DELETE(req: NextRequest) {
  let body: { code?: string; workspaceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const target = (body.workspaceId ?? "").trim();
  if (!target || target === DEFAULT_WORKSPACE_ID)
    return NextResponse.json({ error: "That workspace can't be deleted." }, { status: 400 });

  const ctx = await resolveAdminContext(body.code);
  // Super-admin may erase any workspace; otherwise the caller must be an OWNER of
  // the very workspace they're deleting (their code resolves to it as owner).
  const allowed =
    ctx.ok &&
    (ctx.isSuperAdmin || (ctx.role === "owner" && ctx.workspaceId === target));
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ok = await deleteWorkspace(target);
  if (!ok) return NextResponse.json({ error: "No such workspace" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
