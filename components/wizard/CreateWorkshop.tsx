"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RoomAccessCard } from "@/components/RoomAccessCard";
import {
  EMPTY_THEME,
  ThemePanel,
  themeForPatch,
  themeIsCustom,
  type ThemeDraft,
} from "@/components/admin/ThemePanel";
import { JoinScreenPreview } from "@/components/admin/JoinScreenPreview";
import { TEMPLATES } from "@/lib/templates";
import type { PhaseInstance } from "@/lib/types";

type Step = "name" | "design" | "brand" | "share" | "ready";
const STEPS: { id: Step; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "design", label: "Design" },
  { id: "brand", label: "Brand" },
  { id: "share", label: "Share" },
  { id: "ready", label: "Ready" },
];

interface DesignIntent {
  kind: "ai" | "template" | "blank";
  templateId?: string;
  phases?: PhaseInstance[];
  sessionName?: string;
  label?: string; // human one-liner for the Ready card
}

type ModuleMeta = Record<string, { name: string; description: string }>;

// The create-a-workshop wizard (A1). An in-page state machine: the super-admin
// code stays in React state (never the URL); the durable room is NOT created
// until the Share step, so abandoning leaves nothing behind. Reuses the shipped
// host/admin endpoints — no module-contract changes.
export function CreateWorkshop({
  code,
  onClose,
  onCreated,
}: {
  code: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [intent, setIntent] = useState<DesignIntent>({ kind: "blank" });
  const [brand, setBrand] = useState<ThemeDraft>(EMPTY_THEME);
  const [slug, setSlug] = useState("");
  const [passcodes, setPasscodes] = useState<{
    facilitator: string;
    cohost: string;
    projector: string;
  } | null>(null);

  const [aiAvailable, setAiAvailable] = useState(false);
  const [moduleMeta, setModuleMeta] = useState<ModuleMeta>({});
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const q = `?code=${encodeURIComponent(code)}`;
    fetch(`/api/admin/capabilities${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAiAvailable(Boolean(d.aiAvailable)))
      .catch(() => {});
    fetch(`/api/admin/module-meta${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.meta && setModuleMeta(d.meta))
      .catch(() => {});
  }, [code]);

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const joinUrl = slug ? `${origin}/r/${slug}` : `${origin}/r/your-room`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      {/* progress rail */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                i < stepIdx
                  ? "bg-accent text-bg"
                  : i === stepIdx
                    ? "border border-accent text-accent"
                    : "border border-border text-muted"
              }`}
            >
              {i < stepIdx ? "✓" : i + 1}
            </span>
            <span className={`text-xs ${i === stepIdx ? "text-accent" : "text-muted"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      <ErrorBoundary label="wizard" resetKey={step}>
        {step === "name" && (
          <StepName
            name={name}
            setName={setName}
            topic={topic}
            setTopic={setTopic}
            headcount={headcount}
            setHeadcount={setHeadcount}
            onCancel={onClose}
            onNext={() => setStep("design")}
          />
        )}
        {step === "design" && (
          <StepDesign
            code={code}
            topic={topic}
            headcount={headcount}
            aiAvailable={aiAvailable}
            moduleMeta={moduleMeta}
            slugForBlank={slug}
            onBack={() => setStep("name")}
            onChoose={(it) => {
              setIntent(it);
              setStep("brand");
            }}
          />
        )}
        {step === "brand" && (
          <StepBrand
            code={code}
            brand={brand}
            setBrand={setBrand}
            joinUrl={joinUrl}
            title={name}
            onBack={() => setStep("design")}
            onNext={() => setStep("share")}
          />
        )}
        {step === "share" && (
          <StepShare
            code={code}
            name={name}
            topic={topic}
            intent={intent}
            brand={brand}
            slug={slug}
            setSlug={setSlug}
            passcodes={passcodes}
            setPasscodes={setPasscodes}
            onCreated={onCreated}
            onBack={() => setStep("brand")}
            onNext={() => setStep("ready")}
          />
        )}
        {step === "ready" && (
          <StepReady slug={slug} name={name} code={code} origin={origin} onClose={onClose} />
        )}
      </ErrorBoundary>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl font-semibold tracking-tight">{children}</h2>;
}

// ---- Step 1: Name ---------------------------------------------------------

function StepName({
  name,
  setName,
  topic,
  setTopic,
  headcount,
  setHeadcount,
  onCancel,
  onNext,
}: {
  name: string;
  setName: (v: string) => void;
  topic: string;
  setTopic: (v: string) => void;
  headcount: string;
  setHeadcount: (v: string) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <H>Name your workshop</H>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onNext()}
        placeholder="Workshop name (e.g. Q3 strategy offsite)"
        className="rounded-lg border border-border bg-bg px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
      />
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (optional — grounds the AI + the report)"
        className="rounded-lg border border-border bg-bg px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
      />
      <input
        type="number"
        min={1}
        value={headcount}
        onChange={(e) => setHeadcount(e.target.value)}
        placeholder="Roughly how many people? (optional)"
        className="w-60 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
      />
      <p className="text-xs text-muted">You can change all of this later.</p>
      <div className="flex items-center gap-2">
        <Button onClick={onNext} disabled={!name.trim()}>
          Continue
        </Button>
        <button onClick={onCancel} className="text-xs text-muted underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Step 2: Design -------------------------------------------------------

function StepDesign({
  code,
  topic,
  headcount,
  aiAvailable,
  moduleMeta,
  slugForBlank,
  onBack,
  onChoose,
}: {
  code: string;
  topic: string;
  headcount: string;
  aiAvailable: boolean;
  moduleMeta: ModuleMeta;
  slugForBlank: string;
  onBack: () => void;
  onChoose: (it: DesignIntent) => void;
}) {
  const [lane, setLane] = useState<"ai" | "template" | "blank">(
    aiAvailable ? "ai" : "template",
  );
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState<null | "suggest" | "critique" | "revise">(null);
  const [err, setErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    sessionName: string;
    rationale: string;
    phases: PhaseInstance[];
  } | null>(null);
  const [critique, setCritique] = useState<{ strengths: string[]; issues: string[] } | null>(null);

  async function design(action: "suggest" | "revise") {
    setBusy(action);
    setErr(null);
    setCritique(null);
    try {
      const res = await fetch("/api/admin/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          action,
          goal,
          topic,
          minutes: minutes ? Number(minutes) : undefined,
          headcount: headcount ? Number(headcount) : undefined,
          phases: suggestion?.phases,
          issues: critique?.issues,
        }),
      });
      const d = await res.json();
      if (res.ok && d.suggestion) setSuggestion(d.suggestion);
      else setErr(d.error ?? "Couldn't design a session.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  async function refine() {
    if (!suggestion) return;
    setBusy("critique");
    setErr(null);
    try {
      const res = await fetch("/api/admin/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "critique", phases: suggestion.phases, topic }),
      });
      const d = await res.json();
      if (res.ok && d.critique) setCritique(d.critique);
      else setErr(d.error ?? "Couldn't review.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(null);
    }
  }

  function phaseLine(p: PhaseInstance, i: number): string {
    const nm = moduleMeta[p.moduleId]?.name ?? p.moduleId;
    const label = (p.config as { label?: string })?.label;
    return `${i + 1}. ${nm}${label && label !== nm ? ` — ${label}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <H>Design the session</H>
      <div className="flex gap-2 text-sm">
        {aiAvailable && (
          <LaneTab on={lane === "ai"} onClick={() => setLane("ai")}>
            ✨ Design with AI
          </LaneTab>
        )}
        <LaneTab on={lane === "template"} onClick={() => setLane("template")}>
          Start from a template
        </LaneTab>
        <LaneTab on={lane === "blank"} onClick={() => setLane("blank")}>
          Start blank
        </LaneTab>
      </div>

      {lane === "ai" && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3">
          {!aiAvailable ? (
            <p className="text-sm text-muted">
              AI design is off for this deployment — pick a template instead.
            </p>
          ) : (
            <>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What should the room leave with? e.g. 'decide between 3 roadmap options, with owners'"
                rows={2}
                className="rounded-lg border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                Minutes
                <input
                  type="number"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="60"
                  className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm"
                />
                <span>sizes the agenda.</span>
              </label>
              <Button onClick={() => design("suggest")} disabled={busy !== null || !goal.trim()}>
                {busy === "suggest" ? "Designing…" : "Design it"}
              </Button>

              {busy === "suggest" && (
                <p className="text-sm text-muted">Reading your goal and laying out a calm agenda…</p>
              )}

              {suggestion && busy === null && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                  <p className="text-sm font-medium">{suggestion.sessionName}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {suggestion.phases.map((p, i) => (
                      <li key={i}>{phaseLine(p, i)}</li>
                    ))}
                  </ul>
                  {suggestion.rationale && (
                    <p className="text-xs text-muted">
                      <span className="text-accent">Why:</span> {suggestion.rationale}
                    </p>
                  )}
                  {critique && critique.issues.length > 0 && (
                    <div className="text-xs">
                      <span className="text-[#ffb86b]">To consider:</span>
                      <ul className="ml-4 list-disc text-muted">
                        {critique.issues.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        onChoose({
                          kind: "ai",
                          phases: suggestion.phases,
                          sessionName: suggestion.sessionName,
                          label: suggestion.sessionName,
                        })
                      }
                    >
                      Use this
                    </Button>
                    <Button variant="ghost" onClick={refine} disabled={busy !== null}>
                      {busy === "critique" ? "Reviewing…" : "Review it"}
                    </Button>
                    {critique && critique.issues.length > 0 && (
                      <Button variant="ghost" onClick={() => design("revise")} disabled={busy !== null}>
                        {busy === "revise" ? "Revising…" : "Apply fixes"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {err && <p className="text-xs text-[#ff8a8a]">{err}</p>}
        </div>
      )}

      {lane === "template" && (
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              title={t.description}
              onClick={() => onChoose({ kind: "template", templateId: t.id, label: t.name })}
              className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs hover:border-accent"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {lane === "blank" && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm text-muted">
          <p>
            Start with an empty room and compose phases yourself in the builder.
            You&apos;ll get the builder link on the last step.
          </p>
          <Button onClick={() => onChoose({ kind: "blank", label: "Blank — build it yourself" })}>
            Continue blank
          </Button>
        </div>
      )}

      <button onClick={onBack} className="self-start text-xs text-muted underline">
        ← Back
      </button>
    </div>
  );
}

function LaneTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 ${
        on ? "border-accent text-accent" : "border-border text-muted"
      }`}
    >
      {children}
    </button>
  );
}

// ---- Step 3: Brand --------------------------------------------------------

function StepBrand({
  code,
  brand,
  setBrand,
  joinUrl,
  title,
  onBack,
  onNext,
}: {
  code: string;
  brand: ThemeDraft;
  setBrand: (t: ThemeDraft) => void;
  joinUrl: string;
  title: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <H>Make it yours</H>
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <ThemePanel code={code} value={brand} onChange={setBrand} />
        <div className="md:w-64">
          <JoinScreenPreview theme={brand} joinUrl={joinUrl} title={title} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onNext}>Save &amp; continue</Button>
        <button onClick={() => setBrand(EMPTY_THEME)} className="text-xs text-muted underline">
          Skip branding
        </button>
        <button onClick={onBack} className="ml-auto text-xs text-muted underline">
          ← Back
        </button>
      </div>
    </div>
  );
}

// ---- Step 4: Share (commit) ----------------------------------------------

function StepShare({
  code,
  name,
  topic,
  intent,
  brand,
  slug,
  setSlug,
  passcodes,
  setPasscodes,
  onCreated,
  onBack,
  onNext,
}: {
  code: string;
  name: string;
  topic: string;
  intent: DesignIntent;
  brand: ThemeDraft;
  slug: string;
  setSlug: (s: string) => void;
  passcodes: { facilitator: string; cohost: string; projector: string } | null;
  setPasscodes: (p: { facilitator: string; cohost: string; projector: string }) => void;
  onCreated: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Run the deferred create EXACTLY once — StrictMode double-invokes effects in
  // dev, and a re-render must never mint a second room. The room is created here
  // (not earlier) so abandoning the wizard before Share leaves nothing durable.
  const committed = useRef(false);

  async function host(slugId: string, command: string, args: Record<string, unknown>) {
    const res = await fetch(`/api/r/${slugId}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, code, ...args }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "command failed");
  }

  async function commit() {
    setBusy(true);
    setErr(null);
    try {
      let id = slug;
      // 1. Create the room only now (deferred-create → abandonment leaves nothing).
      if (!id) {
        const cr = await fetch("/api/admin/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, topic, code }),
        });
        const crd = await cr.json();
        if (!cr.ok) throw new Error(crd.error ?? "Couldn't create the room.");
        id = crd.slug;
        setSlug(id);
        setPasscodes(crd.passcodes);
        onCreated();
      }
      // 2. Apply the chosen design with the workspace code. resolveRole grants a
      //    member of the room's OWNING workspace the admin role, so setPhases'
      //    `configure` cap is satisfied for owners/members, not just super-admin.
      if (intent.kind === "template" && intent.templateId)
        await host(id, "setTemplate", { templateId: intent.templateId });
      else if (intent.kind === "ai" && intent.phases)
        await host(id, "setPhases", {
          phases: intent.phases,
          sessionName: intent.sessionName ?? name,
        });
      // 3. Apply branding if the facilitator changed anything.
      if (themeIsCustom(brand))
        await fetch(`/api/admin/rooms/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, theme: themeForPatch(brand) }),
        });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (committed.current) return;
    committed.current = true;
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (busy)
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="h-10 w-10 animate-pulseSoft rounded-full bg-accent" />
        <p className="text-sm text-muted">Setting up your room…</p>
      </div>
    );

  if (err)
    return (
      <div className="flex flex-col gap-3">
        <H>Almost there</H>
        <p className="rounded-lg border border-[#5a2a2a] bg-[#5a2a2a]/30 px-3 py-2 text-sm text-[#ffd7d7]">
          {err}
        </p>
        <div className="flex gap-2">
          <Button onClick={commit}>Try again</Button>
          <button onClick={onBack} className="text-xs text-muted underline">
            ← Back
          </button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <H>Your keys</H>
      <p className="text-sm text-muted">
        Share these links to run the room. Each link is the key — anyone with it
        can do its job.
      </p>
      {passcodes && (
        <RoomAccessCard slug={slug} name={name} codes={passcodes} />
      )}
      <div>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}

// ---- Step 5: Ready --------------------------------------------------------

function StepReady({
  slug,
  name,
  code,
  origin,
  onClose,
}: {
  slug: string;
  name: string;
  code: string;
  origin: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // A1 — a new room is created as a draft. Let the facilitator flip it live right
  // here, so they don't have to hop to the admin list to open the doors.
  const [live, setLive] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  async function markLive() {
    setLiveBusy(true);
    try {
      const res = await fetch(`/api/admin/rooms/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, status: "live" }),
      });
      if (res.ok) setLive(true);
    } finally {
      setLiveBusy(false);
    }
  }
  const join = `${origin}/r/${slug}`;
  function copyInvite() {
    navigator.clipboard
      ?.writeText(`Join my workshop "${name}": ${join} — no app, no passcode.`)
      .then(() => setCopied(true), () => setCopied(false));
  }
  const tiles: { label: string; href: string }[] = [
    { label: "Open host console", href: `/r/${slug}/host` },
    { label: "Open projector", href: `/r/${slug}/screen` },
    { label: "Print door QR", href: `/r/${slug}/qr` },
  ];
  return (
    <div className="flex flex-col gap-4">
      <H>“{name}” is ready 🎉</H>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <a
            key={t.href}
            href={t.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-border bg-surface p-5 text-center text-sm font-medium hover:border-accent"
          >
            {t.label}
          </a>
        ))}
        <button
          onClick={copyInvite}
          className="rounded-xl border border-accent bg-accent/10 p-5 text-center text-sm font-medium text-accent"
        >
          {copied ? "Invite copied ✓" : "Copy invite text"}
        </button>
      </div>
      {/* A1 — open the doors now, or leave it a draft to launch later. */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        {live ? (
          <p className="text-sm text-emerald-400">
            ✓ This room is <strong>live</strong> — participants can join now.
          </p>
        ) : (
          <>
            <div className="flex-1">
              <p className="text-sm font-medium">Open the doors?</p>
              <p className="text-xs text-muted">
                It&apos;s a draft until you mark it live — you can also do this later
                from the rooms list.
              </p>
            </div>
            <Button onClick={markLive} disabled={liveBusy}>
              {liveBusy ? "Going live…" : "Mark live"}
            </Button>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={onClose}>Back to all rooms</Button>
      </div>
    </div>
  );
}
