// Setup-phase AI assist: turn a facilitator's GOAL into a proposed session
// (a sequence of real modules with valid configs), and CRITIQUE an assembled
// design before it runs. Both are read-only helpers — they propose, they never
// apply. The facilitator edits and launches in the builder.

import { SERVER_MODULES, getServerModule } from "./modules/registry.server";
import { MODULE_CARDS } from "./modules/cards";
import { TEMPLATES } from "./templates";
import { generateJSON, topicLine } from "./ai";
import type { ModuleKind, PhaseInstance } from "./types";

// Modules that PRODUCE free-text contributions a later phase can analyse.
const PRODUCERS = new Set<ModuleKind>([
  "capture",
  "prework",
  "qna",
  "brainwrite",
]);

// Does a module take a `sourcePhaseId` (i.e. it consumes an earlier phase's
// contributions), and is it required? Derived from the zod schema so it can't
// drift from the actual modules.
function sourceNeed(id: ModuleKind): { has: boolean; required: boolean } {
  const mod = getServerModule(id);
  const schema = mod?.schema as unknown as {
    shape?: Record<string, { isOptional?: () => boolean }>;
    _def?: { shape?: () => Record<string, { isOptional?: () => boolean }> };
  };
  const shape = schema?.shape ?? schema?._def?.shape?.();
  const f = shape?.sourcePhaseId;
  if (!f) return { has: false, required: false };
  const required = typeof f.isOptional === "function" ? !f.isOptional() : true;
  return { has: true, required };
}

// The module ids that read an earlier phase's contributions (for the prompt).
function sourceConsumers(): ModuleKind[] {
  return Object.values(SERVER_MODULES)
    .map((m) => m.id)
    .filter((id) => sourceNeed(id).has);
}

function moduleCatalog(): string {
  return Object.values(SERVER_MODULES)
    .map((m) => {
      const need = sourceNeed(m.id);
      const tag = need.has
        ? ` [needs sourcePhaseId → an earlier capture/pre-work phase${need.required ? ", REQUIRED" : ""}]`
        : "";
      // B6 — feed the AI the plain-language "best for" so its rationale speaks the
      // same language the builder cards show the facilitator.
      const card = MODULE_CARDS[m.id];
      const best = card ? ` (best for: ${card.bestFor})` : "";
      return `- ${m.id}: ${m.meta.name} — ${m.meta.description}${best}${tag}`;
    })
    .join("\n");
}

function templateCatalog(): string {
  return TEMPLATES.map((t) => `- ${t.name} (${t.tag}): ${t.description}`).join("\n");
}

export interface SuggestedSession {
  sessionName: string;
  rationale: string;
  phases: PhaseInstance[];
}

const PRODUCERS_LIST = Array.from(PRODUCERS).join(", ");

// Time budget → how many phases to aim for. Workshops run long when every idea
// becomes its own phase; budget ~13 min/phase (setup + activity + debrief) and
// bias toward FEWER, deeper phases.
// The effective time budget (the stated minutes, or a 60-minute default). Shared
// with B1's agenda arc so the builder and the AI designer agree on the budget.
export function timeBudget(minutes?: number): number {
  return minutes && minutes > 0 ? minutes : 60;
}

function timeGuidance(minutes?: number): { budget: number; text: string } {
  const budget = timeBudget(minutes);
  const target = Math.min(10, Math.max(3, Math.round(budget / 13)));
  return {
    budget,
    text: `TIME BUDGET: about ${budget} minutes total. Each interactive phase realistically takes 8–15 minutes once you include setup, the activity, and a debrief; lobby and close are brief. Aim for roughly ${target} phases TOTAL (including lobby and close). Prefer FEWER, deeper phases over many shallow ones — a packed agenda always overruns. Do NOT exceed the budget, and set config.timerSeconds on timed phases so the timers sum to about ${budget} minutes.`,
  };
}

// Turn raw model JSON into validated PhaseInstances (drop hallucinated modules;
// fall back to a module's default config when the suggested one is invalid).
function buildPhases(rawPhases: unknown[]): PhaseInstance[] {
  const seen = new Set<string>();
  const phases: PhaseInstance[] = [];
  for (let i = 0; i < rawPhases.length; i++) {
    const raw = rawPhases[i];
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const moduleId = String(p.moduleId ?? "") as ModuleKind;
    const mod = getServerModule(moduleId);
    if (!mod) continue;
    let id = String(p.id ?? "").trim() || `${moduleId}-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const cfg = p.config && typeof p.config === "object" ? p.config : {};
    const parsed = mod.schema.safeParse(cfg);
    phases.push({
      id,
      moduleId,
      config: parsed.success ? (cfg as Record<string, unknown>) : mod.defaultConfig,
    });
  }
  return phases;
}

// Guarantee every analysis phase (one that takes sourcePhaseId) references an
// EARLIER producer phase: rewire to the nearest preceding producer, drop a
// REQUIRED-source phase that has none before it, relax an OPTIONAL one.
function repairDependencies(phases: PhaseInstance[]): PhaseInstance[] {
  const repaired: PhaseInstance[] = [];
  for (const ph of phases) {
    const need = sourceNeed(ph.moduleId);
    if (need.has) {
      const cfg = { ...(ph.config as Record<string, unknown>) };
      const cur = cfg.sourcePhaseId;
      const refOk =
        typeof cur === "string" &&
        repaired.some((p) => p.id === cur && PRODUCERS.has(p.moduleId));
      if (!refOk) {
        const src = [...repaired].reverse().find((p) => PRODUCERS.has(p.moduleId));
        if (src) cfg.sourcePhaseId = src.id;
        else if (need.required) continue;
        else delete cfg.sourcePhaseId;
        ph.config = cfg;
      }
    }
    repaired.push(ph);
  }
  return repaired;
}

// B7 — deterministically guarantee the arc: a "lobby" first and a "close" last,
// whatever the AI returned (a "make it shorter" transform must never drop the
// open/close). Moves an existing lobby/close into place, or synthesises one from
// the module default. Pure; ids kept unique.
export function enforceArc(phases: PhaseInstance[]): PhaseInstance[] {
  if (phases.length === 0) return phases;
  const out = [...phases];
  const ids = new Set(out.map((p) => p.id));
  const uniqueId = (base: string): string => {
    let id = base;
    let n = 1;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return id;
  };
  // lobby first
  if (out[0].moduleId !== "lobby") {
    const i = out.findIndex((p) => p.moduleId === "lobby");
    if (i > 0) out.unshift(out.splice(i, 1)[0]);
    else {
      const mod = getServerModule("lobby");
      out.unshift({ id: uniqueId("lobby"), moduleId: "lobby", config: mod?.defaultConfig ?? { label: "Lobby" } });
    }
  }
  // close last
  if (out[out.length - 1].moduleId !== "close") {
    const i = out.findIndex((p) => p.moduleId === "close");
    if (i >= 0 && i < out.length - 1) out.push(out.splice(i, 1)[0]);
    else {
      const mod = getServerModule("close");
      out.push({ id: uniqueId("close"), moduleId: "close", config: mod?.defaultConfig ?? { label: "Close" } });
    }
  }
  return out;
}

// Propose a full session from a goal. Every returned phase references a real
// module; any config that fails its zod schema is replaced with the module's
// default so the result is always launchable.
export async function suggestSession(
  goal: string,
  topic: string,
  minutes?: number,
  headcount?: number,
): Promise<{ ok: boolean; suggestion?: SuggestedSession; reason?: string }> {
  const tg = timeGuidance(minutes);
  const res = await generateJSON<{
    sessionName?: unknown;
    rationale?: unknown;
    phases?: unknown;
  }>({
    label: "suggest-session",
    tier: "reasoning",
    shape: "object",
    maxTokens: 8000, // a full multi-phase session + rationale, after thinking
    system:
      "You are an expert facilitation designer. Given a goal, you compose a " +
      "session as an ordered sequence of modules from the provided catalogue. " +
      "Prefer a clear arc (open → diverge → converge → close). Use only module " +
      "ids from the catalogue. Return JSON only — no markdown, no code fences.",
    user: `${topicLine(topic)}Goal: ${goal}
${minutes ? `Time available: about ${minutes} minutes.\n` : ""}${headcount ? `Group size: about ${headcount} people.\n` : ""}
Available modules (id: name — description):
${moduleCatalog()}

For inspiration, existing ready-made templates:
${templateCatalog()}

Design a session that achieves the goal. Start with a "lobby" phase and end with a "close" phase. For each phase pick the best module id and a sensible config. Capture/voting phases should have a clear "prompt" or "question".

DEPENDENCIES — important: the modules marked "[needs sourcePhaseId …]" above ANALYSE earlier contributions. Each such phase MUST come AFTER a capture or pre-work phase, and its config.sourcePhaseId MUST be set to that earlier phase's exact id. A phase that produces contributions is one of: ${PRODUCERS_LIST}. Never place an analysis module before there is anything for it to read. Example: a "capture" phase with id "ideas", then a "marketplace"/"devil"/"friction" phase whose config includes "sourcePhaseId": "ideas".

${tg.text}

Return JSON only, in this shape:
{
  "sessionName": "Short session name",
  "rationale": "2-3 sentences on why this sequence fits the goal",
  "phases": [
    { "id": "kebab-id", "moduleId": "capture", "config": { "label": "…", "prompt": "…" } }
  ]
}`,
  });
  if (!res.ok || !res.data) return { ok: false, reason: res.reason };

  const d = res.data;
  const phases = enforceArc(
    repairDependencies(buildPhases(Array.isArray(d.phases) ? d.phases : [])),
  );
  if (phases.length === 0) return { ok: false, reason: "No usable phases suggested." };
  return {
    ok: true,
    suggestion: {
      sessionName: typeof d.sessionName === "string" ? d.sessionName.slice(0, 80) : "Suggested session",
      rationale: typeof d.rationale === "string" ? d.rationale.slice(0, 600) : "",
      phases,
    },
  };
}

// Feed the critique back in: take the current design + the reviewer's issues
// and produce an improved, dependency-correct, time-budgeted version. This is
// the loop "Critique" was missing — it now actually fixes the build.
export async function reviseSession(
  current: { id: string; moduleId: string; config: Record<string, unknown> }[],
  goal: string,
  topic: string,
  issues: string[],
  minutes?: number,
): Promise<{ ok: boolean; suggestion?: SuggestedSession; reason?: string }> {
  const tg = timeGuidance(minutes);
  const outline = current
    .map((p, i) => `${i + 1}. {"id":"${p.id}","moduleId":"${p.moduleId}","config":${JSON.stringify(p.config)}}`)
    .join("\n");
  const res = await generateJSON<{
    sessionName?: unknown;
    rationale?: unknown;
    phases?: unknown;
  }>({
    label: "revise-session",
    tier: "reasoning",
    shape: "object",
    maxTokens: 8000,
    system:
      "You are an expert facilitation designer revising a draft session. Fix " +
      "the listed issues, keep what already works, and return the FULL improved " +
      "session. Use only module ids from the catalogue. Return JSON only.",
    user: `${topicLine(topic)}Goal: ${goal}

Current draft (ordered phases):
${outline}

Issues to fix:
${issues.length ? issues.map((s) => `- ${s}`).join("\n") : "- (none given — tighten the arc and the time budget)"}

Available modules (id: name — description):
${moduleCatalog()}

Produce an improved version. Keep a "lobby" first and "close" last. ${tg.text}

DEPENDENCIES: modules marked "[needs sourcePhaseId …]" MUST come after a producer phase (${PRODUCERS_LIST}) and set config.sourcePhaseId to that phase's id.

Return JSON only, in this shape:
{
  "sessionName": "Short session name",
  "rationale": "2-3 sentences on what you changed and why",
  "phases": [ { "id": "kebab-id", "moduleId": "capture", "config": { "label": "…" } } ]
}`,
  });
  if (!res.ok || !res.data) return { ok: false, reason: res.reason };
  const d = res.data;
  const phases = enforceArc(
    repairDependencies(buildPhases(Array.isArray(d.phases) ? d.phases : [])),
  );
  if (phases.length === 0) return { ok: false, reason: "Couldn't revise the session." };
  return {
    ok: true,
    suggestion: {
      sessionName: typeof d.sessionName === "string" ? d.sessionName.slice(0, 80) : "Revised session",
      rationale: typeof d.rationale === "string" ? d.rationale.slice(0, 600) : "",
      phases,
    },
  };
}

export interface DesignCritique {
  strengths: string[];
  issues: string[];
}

// Critique an assembled design before it runs (missing convergence, no close,
// dangling sourcePhaseId, timing, etc.).
export async function critiqueSession(
  phases: { id: string; moduleId: string; config: Record<string, unknown> }[],
  topic: string,
): Promise<{ ok: boolean; critique?: DesignCritique; reason?: string }> {
  const outline = phases
    .map((p, i) => `${i + 1}. [${p.moduleId}] ${(p.config?.label as string) ?? p.id} (id: ${p.id})`)
    .join("\n");
  const res = await generateJSON<{ strengths?: unknown; issues?: unknown }>({
    label: "critique-session",
    tier: "reasoning",
    shape: "object",
    system:
      "You are a facilitation design reviewer. Given a planned session, you " +
      "flag concrete design problems and note genuine strengths. Be specific " +
      "and practical. Return JSON only — no markdown, no code fences.",
    user: `${topicLine(topic)}Here is a planned session as an ordered list of phases (module in brackets):

${outline}

Review it for: a clear arc (does divergence get converged?), a proper open and close, dangling references (a phase that reads sourcePhaseId with no matching earlier phase), energy/pacing, inclusion (anonymous divergence before named convergence), and anything likely to fall flat.

Return JSON only:
{
  "strengths": ["…"],
  "issues": ["specific, actionable problems — empty array if genuinely none"]
}`,
  });
  if (!res.ok || !res.data) return { ok: false, reason: res.reason };
  const strList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 300)).slice(0, 10) : [];
  return {
    ok: true,
    critique: { strengths: strList(res.data.strengths), issues: strList(res.data.issues) },
  };
}
