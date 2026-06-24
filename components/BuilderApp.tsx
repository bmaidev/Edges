"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import { TEMPLATES } from "@/lib/templates";
import type { ModuleKind } from "@/lib/types";

interface BuilderPhase {
  id: string;
  moduleId: ModuleKind;
  config: Record<string, unknown>; // edited via form fields; schema-validated
  advanced?: boolean; // show the raw-JSON editor for this phase
}

// Palette grouped into scannable categories (the registry is flat; this is just
// a presentation order). Any module not listed falls into "More".
const CATEGORIES: { label: string; kinds: ModuleKind[] }[] = [
  { label: "Structure", kinds: ["lobby", "content", "media", "close"] },
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

// Modules whose output a later phase can consume via sourcePhaseId. Used to rank
// the "Takes input from" dropdown so producers surface first.
const PRODUCERS = new Set<ModuleKind>(["capture", "prework", "qna", "brainwrite"]);

// ---- zod introspection -----------------------------------------------------
// The form is generated from each module's zod schema. We detect a handful of
// field shapes and render a widget for each; anything we don't recognise stays
// editable through the per-phase Advanced (JSON) toggle, so no config is ever
// un-editable even if a schema uses an exotic type.

// Unwrap optional/default/nullable wrappers to the inner zod type.
function unwrap(zt: any): any {
  let t = zt;
  for (let i = 0; i < 6 && t?._def; i++) {
    const inner = t._def.innerType ?? t._def.schema;
    if (inner) t = inner;
    else break;
  }
  return t;
}

function isOptional(zt: any): boolean {
  try {
    return typeof zt.isOptional === "function" ? zt.isOptional() : false;
  } catch {
    return false;
  }
}

// Enum option values, tolerant of zod version differences.
function enumValues(inner: any): string[] | null {
  const v =
    inner?.options ??
    inner?._def?.values ??
    (inner?._def?.entries ? Object.values(inner._def.entries) : null);
  return Array.isArray(v) ? (v as string[]) : null;
}

type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "enum"
  | "stringList"
  | "enumList"
  | "source"
  | "unsupported";

interface FieldInfo {
  key: string;
  kind: FieldKind;
  optional: boolean;
  enums?: string[];
}

const LONG_TEXT =
  /prompt|message|body|desc|question|instruction|statement|placeholder|headline|tagline|heading|note/i;

function describeField(key: string, zt: any): FieldInfo {
  const optional = isOptional(zt);
  // sourcePhaseId is a plain string in the schema, but semantically a link to
  // an earlier phase — render it as a dropdown.
  if (key === "sourcePhaseId") return { key, kind: "source", optional };
  try {
    const inner = unwrap(zt);
    if (inner instanceof z.ZodEnum)
      return { key, kind: "enum", optional, enums: enumValues(inner) ?? [] };
    if (inner instanceof z.ZodBoolean) return { key, kind: "boolean", optional };
    if (inner instanceof z.ZodNumber) return { key, kind: "number", optional };
    if (inner instanceof z.ZodString)
      return { key, kind: LONG_TEXT.test(key) ? "textarea" : "text", optional };
    if (inner instanceof z.ZodArray) {
      const el = unwrap(inner._def?.type ?? inner._def?.element ?? inner.element);
      if (el instanceof z.ZodString) return { key, kind: "stringList", optional };
      if (el instanceof z.ZodEnum)
        return { key, kind: "enumList", optional, enums: enumValues(el) ?? [] };
    }
  } catch {
    /* fall through to unsupported */
  }
  return { key, kind: "unsupported", optional };
}

function schemaFields(moduleId: ModuleKind): FieldInfo[] | null {
  try {
    const schema = SERVER_MODULES[moduleId].schema as any;
    const shape = schema.shape ?? schema._def?.shape?.();
    if (!shape) return null;
    return Object.entries(shape).map(([k, zt]) => describeField(k, zt as any));
  } catch {
    return null;
  }
}

// camelCase / snake → "Sentence case", with a few nicer labels.
function humanize(key: string): string {
  if (key === "sourcePhaseId") return "Takes input from";
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function validateConfig(
  moduleId: ModuleKind,
  config: unknown,
): { ok: boolean; msg?: string } {
  const r = SERVER_MODULES[moduleId].schema.safeParse(config);
  if (r.success) return { ok: true };
  const issue = r.error.issues[0];
  return { ok: false, msg: `${issue.path.join(".") || "config"}: ${issue.message}` };
}

// ---- form field widgets ----------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";

function FieldRow({
  label,
  optional,
  children,
}: {
  label: string;
  optional: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-white/80">
        {label}
        {!optional && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function AutoForm({
  moduleId,
  config,
  onChange,
  earlierPhases,
}: {
  moduleId: ModuleKind;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  earlierPhases: { id: string; moduleId: ModuleKind }[];
}) {
  const fields = schemaFields(moduleId);
  if (!fields) {
    return (
      <p className="text-xs text-muted">
        This module&apos;s settings can&apos;t be shown as a form — use Advanced
        (JSON) below.
      </p>
    );
  }

  function set(key: string, value: unknown) {
    const next = { ...config };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const unsupported = fields.filter((f) => f.kind === "unsupported").map((f) => f.key);

  return (
    <div className="flex flex-col gap-3">
      {fields
        .filter((f) => f.kind !== "unsupported")
        .map((f) => {
          const label = humanize(f.key);
          const val = config[f.key];
          switch (f.kind) {
            case "textarea":
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <textarea
                    value={(val as string) ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={3}
                    className={inputCls}
                  />
                </FieldRow>
              );
            case "text":
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <input
                    value={(val as string) ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={inputCls}
                  />
                </FieldRow>
              );
            case "number":
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <input
                    type="number"
                    value={val === undefined || val === null ? "" : (val as number)}
                    onChange={(e) =>
                      set(f.key, e.target.value === "" ? undefined : Number(e.target.value))
                    }
                    className={inputCls}
                  />
                </FieldRow>
              );
            case "boolean":
              return (
                <label key={f.key} className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => set(f.key, e.target.checked)}
                    className="h-4 w-4 accent-[var(--c-accent)]"
                  />
                  {label}
                </label>
              );
            case "enum":
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <select
                    value={(val as string) ?? ""}
                    onChange={(e) => set(f.key, e.target.value || undefined)}
                    className={inputCls}
                  >
                    {f.optional && <option value="">— none —</option>}
                    {(f.enums ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              );
            case "enumList": {
              const arr = Array.isArray(val) ? (val as string[]) : [];
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <div className="flex flex-wrap gap-2">
                    {(f.enums ?? []).map((o) => {
                      const on = arr.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() =>
                            set(
                              f.key,
                              on ? arr.filter((x) => x !== o) : [...arr, o],
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs ${
                            on
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border bg-surface text-white/70"
                          }`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </FieldRow>
              );
            }
            case "stringList": {
              const arr = Array.isArray(val) ? (val as string[]) : [];
              return (
                <FieldRow key={f.key} label={`${label} (one per line)`} optional={f.optional}>
                  <textarea
                    value={arr.join("\n")}
                    onChange={(e) =>
                      set(
                        f.key,
                        e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                    rows={3}
                    className={inputCls}
                  />
                </FieldRow>
              );
            }
            case "source":
              return (
                <FieldRow key={f.key} label={label} optional={f.optional}>
                  <select
                    value={(val as string) ?? ""}
                    onChange={(e) => set(f.key, e.target.value || undefined)}
                    className={inputCls}
                  >
                    {/* Blank means different things per module: optional source
                        modules read EVERY earlier contribution; required ones
                        need a specific phase chosen. */}
                    <option value="">
                      {f.optional ? "All contributions so far" : "Select a phase…"}
                    </option>
                    {earlierPhases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} · {SERVER_MODULES[p.moduleId]?.meta.name}
                        {PRODUCERS.has(p.moduleId) ? " ✓" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-muted">
                    {f.optional
                      ? "Leave on “All contributions so far” to analyse everything, or pick one phase to focus."
                      : earlierPhases.length === 0
                        ? "Add a capture/pre-work phase before this one to feed it."
                        : "Choose which earlier phase this reads from."}
                  </span>
                </FieldRow>
              );
            default:
              return null;
          }
        })}
      {unsupported.length > 0 && (
        <p className="text-[11px] text-muted">
          Edit in Advanced (JSON): {unsupported.join(", ")}
        </p>
      )}
    </div>
  );
}

// Raw-JSON editor (the "advanced view"). Holds its own draft so invalid JSON can
// be typed without losing it; commits up to the phase on every valid parse.
function AdvancedJson({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(config, null, 2));
  const [err, setErr] = useState<string | null>(null);
  function edit(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text);
      setErr(null);
      onChange(parsed);
    } catch {
      setErr("Invalid JSON — check quotes, commas, brackets.");
    }
  }
  return (
    <div className="mt-2 flex flex-col gap-1">
      <textarea
        value={draft}
        onChange={(e) => edit(e.target.value)}
        spellCheck={false}
        rows={draft.split("\n").length + 1}
        className={`w-full rounded-lg border bg-bg p-2 font-mono text-xs focus:outline-none ${
          err ? "border-[#5a2a2a]" : "border-border focus:border-accent"
        }`}
      />
      {err && <p className="text-xs text-[#ff8a8a]">{err}</p>}
    </div>
  );
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
        config: (p.config ?? {}) as Record<string, unknown>,
      })),
    );
  }

  // Current phases for the AI endpoints (config is already an object).
  function parsedPhases() {
    return phases.map((p) => ({ id: p.id, moduleId: p.moduleId, config: p.config }));
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
        config: { ...(mod.defaultConfig as Record<string, unknown>) },
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
        config: { ...(p.config as Record<string, unknown>) },
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
  function setConfig(i: number, config: Record<string, unknown>) {
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, config } : p)));
  }
  function toggleAdvanced(i: number) {
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, advanced: !p.advanced } : p)));
  }

  async function launch() {
    setMsg(null);
    const parsed = phases.map((p) => ({ id: p.id, moduleId: p.moduleId, config: p.config }));
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
      {phases.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Add modules above to build the flow.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          {phases.map((p, i) => {
            const mod = SERVER_MODULES[p.moduleId];
            const valid = validateConfig(p.moduleId, p.config);
            const earlierPhases = phases.slice(0, i).map((q) => ({ id: q.id, moduleId: q.moduleId }));
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

                <div className="mt-3">
                  {p.advanced ? (
                    <AdvancedJson config={p.config} onChange={(c) => setConfig(i, c)} />
                  ) : (
                    <AutoForm
                      moduleId={p.moduleId}
                      config={p.config}
                      onChange={(c) => setConfig(i, c)}
                      earlierPhases={earlierPhases}
                    />
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => toggleAdvanced(i)}
                    className="text-xs text-muted underline decoration-dotted hover:text-white/80"
                  >
                    {p.advanced ? "▾ Hide JSON — back to form" : "▸ Advanced (JSON)"}
                  </button>
                  {!valid.ok && <span className="text-xs text-[#ff8a8a]">{valid.msg}</span>}
                </div>
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
            phases.some((p) => !validateConfig(p.moduleId, p.config).ok)
          }
        >
          Launch into room
        </Button>
        {msg && <span className="text-sm text-[#ff8a8a]">{msg}</span>}
      </div>
    </main>
  );
}
