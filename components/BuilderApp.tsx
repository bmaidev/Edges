"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Pencil,
  Sparkles,
  Search,
  Scissors,
  Star,
  Download,
  Upload,
  Share2,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Play,
  Rocket,
} from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
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
import { RehearsalTheatre } from "@/components/RehearsalTheatre";
import { ShareImportPanel } from "@/components/ShareImportPanel";
import { acceptsTimerEdit, phaseMinutes, phaseStage } from "@/lib/arc";
import { MODULE_CATEGORIES } from "@/lib/modules/categories";
import type { ModuleKind, PhaseInstance } from "@/lib/types";

// Compact "time since" for the editing banner (client-only, so Date.now is fine).
function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

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
// B6 — the palette grouping is shared with the /help method reference.
const CATEGORIES = MODULE_CATEGORIES;

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
  // When we've re-opened an existing build for editing, remember when it was last
  // saved — drives the "editing" banner + the "Save changes" affordance.
  const [editingSaved, setEditingSaved] = useState<{ savedAt: number } | null>(null);

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

  // Re-open an EXISTING build for editing. The room's design is persisted durably
  // as room.blueprint (name + phases) on every launch, but the builder used to
  // always start blank — so a facilitator could build a room and never edit it
  // again. As soon as we have auth, fetch that blueprint and seed the editor from
  // it. Guarded so it runs once and never clobbers work already in progress
  // (only seeds while the editor is still empty).
  const blueprintTried = useRef(false);
  useEffect(() => {
    if (blueprintTried.current || !code) return;
    blueprintTried.current = true;
    (async () => {
      try {
        const res = await fetch(
          `${apiBase}/blueprint?code=${encodeURIComponent(code)}`,
        );
        if (!res.ok) return;
        const d = (await res.json()) as {
          blueprint: { name?: string; phases?: PhaseInstance[]; savedAt?: number } | null;
        };
        const bp = d.blueprint;
        if (!bp?.phases?.length) return;
        setPhases((prev) =>
          prev.length > 0
            ? prev
            : bp.phases!.map((p) => ({
                id: p.id,
                moduleId: p.moduleId,
                config: { ...p.config },
              })),
        );
        setName((prev) =>
          prev === "Custom session" && bp.name ? bp.name : prev,
        );
        setEditingSaved({ savedAt: bp.savedAt ?? Date.now() });
      } catch {
        /* never built / offline — stay on the blank create flow */
      }
    })();
  }, [code, apiBase]);
  // Setup-phase AI assist
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState("");
  // B1 — shared hover/selection across the arc and the phase cards (index-keyed,
  // because builder phase ids aren't unique).
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "suggest" | "critique" | "revise">(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [critique, setCritique] = useState<{ strengths: string[]; issues: string[] } | null>(null);
  // B7 — AI design partner: transform the CURRENT design by a free-text instruction.
  const [refineText, setRefineText] = useState("");
  const [preTransform, setPreTransform] = useState<BuilderPhase[] | null>(null);
  const [tally, setTally] = useState<{ bN: number; bM: number; aN: number; aM: number } | null>(null);

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

  const totalMinutes = (ps: { moduleId: ModuleKind; config: Record<string, unknown> }[]) =>
    ps.reduce((sum, p) => sum + phaseMinutes({ moduleId: p.moduleId, config: p.config }).minutes, 0);

  // B7 — transform the current design by an instruction (a preset chip or free
  // text). Reuses the existing reviseSession AI command (which validates every
  // returned phase + now enforces lobby-first/close-last), previews the result by
  // loading it into the editor, and keeps a snapshot for one-tap Undo.
  async function transform(instruction: string) {
    if (!instruction.trim() || phases.length === 0) return;
    if (!code.trim()) {
      setMsg("Enter your admin or facilitator passcode above first — the AI tools need it.");
      return;
    }
    setAiBusy("revise");
    setMsg(null);
    const snapshot = phases;
    const before = { n: snapshot.length, m: Math.round(totalMinutes(snapshot)) };
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "reviseSession", phases: parsedPhases(), goal: instruction, code }),
      });
      const d = await res.json();
      if (res.ok && d.suggestion) {
        setPreTransform(snapshot);
        loadSuggestion(d.suggestion);
        const after = d.suggestion.phases ?? [];
        setTally({ bN: before.n, bM: before.m, aN: after.length, aM: Math.round(totalMinutes(after)) });
        setRefineText("");
      } else {
        setMsg(d.error ?? "Couldn't transform the design.");
      }
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setAiBusy(null);
    }
  }

  function undoTransform() {
    if (!preTransform) return;
    setPhases(preTransform);
    setPreTransform(null);
    setTally(null);
    setRationale(null);
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

  // B5 — rehearsal theatre overlay.
  const [rehearsing, setRehearsing] = useState(false);

  // B4 — the user-template library (global + this room's room-scoped designs).
  const [userDesigns, setUserDesigns] = useState<
    { id: string; name: string; phaseCount: number; scope?: "global" | "room" }[]
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
    // B4 — scope: the shared library (every room, needs the admin code) or this
    // room only. Default to room-only — the safer, no-extra-passcode choice.
    const shared = window.confirm(
      "Save to the SHARED library (visible in every room — needs the admin passcode)?\n\nOK = shared · Cancel = this room only",
    );
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: "saveDesign",
        name: nm,
        phases: parsedPhases(),
        scope: shared ? "global" : "room",
        code,
      }),
    });
    if (res.ok) {
      setMsg(`Saved “${nm}” to ${shared ? "the shared library" : "this room"}.`);
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

  // B4 — share a saved design as a portable code, then copy it to the clipboard.
  async function shareDesign(id: string, dname: string) {
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "exportDesign", id, code, origin: name || undefined }),
    });
    const d = await res.json().catch(() => ({}));
    if (!d.code) {
      setMsg("Couldn't export that design.");
      return;
    }
    try {
      await navigator.clipboard.writeText(d.code);
      setMsg(`Copied a share code for “${dname}” to your clipboard.`);
    } catch {
      window.prompt(`Share code for “${dname}” (copy it):`, d.code);
    }
  }

  // B4 — duplicate a saved design: load it, then save a fresh copy. Re-uses the
  // validated phases the library already holds (saveDesign re-validates anyway).
  async function duplicateDesign(id: string) {
    const got = await fetch(`${apiBase}/designs?code=${encodeURIComponent(code)}&id=${id}`);
    if (!got.ok) return;
    const { design } = await got.json();
    if (!design) return;
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "saveDesign", name: `${design.name} (copy)`.slice(0, 80), phases: design.phases, code }),
    });
    if (res.ok) {
      setMsg(`Duplicated “${design.name}”.`);
      loadDesigns();
    } else {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? "Couldn't duplicate (needs the admin passcode).");
    }
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
        <h1 className="text-xl font-semibold">
          {editingSaved ? "Changes saved" : "Session launched"}
        </h1>
        <p className="text-sm text-muted">
          {editingSaved
            ? `Your updated sequence is live in room ${slug}.`
            : `Your custom sequence is live in room ${slug}.`}
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
      {rehearsing && (
        <RehearsalTheatre
          apiBase={apiBase}
          code={code}
          phases={parsedPhases()}
          onClose={() => setRehearsing(false)}
        />
      )}
      <h1 className="font-display text-2xl font-semibold tracking-tight">Session builder · {slug}</h1>
      <p className="mt-1 text-sm text-muted">
        {editingSaved
          ? "Editing this room's saved build — change any phase, then save. Re-launching updates the live room."
          : "Start from a template or compose your own sequence, edit each phase, then launch."}
      </p>
      {editingSaved && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs text-accent">
          <Pencil className="size-3.5 shrink-0" />
          <span>
            Loaded the existing build ({phases.length} phase
            {phases.length === 1 ? "" : "s"}), saved {relativeTime(editingSaved.savedAt)}.
          </span>
        </div>
      )}

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

      <h2 className="mt-8 mb-2 border-b border-border/60 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
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
          <UiButton
            variant="primary"
            onClick={suggest}
            disabled={aiBusy !== null || !goal.trim() || !code.trim()}
          >
            <Sparkles /> {aiBusy === "suggest" ? "Designing…" : "Suggest a session"}
          </UiButton>
          <UiButton
            variant="secondary"
            onClick={runCritique}
            disabled={aiBusy !== null || phases.length === 0 || !code.trim()}
          >
            <Search /> {aiBusy === "critique" ? "Reviewing…" : "Critique this design"}
          </UiButton>
          {!code.trim() && (
            <span className="text-xs text-muted">Enter your passcode above to enable AI design.</span>
          )}
        </div>

        {/* B7 — transform the design in hand (distinct from generating from scratch). */}
        {phases.length > 0 && (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-bg/40 p-3">
            <span className="text-xs font-medium text-white/80">Refine this design with AI</span>
            <div className="flex flex-wrap gap-1.5">
              {/* B1 — a targeted one-tap that appears only when the design runs over
                  the stated budget: trim to fit the actual number, not a guess. */}
              {minutes &&
                Number(minutes) > 0 &&
                totalMinutes(phases) > Number(minutes) + 2 && (
                  <button
                    onClick={() =>
                      transform(
                        `Trim this session to fit within ${Number(minutes)} minutes total — merge or shorten phases, but keep the essential arc and a clear open and close.`,
                      )
                    }
                    disabled={aiBusy !== null || !code.trim()}
                    className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent/10 px-2.5 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-30"
                    title={`Currently ~${Math.round(totalMinutes(phases))} min`}
                  >
                    <Scissors className="size-3" /> Trim to {Number(minutes)}m
                  </button>
                )}
              {[
                { label: "Make it shorter", instr: "Make this session about 20 minutes shorter — trim or merge phases, keep the essential arc." },
                { label: "Add a warm-up", instr: "Add a short warm-up / opener near the start to settle the room." },
                { label: "More interactive", instr: "Make this more interactive — replace passive phases with participatory ones where it fits." },
              ].map((c) => (
                <button
                  key={c.label}
                  onClick={() => transform(c.instr)}
                  disabled={aiBusy !== null || !code.trim()}
                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-accent disabled:opacity-30"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && transform(refineText)}
                placeholder="…or describe a change (e.g. “adapt for 50 people”)"
                className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
              <UiButton
                variant="primary"
                size="sm"
                onClick={() => transform(refineText)}
                disabled={aiBusy !== null || !refineText.trim() || !code.trim()}
                className="shrink-0"
              >
                {aiBusy === "revise" ? "Transforming…" : "Transform"}
              </UiButton>
            </div>
            {tally && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">
                  {tally.bN} phases (~{tally.bM}m) → <span className="text-accent">{tally.aN} phases (~{tally.aM}m)</span>. Review below, then launch.
                </span>
                <button onClick={undoTransform} className="text-muted underline hover:text-white">
                  Undo
                </button>
              </div>
            )}
          </div>
        )}
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
              <UiButton
                variant="primary"
                size="sm"
                onClick={applyFixes}
                disabled={aiBusy !== null}
                className="mt-1 self-start"
              >
                <Sparkles /> {aiBusy === "revise" ? "Revising…" : "Apply AI fixes"}
              </UiButton>
            )}
          </div>
        )}
      </div>

      <h2 className="mt-8 mb-2 border-b border-border/60 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
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
        <UiButton
          variant="secondary"
          size="sm"
          onClick={saveAsTemplate}
          disabled={phases.length === 0}
        >
          <Star /> Save as template
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          onClick={exportDesign}
          disabled={phases.length === 0}
        >
          <Download /> Export JSON
        </UiButton>
        <UiButton variant="secondary" size="sm" onClick={importDesign}>
          <Upload /> Import JSON
        </UiButton>
      </div>
      <h2 className="mt-8 mb-2 border-b border-border/60 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
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
              {d.scope === "room" && <span className="text-muted/60"> · this room</span>}
            </button>
            {/* B4 — share / duplicate / delete a saved design. */}
            <UiButton
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => shareDesign(d.id, d.name)}
              title="Copy a shareable code"
            >
              <Share2 className="!size-3.5" />
            </UiButton>
            <UiButton
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => duplicateDesign(d.id)}
              title="Duplicate (admin only)"
            >
              <Copy className="!size-3.5" />
            </UiButton>
            <UiButton
              variant="ghost"
              size="icon"
              className="size-7 text-[#ff8a8a] hover:bg-[#ff6b6b]/10 hover:text-[#ff9a9a]"
              onClick={() => removeDesign(d.id)}
              title="Delete (admin only)"
            >
              <Trash2 className="!size-3.5" />
            </UiButton>
          </div>
        ))}
      </div>
      {/* B4 — import a design someone shared with you. */}
      <ShareImportPanel apiBase={apiBase} code={code} onImported={(nm) => { setMsg(`Imported “${nm}”.`); loadDesigns(); }} />

      <h2 className="mt-8 mb-2 border-b border-border/60 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
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

      <h2 className="mt-8 mb-2 border-b border-border/60 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
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
                    <UiButton
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      title="Move up"
                    >
                      <ChevronUp className="!size-4" />
                    </UiButton>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === phases.length - 1}
                      onClick={() => move(i, 1)}
                      title="Move down"
                    >
                      <ChevronDown className="!size-4" />
                    </UiButton>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      className="size-7 text-[#ff8a8a] hover:bg-[#ff6b6b]/10 hover:text-[#ff9a9a]"
                      onClick={() => remove(i)}
                      title="Remove phase"
                    >
                      <Trash2 className="!size-3.5" />
                    </UiButton>
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

                {/* D1 — an optional instruction line the room sees this phase. */}
                <label className="mt-2 flex flex-col gap-1 text-xs">
                  <span className="text-muted">Instruction shown to the room (optional)</span>
                  <input
                    value={(p.config.instruction as string) ?? ""}
                    onChange={(e) =>
                      setConfig(i, { ...p.config, instruction: e.target.value || undefined })
                    }
                    placeholder="e.g. Add one idea per card — no wrong answers."
                    maxLength={200}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </label>

                {/* C1 — a private script line for the facilitate cockpit. Never
                    leaves the host (stripped for participant/projector). */}
                <label className="mt-2 flex flex-col gap-1 text-xs">
                  <span className="text-muted">
                    Your script note for this phase (only you see it, in the cockpit)
                  </span>
                  <input
                    value={(p.config.scriptNote as string) ?? ""}
                    onChange={(e) =>
                      setConfig(i, { ...p.config, scriptNote: e.target.value || undefined })
                    }
                    placeholder="e.g. Remind them this is silent — read the room before advancing."
                    maxLength={240}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </label>

                {/* C2 — per-gather-phase room signals (passthrough config, read by
                    the store/host route). Only meaningful where the phase gathers. */}
                {SERVER_MODULES[p.moduleId]?.capabilities.gatherSource !== "none" && (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-bg/40 p-2.5 text-xs">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.config.showLiveCount === true}
                        onChange={(e) => setConfig(i, { ...p.config, showLiveCount: e.target.checked })}
                      />
                      Show the live response count on the big screen (3+ present)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.config.nudgeable !== false}
                        onChange={(e) => setConfig(i, { ...p.config, nudgeable: e.target.checked })}
                      />
                      Allow “nudge the room” on this phase
                    </label>
                  </div>
                )}

                {/* D4 — latecomer policy, only on the grouping modules (which
                    freeze a cohort on entry). Hold parks late arrivals until you
                    place them, instead of auto-folding them mid-activity. */}
                {(p.moduleId === "onetwofour" ||
                  p.moduleId === "worldcafe" ||
                  p.moduleId === "stations") && (
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={p.config.latecomerHold === true}
                      onChange={(e) =>
                        setConfig(i, { ...p.config, latecomerHold: e.target.checked })
                      }
                    />
                    Hold latecomers until I place them (instead of auto-grouping)
                  </label>
                )}

                {/* C6 — author when the big screen goes amber + drains (minutes
                    left). Empty = the calm default (2:00). Only meaningful on a
                    timed phase. */}
                {timed && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <span>Big screen goes amber at</span>
                    <input
                      type="number"
                      min={0}
                      value={
                        typeof p.config.timerWarnSeconds === "number"
                          ? Math.round((p.config.timerWarnSeconds as number) / 60)
                          : ""
                      }
                      onChange={(e) => {
                        const m = Number(e.target.value);
                        setConfig(i, {
                          ...p.config,
                          timerWarnSeconds: m > 0 ? m * 60 : undefined,
                        });
                      }}
                      placeholder="2"
                      className="w-12 rounded border border-border bg-bg px-1 py-0.5 text-right focus:border-accent focus:outline-none"
                      aria-label="Amber warning, minutes left"
                    />
                    <span>min left</span>
                  </label>
                )}

                {/* B3 — author the facilitator-private run-sheet for this phase. */}
                <RunSheetSection config={p.config} onChange={(c) => setConfig(i, c)} />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleAdvanced(i)}
                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-white/80"
                    >
                      <ChevronDown
                        className={`size-3.5 transition-transform ${p.advanced ? "" : "-rotate-90"}`}
                      />
                      {p.advanced ? "Hide JSON — back to form" : "Advanced (JSON)"}
                    </button>
                    {/* B2 — audition this phase on the participant phone + projector. */}
                    <button
                      onClick={() => togglePreview(i)}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:text-white/80"
                    >
                      <Eye className="size-3.5" />
                      {p.previewOpen ? "Hide preview" : "Preview the room"}
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

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <UiButton
          variant="primary"
          size="lg"
          onClick={launch}
          disabled={
            phases.length === 0 ||
            phases.some((p) => !validateConfig(p.moduleId, p.config).ok)
          }
        >
          {editingSaved ? <Pencil /> : <Rocket />}
          {editingSaved ? "Save changes" : "Launch into room"}
        </UiButton>
        {/* B5 — walk the whole arc with a synthetic room before going live. */}
        <UiButton
          variant="secondary"
          size="lg"
          onClick={() => setRehearsing(true)}
          disabled={
            phases.length === 0 ||
            phases.some((p) => !validateConfig(p.moduleId, p.config).ok)
          }
        >
          <Play /> Rehearse (dry-run)
        </UiButton>
      </div>
      {msg && (
        <p className="mt-3 rounded-lg border border-[#5a2a2a] bg-[#5a2a2a]/30 px-3 py-2 text-sm text-[#ffd7d7]">
          {msg}
        </p>
      )}
    </main>
  );
}
