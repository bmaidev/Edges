"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import type { Readiness, Role, Severity } from "@/lib/types";

const TONE: Record<string, { dot: string; text: string; border: string }> = {
  blocker: { dot: "bg-[#ff8a8a]", text: "text-[#ff8a8a]", border: "border-[#ff8a8a]/40" },
  warning: { dot: "bg-amber-400", text: "text-[#ffe2ad]", border: "border-amber-400/40" },
  ok: { dot: "bg-emerald-400", text: "text-emerald-300", border: "border-emerald-400/40" },
};

// H2 — a quiet pre-flight pill in the host header. Calm when ready; surfaces a
// count to fix/check otherwise. Advisory only — it opens a sheet, never blocks.
export function PreflightPill({
  readiness,
  onOpen,
}: {
  readiness: Readiness;
  onOpen: () => void;
}) {
  const blockers = readiness.checks.filter((c) => c.severity === "blocker").length;
  const warnings = readiness.checks.filter((c) => c.severity === "warning").length;
  const key = blockers ? "blocker" : warnings ? "warning" : "ok";
  const t = TONE[key];
  const label = blockers
    ? `${blockers} to fix`
    : warnings
      ? `${warnings} to check`
      : "Ready";
  return (
    <button
      onClick={onOpen}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${t.border} ${t.text} hover:bg-white/5`}
      title="Pre-flight check"
    >
      <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
      {label}
    </button>
  );
}

const SECTIONS: { sev: Severity; heading: string }[] = [
  { sev: "blocker", heading: "Fix before going live" },
  { sev: "warning", heading: "Worth a look" },
  { sev: "info", heading: "For your awareness" },
];

export function PreflightSheet({
  readiness,
  role = "facilitator",
  onClose,
  onRemedy,
  onRecheck,
}: {
  readiness: Readiness;
  // H2 — a cohost can't reach the Session/Content tabs, so a "Fix" there is dead.
  // We relabel it for them rather than offer a button that goes nowhere.
  role?: Role;
  onClose: () => void;
  onRemedy: (tab: "session" | "content") => void;
  onRecheck?: () => void;
}) {
  // H2 — pass rows lead with nothing actionable, so collapse the "for awareness"
  // section by default; the sheet opens on what needs attention.
  const [showInfo, setShowInfo] = useState(false);
  const isCohost = role === "cohost";
  const infoCount = readiness.checks.filter((c) => c.severity === "info").length;

  return (
    <Modal title="Pre-flight check" onClose={onClose}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted">
          A heads-up before the room arrives. Nothing here blocks you — you decide
          when to launch.
        </p>
        {onRecheck && (
          <button
            onClick={onRecheck}
            className="shrink-0 text-xs text-accent underline hover:text-white"
            title="Re-run the check now"
          >
            ↻ Re-check
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {SECTIONS.map(({ sev, heading }) => {
          const items = readiness.checks.filter((c) => c.severity === sev);
          if (!items.length) return null;
          const t = TONE[sev === "blocker" ? "blocker" : sev === "warning" ? "warning" : "ok"];
          // Collapse the info ("for awareness") rows behind a toggle.
          if (sev === "info" && !showInfo) {
            return (
              <button
                key={sev}
                onClick={() => setShowInfo(true)}
                className="self-start text-xs text-muted underline hover:text-white"
              >
                Show {infoCount} more for awareness
              </button>
            );
          }
          return (
            <div key={sev}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${t.text}`}>
                {heading}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />
                    <span className="flex-1 text-sm">
                      <span className="font-medium text-white/90">{c.title}</span>
                      {c.detail && (
                        <span className="block text-xs text-muted">{c.detail}</span>
                      )}
                    </span>
                    {c.remedyTab &&
                      (isCohost && c.remedyTab === "session" ? (
                        <span className="shrink-0 text-xs text-muted">lead fixes</span>
                      ) : (
                        <button
                          onClick={() => onRemedy(c.remedyTab!)}
                          className="shrink-0 text-xs text-accent underline"
                        >
                          Fix
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
