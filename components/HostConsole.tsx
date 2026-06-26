"use client";

import { useCallback, useEffect, useState } from "react";
import { usePolledState } from "@/components/usePolledState";
import { TourCoach } from "@/components/TourCoach";
import { ParticipationSignal } from "@/lib/modules/render-kit";
import { bootToken, clearToken } from "@/lib/magicLink";
import { Countdown } from "@/components/Countdown";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Button, InlineEdit, Modal } from "@/components/ui";
import { getClientRenderer } from "@/lib/modules/registry.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MODES, STARTER_LIBRARY } from "@/lib/modes";
import { TEMPLATES } from "@/lib/templates";
import type {
  ContentType,
  FacilitatorState,
  ModuleKind,
  ModeId,
  Role,
} from "@/lib/types";

// Modules whose live results the facilitator should see on their own console
// (rendered with the same projector renderer the room sees).
const RESULT_MODULES: ModuleKind[] = [
  "poll",
  "dotvote",
  "rank",
  "scale",
  "wordcloud",
  "qna",
  "matrix",
  // Fleet modules with a projector view but no dedicated facilitator surface.
  "brainwrite",
  "marketplace",
  "redistribute",
  "spectrogram",
  "gradient",
  "lightning",
  "fishbowl",
  "openspace",
  "consult",
];

const PHASE_NA = "—";
const CONTENT_TYPES: ContentType[] = ["case", "lens", "prompt", "argument", "note"];

// Command dispatcher → POST {apiBase}/host { command, code, ...args }.
type Cmd = (command: string, args?: Record<string, unknown>) => Promise<Response>;

// Room-scoped facilitator/co-host console. Drives any room via the host
// command API; role (from the state response) gates which controls show.
export function HostConsole({
  apiBase,
  roomName,
}: {
  apiBase: string;
  roomName?: string;
}) {
  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [cmdError, setCmdError] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  type Tab = "run" | "preview" | "content" | "patterns" | "session";
  const [tab, setTab] = useState<Tab>("run");
  const slug = apiBase.replace("/api/r/", "");
  // A2: a Facilitator/Co-host magic link opens already authed — read the `#k=`
  // token (or the tab's remembered one), scrub it from the URL, set the code. No
  // password box. Falls through to the manual passcode screen when absent.
  useEffect(() => {
    const t = bootToken(slug);
    if (t) setCode(t);
  }, [slug]);
  // A3 tour deep-link: `?tour=1` enables the coach; `?code=` carries the demo
  // facilitator passcode so the second gate is skipped — stripped immediately via
  // history.replaceState so the low-value disposable code never lingers in the bar.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tour") === "1") setTour(true);
    const c = url.searchParams.get("code");
    if (c) {
      setCode(c);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const { state, refresh, apply } = usePolledState<FacilitatorState & { role?: Role }>({
    code: code || undefined,
    endpoint: `${apiBase}/state`,
    streamEndpoint: `${apiBase}/stream`,
  });
  // Forget the remembered token once the session is ended/wiped.
  useEffect(() => {
    if (state?.ended) clearToken(slug);
  }, [state?.ended, slug]);

  // Authenticate by the resolved role, not by racing on response shape. While a
  // freshly-entered code's first poll is in flight, state is null → "checking"
  // (no false "wrong passcode" flash).
  const liveRole: Role | undefined = state?.role;
  const isPrivileged =
    liveRole === "admin" || liveRole === "facilitator" || liveRole === "cohost";
  const authed = Boolean(code) && state !== null && isPrivileged;
  const checking = Boolean(code) && state === null;
  const wrongCode = Boolean(code) && state !== null && !isPrivileged;

  // Commands surface failures instead of silently no-op'ing (e.g. a co-host
  // hitting a lead-only control returns 403 — say so).
  const cmd = useCallback<Cmd>(
    async (command, args = {}) => {
      // AI commands (generate/build/suggest) can take many seconds; cap the
      // wait so a hung call surfaces an error instead of freezing the console.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      try {
        const res = await fetch(`${apiBase}/host`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, code, ...args }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setCmdError(d.error ?? "That action didn't go through.");
          setTimeout(() => setCmdError(null), 4000);
        } else {
          // Nav commands return the FULL authoritative state (built from the
          // just-written state, no read-back). Apply it directly so the change
          // shows instantly and a later stale read can't revert it — correct
          // even on an eventually-consistent store. Other commands just re-poll.
          const d = await res.clone().json().catch(() => null);
          if (d?.state && typeof d.state.rev === "number") apply(d.state);
          else refresh();
        }
        return res;
      } catch {
        setCmdError("That took too long or the connection dropped — try again.");
        setTimeout(() => setCmdError(null), 4000);
        return new Response(null, { status: 599 });
      } finally {
        clearTimeout(timer);
      }
    },
    [apiBase, code, refresh, apply],
  );

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-xl font-semibold">{roomName ?? "Host console"}</h1>
        <p className="text-sm text-muted">Enter your passcode (facilitator or co-host).</p>
        <input
          type="password"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setCode(codeInput)}
          placeholder="Passcode"
          className="rounded-xl border border-border bg-surface px-4 py-3 focus:border-accent focus:outline-none"
        />
        <Button onClick={() => setCode(codeInput)} disabled={checking}>
          {checking ? "Checking…" : "Enter"}
        </Button>
        {wrongCode && (
          <p className="text-sm text-[#ff8a8a]">
            That code or link didn&apos;t work — it may have been reset. Ask the
            organiser for a fresh link.
          </p>
        )}
      </main>
    );
  }

  const s = state as FacilitatorState & { role?: Role };
  const role: Role = s.role ?? "facilitator";

  // The coach is mounted in EVERY authed branch (incl. the post-end ModeSelector
  // path) so the "End wipes everything" beat still resolves after the wipe. It
  // reads the rev-guarded `s` the console already applies — never a /state refetch.
  const coach = tour ? (
    <TourCoach
      surface="host"
      roomState={{
        phaseId: s.phaseId,
        ended: Boolean(s.ended),
        rev: s.rev ?? 0,
        patternsCount: s.patterns?.length ?? 0,
      }}
    />
  ) : null;

  // No sequence yet (no mode and no custom phases) → pick a starting point.
  if (!s.mode && (!s.sequence || s.sequence.length === 0))
    return (
      <>
        {coach}
        <ModeSelector cmd={cmd} apiBase={apiBase} />
      </>
    );

  const hasModuleControls =
    Boolean(s.moduleId && getClientRenderer(s.moduleId, "facilitator") && s.view) &&
    !(
      s.moduleId === "capture" &&
      !((s.view?.data as { constraintDeck?: string[] })?.constraintDeck?.length)
    );
  const hasResults = Boolean(s.moduleId && RESULT_MODULES.includes(s.moduleId) && s.view);
  const isAllocate = s.primitive === "allocate" && role !== "cohost";
  const isReadaround = s.primitive === "readaround";
  const isSubmissions = s.primitive === "capture" || s.primitive === "qna";
  const runHasContent =
    hasModuleControls || hasResults || isAllocate || isReadaround || isSubmissions;

  // Patterns is only meaningful when a phase consumes curated patterns (a
  // read-around sourced from patterns) or some already exist — otherwise the tab
  // is just noise, so hide it.
  const showPatterns = s.usesPatterns || (s.patterns?.length ?? 0) > 0;
  const TABS: { id: Tab; label: string; show: boolean }[] = [
    { id: "run", label: "Run", show: true },
    { id: "preview", label: "What they see", show: true },
    { id: "content", label: "Content", show: true },
    { id: "patterns", label: "Patterns", show: showPatterns },
    { id: "session", label: "Session", show: role !== "cohost" },
  ];
  // Never strand the user on a tab that's now hidden.
  const activeTab: Tab = TABS.some((t) => t.id === tab && t.show) ? tab : "run";

  return (
    <main className="mx-auto w-full max-w-2xl pb-24 lg:max-w-5xl">
      {coach}
      <div className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur">
        <SessionHeader state={s} cmd={cmd} role={role} />
        <PhaseStepper state={s} cmd={cmd} />
        <div className="flex gap-1 overflow-x-auto px-2">
          {TABS.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              data-tour-id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                activeTab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-white/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {cmdError && (
        <div className="bg-[#5a2a2a] px-4 py-2 text-center text-sm text-[#ffd7d7]">
          {cmdError}
        </div>
      )}

      <div className="flex flex-col gap-6 p-4">
        {activeTab === "run" && (
          <div className="lg:grid lg:grid-cols-[1fr_minmax(320px,380px)] lg:items-start lg:gap-6">
            <div className="flex flex-col gap-6">
              {/* C2 — read the room: "N of M responded" on every gather phase. */}
              {s.participation && (
                <ParticipationSignal s={s.participation} />
              )}
              {role === "cohost" && (
                <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                  Co-host mode — you can drive the room, but ending, reconfiguring,
                  and reassigning are reserved for the lead facilitator.
                </p>
              )}
              {hasModuleControls && (
                <ModuleControlPanel state={s} cmd={cmd} apiBase={apiBase} code={code} />
              )}
              {hasResults && <ResultsPanel state={s} />}
              {isAllocate && <AllocationsPanel state={s} cmd={cmd} />}
              {isReadaround && <ReadAroundControls state={s} cmd={cmd} />}
              {isSubmissions && <SubmissionsPanel state={s} cmd={cmd} />}
              {!runHasContent && (
                <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
                  Nothing to drive in this phase — it’s display-only for the room.
                  Use <span className="text-accent">Advance</span> above when you’re
                  ready, or the <span className="text-accent">What they see</span>{" "}
                  tab to preview it.
                </div>
              )}
            </div>
            {/* Desktop: a live preview rail so you drive AND watch the room at once. */}
            <aside className="hidden lg:sticky lg:top-44 lg:block lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                What they see (live)
              </p>
              <PreviewPanel state={s} />
            </aside>
          </div>
        )}
        {activeTab === "preview" && <PreviewPanel state={s} />}
        {activeTab === "content" && <InjectPanel state={s} cmd={cmd} />}
        {activeTab === "patterns" && <PatternPanel state={s} cmd={cmd} />}
        {activeTab === "session" && role !== "cohost" && (
          <SessionControls state={s} cmd={cmd} />
        )}
      </div>
    </main>
  );
}

// What participants (and the projector) see for the current phase, read-only —
// so the facilitator is never guessing what's on the room's screens.
function PreviewPanel({ state }: { state: FacilitatorState }) {
  const P = state.moduleId ? getClientRenderer(state.moduleId, "participant") : null;
  const J = state.moduleId ? getClientRenderer(state.moduleId, "projector") : null;
  const noop = async () => false;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          On participants’ phones
        </p>
        <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-border bg-bg">
          {P && state.view ? (
            // transform-gpu makes this box the containing block, so the participant
            // renderer's `fixed` submit bar stays INSIDE the phone frame instead of
            // floating over the whole host screen.
            <div className="pointer-events-none relative max-h-[460px] transform-gpu overflow-y-auto">
              <ErrorBoundary
                label={`preview-participant:${state.moduleId}`}
                resetKey={state.phaseId ?? ""}
                fallback={<p className="p-4 text-sm text-muted">Preview unavailable.</p>}
              >
                <P view={state.view.data} token="" handle="" phaseId={state.phaseId ?? ""} act={noop} />
              </ErrorBoundary>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">
              Participants have no interactive screen in this phase.
            </p>
          )}
        </div>
      </div>
      {J && state.view && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            On the projector
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-bg text-sm [&_*]:!text-sm">
            <div className="pointer-events-none relative max-h-[360px] transform-gpu overflow-y-auto">
              <ErrorBoundary
                label={`preview-projector:${state.moduleId}`}
                resetKey={state.phaseId ?? ""}
                fallback={<p className="p-4 text-sm text-muted">Preview unavailable.</p>}
              >
                <J view={state.view.data} token="" handle="" phaseId={state.phaseId ?? ""} act={noop} />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Live results for poll/dotvote/rank/scale/wordcloud, rendered with the same
// projector renderer the room sees — so the facilitator is never flying blind
// (especially for reveal-on-advance polls hidden from participants).
function ResultsPanel({ state }: { state: FacilitatorState }) {
  const R = state.moduleId
    ? getClientRenderer(state.moduleId, "projector")
    : null;
  if (!R || !state.view) return null;
  return (
    <Panel title="Live results (what you'd project)">
      <div className="rounded-xl border border-border bg-surface p-2 text-sm [&_*]:!text-base">
        <ErrorBoundary
          label={`results:${state.moduleId}`}
          resetKey={state.phaseId ?? ""}
          fallback={<p className="text-sm text-muted">Results unavailable for this phase.</p>}
        >
          <R
            view={state.view.data}
            token=""
            handle=""
            phaseId={state.phaseId ?? ""}
            act={async () => false}
          />
        </ErrorBoundary>
      </div>
    </Panel>
  );
}

// Facilitator-facing surface for modules that have one (AI generate/promote,
// needs/equity dashboards). The module's facilitator renderer drives its own
// buttons; `act` routes them through the host `moduleAction` command, which
// dispatches to the module with the host's resolved role.
function ModuleControlPanel({
  state,
  cmd,
  apiBase,
  code,
}: {
  state: FacilitatorState;
  cmd: Cmd;
  apiBase: string;
  code: string;
}) {
  const R = state.moduleId
    ? getClientRenderer(state.moduleId, "facilitator")
    : null;
  if (!R || !state.view) return null;
  const act = async (action: { type: string; payload?: Record<string, unknown> }) => {
    const res = await cmd("moduleAction", {
      actionType: action.type,
      payload: action.payload ?? {},
    });
    return res.ok;
  };
  // Authenticated file upload for modules that need it (e.g. media slides). Goes
  // to the room-scoped Blob endpoint, gated by the facilitator's own passcode.
  const upload = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(
        `${apiBase}/upload?code=${encodeURIComponent(code)}`,
        { method: "POST", body: fd },
      );
      if (!res.ok) return null;
      const j = (await res.json()) as { url?: string };
      return j.url ?? null;
    } catch {
      return null;
    }
  };
  return (
    <Panel title="Module controls">
      <div className="rounded-xl border border-border bg-surface p-3">
        <ErrorBoundary
          label={`controls:${state.moduleId}`}
          resetKey={state.phaseId ?? ""}
          fallback={
            <p className="text-sm text-muted">
              This phase&apos;s controls hit a snag — use Advance above to move on.
            </p>
          }
        >
          <R
            view={state.view.data}
            token="__host__"
            handle=""
            phaseId={state.phaseId ?? ""}
            act={act}
            upload={upload}
          />
        </ErrorBoundary>
      </div>
    </Panel>
  );
}

function ModeSelector({ cmd, apiBase }: { cmd: Cmd; apiBase: string }) {
  // apiBase is "/api/r/{slug}"; the builder lives at "/r/{slug}/build".
  const slug = apiBase.replace("/api/r/", "");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6 lg:max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Pick a session mode</h1>
      <p className="text-sm text-muted">
        Participants see the lobby until you pick one. Or build a custom session
        from any modules.
      </p>
      {Object.values(MODES).map((m) => (
        <button
          key={m.id}
          onClick={() => cmd("setMode", { mode: m.id as ModeId })}
          className="rounded-xl border border-border bg-surface p-5 text-left transition-colors hover:border-accent"
        >
          <p className="text-lg font-semibold">{m.name}</p>
          <p className="mt-1 text-sm text-muted">{m.description}</p>
        </button>
      ))}

      <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted">
        Research-grounded templates
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => cmd("setTemplate", { templateId: t.id })}
            className="rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-accent"
          >
            <p className="text-base font-semibold">{t.name}</p>
            <p className="mt-1 text-xs text-muted">{t.description}</p>
          </button>
        ))}
      </div>

      <a
        href={`/r/${slug}/build`}
        className="rounded-xl border border-dashed border-accent p-5 text-center text-accent"
      >
        + Build a custom session
      </a>
    </main>
  );
}

// Top of the console: where you are (session · phase x/y · current label),
// the live count + timer, and the timer controls — separated from navigation.
function SessionHeader({
  state,
  cmd,
  role,
}: {
  state: FacilitatorState;
  cmd: Cmd;
  role: Role;
}) {
  const phases = state.sequence ?? [];
  const idx = phases.findIndex((p) => p.id === state.phaseId);
  const preset = state.config?.timerSeconds;
  const seqName = state.modeName ?? "Session";
  const timer = (sec: number | null) =>
    cmd("setTimer", { endsAt: sec === null ? null : Date.now() + sec * 1000 });

  return (
    <div className="px-4 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs uppercase tracking-wide text-muted">
            {seqName} · phase {idx + 1} of {phases.length}
            {role === "cohost" ? " · co-host" : ""}
          </p>
          <p className="truncate text-lg font-semibold">
            {state.config?.label ?? PHASE_NA}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted">
            {state.participantCount} joined ·{" "}
            <a
              href="/help?doc=facilitator-guide"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              📖 Guide
            </a>
          </p>
          <p className="font-mono text-2xl leading-none text-accent">
            <Countdown endsAt={state.timerEndsAt} />
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Timer:</span>
        {preset && (
          <button className="rounded border border-border px-2 py-1 hover:border-accent" onClick={() => timer(preset)}>
            ▶ {Math.round(preset / 60)}:00
          </button>
        )}
        <button className="rounded border border-border px-2 py-1 hover:border-accent" onClick={() => timer(60)}>
          +1:00
        </button>
        <button className="rounded border border-border px-2 py-1 hover:border-accent" onClick={() => timer(300)}>
          +5:00
        </button>
        <button className="rounded border border-border px-2 py-1 text-muted hover:border-accent" onClick={() => timer(null)}>
          Clear
        </button>
      </div>
    </div>
  );
}

// A clickable timeline of the whole sequence — see where you are at a glance,
// step Back/Advance, or jump to any phase.
function PhaseStepper({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const phases = state.sequence ?? [];
  const idx = phases.findIndex((p) => p.id === state.phaseId);
  const prev = idx > 0 ? phases[idx - 1] : null;
  const next = idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : null;
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-2">
        <button
          disabled={!prev}
          onClick={() => prev && cmd("setPhase", { phaseId: prev.id })}
          className="shrink-0 rounded-lg border border-border px-2 py-2 text-sm disabled:opacity-30"
          aria-label="Previous phase"
        >
          ←
        </button>
        <div className="flex flex-1 gap-1 overflow-x-auto py-1">
          {phases.map((p, i) => {
            const done = idx >= 0 && i < idx;
            const current = i === idx;
            return (
              <button
                key={p.id}
                onClick={() => cmd("setPhase", { phaseId: p.id })}
                title={p.label}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                  current
                    ? "border-accent bg-accent/15 text-accent"
                    : done
                      ? "border-border bg-surface text-muted"
                      : "border-border text-muted hover:border-accent"
                }`}
              >
                <span className="opacity-60">{i + 1}</span>
                <span className="max-w-[9rem] truncate">{p.label}</span>
              </button>
            );
          })}
        </div>
        <button
          data-tour-id="advance"
          disabled={!next}
          onClick={() => next && cmd("setPhase", { phaseId: next.id })}
          className="shrink-0 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm font-medium text-accent disabled:opacity-30"
        >
          Advance →
        </button>
      </div>
    </div>
  );
}

function InjectPanel({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ContentType>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Content is only seen by the room during a phase that DISPLAYS content — a
  // "Content display" phase, or a module configured to show reference material.
  // Outside those, pushed content stays hidden. Surfacing this is the whole
  // point: it's the thing facilitators can't otherwise tell.
  const cfg = state.config as { showContentTypes?: unknown[] } | null;
  const isContentPhase = state.moduleId === "content";
  const phaseShowsReference = Array.isArray(cfg?.showContentTypes);
  const phaseShowsContent = isContentPhase || phaseShowsReference;
  const phaseLabel = (state.config?.label as string) ?? state.moduleId ?? "this phase";

  async function push(target: "now" | "queue" | "hold") {
    if (!title.trim() && !body.trim()) return;
    await cmd("addContent", { type, title, body, target });
    setTitle("");
    setBody("");
    setOpen(false);
  }
  async function loadStarter() {
    for (const it of STARTER_LIBRARY[state.mode as ModeId] ?? [])
      await cmd("addContent", { type: it.type, title: it.title, body: it.body, target: "hold" });
  }

  return (
    <Panel title="Room content">
      <p className="text-xs leading-relaxed text-muted">
        Share reference material — a prompt, a case, a note — onto the room&apos;s
        screens (participants&apos; phones and the projector). It only appears
        during a phase that <em>displays</em> content; in other phases it stays
        hidden until you show it.
      </p>

      {/* Will what I push right now actually be seen? The crux of the confusion. */}
      <div
        className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${
          phaseShowsContent
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-[#5a4a2a] bg-[#5a4a2a]/20 text-[#ffd9a0]"
        }`}
      >
        {isContentPhase ? (
          <>✓ &ldquo;{phaseLabel}&rdquo; is a content phase — anything you <b>show now</b> appears on the room&apos;s screens immediately.</>
        ) : phaseShowsReference ? (
          <>✓ &ldquo;{phaseLabel}&rdquo; shows reference material — pushed items appear as reference alongside the activity.</>
        ) : (
          <>⚠ &ldquo;{phaseLabel}&rdquo; doesn&apos;t display content, so pushing now won&apos;t be visible to anyone yet. <b>Queue</b> it for the next phase, or <b>hold</b> it — then show it once you reach a Content phase.</>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add content"}</Button>
        <Button variant="ghost" onClick={loadStarter}>
          Load starter library
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-lg border px-3 py-1 text-xs capitalize ${
                  type === t ? "border-accent text-accent" : "border-border text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <VoiceTextarea value={body} onChange={setBody} placeholder="Body (type or dictate)…" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => push("now")}>Show now</Button>
            <Button variant="ghost" onClick={() => push("queue")}>
              Queue for next phase
            </Button>
            <Button variant="ghost" onClick={() => push("hold")}>
              Hold (private)
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            <b>Show now</b> — goes live this phase (only visible if this phase
            displays content). <b>Queue</b> — appears automatically when you
            advance to the next phase. <b>Hold</b> — saved to the list below,
            shown to no one until you press <em>show</em>.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {state.allContent.length === 0 ? (
          <Empty>No content yet.</Empty>
        ) : (
          state.allContent
            .slice()
            .sort((a, b) => a.addedAt - b.addedAt)
            .map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {c.type}
                    {c.queued ? " · queued" : c.visible ? " · live" : " · held"}
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button
                      className="text-accent underline"
                      onClick={() =>
                        cmd("updateContent", { id: c.id, visible: !c.visible, queued: false })
                      }
                    >
                      {c.visible ? "hide" : "push"}
                    </button>
                    <InlineEdit
                      value={c.body}
                      onSave={(body) => cmd("updateContent", { id: c.id, body })}
                    />
                    <button
                      className="text-[#ff8a8a] underline"
                      onClick={() => cmd("deleteContent", { id: c.id })}
                    >
                      delete
                    </button>
                  </div>
                </div>
                {c.title && c.title !== "(untitled)" && (
                  <p className="mt-1 text-sm font-medium">{c.title}</p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                  {c.body.slice(0, 160)}
                  {c.body.length > 160 ? "…" : ""}
                </p>
              </div>
            ))
        )}
      </div>
    </Panel>
  );
}

function AllocationsPanel({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const alloc = state.config?.allocate;
  if (!alloc) return null;
  const kind = alloc.kind;
  const options = alloc.fixedOptions
    ? alloc.fixedOptions
    : state.visibleContent
        .filter((c) => c.type === alloc.optionsFromContentType)
        .map((c) => c.title);
  return (
    <Panel title="Allocations (live)">
      {state.participants.length === 0 && <Empty>No participants yet.</Empty>}
      {state.participants.map((p) => {
        const cur = kind === "lens" ? p.lens : p.side;
        return (
          <div
            key={p.token}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <span className="text-sm">{p.handle}</span>
            <select
              value={cur ?? ""}
              onChange={(e) =>
                cmd("reassign", { token: p.token, kind, value: e.target.value || null })
              }
              className="rounded-lg border border-border bg-bg px-2 py-1 text-xs"
            >
              <option value="">— none —</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o} ({state.allocation?.counts[o] ?? 0})
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </Panel>
  );
}

function ReadAroundControls({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const ra = state.readaround;
  return (
    <Panel title="Read-around">
      <p className="text-xs text-muted">
        {ra && ra.total > 0
          ? `Showing ${ra.index + 1} of ${ra.total} on participant phones.`
          : "Nothing to show yet."}
      </p>
      {ra?.item && (
        <div className="rounded-lg border border-accent bg-accent/10 p-3 text-sm">
          {ra.item.tag && <span className="mr-2 text-xs text-muted">{ra.item.tag}</span>}
          {ra.item.text}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => cmd("readaroundNext", { dir: -1 })}>
          ← Previous
        </Button>
        <Button onClick={() => cmd("readaroundNext", { dir: 1 })}>Push next →</Button>
      </div>
    </Panel>
  );
}

function SubmissionsPanel({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const subs = state.submissions
    .filter((s) => s.phaseId === state.phaseId)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Panel title={`Raw submissions (${subs.length})`}>
      {subs.length === 0 ? (
        <Empty>No submissions in this phase yet.</Empty>
      ) : (
        subs.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {s.handle}
                {s.tag ? ` · ${s.tag}` : ""}
              </span>
              <span>{new Date(s.createdAt).toLocaleTimeString()}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{s.text}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <InlineEdit
                value={s.text}
                onSave={(text) => cmd("updateSubmission", { id: s.id, text })}
              />
              <button
                className="text-[#ff8a8a] underline"
                onClick={() => cmd("deleteSubmission", { id: s.id })}
              >
                delete
              </button>
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

function PatternPanel({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { name: string; submissionIds: string[] }[] | null
  >(null);
  const [noClusters, setNoClusters] = useState(false);
  const ordered = state.patterns;

  function move(index: number, dir: -1 | 1) {
    const arr = [...ordered];
    const t = index + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[index], arr[t]] = [arr[t], arr[index]];
    cmd("reorderPatterns", { orderedIds: arr.map((p) => p.id) });
  }
  async function suggest() {
    setBusy(true);
    setNoClusters(false);
    try {
      const res = await cmd("cluster");
      const data = await res.json();
      const clusters: { name: string; submissionIds: string[] }[] = data.clusters ?? [];
      if (clusters.length === 0) setNoClusters(true);
      else setSuggestions(clusters);
    } finally {
      setBusy(false);
    }
  }
  async function acceptSuggestions() {
    if (!suggestions) return;
    for (const c of suggestions)
      await cmd("createPattern", { name: c.name, submissionIds: c.submissionIds });
    setSuggestions(null);
  }

  return (
    <Panel title="Patterns (curated)">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              cmd("createPattern", { name });
              setName("");
            }
          }}
          placeholder="New pattern name (≤5 words)"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <Button
          onClick={() => {
            if (name.trim()) {
              cmd("createPattern", { name });
              setName("");
            }
          }}
        >
          Add
        </Button>
      </div>
      {state.clusterAssistAvailable && (
        <Button variant="ghost" onClick={suggest} disabled={busy}>
          {busy ? "Thinking…" : "Suggest patterns from current submissions"}
        </Button>
      )}
      {noClusters && <Empty>No clusters suggested yet — collect more notes first.</Empty>}
      {suggestions && (
        <Modal title="Suggested patterns" onClose={() => setSuggestions(null)}>
          <ul className="space-y-1 text-sm">
            {suggestions.map((c, i) => (
              <li key={i}>
                • {c.name}{" "}
                <span className="text-muted">({c.submissionIds.length})</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button onClick={acceptSuggestions}>Create these</Button>
            <Button variant="ghost" onClick={() => setSuggestions(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
      {ordered.length === 0 ? (
        <Empty>No patterns yet.</Empty>
      ) : (
        ordered.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <div className="flex flex-col">
              <button className="text-muted disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>
                ▲
              </button>
              <button
                className="text-muted disabled:opacity-20"
                disabled={i === ordered.length - 1}
                onClick={() => move(i, 1)}
              >
                ▼
              </button>
            </div>
            <p className="flex-1 text-sm font-medium">{p.name}</p>
            <InlineEdit
              value={p.name}
              multiline={false}
              label="rename"
              onSave={(name) => name.trim() && cmd("renamePattern", { id: p.id, name })}
            />
            <button
              className="text-xs text-[#ff8a8a] underline"
              onClick={() => cmd("deletePattern", { id: p.id })}
            >
              delete
            </button>
          </div>
        ))
      )}
    </Panel>
  );
}

function SessionControls({ state, cmd }: { state: FacilitatorState; cmd: Cmd }) {
  function exportJson() {
    const data = {
      mode: state.mode,
      exportedAt: new Date().toISOString(),
      patterns: state.patterns.map((p) => p.name),
      injectedContent: state.allContent.map((c) => ({ type: c.type, title: c.title, body: c.body })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edges-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const [confirming, setConfirming] = useState<"end" | "archive" | null>(null);
  return (
    <Panel title="Session controls">
      <Button variant="ghost" onClick={exportJson}>
        Download export
      </Button>
      <Button variant="ghost" onClick={() => setConfirming("archive")}>
        Archive (save report + wipe)
      </Button>
      <Button
        variant="danger"
        data-tour-id="end-session"
        onClick={() => setConfirming("end")}
      >
        End session
      </Button>
      {confirming && (
        <Modal
          title={confirming === "end" ? "End session?" : "Archive session?"}
          onClose={() => setConfirming(null)}
        >
          <p className="text-sm text-muted">
            {confirming === "end"
              ? "This permanently deletes all submissions, content, patterns, and allocations. It cannot be undone."
              : "This saves a report (patterns + injected content) for the admin, then wipes the live session data."}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant={confirming === "end" ? "danger" : "primary"}
              onClick={() => {
                cmd(confirming);
                setConfirming(null);
              }}
            >
              {confirming === "end" ? "End and wipe" : "Archive and wipe"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
