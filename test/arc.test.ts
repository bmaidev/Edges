import { describe, expect, it } from "vitest";
import {
  DEFAULT_MINUTES,
  ENERGY_OF,
  STAGE_OF,
  TIMED,
  acceptsTimerEdit,
  analyzeAgenda,
  phaseMinutes,
} from "@/lib/arc";
import { timeBudget } from "@/lib/design";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import { TEMPLATES } from "@/lib/templates";
import type { ModuleKind } from "@/lib/types";

// B1 — the agenda/arc classifier. Pure, no store.

describe("curated tables are exhaustive over every module (drift gate)", () => {
  const ids = Object.keys(SERVER_MODULES) as ModuleKind[];
  it("STAGE_OF / ENERGY_OF / DEFAULT_MINUTES / TIMED cover every ModuleKind", () => {
    for (const id of ids) {
      expect(STAGE_OF[id], `STAGE_OF[${id}]`).toBeDefined();
      expect(typeof ENERGY_OF[id], `ENERGY_OF[${id}]`).toBe("number");
      expect(typeof DEFAULT_MINUTES[id], `DEFAULT_MINUTES[${id}]`).toBe("number");
      expect(typeof TIMED[id], `TIMED[${id}]`).toBe("boolean");
    }
  });
  it("energy values stay in 0..1", () => {
    for (const id of ids) {
      expect(ENERGY_OF[id]).toBeGreaterThanOrEqual(0);
      expect(ENERGY_OF[id]).toBeLessThanOrEqual(1);
    }
  });
});

describe("phaseMinutes", () => {
  it("uses config.timerSeconds when set (exact, not estimated)", () => {
    expect(phaseMinutes({ moduleId: "capture", config: { timerSeconds: 360 } })).toEqual({
      minutes: 6,
      estimated: false,
    });
  });
  it("falls back to the curated default (estimated) when no timer", () => {
    const r = phaseMinutes({ moduleId: "fishbowl", config: {} });
    expect(r.estimated).toBe(true);
    expect(r.minutes).toBe(DEFAULT_MINUTES.fishbowl);
  });
});

describe("acceptsTimerEdit", () => {
  it("is true for the timed modules incl. capture, false for untimed", () => {
    expect(acceptsTimerEdit("capture")).toBe(true);
    expect(acceptsTimerEdit("onetwofour")).toBe(true);
    expect(acceptsTimerEdit("poll")).toBe(false);
    expect(acceptsTimerEdit("lobby")).toBe(false);
  });
});

describe("analyzeAgenda", () => {
  it("a built-in template reads as a real arc with a sensible total", () => {
    const blueSky = TEMPLATES.find((t) => t.id === "blue-sky")!;
    const a = analyzeAgenda(blueSky.phases, 60);
    expect(a.points.length).toBe(blueSky.phases.length);
    expect(a.hasOpen).toBe(true);
    expect(a.hasClose).toBe(true);
    expect(a.totalMinutes).toBeGreaterThan(0);
    expect(a.budget).toBe(60);
  });
  it("flags over-budget honestly and marks estimates", () => {
    const phases = [
      { moduleId: "fishbowl" as ModuleKind, config: {} },
      { moduleId: "openspace" as ModuleKind, config: {} },
    ];
    const a = analyzeAgenda(phases, 10);
    expect(a.estimated).toBe(true); // both used defaults
    expect(a.overBudget).toBe(true); // 12 + 15 > 10
  });
  it("empty sequence does not throw", () => {
    const a = analyzeAgenda([], 60);
    expect(a.points).toEqual([]);
    expect(a.totalMinutes).toBe(0);
  });
});

describe("timeBudget (shared with the AI designer)", () => {
  it("defaults to 60 and honours a positive value", () => {
    expect(timeBudget()).toBe(60);
    expect(timeBudget(0)).toBe(60);
    expect(timeBudget(45)).toBe(45);
  });
});
