import { describe, expect, it } from "vitest";
import {
  LONG_TEXT,
  computeReadiness,
  validatePhaseConfig,
  type PreflightInput,
} from "@/lib/preflight";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// H2 — pre-flight readiness. Pure engine, no store/AI/env reads inside.

const BASE: Omit<PreflightInput, "phases"> = {
  participantCount: 3,
  isProd: false,
  kvConfigured: true,
  aiConfigured: true,
  blobConfigured: true,
};
function run(phases: PreflightInput["phases"], over: Partial<PreflightInput> = {}) {
  return computeReadiness({ ...BASE, phases, ...over });
}
const capture = (id: string, prompt = "Go") => ({
  id,
  moduleId: "capture" as ModuleKind,
  config: { label: "Ideas", prompt },
});

describe("computeReadiness", () => {
  it("a clean session is all-clear (overall pass/info only)", () => {
    const r = run([capture("p1")]);
    expect(r.overall === "info" || r.overall === "pass").toBe(true);
    expect(r.checks.some((c) => c.severity === "blocker")).toBe(false);
  });

  it("empty required prompt → blocker (zod alone would pass it)", () => {
    // zod passes an empty string prompt...
    expect(validatePhaseConfig("capture", { label: "x", prompt: "" }).ok).toBe(true);
    // ...but pre-flight catches the blank.
    const r = run([capture("p1", "   ")]);
    const b = r.checks.find((c) => c.id === "empty:p1");
    expect(b?.severity).toBe("blocker");
    expect(r.overall).toBe("blocker");
  });

  it("dependency: a phase sourcing a missing/later phase → blocker (marketplace has a required top-level sourcePhaseId)", () => {
    // marketplace requires a top-level sourcePhaseId (z.string(), not optional).
    const mk = (id: string, sourcePhaseId: string) => ({
      id,
      moduleId: "marketplace" as ModuleKind,
      config: { label: "Market", sourcePhaseId },
    });
    // missing source
    expect(
      run([mk("r1", "nope")]).checks.find((c) => c.id === "dep:r1")?.severity,
    ).toBe("blocker");
    // source comes AFTER the consumer
    const later = run([mk("r1", "p2"), capture("p2")]);
    expect(later.checks.find((c) => c.id === "dep:r1")?.severity).toBe("blocker");
    // correctly wired (source earlier) → no dep blocker
    const ok = run([capture("p1"), mk("r2", "p1")]);
    expect(ok.checks.find((c) => c.id === "dep:r2")).toBeUndefined();
  });

  it("AI phase without a key → warning, never blocker", () => {
    const phases = [
      { id: "s1", moduleId: "synthesis" as ModuleKind, config: { label: "Synth" } },
    ];
    const r = run(phases, { aiConfigured: false });
    const ai = r.checks.find((c) => c.id === "ai:s1");
    expect(ai?.severity).toBe("warning");
    expect(r.checks.some((c) => c.severity === "blocker")).toBe(false);
    // with a key, no AI warning
    expect(
      run(phases, { aiConfigured: true }).checks.find((c) => c.id === "ai:s1"),
    ).toBeUndefined();
  });

  it("storage: blocker in prod, info in dev (never cries wolf locally)", () => {
    expect(run([capture("p1")], { kvConfigured: false, isProd: true }).checks.find((c) => c.id === "kv")?.severity).toBe("blocker");
    expect(run([capture("p1")], { kvConfigured: false, isProd: false }).checks.find((c) => c.id === "kv")?.severity).toBe("info");
    // configured → no kv check at all
    expect(run([capture("p1")], { kvConfigured: true }).checks.find((c) => c.id === "kv")).toBeUndefined();
  });

  it("always reports the joined count as info", () => {
    const r = run([capture("p1")], { participantCount: 7 });
    const j = r.checks.find((c) => c.id === "joined");
    expect(j?.severity).toBe("info");
    expect(j?.title).toContain("7");
  });

  it("overall is the worst severity present", () => {
    const r = run([capture("p1", "")], { aiConfigured: false });
    expect(r.overall).toBe("blocker"); // empty prompt outranks any warning/info
  });
});

describe("validateConfig parity (BuilderApp ↔ pre-flight)", () => {
  it("validatePhaseConfig mirrors the module's own schema.safeParse", () => {
    for (const id of Object.keys(SERVER_MODULES) as ModuleKind[]) {
      const def = SERVER_MODULES[id];
      const good = def.defaultConfig;
      expect(validatePhaseConfig(id, good).ok).toBe(
        def.schema.safeParse(good).success,
      );
    }
  });
});

describe("usesAi guard (regression: AI defs must declare it)", () => {
  it("every module that references the AI declares usesAi", () => {
    const AI_DEFS: ModuleKind[] = [
      "builder",
      "devil",
      "friction",
      "emptychair",
      "needs",
      "issuemap",
      "promptrelay",
      "persona",
      "synthesis",
    ];
    for (const id of AI_DEFS) {
      expect(SERVER_MODULES[id]?.capabilities.usesAi, `${id} usesAi`).toBe(true);
    }
  });

  it("LONG_TEXT matches load-bearing field names", () => {
    expect(LONG_TEXT.test("prompt")).toBe(true);
    expect(LONG_TEXT.test("label")).toBe(false);
  });

  // H2 slice 2 — an empty session is a (non-blocking) warning, not a crash.
  it("no phases → a warning 'No session built yet', never a blocker", () => {
    const r = run([]);
    const c = r.checks.find((x) => x.id === "empty");
    expect(c?.severity).toBe("warning");
    expect(r.overall).not.toBe("blocker");
  });

  // H2 — the "presenting to a dark screen" guard.
  it("a never-connected projector is NOT flagged (projector-less sessions are fine)", () => {
    const r = run([capture("p1")], { projectorSeen: null, now: 1_000_000 });
    expect(r.checks.some((c) => c.id === "projector")).toBe(false);
  });

  it("a fresh projector heartbeat is NOT flagged", () => {
    const now = 1_000_000;
    const r = run([capture("p1")], { projectorSeen: now - 3000, now });
    expect(r.checks.some((c) => c.id === "projector")).toBe(false);
  });

  it("a STALE projector (was here, now silent) → a warning, never a blocker", () => {
    const now = 1_000_000;
    const r = run([capture("p1")], { projectorSeen: now - 30_000, now });
    const c = r.checks.find((x) => x.id === "projector");
    expect(c?.severity).toBe("warning");
    expect(r.overall).not.toBe("blocker"); // advisory only — never blocks advancing
  });
});
