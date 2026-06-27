import { NextRequest, NextResponse } from "next/server";
import { archiveRoom, buildReport, checkSuperAdmin, editReport, getRoom, previewTakeaway, publishTakeaway, regenerateReport, saveBlueprint, setReportMeta } from "@/lib/rooms";
import {
  deleteDesign,
  getDesign,
  renameDesign,
  saveDesign,
  validatePhases,
} from "@/lib/userTemplates";
import { decodeDesign, encodeDesign } from "@/lib/design-share";
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
  setAmbient,
  setCofac,
  dismissCofac,
  placeLatecomer,
  holdLatecomer,
  setDriver,
  setLobbyCue,
  setProjectorA11y,
  setMode,
  setSpotlight,
  resumeAmbient,
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

// F3 — the action-item ids the host chose to leave out of the take-away.
function excludeOf(a: Record<string, any>): string[] {
  return Array.isArray(a.excludeActionItems)
    ? (a.excludeActionItems as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
}

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
  // B4 — user templates. Launching a saved design is a normal nav move (advance);
  // writing to the SHARED library (save/delete) needs `configure` AND, because the
  // library is global, an extra super-admin check inside the handler.
  setDesign: "advance",
  saveDesign: "configure",
  deleteDesign: "configure",
  renameDesign: "configure",
  // B4 — share envelope. Exporting + previewing an import is a read move (any
  // host); committing an import to the shared library writes globally → configure
  // + super-admin (checked in-handler).
  exportDesign: "advance",
  previewImport: "advance",
  importDesign: "configure",
  // C5 — the driving baton is a soft nav-tier signal (cohost can claim/hand off).
  claimDriver: "advance",
  handoffDriver: "advance",
  releaseDriver: "advance",
  // E3 — a calm break/hold is a live nav move (facilitator + cohost), NOT the
  // admin-only configure (it never touches the stored phase sequence).
  setAmbient: "advance",
  resumeAmbient: "advance",
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
  // E1 — author the front-of-room lobby (begin-cue + count visibility). A soft
  // pre-launch control on the same tier as the clock (cohost can set it).
  setLobbyCue: "timer",
  // D2 — toggle the projector's high-contrast mode (a display control, timer-tier).
  setProjectorA11y: "timer",
  // C7 — the lead's co-facilitator off-switch + sensitivity is a room-setup
  // control (admin-only configure tier). Dismissing a live nudge is a nav-tier
  // move (cohost can dismiss).
  cofacToggle: "configure",
  cofacDismiss: "advance",
  // D4 — place / hold latecomers under the hold policy. A live nav-tier move
  // (facilitator + cohost can seat a waiting latecomer).
  placeLatecomer: "advance",
  holdLatecomer: "advance",
  // F1 — build a client-ready report mid-session (no wipe). Facilitator + admin,
  // not cohost; never the admin-only `configure` cap.
  buildReport: "end",
  // F3 — preview/curate the participant take-away before the irreversible publish.
  previewTakeaway: "end",
  // F1 — curate the report before sharing (facilitator/admin, like buildReport).
  editReport: "end",
  setReportMeta: "end",
  regenerateReport: "end",
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
      const sessionName = a.sessionName ?? "Custom session";
      const written = await setPhases(phases, sessionName, room);
      // A5 — mirror the launched design into a durable blueprint so it survives
      // the 24h wipe and can be duplicated. Only on the admin setPhases path (a
      // cohost-driven setTemplate must NOT write durable records).
      await saveBlueprint(room, { name: sessionName, phases }).catch(() => {});
      return NextResponse.json({
        ok: true,
        state: await navState(room, written, role ?? "facilitator"),
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
    // B4 — launch a saved user template by id (no raw phases accepted here).
    case "setDesign": {
      const d = await getDesign(String(a.id ?? ""));
      if (!d)
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
      const written = await setPhases(d.phases, d.name, room);
      await saveBlueprint(room, { name: d.name, phases: d.phases }).catch(() => {});
      return NextResponse.json({
        ok: true,
        state: await navState(room, written, role ?? "facilitator"),
      });
    }
    // B4 — save the builder's current design to the SHARED library. The global
    // scope needs the super-admin code (not just a per-room admin), or one room's
    // admin could pollute every room's library.
    case "saveDesign": {
      // B4 — a GLOBAL (shared-library) save needs the super-admin code; a
      // ROOM-scoped save is private to this room, so the room's `configure` tier
      // (already required by COMMAND_CAP) suffices.
      const scope = a.scope === "room" ? "room" : "global";
      if (scope === "global" && !checkSuperAdmin(a.code))
        return NextResponse.json(
          { error: "Saving to the shared library needs the admin passcode." },
          { status: 403 },
        );
      const res = await saveDesign(String(a.name ?? ""), a.phases, {
        scope,
        roomSlug: scope === "room" ? room : undefined,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, id: res.id });
    }
    case "deleteDesign": {
      if (!checkSuperAdmin(a.code))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const ok = await deleteDesign(String(a.id ?? ""));
      return NextResponse.json({ ok });
    }
    // A5 — rename a saved workshop in the shared library (global → super-admin).
    case "renameDesign": {
      if (!checkSuperAdmin(a.code))
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const ok = await renameDesign(String(a.id ?? ""), String(a.name ?? ""));
      return NextResponse.json({ ok });
    }
    // B4 — export a saved design as a portable, checksummed share code.
    case "exportDesign": {
      const d = await getDesign(String(a.id ?? ""));
      if (!d) return NextResponse.json({ error: "Unknown design" }, { status: 404 });
      const code = encodeDesign({
        name: d.name,
        phases: d.phases,
        meta: { origin: typeof a.origin === "string" ? a.origin.slice(0, 80) : undefined },
      });
      return NextResponse.json({ ok: true, code, name: d.name });
    }
    // B4 — decode + zod-revalidate a share code WITHOUT saving (read-only preview).
    case "previewImport": {
      const dec = decodeDesign(String(a.shareCode ?? ""));
      if (!dec.ok) return NextResponse.json({ ok: false, error: dec.error }, { status: 400 });
      const v = validatePhases(dec.phases);
      if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
      return NextResponse.json({
        ok: true,
        name: dec.name,
        meta: dec.meta ?? null,
        phases: v.phases.map((p) => ({ id: p.id, moduleId: p.moduleId, label: (p.config.label as string) ?? p.moduleId })),
      });
    }
    // B4 — commit an imported design to the shared library (global → super-admin).
    case "importDesign": {
      if (!checkSuperAdmin(a.code))
        return NextResponse.json(
          { error: "Importing to the shared library needs the admin passcode." },
          { status: 403 },
        );
      const dec = decodeDesign(String(a.shareCode ?? ""));
      if (!dec.ok) return NextResponse.json({ ok: false, error: dec.error }, { status: 400 });
      // saveDesign re-validates every phase against its module schema (the security
      // gate), rebuilding each as exactly {id, moduleId, config}.
      const res = await saveDesign(dec.name, dec.phases);
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, id: res.id, name: dec.name });
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
      // C5 — a take-over Advance claims the baton in the same write as the move.
      const claimDriver =
        typeof a.claimDriverId === "string" && a.claimDriverId
          ? {
              driverId: a.claimDriverId,
              driverName: typeof a.claimDriverName === "string" ? a.claimDriverName : "",
              claimedAt: Date.now(),
            }
          : undefined;
      const written = await setPhase(target, room, { release: forward, claimDriver });
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
        // C4 — opt-in attribution: a literal spotlight carries a name ONLY when the
        // host explicitly passes a non-empty handle (the UI offers this solely for a
        // named, non-anonymous source). Submission spotlights ignore any handle.
        ref = {
          kind: "literal",
          text: a.text,
          handle:
            typeof a.handle === "string" && a.handle.trim()
              ? a.handle.trim().slice(0, 60)
              : null,
        };
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setSpotlight(ref, room), role ?? "facilitator"),
      });
    }
    // E3 — summon / leave a calm ambient break or hold.
    case "setAmbient": {
      // E3 scene engine — accept a `scene`; fall back to the legacy `kind` so old
      // clients (break/hold) keep working.
      const SCENES = ["break", "hold", "breathe", "countdown", "cuecard"] as const;
      const scene = (SCENES as readonly string[]).includes(a.scene)
        ? (a.scene as import("@/lib/types").AmbientScene)
        : a.kind === "hold"
          ? "hold"
          : "break";
      const durationSec = typeof a.durationSec === "number" ? a.durationSec : null;
      const note = typeof a.note === "string" ? a.note : undefined;
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setAmbient(scene, durationSec, note, room), role ?? "facilitator"),
      });
    }
    case "resumeAmbient":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await resumeAmbient(room), role ?? "facilitator"),
      });
    // C5 — claim/hand off/release the driving baton (advisory; controls never block).
    case "claimDriver":
    case "handoffDriver": {
      const driverId = String(a.driverId ?? "");
      if (!driverId) return NextResponse.json({ error: "Missing driverId" }, { status: 400 });
      const driver = {
        driverId,
        driverName: typeof a.driverName === "string" ? a.driverName : "",
        claimedAt: Date.now(),
      };
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setDriver(driver, room), role ?? "facilitator"),
      });
    }
    case "releaseDriver":
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setDriver(null, room), role ?? "facilitator"),
      });
    case "setLobbyCue": {
      // E1 — partial patch: only the provided keys change, so the host can author
      // the cue and toggle the count independently.
      const patch: { cue?: string | null; countVisible?: boolean } = {};
      if ("cue" in a) patch.cue = typeof a.cue === "string" ? a.cue : null;
      if ("countVisible" in a) patch.countVisible = Boolean(a.countVisible);
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setLobbyCue(patch, room), role ?? "facilitator"),
      });
    }
    case "setProjectorA11y": {
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setProjectorA11y(Boolean(a.on), room), role ?? "facilitator"),
      });
    }
    case "cofacToggle": {
      // C7 — partial patch: enable and/or set sensitivity, independently.
      const patch: { enabled?: boolean; sensitivity?: import("@/lib/cofac").CofacSensitivity } = {};
      if ("enabled" in a) patch.enabled = Boolean(a.enabled);
      if (a.sensitivity === "calm" || a.sensitivity === "standard" || a.sensitivity === "keen")
        patch.sensitivity = a.sensitivity;
      return NextResponse.json({
        ok: true,
        state: await navState(room, await setCofac(patch, room), role ?? "facilitator"),
      });
    }
    case "cofacDismiss": {
      const phaseId = String(a.phaseId ?? "");
      const kind = String(a.kind ?? "");
      if (!phaseId || !kind)
        return NextResponse.json({ error: "Missing phaseId/kind" }, { status: 400 });
      return NextResponse.json({
        ok: true,
        state: await navState(room, await dismissCofac(phaseId, kind, room), role ?? "facilitator"),
      });
    }
    case "placeLatecomer":
    case "holdLatecomer": {
      const phaseId = String(a.phaseId ?? "");
      const tokens = Array.isArray(a.tokens)
        ? (a.tokens as unknown[]).filter((t): t is string => typeof t === "string")
        : [];
      if (!phaseId || tokens.length === 0)
        return NextResponse.json({ error: "Missing phaseId/tokens" }, { status: 400 });
      const written =
        command === "placeLatecomer"
          ? await placeLatecomer(phaseId, tokens, room)
          : await holdLatecomer(phaseId, tokens, room);
      return NextResponse.json({
        ok: true,
        state: await navState(room, written, role ?? "facilitator"),
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
    // F1 — inline curation of the built report (edit/drop/reorder/summary).
    case "editReport": {
      const archive = await editReport(room, a.edit as import("@/lib/report-edit").ReportEdit);
      return NextResponse.json({ ok: true, archive });
    }
    case "setReportMeta": {
      const archive = await setReportMeta(room, a.meta);
      return NextResponse.json({ ok: true, archive });
    }
    case "regenerateReport": {
      const archive = await regenerateReport(room);
      return NextResponse.json({ ok: true, archive });
    }
    // F3 — preview the take-away the room will keep, WITHOUT ending the session,
    // so the host can review/curate before the irreversible publish.
    case "previewTakeaway": {
      const exclude = Array.isArray(a.excludeActionItems)
        ? (a.excludeActionItems as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const preview = await previewTakeaway(room, { excludeActionItems: exclude });
      return NextResponse.json({ ok: true, ...preview });
    }
    case "archive": {
      // Build the durable archive (AI report), then publish the take-away (reuses
      // that report) which also wipes the live data.
      const archive = await archiveRoom(room);
      await publishTakeaway(room, { excludeActionItems: excludeOf(a) });
      return NextResponse.json({ ok: true, archive });
    }
    case "end": {
      // F3 — optionally snapshot the durable archive (a report for the admin)
      // BEFORE the wipe, so ending doesn't have to mean losing the record. Then
      // publish the curated take-away, which wipes. archiveRoom never wipes.
      if (a.alsoArchive === true) await archiveRoom(room);
      await publishTakeaway(room, { excludeActionItems: excludeOf(a) });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }
}
