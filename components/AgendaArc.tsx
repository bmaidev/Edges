"use client";

import { useMemo } from "react";
import { analyzeAgenda, type ArcStage } from "@/lib/arc";
import type { PhaseInstance } from "@/lib/types";

const STAGE_COLOR: Record<ArcStage, string> = {
  open: "#6aa9ff",
  diverge: "rgb(var(--c-accent))",
  converge: "#5fd0a0",
  close: "#8a8aa0",
};
const STAGE_LABEL: Record<ArcStage, string> = {
  open: "Open",
  diverge: "Diverge",
  converge: "Converge",
  close: "Close",
};

// B1 — the agenda & arc: a session design reflected back as time (a proportional
// ledger vs the stated budget) and energy (an open→diverge→converge→close
// sparkline). Pure client render; nothing persisted. Hover is index-keyed (phase
// ids aren't unique in the builder).
export function AgendaArc({
  phases,
  minutes,
  selectedIndex,
  onSelect,
}: {
  phases: Pick<PhaseInstance, "moduleId" | "config">[];
  minutes?: number;
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
}) {
  const a = useMemo(() => analyzeAgenda(phases, minutes), [phases, minutes]);
  if (a.points.length === 0) return null;

  const W = 100; // SVG viewBox width (responsive via preserveAspectRatio none)
  const H = 44;
  const n = a.points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (e: number) => H - 6 - e * (H - 14); // higher energy = higher line
  const line = a.points.map((pt, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pt.energy).toFixed(1)}`).join(" ");

  const arcOk = a.hasOpen && a.hasDiverge && a.hasConverge && a.hasClose;

  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      {/* Time ledger */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Agenda &amp; arc
        </span>
        <span className={`text-xs tabular-nums ${a.overBudget ? "text-[#ffd27a]" : "text-muted"}`}>
          {a.estimated ? "~" : ""}
          {a.totalMinutes} min{" "}
          <span className="text-muted/70">/ {a.budget} budget</span>
          {a.overBudget && " · over"}
        </span>
      </div>

      {/* Proportional time bar — one segment per phase, coloured by arc stage */}
      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border/40">
        {a.points.map((pt) => (
          <button
            key={pt.index}
            onMouseEnter={() => onSelect(pt.index)}
            onMouseLeave={() => onSelect(null)}
            onClick={() => onSelect(pt.index)}
            title={`${pt.index + 1}. ${STAGE_LABEL[pt.stage]} · ${pt.estimated ? "~" : ""}${pt.minutes}m`}
            aria-label={`Phase ${pt.index + 1}`}
            className="h-full shrink-0 transition-opacity"
            style={{
              width: `${(pt.minutes / a.totalMinutes) * 100}%`,
              backgroundColor: STAGE_COLOR[pt.stage],
              opacity: selectedIndex === null || selectedIndex === pt.index ? 1 : 0.4,
            }}
          />
        ))}
      </div>

      {/* Energy sparkline */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 h-11 w-full"
        aria-hidden
      >
        <path d={line} fill="none" stroke="rgb(var(--c-accent))" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        {a.points.map((pt) => (
          <circle
            key={pt.index}
            cx={x(pt.index)}
            cy={y(pt.energy)}
            r={selectedIndex === pt.index ? 2.6 : 1.6}
            fill={STAGE_COLOR[pt.stage]}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        {(["open", "diverge", "converge", "close"] as ArcStage[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[s] }} />
            {STAGE_LABEL[s]}
          </span>
        ))}
        {!arcOk && (
          <span className="text-muted/70">
            · a full arc usually opens, diverges, converges, then closes
          </span>
        )}
      </div>
    </section>
  );
}
