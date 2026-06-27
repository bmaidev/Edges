"use client";

import { paletteAudit } from "@/lib/a11y/contrast";

// D2 — surface WCAG AA contrast of the room palette right in the theme editor, so
// a facilitator sees (before anyone joins) whether their branding is legible.
// Advisory: it warns, never blocks a save. Reuses the pure paletteAudit engine.

function hexToTriple(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "0 0 0";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function ContrastStrip({ palette }: { palette: Record<string, string> }) {
  const findings = paletteAudit({
    bg: hexToTriple(palette.bg ?? "#000000"),
    surface: hexToTriple(palette.surface ?? "#000000"),
    accent: hexToTriple(palette.accent ?? "#000000"),
    muted: hexToTriple(palette.muted ?? "#000000"),
  });
  const failing = findings.filter((f) => !f.passes);

  return (
    <div className="mt-3 flex flex-col gap-1.5 rounded-lg border border-border bg-bg/40 p-3 text-xs">
      <span className="font-medium text-white/80">Contrast (WCAG AA)</span>
      <div className="grid gap-1 sm:grid-cols-2">
        {findings.map((f) => (
          <div key={f.pair} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-muted">{f.pair}</span>
            <span
              className={`shrink-0 font-mono ${f.passes ? "text-emerald-400" : "text-[#ff8a8a]"}`}
              title={f.passes ? "Passes AA" : "Below AA — hard to read"}
            >
              {f.ratio.toFixed(1)}:1 {f.passes ? "✓" : "✕"}
            </span>
          </div>
        ))}
      </div>
      {failing.length > 0 && (
        <p className="text-[#ffb454]">
          {failing.length} pairing{failing.length === 1 ? "" : "s"} below AA — readable
          for most, but consider a stronger contrast. (You can still save.)
        </p>
      )}
    </div>
  );
}
