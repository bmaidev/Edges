import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import {
  clearWorkspaceAiKey,
  setWorkspaceAiKey,
  workspaceAiKeyInfo,
} from "@/lib/workspaces";
import { secretsConfigured } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase D3 — a workspace's BYO Anthropic key. GET (any member) reports only
// whether a key is set + its last4 + whether the server can store secrets at all;
// PUT/DELETE (OWNER) set/clear it. The plaintext is write-only — never returned.

function ownerGate(ctx: { ok: boolean; role: string | null; isSuperAdmin: boolean }) {
  return ctx.ok && (ctx.isSuperAdmin || ctx.role === "owner");
}

// GET ?code=… -> { set, last4, secretsConfigured }
export async function GET(req: NextRequest) {
  const ctx = await resolveAdminContext(
    req.nextUrl.searchParams.get("code"),
    req.nextUrl.searchParams.get("workspace"),
  );
  if (!ctx.ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const info = await workspaceAiKeyInfo(ctx.workspaceId);
  return NextResponse.json({ ...info, secretsConfigured: secretsConfigured() });
}

// PUT { code, key } -> set the workspace's BYO key (OWNER).
export async function PUT(req: NextRequest) {
  let body: { code?: string; key?: string; workspace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code, body.workspace);
  if (!ownerGate(ctx))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!secretsConfigured())
    return NextResponse.json(
      { error: "This instance can't store keys — EDGES_SECRET_KEY isn't set." },
      { status: 409 },
    );
  const key = (body.key ?? "").trim();
  // Light shape check — Anthropic keys start with "sk-"; don't over-validate (the
  // format can evolve, and a wrong key just fails the call gracefully later).
  if (!key.startsWith("sk-") || key.length < 20)
    return NextResponse.json({ error: "That doesn't look like an Anthropic API key." }, { status: 400 });
  const ok = await setWorkspaceAiKey(ctx.workspaceId, key);
  if (!ok) return NextResponse.json({ error: "Couldn't store the key." }, { status: 500 });
  return NextResponse.json({ ok: true, last4: key.slice(-4) });
}

// DELETE { code } -> remove the workspace's BYO key (OWNER) → falls back to the
// platform baseline key.
export async function DELETE(req: NextRequest) {
  let body: { code?: string; workspace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ctx = await resolveAdminContext(body.code, body.workspace);
  if (!ownerGate(ctx))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await clearWorkspaceAiKey(ctx.workspaceId);
  return NextResponse.json({ ok: true });
}
