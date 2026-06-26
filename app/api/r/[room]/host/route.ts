import { NextRequest, NextResponse } from "next/server";
import { archiveRoom, buildReport, getRoom, publishTakeaway } from "@/lib/rooms";
import { requireCapability, type Capability } from "@/lib/auth";
import { suggestClusters } from "@/lib/cluster";
import { getServerModule } from "@/lib/modules/registry.server";
import { getTemplate } from "@/lib/templates";
import { critiqueSession, reviseSession, suggestSession } from "@/lib/design";
import type { PhaseInstance } from "@/lib/types";
import {
  addContent,
  createPattern,
  deleteContent,
  deletePattern,
  addTime,
  clearPhaseData,
  clearUndo,
  mutateActionItems,
  type ActionItemOp,
  deleteSubmission,
  dispatchAction,
  getFacilitatorState,
  getState,
  listContent,
  pauseTimer,
  phaseSequence,
  reassign,
  renamePattern,
  reorderPatterns,
  resumeTimer,
  setMode,
  setSpotlight,
  tryNudge,
  setPhase,
  setPhases,
  setReadaroundIndex,
  setTimer,
  undoLastAction,
  updateContent,
  updateSubmission,
  withLock,
  writeUndo,
} from "@/lib/store";
import type { ContentType, ModeId, Role, SessionState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build the SAME payload the /state poll returns, but from the just-written
// state (no read-back). Lets the client apply a navigation result instantly and
// correctly even on an eventually-consistent store that would serve a stale read
// immediately after the write.
async function navState(room: string, written: SessionState, role: Role) {
  const roomRec = await getRoom(room);
  const t = roomRec?.theme;
  const branding =
    t && (t.logoUrl || t.headline || t.tagline)
      ? { logoUrl: t.logoUrl, headline: t.headline, tagline: t.tagline }
      : null;
  const state = await getFacilitatorState(room, written);
  return { ...state, topic: roomRec?.topic || state.topic, role, branding };
}
// AI commands (suggest/critique/revise/generate) can run for tens of seconds;
// give them real headroom rather than the platform's short default.
export const maxDuration = 60;

// Which capability each command needs.
const COMMAND_CAP: Record<string, Capability> = {
  setMode: "advance",
  setPhases: "configure",
  // Launching a vetted built-in template is a normal facilitator action; only
  // arbitrary custom phase-config (setPhases) needs the admin "configure" cap.
  setTemplate: "advance",
  // Setup-phase AI assist (read-only — proposes/critiques, never applies).
  suggestSession: "advance",
  critiqueSession: "advance",
  reviseSession: "advance",
  setPhase: "advance",
  setTimer: "timer",
  // C1 — pause/resume/+time share the timer cap (cohost can drive the clock).
  pauseTimer: "timer",
  resumeTimer: "timer",
  addTime: "timer",
  // C3 recovery. undo is a nav move (advance). reset/reopen CLEAR a phase's data,
  // so they sit one notch up at `curate` (cohost has it); none need the admin-only
  // `configure` cap — which would lock both facilitator and cohost out.
  undo: "advance",
  resetPhase: "curate",
  reopenPhase: "curate",
  // C4 — spotlight a response to the projector. A live nav-tier move (same as
  // setPhase): facilitator + cohost can do it; NOT the admin-only `configure`.
  spotlight: "advance",
  addContent: "inject",
  updateContent: "inject",
  deleteContent: "inject",
  createPattern: "curate",
  renamePattern: "curate",
  reorderPatterns: "curate",
  deletePattern: "curate",
  updateSubmission: "curate",
  deleteSubmission: "curate",
  reassign: "reassign",
  readaroundNext: "readaround",
  cluster: "cluster",
  // Facilitator-driven module actions (AI generate/promote, spectrogram stage,
  // consult round, lightning next, open-space placement, …).
  moduleAction: "advance",
  // F2 — capture/manage action items (same tier as moduleAction; cohost can
  // capture, participant cannot; never the admin-only `configure`).
  actionItem: "advance",
  // C2 — gently re-surface the prompt on phones that haven't answered.
  nudgeRoom: "advance",
  // F1 — build a client-ready report mid-session (no wipe). Facilitator + admin,
  // not cohost; never the admin-only `configure` cap.
  buildReport: "end",
  archive: "end",
  end: "end",
};

// POST /api/r/[room]/host { command, code, ...args }
export async function POST(
  req: NextRequest,
  { params }: { params: { room: string } },
) {
  const room = params.room;
  if (!(await getRoom(room)))
    return NextResponse.json({ error: "No such room" }, { status: 404 });

  let body: Record<string, unknown> & { command?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const command = body.command;
  if (!command || !(command in COMMAND_CAP))
    return NextResponse.json({ error: "Unknown command" }, { status: 400 });

  const { ok, role } = await requireCapability(
    room,
    body.code,
    COMMAND_CAP[command],
  );
  if (!ok)
    return NextResponse.json(
      { error: role ? "Not permitted for your role" : "Forbidden" },
      { status: 403 },
    );

  const a = body as Record<string, any>;
  switch (command) {
    case "setMode":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setMode(a.mode as ModeId, room), role ?? "facilitator"),
      });
    case "setPhases": {
      const phases = (a.phases ?? []) as PhaseInstance[];
      if (!Array.isArray(phases) || phases.length === 0)
        return NextResponse.json({ error: "No phases" }, { status: 400 });
      // Validate every phase against its module's schema (the zod payoff).
      for (const p of phases) {
        const mod = getServerModule(p.moduleId);
        if (!mod)
          return NextResponse.json(
            { error: `Unknown module: ${p.moduleId}` },
            { status: 400 },
          );
        const parsed = mod.schema.safeParse(p.config);
        if (!parsed.success)
          return NextResponse.json(
            { error: `Invalid config for "${p.id}" (${p.moduleId})` },
            { status: 400 },
          );
      }
      return NextResponse.json({
        ok: true,
        state: await navState(
          room,
          await setPhases(phases, a.sessionName ?? "Custom session", room),
          role ?? "facilitator",
        ),
      });
    }
    case "setTemplate": {
      const t = getTemplate(String(a.templateId ?? ""));
      if (!t)
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setPhases(t.phases, t.name, room), role ?? "facilitator"),
      });
    }
    case "suggestSession": {
      const goal = String(a.goal ?? "").trim();
      if (!goal) return NextResponse.json({ error: "Describe a goal first." }, { status: 400 });
      const roomRec = await getRoom(room);
      const r = await suggestSession(
        goal,
        roomRec?.topic ?? "",
        typeof a.minutes === "number" ? a.minutes : undefined,
        typeof a.headcount === "number" ? a.headcount : undefined,
      );
      if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't suggest" }, { status: 502 });
      return NextResponse.json({ ok: true, suggestion: r.suggestion });
    }
    case "critiqueSession": {
      const phases = (a.phases ?? []) as { id: string; moduleId: string; config: Record<string, unknown> }[];
      if (!Array.isArray(phases) || phases.length === 0)
        return NextResponse.json({ error: "No phases to critique." }, { status: 400 });
      const roomRec = await getRoom(room);
      const r = await critiqueSession(phases, roomRec?.topic ?? "");
      if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't critique" }, { status: 502 });
      return NextResponse.json({ ok: true, critique: r.critique });
    }
    case "reviseSession": {
      const phases = (a.phases ?? []) as { id: string; moduleId: string; config: Record<string, unknown> }[];
      if (!Array.isArray(phases) || phases.length === 0)
        return NextResponse.json({ error: "No phases to revise." }, { status: 400 });
      const issues = Array.isArray(a.issues)
        ? (a.issues as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const roomRec = await getRoom(room);
      const r = await reviseSession(
        phases,
        String(a.goal ?? ""),
        roomRec?.topic ?? "",
        issues,
        typeof a.minutes === "number" ? a.minutes : undefined,
      );
      if (!r.ok) return NextResponse.json({ error: r.reason ?? "Couldn't revise" }, { status: 502 });
      return NextResponse.json({ ok: true, suggestion: r.suggestion });
    }
    case "setPhase": {
      // C3 — release queued content ONLY on a forward move (Back must never dump
      // queued slides onto the room), and snapshot the prior position for undo.
      const target = String(a.phaseId ?? "");
      const before = await getState(room);
      const seq = await phaseSequence(room);
      const curIdx = seq.indexOf(before.phaseId ?? "");
      const forward = curIdx >= 0 && seq.indexOf(target) === curIdx + 1;
      const releasedIds = forward
        ? (await listContent(room)).filter((c) => c.queued).map((c) => c.id)
        : [];
      const written = await setPhase(target, room, { release: forward });
      await writeUndo(
        {
          prevPhaseId: before.phaseId,
          prevTimerEndsAt: before.timerEndsAt,
          prevTimerRemainingMs: before.timerRemainingMs ?? null,
          prevReadaroundIndex: before.readaroundIndex,
          releasedIds,
          label: target,
          at: Date.now(),
        },
        room,
      );
      return NextResponse.json({
        ok: true,
        state: await navState(room, written, role ?? "facilitator"),
      });
    }
    case "undo": {
      const { state, undone } = await undoLastAction(room);
      return NextResponse.json({
        ok: true,
        undone,
        state: await navState(room, state, role ?? "facilitator"),
      });
    }
    case "resetPhase": {
      // Clear a contaminated phase's data and re-enter it clean, in place.
      const before = await getState(room);
      const phaseId = String(a.phaseId ?? before.phaseId ?? "");
      if (!phaseId)
        return NextResponse.json({ ok: false, reason: "no phase" });
      const locked = await withLock(
        room,
        "clear:" + phaseId,
        async () => {
          await clearPhaseData(phaseId, room);
          return setPhase(phaseId, room, { release: false });
        },
        { ttlSeconds: 10 },
      );
      if (!locked.ok)
        return NextResponse.json(
          { error: "Someone else just changed this phase — try again." },
          { status: 409 },
        );
      await clearUndo(room); // a confirmed clear invalidates the nav undo
      return NextResponse.json({
        ok: true,
        state: await navState(room, locked.value, role ?? "facilitator"),
      });
    }
    case "reopenPhase": {
      // Jump back to a past phase and clear it so it can be re-run.
      const before = await getState(room);
      const target = String(a.phaseId ?? "");
      if (!target) return NextResponse.json({ ok: false, reason: "no phase" });
      const locked = await withLock(
        room,
        "clear:" + target,
        async () => {
          await clearPhaseData(target, room);
          return setPhase(target, room, { release: false });
        },
        { ttlSeconds: 10 },
      );
      if (!locked.ok)
        return NextResponse.json(
          { error: "Someone else just changed this phase — try again." },
          { status: 409 },
        );
      // Nav undo so a mis-tapped reopen can bounce back (the clear stays final).
      await writeUndo(
        {
          prevPhaseId: before.phaseId,
          prevTimerEndsAt: before.timerEndsAt,
          prevTimerRemainingMs: before.timerRemainingMs ?? null,
          prevReadaroundIndex: before.readaroundIndex,
          releasedIds: [],
          label: target,
          at: Date.now(),
        },
        room,
      );
      return NextResponse.json({
        ok: true,
        state: await navState(room, locked.value, role ?? "facilitator"),
      });
    }
    case "setTimer":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setTimer(a.endsAt ?? null, room), role ?? "facilitator"),
      });
    case "pauseTimer":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await pauseTimer(room), role ?? "facilitator"),
      });
    case "resumeTimer":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await resumeTimer(room), role ?? "facilitator"),
      });
    case "addTime":
      return NextResponse.json({
        ok: true,
        state: await navState(
          room,
          await addTime(Number(a.addMs ?? 0), room),
          role ?? "facilitator",
        ),
      });
    case "spotlight": {
      // Parse the ref: a submission id wins; else a literal text; else clear.
      // A blank/absent payload clears — so the same command both sets and dismisses.
      let ref: import("@/lib/types").SpotlightRef | null = null;
      if (typeof a.id === "string" && a.id) ref = { kind: "submission", id: a.id };
      else if (typeof a.text === "string" && a.text.trim())
        ref = { kind: "literal", text: a.text };
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setSpotlight(ref, room), role ?? "facilitator"),
      });
    }
    case "addContent":
      return NextResponse.json({
        ok: true,
        item: await addContent(a.type as ContentType, a.title ?? "", a.body ?? "", a.target ?? "now", room),
      });
    case "updateContent": {
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "body", "visible", "queued"])
        if (k in a) patch[k] = a[k];
      await updateContent(a.id, patch, room);
      return NextResponse.json({ ok: true });
    }
    case "deleteContent":
      await deleteContent(a.id, room);
      return NextResponse.json({ ok: true });
    case "createPattern":
      return NextResponse.json({
        ok: true,
        pattern: await createPattern(a.name ?? "", a.submissionIds ?? [], room),
      });
    case "renamePattern":
      await renamePattern(a.id, a.name, room);
      return NextResponse.json({ ok: true });
    case "reorderPatterns":
      await reorderPatterns(a.orderedIds ?? [], room);
      return NextResponse.json({ ok: true });
    case "deletePattern":
      await deletePattern(a.id, room);
      return NextResponse.json({ ok: true });
    case "updateSubmission": {
      const patch: Record<string, unknown> = {};
      for (const k of ["text", "tag"]) if (k in a) patch[k] = a[k];
      await updateSubmission(a.id, patch, room);
      return NextResponse.json({ ok: true });
    }
    case "deleteSubmission":
      await deleteSubmission(a.id, room);
      return NextResponse.json({ ok: true });
    case "reassign":
      await reassign(a.token, a.kind, a.value ?? null, room);
      return NextResponse.json({ ok: true });
    case "readaroundNext": {
      const state = await getState(room);
      const dir = a.dir === -1 ? -1 : 1;
      return NextResponse.json({
        ok: true,
        state: await navState(
          room,
          await setReadaroundIndex(state.readaroundIndex + dir, room),
          role ?? "facilitator",
        ),
      });
    }
    case "cluster": {
      const res = await suggestClusters(room);
      if (!res.ok)
        return NextResponse.json({ error: "Cluster failed" }, { status: res.status });
      return NextResponse.json({ clusters: res.clusters });
    }
    case "moduleAction": {
      // Dispatch a module action with the host's resolved role, so modules can
      // gate facilitator-only actions (generate, promote, nextRound, …) on role.
      const result = await dispatchAction(
        room,
        {
          type: String(a.actionType ?? ""),
          payload: (a.payload ?? {}) as Record<string, unknown>,
          token: "__host__",
        },
        role ?? "facilitator",
      );
      return NextResponse.json(
        { ok: result.ok, reason: result.reason },
        { status: result.status },
      );
    }
    case "actionItem": {
      const op = a.op as ActionItemOp | undefined;
      if (!op || typeof op.kind !== "string")
        return NextResponse.json({ ok: false, reason: "bad op" });
      const written = await mutateActionItems(op, room);
      return NextResponse.json({
        ok: true,
        state: await navState(room, written, role ?? "facilitator"),
      });
    }
    case "nudgeRoom": {
      const phaseId = String(a.phaseId ?? "");
      const fs = await getFacilitatorState(room);
      if (fs.phaseId !== phaseId)
        return NextResponse.json({ ok: false, reason: "not the active phase" });
      if ((fs.config as { nudgeable?: boolean } | null)?.nudgeable === false)
        return NextResponse.json({ ok: false, reason: "not nudgeable" });
      const fresh = await tryNudge(phaseId, room);
      if (!fresh) return NextResponse.json({ ok: true, alreadyNudged: true });
      const nudged = Math.max(
        0,
        (fs.participation?.present ?? 0) - (fs.participation?.responded ?? 0),
      );
      return NextResponse.json({
        ok: true,
        nudged,
        state: await navState(room, await getState(room), role ?? "facilitator"),
      });
    }
    case "buildReport": {
      // F1 — build the client-ready report from the LIVE session, no wipe.
      const archive = await buildReport(room);
      return NextResponse.json({ ok: true, archive });
    }
    case "archive": {
      // Build the durable archive (AI report), then publish the take-away (reuses
      // that report) which also wipes the live data.
      const archive = await archiveRoom(room);
      await publishTakeaway(room);
      return NextResponse.json({ ok: true, archive });
    }
    case "end": {
      // F3 — publish a take-away by default, then wipe (publishTakeaway does both).
      await publishTakeaway(room);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }
}
