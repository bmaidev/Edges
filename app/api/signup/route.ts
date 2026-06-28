import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/rooms";
import { createWorkspace } from "@/lib/workspaces";
import { adminMagicLink } from "@/lib/magicLink";
import { signupAllowed, signupPolicy } from "@/lib/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUBLIC self-service workspace signup (NOT super-admin gated — that's the whole
// point: an individual facilitator onboards without an operator). Deliberately
// separate from /api/admin/workspaces, which stays super-admin-only for listing.

// A soft global rate cap as an abuse backstop for the open mode. A rolling-window
// list of creation timestamps in the durable store — read-modify-write (racy
// under burst, fine for a soft cap); the community code is the real gate.
const RATE_KEY = "signup:recent";
const RATE_CAP = 20; // new workspaces per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function overRateLimit(now: number): Promise<boolean> {
  const db = getDb();
  const recent = ((await db.get<number[]>(RATE_KEY)) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_CAP) {
    await db.set(RATE_KEY, recent); // prune even when rejecting
    return true;
  }
  await db.set(RATE_KEY, [...recent, now]);
  return false;
}

// GET /api/signup -> { policy } so /start renders the right form (or "closed").
export async function GET() {
  return NextResponse.json({ policy: signupPolicy() });
}

// POST /api/signup { name, code? } -> create a workspace, return its admin code +
// bookmarkable sign-in link ONCE.
export async function POST(req: NextRequest) {
  let body: { name?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!signupAllowed(body.code)) {
    const policy = signupPolicy();
    const error =
      policy === "closed"
        ? "Self-service signups are closed on this instance — ask your host for an invite."
        : "That community code isn't right.";
    return NextResponse.json({ error }, { status: 403 });
  }

  const name = (body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "Give your workspace a name." }, { status: 400 });

  if (await overRateLimit(Date.now()))
    return NextResponse.json(
      { error: "Lots of new workspaces just now — please try again shortly." },
      { status: 429 },
    );

  const { workspace, adminCode } = await createWorkspace(name);
  return NextResponse.json({
    id: workspace.id,
    name: workspace.name,
    adminCode, // shown once
    link: adminMagicLink(req.nextUrl.origin, adminCode),
  });
}
