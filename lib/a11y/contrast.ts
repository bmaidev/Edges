// D2 — pure WCAG contrast maths (no DOM/React/KV), so the admin theme editor and
// any audit can prove AA before anyone joins. Colours are [r,g,b] 0..255.

export type RGB = [number, number, number];

export function relativeLuminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// AA: 4.5:1 for normal text, 3:1 for large text (or UI components).
export function passesAA(ratio: number, large = false): boolean {
  return ratio >= (large ? 3.0 : 4.5);
}

// Parse the CSS-var triple format ("15 26 53") into an RGB tuple.
export function parseTriple(s: string): RGB {
  const p = s.trim().split(/[\s,]+/).map(Number);
  return [p[0] || 0, p[1] || 0, p[2] || 0];
}

export interface PaletteTriples {
  bg: string;
  surface: string;
  accent: string;
  muted: string;
}
export interface ContrastFinding {
  pair: string;
  ratio: number;
  passes: boolean;
  large: boolean;
}

// Audit the load-bearing text/background pairings of a room palette. Includes the
// highest-risk one: the primary Button label, which is bg-coloured text ON the
// accent — a pale accent silently fails it.
export function paletteAudit(p: PaletteTriples): ContrastFinding[] {
  const bg = parseTriple(p.bg);
  const surface = parseTriple(p.surface);
  const accent = parseTriple(p.accent);
  const muted = parseTriple(p.muted);
  const white: RGB = [255, 255, 255];
  const raw: { pair: string; a: RGB; b: RGB; large: boolean }[] = [
    { pair: "Body text on the background", a: white, b: bg, large: false },
    { pair: "Body text on a surface card", a: white, b: surface, large: false },
    { pair: "Muted text on the background", a: muted, b: bg, large: false },
    { pair: "Accent text on the background", a: accent, b: bg, large: false },
    { pair: "Button label (on the accent)", a: bg, b: accent, large: false },
    { pair: "Accent text on a surface card", a: accent, b: surface, large: false },
  ];
  return raw.map(({ pair, a, b, large }) => {
    const ratio = contrastRatio(a, b);
    return { pair, ratio: Math.round(ratio * 100) / 100, passes: passesAA(ratio, large), large };
  });
}
