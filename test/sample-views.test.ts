import { describe, expect, it } from "vitest";
import { SAMPLE_VIEWS, getSampleView } from "@/lib/modules/sample-views";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B2 — config-reactive sample views for the in-builder preview. Pure, synthetic.

describe("getSampleView", () => {
  it("returns a view for every module that has a factory, null otherwise", () => {
    expect(getSampleView("poll", {})).not.toBeNull();
    expect(getSampleView("capture", {})).not.toBeNull();
    expect(getSampleView("spectrogram", {})).not.toBeNull(); // fleet modules covered
    // B2 — the AI-synthesis family now previews illustratively.
    expect(getSampleView("devil", {})).not.toBeNull();
    expect(getSampleView("emptychair", {})).not.toBeNull();
    expect(getSampleView("friction", {})).not.toBeNull();
    expect(getSampleView("fishbowl", {})).not.toBeNull();
    expect(getSampleView("consult", {})).not.toBeNull();
    expect(getSampleView("onetwofour", {})).not.toBeNull();
    expect(getSampleView("media", {})).not.toBeNull();
    // the non-placeable meta/synthetic modules legitimately have no preview
    // factory and degrade to null (the caller shows a fallback).
    expect(getSampleView("builder", {})).toBeNull();
    expect(getSampleView("ambient", {})).toBeNull();
  });

  it("an AI-synthesis sample is in its hasResult 'payoff' state, marked available", () => {
    const d = getSampleView("devil", {}) as {
      hasResult: boolean;
      available: boolean;
      objections: unknown[];
    };
    expect(d.hasResult).toBe(true);
    expect(d.available).toBe(true);
    expect(d.objections.length).toBeGreaterThan(0);
  });

  it("never throws on defaultConfig or on mutated configs", () => {
    for (const id of Object.keys(SAMPLE_VIEWS) as ModuleKind[]) {
      const def = SERVER_MODULES[id];
      expect(() => getSampleView(id, def.defaultConfig as Record<string, unknown>)).not.toThrow();
      expect(() => getSampleView(id, {})).not.toThrow();
      expect(() => getSampleView(id, { junk: true })).not.toThrow();
    }
  });

  it("is config-reactive — a poll's options flow into the sample view", () => {
    const v = getSampleView("poll", { options: ["Apple", "Pear", "Plum"] }) as {
      options: string[];
      counts: Record<string, number>;
    };
    expect(v.options).toEqual(["Apple", "Pear", "Plum"]);
    expect(Object.keys(v.counts)).toEqual(["Apple", "Pear", "Plum"]);
  });

  it("a scale's statements + labels flow through", () => {
    const v = getSampleView("scale", {
      statements: ["A", "B"],
      labels: ["lo", "hi"],
      min: 1,
      max: 7,
    }) as { statements: string[]; labels?: [string, string]; max: number; stats: unknown[] };
    expect(v.statements).toEqual(["A", "B"]);
    expect(v.labels).toEqual(["lo", "hi"]);
    expect(v.max).toBe(7);
    expect(v.stats.length).toBe(2); // one stat per statement
  });

  it("produces a 'payoff' state — votes show a distribution + the caller's own pick", () => {
    const poll = getSampleView("poll", { options: ["X", "Y"] }) as { counts: Record<string, number>; mine: string[] };
    expect(Object.values(poll.counts).some((n) => n > 0)).toBe(true);
    expect(poll.mine.length).toBeGreaterThan(0);
    const dot = getSampleView("dotvote", { options: ["X", "Y"], dots: 5 }) as { remaining: number };
    expect(dot.remaining).toBeLessThan(5); // some dots already spent
  });

  // The dynamic import of the full client registry can exceed the default 5s
  // timeout when this runs cold under the full-suite load — a CI flake, not a
  // real failure. Give the one-off import generous headroom.
  it("the factored modules all have a real participant renderer to render into", async () => {
    const { getClientRenderer } = await import("@/lib/modules/registry.client");
    for (const id of Object.keys(SAMPLE_VIEWS) as ModuleKind[]) {
      const hasUi =
        getClientRenderer(id, "participant") || getClientRenderer(id, "projector");
      expect(hasUi, `${id} has no renderer to preview into`).toBeTruthy();
    }
  }, 20_000);
});
