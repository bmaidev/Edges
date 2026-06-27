import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext } from "@/lib/auth";
import { critiqueSession, reviseSession, suggestSession } from "@/lib/design";
import type { PhaseInstance } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// AI design can run for tens of seconds.
export const maxDuration = 60;

// POST /api/admin/design { code, action, ... } -> roomless AI session design for
// the create-workshop wizard. The wizard defers creating the room until the
// Share step (so abandonment leaves nothing durable), so it can't use the
// room-scoped host suggestSession command yet — this runs lib/design directly.
// Super-admin gated; never persists anything.
export async function POST(req: NextRequest) {
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!(await resolveAdminContext(body.code)).ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const topic = String(body.topic ?? "");
  const minutes = typeof body.minutes === "number" ? body.minutes : undefined;

  if (body.action === "suggest") {
    const goal = String(body.goal ?? "").trim();
    if (!goal) return NextResponse.json({ error: "Describe a goal first." }, { status: 400 });
    const headcount = typeof body.headcount === "number" ? body.headcount : undefined;
    const r = await suggestSession(goal, topic, minutes, headcount);
    if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't design" }, { status: 502 });
    return NextResponse.json({ ok: true, suggestion: r.suggestion });
  }

  if (body.action === "critique") {
    const phases = (body.phases ?? []) as PhaseInstance[];
    if (!Array.isArray(phases) || phases.length === 0)
      return NextResponse.json({ error: "No phases to critique." }, { status: 400 });
    const r = await critiqueSession(phases, topic);
    if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't critique" }, { status: 502 });
    return NextResponse.json({ ok: true, critique: r.critique });
  }

  if (body.action === "revise") {
    const phases = (body.phases ?? []) as PhaseInstance[];
    if (!Array.isArray(phases) || phases.length === 0)
      return NextResponse.json({ error: "No phases to revise." }, { status: 400 });
    const issues = Array.isArray(body.issues)
      ? (body.issues as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const r = await reviseSession(phases, String(body.goal ?? ""), topic, issues, minutes);
    if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't revise" }, { status: 502 });
    return NextResponse.json({ ok: true, suggestion: r.suggestion });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
