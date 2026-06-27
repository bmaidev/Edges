import { NextRequest, NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms";
import { requireCapability } from "@/lib/auth";
import { getFacilitatorState, getPublicState, setPhase } from "@/lib/store";
import {
  seedRehearsal,
  shadowRoomId,
  tearDownRehearsal,
} from "@/lib/rehearsal";
import { validatePhases } from "@/lib/userTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/r/[room]/rehearse — drive a dry-run in an isolated shadow room.
// Authed on the LIVE slug (cap `rehearse`); all store ops target the shadow id,
// which no live route can reach (they gate on getRoom). Commands: start / view /
// end. The shadow leaves no real data — `end` (and the 24h TTL backstop) wipe it.
export async function POST(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  if (!(await getRoom(room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  let body: Record<string, unknown> & { command?: string; code?: string; nonce?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { ok } = await requireCapability(room, body.code, "rehearse");
  if (!ok)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const nonce = String(body.nonce ?? "");
  if (!nonce) return NextResponse.json({ error: "Missing nonce" }, { status: 400 });
  const shadowId = shadowRoomId(room, nonce);

  // The room-facing surfaces for the shadow's active phase, as a given participant.
  async function surfaces(asToken: string) {
    const [projector, participant] = await Promise.all([
      getPublicState(null, shadowId, "projector"),
      getPublicState(asToken || null, shadowId, "participant"),
    ]);
    return { projector, participant };
  }

  // B5 — the auto-issue PUNCH LIST: the same advisory readiness engine the live
  // pre-flight uses, run over the shadow's built session, so issues (empty prompts,
  // dangling source refs, AI/media not configured) surface DURING the dry-run.
  // Session-wide (not per-phase), so it's computed once at start/reseed.
  async function punchList() {
    return (await getFacilitatorState(shadowId)).readiness ?? null;
  }

  switch (body.command) {
    case "start": {
      const v = validatePhases(body.phases);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      const castSize = Number(body.castSize ?? 8);
      // Fresh start: clear any prior shadow under this nonce, then seed.
      await tearDownRehearsal(shadowId);
      const { tokens, handles } = await seedRehearsal(shadowId, v.phases, castSize);
      const cast = tokens.map((t, i) => ({ token: t, handle: handles[i] }));
      return NextResponse.json({
        ok: true,
        cast,
        sequence: v.phases.map((p) => ({
          id: p.id,
          moduleId: p.moduleId,
          label: (p.config?.label as string) ?? p.moduleId,
        })),
        readiness: await punchList(),
        ...(await surfaces(tokens[0] ?? "")),
      });
    }
    case "view": {
      const phaseId = String(body.phaseId ?? "");
      if (phaseId) await setPhase(phaseId, shadowId);
      return NextResponse.json({
        ok: true,
        ...(await surfaces(String(body.asToken ?? ""))),
      });
    }
    // B5 — re-roll the synthetic data (new contributions/tallies, fresh roster) at
    // a chosen cast size, WITHOUT leaving the theatre. A full teardown + reseed of
    // the shadow, so it's as clean as a fresh start.
    case "reseed":
    case "setCast": {
      const v = validatePhases(body.phases);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      const castSize = Number(body.castSize ?? 8);
      await tearDownRehearsal(shadowId);
      const { tokens, handles } = await seedRehearsal(shadowId, v.phases, castSize);
      const cast = tokens.map((t, i) => ({ token: t, handle: handles[i] }));
      // Stay on the phase the facilitator was viewing, if it still exists.
      const phaseId = typeof body.phaseId === "string" && v.phases.some((p) => p.id === body.phaseId)
        ? body.phaseId
        : v.phases[0]?.id;
      if (phaseId) await setPhase(phaseId, shadowId);
      return NextResponse.json({
        ok: true,
        cast,
        sequence: v.phases.map((p) => ({
          id: p.id,
          moduleId: p.moduleId,
          label: (p.config?.label as string) ?? p.moduleId,
        })),
        readiness: await punchList(),
        ...(await surfaces(tokens[0] ?? "")),
      });
    }
    case "end": {
      await tearDownRehearsal(shadowId);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }
}
