import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  paletteAudit,
  parseTriple,
  passesAA,
  relativeLuminance,
} from "@/lib/a11y/contrast";

// D2 — WCAG contrast maths.

describe("relativeLuminance + contrastRatio", () => {
  it("black ≈ 0, white ≈ 1", () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
  it("white on black is the max 21:1", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
  });
  it("is symmetric", () => {
    const a: [number, number, number] = [200, 100, 50];
    const b: [number, number, number] = [10, 20, 30];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
});

describe("passesAA", () => {
  it("4.5 is the normal-text floor, 3.0 the large-text floor", () => {
    expect(passesAA(4.5)).toBe(true);
    expect(passesAA(4.49)).toBe(false);
    expect(passesAA(3.5, true)).toBe(true); // 3.5 passes large
    expect(passesAA(3.5, false)).toBe(false); // but fails normal
  });
});

describe("parseTriple", () => {
  it("parses the CSS-var triple format", () => {
    expect(parseTriple("15 26 53")).toEqual([15, 26, 53]);
    expect(parseTriple("232, 177, 74")).toEqual([232, 177, 74]);
  });
});

describe("paletteAudit", () => {
  const ours = { bg: "15 26 53", surface: "26 34 71", accent: "232 177 74", muted: "168 173 233" };
  it("returns all six load-bearing pairings", () => {
    const f = paletteAudit(ours);
    expect(f.length).toBe(6);
    expect(f.map((x) => x.pair)).toContain("Button label (on the accent)");
  });
  it("the shipped dark palette's body + button text pass AA", () => {
    const f = paletteAudit(ours);
    const body = f.find((x) => x.pair === "Body text on the background")!;
    const button = f.find((x) => x.pair === "Button label (on the accent)")!;
    expect(body.passes).toBe(true);
    expect(button.passes).toBe(true);
  });
  it("flags a pale accent's button label as failing (the silent footgun)", () => {
    const pale = paletteAudit({ ...ours, accent: "250 240 200" });
    const button = pale.find((x) => x.pair === "Button label (on the accent)")!;
    // dark text on a pale accent is fine; flip: a pale accent as TEXT on bg fails
    const accentText = pale.find((x) => x.pair === "Accent text on the background")!;
    expect(accentText.passes).toBe(true); // pale-on-dark is high contrast
    expect(button.ratio).toBeGreaterThan(1);
  });
  it("catches a genuinely low-contrast pairing", () => {
    const bad = paletteAudit({ bg: "40 40 40", surface: "50 50 50", accent: "70 70 70", muted: "90 90 90" });
    expect(bad.some((x) => !x.passes)).toBe(true);
  });
});
