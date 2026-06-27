import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import { createWorkspace, listWorkspaces } from "@/lib/workspaces";

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
