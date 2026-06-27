// F1 — inline light curation of the AI session report: the "glance, fix, send"
// promise. The facilitator can edit the summary, rename or drop a theme, drop a
// tension / decision / next-step, and reorder lists — BEFORE sharing. Pure +
// client-safe so the host UI can apply an edit optimistically and the server can
// re-apply it authoritatively over the durable archive.

import type { SessionReport } from "./types";

// One structured, idempotent-ish edit. Index-based (the lists are short and the
// UI holds the live order); an out-of-range index is a no-op rather than a throw.
export type ReportEdit =
  | { kind: "summary"; text: string }
  | { kind: "renameTheme"; index: number; title?: string; detail?: string }
  | { kind: "dropTheme"; index: number }
  | { kind: "dropTension"; index: number }
  | { kind: "dropDecision"; index: number }
  | { kind: "dropStep"; index: number }
  | { kind: "reorderThemes"; order: number[] }
  | { kind: "reorderSteps"; order: number[] };

// F1 — report sharing preferences. Conservative defaults preserve the off-the-
// record ethos: no verbatim quotes, no attribution unless the facilitator opts in.
export interface ReportMeta {
  showQuotes?: boolean; // include verbatim participant quotes in the shared report
  attribution?: "anonymous" | "named"; // default "anonymous"
}

function dropAt<T>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

// Reorder by an index permutation. A malformed `order` (wrong length, dupes, or
// out-of-range) is rejected → the list is returned unchanged (never corrupted).
function reorder<T>(list: T[], order: number[]): T[] {
  if (order.length !== list.length) return list;
  const seen = new Set<number>();
  for (const i of order) {
    if (i < 0 || i >= list.length || seen.has(i)) return list;
    seen.add(i);
  }
  return order.map((i) => list[i]);
}

export function applyReportEdit(report: SessionReport, edit: ReportEdit): SessionReport {
  switch (edit.kind) {
    case "summary":
      return { ...report, summary: edit.text.slice(0, 2000) };
    case "renameTheme": {
      const themes = report.themes.map((t, i) =>
        i === edit.index
          ? {
              title: (edit.title ?? t.title).slice(0, 120),
              detail: (edit.detail ?? t.detail).slice(0, 600),
            }
          : t,
      );
      return { ...report, themes };
    }
    case "dropTheme":
      return { ...report, themes: dropAt(report.themes, edit.index) };
    case "dropTension":
      return { ...report, tensions: dropAt(report.tensions, edit.index) };
    case "dropDecision":
      return { ...report, decisions: dropAt(report.decisions, edit.index) };
    case "dropStep":
      return { ...report, nextSteps: dropAt(report.nextSteps, edit.index) };
    case "reorderThemes":
      return { ...report, themes: reorder(report.themes, edit.order) };
    case "reorderSteps":
      return { ...report, nextSteps: reorder(report.nextSteps, edit.order) };
    default:
      return report;
  }
}

// Coerce an untrusted ReportMeta to the safe shape (defaults preserve anonymity).
export function normalizeReportMeta(raw: unknown): ReportMeta {
  const m = (raw ?? {}) as Record<string, unknown>;
  return {
    showQuotes: m.showQuotes === true,
    attribution: m.attribution === "named" ? "named" : "anonymous",
  };
}
