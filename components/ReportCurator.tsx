"use client";

import { useState } from "react";
import type { RoomArchive } from "@/lib/rooms";
import type { ReportEdit } from "@/lib/report-edit";

// F1 — inline report curation UI. Each tweak posts editReport / setReportMeta to
// the host route and swaps in the returned (authoritative) archive, so the
// curation is durable and the preview stays in sync. "Glance, fix, send."
export function ReportCurator({
  archive,
  apiBase,
  code,
  onUpdate,
}: {
  archive: RoomArchive;
  apiBase: string;
  code: string;
  onUpdate: (a: RoomArchive) => void;
}) {
  const [busy, setBusy] = useState(false);
  const report = archive.report;

  async function post(command: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, code, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.archive) onUpdate(d.archive as RoomArchive);
    } finally {
      setBusy(false);
    }
  }
  const edit = (e: ReportEdit) => post("editReport", { edit: e });

  if (!report) {
    return <p className="text-sm text-muted">No report to curate yet.</p>;
  }
  const meta = archive.reportMeta ?? { showQuotes: false, attribution: "anonymous" as const };

  return (
    <div className={`flex flex-col gap-4 text-sm ${busy ? "opacity-60" : ""}`}>
      {/* Summary */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Summary</span>
        <textarea
          defaultValue={report.summary}
          onBlur={(e) => {
            if (e.target.value !== report.summary) edit({ kind: "summary", text: e.target.value });
          }}
          rows={3}
          className="resize-none rounded-lg border border-border bg-bg px-3 py-2 focus:border-accent focus:outline-none"
        />
      </label>

      {/* Themes — rename inline (commit on blur) + drop. */}
      <Section title="Themes">
        {report.themes.map((t, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-bg p-2">
            <div className="flex-1">
              <input
                defaultValue={t.title}
                onBlur={(e) => {
                  if (e.target.value !== t.title) edit({ kind: "renameTheme", index: i, title: e.target.value });
                }}
                className="w-full bg-transparent font-medium focus:outline-none"
              />
              <input
                defaultValue={t.detail}
                onBlur={(e) => {
                  if (e.target.value !== t.detail) edit({ kind: "renameTheme", index: i, detail: e.target.value });
                }}
                className="w-full bg-transparent text-xs text-muted focus:outline-none"
              />
            </div>
            {i > 0 && <MoveUp onClick={() => edit({ kind: "reorderThemes", order: swap(report.themes.length, i) })} />}
            <Drop onClick={() => edit({ kind: "dropTheme", index: i })} />
          </div>
        ))}
      </Section>

      <DropList title="Tensions" items={report.tensions} onDrop={(i) => edit({ kind: "dropTension", index: i })} />
      <DropList title="Decisions" items={report.decisions} onDrop={(i) => edit({ kind: "dropDecision", index: i })} />
      <Section title="Next steps">
        {report.nextSteps.map((s, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5">
            <span className="flex-1">{s}</span>
            {i > 0 && <MoveUp onClick={() => edit({ kind: "reorderSteps", order: swap(report.nextSteps.length, i) })} />}
            <Drop onClick={() => edit({ kind: "dropStep", index: i })} />
          </div>
        ))}
      </Section>

      {/* Sharing prefs. */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Sharing</span>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={meta.showQuotes === true}
            onChange={(e) => post("setReportMeta", { meta: { ...meta, showQuotes: e.target.checked } })}
          />
          Include verbatim quotes in the shared report
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={meta.attribution === "named"}
            onChange={(e) => post("setReportMeta", { meta: { ...meta, attribution: e.target.checked ? "named" : "anonymous" } })}
          />
          Attribute contributions by name (off = anonymous)
        </label>
      </div>

      <button
        onClick={() => post("regenerateReport", {})}
        disabled={busy}
        className="self-start text-xs text-muted underline hover:text-accent disabled:opacity-40"
      >
        ↻ Regenerate from scratch (discards edits)
      </button>
    </div>
  );
}

// Move item i up one slot (swap with i-1) as an index permutation.
function swap(len: number, i: number): number[] {
  const order = Array.from({ length: len }, (_, k) => k);
  [order[i - 1], order[i]] = [order[i], order[i - 1]];
  return order;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</span>
      {children}
    </div>
  );
}

function DropList({ title, items, onDrop }: { title: string; items: string[]; onDrop: (i: number) => void }) {
  if (items.length === 0) return null;
  return (
    <Section title={title}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5">
          <span className="flex-1">{it}</span>
          <Drop onClick={() => onDrop(i)} />
        </div>
      ))}
    </Section>
  );
}

function Drop({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Remove" className="shrink-0 text-[#ff8a8a] hover:text-[#ffb0b0]">
      ✕
    </button>
  );
}
function MoveUp({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Move up" className="shrink-0 text-muted hover:text-accent">
      ↑
    </button>
  );
}
