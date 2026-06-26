"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui";
import { bootToken } from "@/lib/magicLink";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import { PaletteChip, PlacedPhaseCard, SourceField } from "@/components/ModuleCard";
import { TEMPLATES } from "@/lib/templates";
// H2 — single source of truth, shared with the pre-flight engine so the builder's
// validation and the readiness check can never drift.
import { LONG_TEXT, validatePhaseConfig } from "@/lib/preflight";
import { AgendaArc } from "@/components/AgendaArc";
import { RunSheetSection } from "@/components/RunSheetSection";
import { RoomMockup } from "@/components/RoomMockup";
import { acceptsTimerEdit, phaseMinutes, phaseStage } from "@/lib/arc";
import type { ModuleKind } from "@/lib/types";

// B1 — arc-stage dot colours (shared with AgendaArc's palette).
const STAGE_DOT: Record<string, string> = {
  open: "#6aa9ff",
  diverge: "rgb(var(--c-accent))",
  converge: "#5fd0a0",
  close: "#8a8aa0",
};

interface BuilderPhase {
  id: string;
  moduleId: ModuleKind;
  config: Record<string, unknown>; // edited via form fields; schema-validated
  advanced?: boolean; // show the raw-JSON editor for this phase
  previewOpen?: boolean; // B2 — show the live room mockup for this phase
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

// Delegates to the shared pre-flight validator (kept as a thin local alias so the
// rest of the builder is untouched).
function validateConfig(
  moduleId: ModuleKind,
  config: unknown,
): { ok: boolean; msg?: string } {
  return validatePhaseConfig(moduleId, config);
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
  // B6 — carries each earlier phase's config so the source field can quote its
  // real prompt ("Reads what the room wrote in '…'").
  earlierPhases: { id: string; moduleId: ModuleKind; config: Record<string, unknown> }[];
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
                  <SourceField
                    value={(val as string) ?? ""}
                    optional={f.optional}
                    earlierPhases={earlierPhases}
                    onChange={(v) => set(f.key, v)}
                  />
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
  const [hasToken, setHasToken] = useState(false);
  const [name, setName] = useState("Custom session");
  const [phases, setPhases] = useState<BuilderPhase[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);

  // A2: inherit the magic-link token (from `#k=` or the tab's remembered one) so
  // the builder knows who you are with no passcode box. Facilitators can now
  // launch custom sessions, so this is all the auth the builder needs.
  useEffect(() => {
    const t = bootToken(slug);
    if (t) {
      setCode(t);
      setHasToken(true);
    }
  }, [slug]);
  // Setup-phase AI assist
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState("");
  // B1 — shared hover/selection across the arc and the phase cards (index-keyed,
  // because builder phase ids aren't unique).
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  // B4 — the shared user-template library.
  const [userDesigns, setUserDesigns] = useState<
    { id: string; name: string; phaseCount: number }[]
  >([]);
  const loadDesigns = useCallback(async () => {
    if (!code.trim()) return;
    try {
      const res = await fetch(`${apiBase}/designs?code=${encodeURIComponent(code)}`);
      if (res.ok) setUserDesigns((await res.json()).designs ?? []);
    } catch {
      /* the launch path is the real gate */
    }
  }, [apiBase, code]);
  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  async function saveAsTemplate() {
    if (phases.length === 0) return;
    const nm = window.prompt("Name this template:", name || "My session");
    if (!nm) return;
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "saveDesign", name: nm, phases: parsedPhases(), code }),
    });
    if (res.ok) {
      setMsg(`Saved “${nm}” to your templates.`);
      loadDesigns();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? "Couldn't save the template.");
    }
  }

  async function editDesign(id: string) {
    const res = await fetch(`${apiBase}/designs?code=${encodeURIComponent(code)}&id=${id}`);
    if (!res.ok) return;
    const { design } = await res.json();
    if (!design) return;
    setName(design.name);
    setPhases(
      design.phases.map((p: { id: string; moduleId: ModuleKind; config: Record<string, unknown> }) => ({
        id: p.id,
        moduleId: p.moduleId,
        config: { ...p.config },
      })),
    );
  }

  async function removeDesign(id: string) {
    if (!window.confirm("Delete this shared template?")) return;
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "deleteDesign", id, code }),
    });
    if (res.ok) loadDesigns();
    else setMsg("Couldn't delete (needs the admin passcode).");
  }

  function exportDesign() {
    const json = JSON.stringify({ version: 1, name, phases: parsedPhases() }, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => setMsg("Copied this design as JSON — paste it anywhere to share."),
      () => setMsg("Couldn't copy to the clipboard."),
    );
  }

  function importDesign() {
    const raw = window.prompt("Paste a design JSON to load it into the builder:");
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as { name?: string; phases?: unknown };
      if (!Array.isArray(d.phases)) throw new Error("no phases");
      if (typeof d.name === "string") setName(d.name);
      setPhases(
        (d.phases as { id?: string; moduleId: ModuleKind; config?: Record<string, unknown> }[]).map(
          (p, i) => ({ id: p.id ?? `p${i + 1}`, moduleId: p.moduleId, config: { ...(p.config ?? {}) } }),
        ),
      );
      setMsg("Imported — review the phases, then launch (it'll be validated).");
    } catch {
      setMsg("That doesn't look like a valid design JSON.");
    }
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
  function togglePreview(i: number) {
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, previewOpen: !p.previewOpen } : p)));
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
      // A2: facilitators can now configure, so a 403 means a bad/expired link —
      // not the old "needs the admin code" wall.
      if (res.status === 403)
        setMsg(
          "Not saved — open the builder from your Facilitator link (your access may have been reset).",
        );
      else setMsg(d.error ?? `Launch failed (${res.status}).`);
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
        {/* A2: when opened from a Facilitator link the token is inherited and
            this box stays hidden — no passcode friction. Shown only as a fallback
            (e.g. a bookmarked /build with no link). Facilitators can now launch
            custom sessions, so there is no admin-only wall to explain. */}
        {!hasToken && (
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Facilitator passcode (or open from your Facilitator link)"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        )}
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

      {/* B4 — the shared library of designs you've saved + share via JSON. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={saveAsTemplate}
          disabled={phases.length === 0}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent disabled:opacity-30"
        >
          ★ Save as template
        </button>
        <button
          onClick={exportDesign}
          disabled={phases.length === 0}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent disabled:opacity-30"
        >
          Export JSON
        </button>
        <button
          onClick={importDesign}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:border-accent"
        >
          Import JSON
        </button>
      </div>
      {userDesigns.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">
            Your templates
          </h2>
          <div className="mt-2 flex flex-col gap-1.5">
            {userDesigns.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => editDesign(d.id)}
                  className="flex-1 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-left hover:border-accent"
                >
                  {d.name}{" "}
                  <span className="text-muted">· {d.phaseCount} phase{d.phaseCount === 1 ? "" : "s"}</span>
                </button>
                <button
                  onClick={() => removeDesign(d.id)}
                  className="text-[#ff8a8a] underline"
                  title="Delete (admin only)"
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}

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
                  <PaletteChip key={k} moduleId={k} onAdd={() => add(k)} />
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
          <AgendaArc
            phases={parsedPhases()}
            minutes={minutes ? Number(minutes) : undefined}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
          />
          {phases.map((p, i) => {
            const mod = SERVER_MODULES[p.moduleId];
            const valid = validateConfig(p.moduleId, p.config);
            const earlierPhases = phases.slice(0, i).map((q) => ({ id: q.id, moduleId: q.moduleId, config: q.config }));
            const stage = phaseStage(p.moduleId);
            const mins = phaseMinutes({ moduleId: p.moduleId, config: p.config });
            const timed = acceptsTimerEdit(p.moduleId);
            return (
              <div
                key={i}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseLeave={() => setSelectedIndex(null)}
                className={`rounded-xl border bg-surface p-3 transition-colors ${
                  selectedIndex === i ? "border-accent" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_DOT[stage] }}
                      title={stage}
                    />
                    {i + 1}. {mod.meta.name}{" "}
                    <span className="text-xs text-muted">({p.id})</span>
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    {timed ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <input
                          type="number"
                          min={1}
                          value={mins.minutes}
                          onChange={(e) => {
                            const v = Math.max(1, Number(e.target.value) || 1);
                            setConfig(i, { ...p.config, timerSeconds: v * 60 });
                          }}
                          className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-right text-xs focus:border-accent focus:outline-none"
                          aria-label="Planned minutes"
                        />
                        min
                      </span>
                    ) : (
                      <span className="text-muted" title="estimated">
                        ~{mins.minutes}m
                      </span>
                    )}
                    <button className="text-muted disabled:opacity-20" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button className="text-muted disabled:opacity-20" disabled={i === phases.length - 1} onClick={() => move(i, 1)}>▼</button>
                    <button className="text-[#ff8a8a] underline" onClick={() => remove(i)}>remove</button>
                  </div>
                </div>
                <PlacedPhaseCard moduleId={p.moduleId} />

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

                {/* B3 — author the facilitator-private run-sheet for this phase. */}
                <RunSheetSection config={p.config} onChange={(c) => setConfig(i, c)} />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleAdvanced(i)}
                      className="text-xs text-muted underline decoration-dotted hover:text-white/80"
                    >
                      {p.advanced ? "▾ Hide JSON — back to form" : "▸ Advanced (JSON)"}
                    </button>
                    {/* B2 — audition this phase on the participant phone + projector. */}
                    <button
                      onClick={() => togglePreview(i)}
                      className="text-xs text-accent underline decoration-dotted hover:text-white/80"
                    >
                      {p.previewOpen ? "▾ Hide preview" : "👁 Preview the room"}
                    </button>
                  </div>
                  {!valid.ok && <span className="text-xs text-[#ff8a8a]">{valid.msg}</span>}
                </div>

                {p.previewOpen &&
                  (valid.ok ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <RoomMockup moduleId={p.moduleId} config={p.config} />
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#ff8a8a]">
                      Fix the highlighted field to preview.
                    </p>
                  ))}
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
      </div>
      {msg && (
        <p className="mt-3 rounded-lg border border-[#5a2a2a] bg-[#5a2a2a]/30 px-3 py-2 text-sm text-[#ffd7d7]">
          {msg}
        </p>
      )}
    </main>
  );
}
