import { describe, expect, it } from "vitest";
import { SAMPLE_VIEWS, getSampleView } from "@/lib/modules/sample-views";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B2 — config-reactive sample views for the in-builder preview. Pure, synthetic.

describe("getSampleView", () => {
  it("returns a view for every module that has a factory, null otherwise", () => {
    expect(getSampleView("poll", {})).not.toBeNull();
    expect(getSampleView("capture", {})).not.toBeNull();
    // a module without a factory degrades to null (caller shows a fallback)
    expect(getSampleView("synthesis", {})).toBeNull();
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

  it("the factored modules all have a real participant renderer to render into", async () => {
    const { getClientRenderer } = await import("@/lib/modules/registry.client");
    for (const id of Object.keys(SAMPLE_VIEWS) as ModuleKind[]) {
      const hasUi =
        getClientRenderer(id, "participant") || getClientRenderer(id, "projector");
      expect(hasUi, `${id} has no renderer to preview into`).toBeTruthy();
    }
  });
});
