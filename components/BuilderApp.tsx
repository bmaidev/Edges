"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import { TEMPLATES } from "@/lib/templates";
import type { ModuleKind } from "@/lib/types";

interface BuilderPhase {
  id: string;
  moduleId: ModuleKind;
  configText: string; // edited as JSON; parsed + schema-validated on launch
}

// Palette grouped into scannable categories (the registry is flat; this is just
// a presentation order). Any module not listed falls into "More".
const CATEGORIES: { label: string; kinds: ModuleKind[] }[] = [
  { label: "Structure", kinds: ["lobby", "content", "close"] },
  { label: "Capture & surface", kinds: ["capture", "prework", "readaround"] },
  {
    label: "Group & dialogue",
    kinds: ["allocate", "coordinator", "onetwofour", "worldcafe", "stations", "consult", "fishbowl", "openspace"],
  },
  {
    label: "Vote & prioritise",
    kinds: ["poll", "dotvote", "rank", "scale", "gradient", "marketplace", "matrix", "spectrogram", "twentyfive10", "minspecs"],
  },
  { label: "Ideate & critique", kinds: ["brainwrite", "redistribute", "lightning", "qna", "wordcloud"] },
  {
    label: "AI",
    kinds: ["devil", "friction", "synthesis", "needs", "persona", "emptychair", "issuemap", "promptrelay", "builder"],
  },
  { label: "Analytics", kinds: ["equity"] },
];

// Unwrap optional/default/nullable wrappers to the inner zod type.
function unwrap(zt: any): any {
  let t = zt;
  for (let i = 0; i < 5 && t?._def; i++) {
    const inner = t._def.innerType ?? t._def.schema;
    if (inner) t = inner;
    else break;
  }
  return t;
}

// Schema-driven field hints: required vs optional, with enum options where they
// exist. Falls back to defaultConfig keys if zod introspection isn't available.
function fieldHints(moduleId: ModuleKind): { required: string[]; optional: string[] } {
  try {
    const schema = SERVER_MODULES[moduleId].schema as any;
    const shape = schema.shape ?? schema._def?.shape?.();
    if (shape) {
      const required: string[] = [];
      const optional: string[] = [];
      for (const [k, raw] of Object.entries(shape)) {
        const zt = raw as any;
        const inner = unwrap(zt);
        const enumVals = inner?._def?.values;
        const label = Array.isArray(enumVals) ? `${k} (${enumVals.join(" | ")})` : k;
        if (typeof zt.isOptional === "function" ? zt.isOptional() : false)
          optional.push(label);
        else required.push(label);
      }
      return { required, optional };
    }
  } catch {
    /* fall through */
  }
  const dc = SERVER_MODULES[moduleId].defaultConfig as Record<string, unknown>;
  return { required: Object.keys(dc), optional: [] };
}

// Live JSON + zod-schema validation, naming the offending field.
function validateConfig(
  moduleId: ModuleKind,
  text: string,
): { ok: boolean; msg?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, msg: "Invalid JSON — check quotes, commas, brackets." };
  }
  const r = SERVER_MODULES[moduleId].schema.safeParse(parsed);
  if (r.success) return { ok: true };
  const issue = r.error.issues[0];
  return {
    ok: false,
    msg: `${issue.path.join(".") || "config"}: ${issue.message}`,
  };
}

// Admin session builder: compose a custom phase sequence from any module, edit
// each phase's config, and launch it into the room. Requires the admin tier
// (server gates setPhases behind the "configure" capability).
export function BuilderApp({ apiBase, slug }: { apiBase: string; slug: string }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Custom session");
  const [phases, setPhases] = useState<BuilderPhase[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  // Setup-phase AI assist
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState("");
  const [aiBusy, setAiBusy] = useState<null | "suggest" | "critique" | "revise">(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [critique, setCritique] = useState<{ strengths: string[]; issues: string[] } | null>(null);

  const phaseIds = useMemo(() => phases.map((p) => p.id), [phases]);

  // Load an AI-proposed/revised session into the editor.
  function loadSuggestion(sg: {
    sessionName?: string;
    rationale?: string;
    phases?: { id: string; moduleId: ModuleKind; config: unknown }[];
  }) {
    setName(sg.sessionName ?? "Suggested session");
    setRationale(sg.rationale ?? null);
    setPhases(
      (sg.phases ?? []).map((p) => ({
        id: p.id,
        moduleId: p.moduleId,
        configText: JSON.stringify(p.config, null, 2),
      })),
    );
  }

  // Current phases parsed for the AI endpoints.
  function parsedPhases() {
    return phases.map((p) => {
      try {
        return { id: p.id, moduleId: p.moduleId, config: JSON.parse(p.configText) };
      } catch {
        return { id: p.id, moduleId: p.moduleId, config: {} };
      }
    });
  }

  async function suggest() {
    if (!goal.trim()) return;
    if (!code.trim()) {
      setMsg("Enter your admin or facilitator passcode above first — the AI design tools need it.");
      return;
    }
    setAiBusy("suggest");
    setMsg(null);
    setCritique(null);
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "suggestSession",
          goal,
          minutes: minutes ? Number(minutes) : undefined,
          code,
        }),
      });
      const d = await res.json();
      if (res.ok && d.suggestion) loadSuggestion(d.suggestion);
      else setMsg(d.error ?? "Couldn't suggest a session (admin/facilitator code + AI key needed).");
    } catch {
      setMsg("Network error.");
    } finally {
      setAiBusy(null);
    }
  }

  // Feed the critique's issues back to the AI and load the revised design.
  async function applyFixes() {
    if (phases.length === 0 || !code.trim()) return;
    setAiBusy("revise");
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "reviseSession",
          phases: parsedPhases(),
          goal,
          issues: critique?.issues ?? [],
          minutes: minutes ? Number(minutes) : undefined,
          code,
        }),
      });
      const d = await res.json();
      if (res.ok && d.suggestion) {
        loadSuggestion(d.suggestion);
        setCritique(null);
      } else setMsg(d.error ?? "Couldn't revise (AI key needed).");
    } catch {
      setMsg("Network error.");
    } finally {
      setAiBusy(null);
    }
  }

  async function runCritique() {
    if (phases.length === 0) return;
    if (!code.trim()) {
      setMsg("Enter your admin or facilitator passcode above first — the AI design tools need it.");
      return;
    }
    setAiBusy("critique");
    setCritique(null);
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "critiqueSession", phases: parsedPhases(), code }),
      });
      const d = await res.json();
      if (res.ok && d.critique) setCritique(d.critique);
      else setMsg(d.error ?? "Couldn't critique (AI key needed).");
    } catch {
      setMsg("Network error.");
    } finally {
      setAiBusy(null);
    }
  }

  function add(moduleId: ModuleKind) {
    const mod = SERVER_MODULES[moduleId];
    const n = phases.filter((p) => p.moduleId === moduleId).length + 1;
    setPhases((prev) => [
      ...prev,
      {
        id: `${moduleId}-${n}`,
        moduleId,
        configText: JSON.stringify(mod.defaultConfig, null, 2),
      },
    ]);
  }
  function loadTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setName(t.name);
    setPhases(
      t.phases.map((p) => ({
        id: p.id,
        moduleId: p.moduleId,
        configText: JSON.stringify(p.config, null, 2),
      })),
    );
  }
  function move(i: number, dir: -1 | 1) {
    const t = i + dir;
    if (t < 0 || t >= phases.length) return;
    const next = [...phases];
    [next[i], next[t]] = [next[t], next[i]];
    setPhases(next);
  }
  function remove(i: number) {
    setPhases(phases.filter((_, idx) => idx !== i));
  }
  function editConfig(i: number, text: string) {
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, configText: text } : p)));
  }

  async function launch() {
    setMsg(null);
    const parsed: { id: string; moduleId: ModuleKind; config: unknown }[] = [];
    for (const p of phases) {
      try {
        parsed.push({ id: p.id, moduleId: p.moduleId, config: JSON.parse(p.configText) });
      } catch {
        setMsg(`Phase "${p.id}" has invalid JSON.`);
        return;
      }
    }
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "setPhases", phases: parsed, sessionName: name, code }),
    });
    if (res.ok) {
      setLaunched(true);
      setMsg(null);
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? "Launch failed (admin passcode required).");
    }
  }

  if (launched) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Session launched</h1>
        <p className="text-sm text-muted">
          Your custom sequence is live in room {slug}.
        </p>
        <a className="text-accent underline" href={`/r/${slug}/host`}>
          Open host console →
        </a>
        <a className="text-accent underline" href={`/r/${slug}/screen`}>
          Open projector →
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-6 lg:max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Session builder · {slug}</h1>
      <p className="mt-1 text-sm text-muted">
        Start from a template or compose your own sequence, edit each phase, then launch.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Session name"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Admin or facilitator passcode (needed for AI design + to launch)"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Design with AI
      </h2>
      <div className="mt-2 flex flex-col gap-2 rounded-xl border border-dashed border-accent/50 bg-accent/5 p-3">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe your goal — e.g. 'decide between three roadmap options and leave with owners'"
          rows={2}
          className="w-full rounded-lg border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          Minutes
          <input
            type="number"
            min={10}
            max={240}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="e.g. 60"
            className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none"
          />
          <span>sizes the agenda — fewer, deeper phases for the time you have.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={suggest} disabled={aiBusy !== null || !goal.trim() || !code.trim()}>
            {aiBusy === "suggest" ? "Designing…" : "✨ Suggest a session"}
          </Button>
          <Button
            variant="ghost"
            onClick={runCritique}
            disabled={aiBusy !== null || phases.length === 0 || !code.trim()}
          >
            {aiBusy === "critique" ? "Reviewing…" : "🔍 Critique this design"}
          </Button>
          {!code.trim() && (
            <span className="text-xs text-muted">Enter your passcode above to enable AI design.</span>
          )}
        </div>
        {rationale && (
          <p className="text-xs text-muted">
            <span className="text-accent">Why this shape:</span> {rationale}
          </p>
        )}
        {critique && (
          <div className="mt-1 space-y-1 text-xs">
            {critique.strengths.length > 0 && (
              <div>
                <span className="text-accent">Strengths:</span>
                <ul className="ml-4 list-disc text-muted">
                  {critique.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            <div>
              <span className={critique.issues.length ? "text-[#ff8a8a]" : "text-accent"}>
                {critique.issues.length ? "Issues to consider:" : "No issues flagged."}
              </span>
              {critique.issues.length > 0 && (
                <ul className="ml-4 list-disc text-muted">
                  {critique.issues.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </div>
            {critique.issues.length > 0 && (
              <Button
                onClick={applyFixes}
                disabled={aiBusy !== null}
                className="mt-1 !px-3 !py-1 !text-xs"
              >
                {aiBusy === "revise" ? "Revising…" : "✨ Apply AI fixes"}
              </Button>
            )}
          </div>
        )}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Start from a template
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => loadTemplate(t.id)}
            title={t.description}
            className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs hover:border-accent"
          >
            {t.name}
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Add a module
      </h2>
      <div className="mt-2 flex flex-col gap-3">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <p className="mb-1 text-xs text-muted">{cat.label}</p>
            <div className="flex flex-wrap gap-2">
              {cat.kinds
                .filter((k) => SERVER_MODULES[k])
                .map((k) => (
                  <button
                    key={k}
                    onClick={() => add(k)}
                    title={SERVER_MODULES[k].meta.description}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent"
                  >
                    + {SERVER_MODULES[k].meta.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
        Sequence ({phases.length})
      </h2>
      {phaseIds.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Phase ids (use for <code>sourcePhaseId</code>): {phaseIds.join(", ")}
        </p>
      )}
      {phases.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Add modules above to build the flow.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {phases.map((p, i) => {
            const mod = SERVER_MODULES[p.moduleId];
            const valid = validateConfig(p.moduleId, p.configText);
            const hints = fieldHints(p.moduleId);
            return (
              <div key={i} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {i + 1}. {mod.meta.name}{" "}
                    <span className="text-xs text-muted">({p.id})</span>
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button className="text-muted disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button className="text-muted disabled:opacity-20" disabled={i === phases.length - 1} onClick={() => move(i, 1)}>▼</button>
                    <button className="text-[#ff8a8a] underline" onClick={() => remove(i)}>remove</button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted">{mod.meta.description}</p>
                <p className="mt-1 text-xs text-muted">
                  <span className="text-white/70">Required:</span>{" "}
                  {hints.required.join(", ") || "—"}
                  {hints.optional.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-white/70">Optional:</span>{" "}
                      {hints.optional.join(", ")}
                    </>
                  )}
                </p>
                <textarea
                  value={p.configText}
                  onChange={(e) => editConfig(i, e.target.value)}
                  spellCheck={false}
                  rows={p.configText.split("\n").length + 1}
                  className={`mt-2 w-full rounded-lg border bg-bg p-2 font-mono text-xs focus:outline-none ${
                    valid.ok ? "border-border focus:border-accent" : "border-[#5a2a2a]"
                  }`}
                />
                {!valid.ok && (
                  <p className="mt-1 text-xs text-[#ff8a8a]">{valid.msg}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={launch}
          disabled={
            phases.length === 0 ||
            phases.some((p) => !validateConfig(p.moduleId, p.configText).ok)
          }
        >
          Launch into room
        </Button>
        {msg && <span className="text-sm text-[#ff8a8a]">{msg}</span>}
      </div>
    </main>
  );
}
