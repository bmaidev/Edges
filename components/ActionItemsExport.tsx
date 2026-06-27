"use client";

import { useState } from "react";
import {
  actionItemsToCsv,
  actionItemsToText,
  type ArchiveActionItem,
} from "@/lib/report/action-items";

// F2 — send-after export of an archived session's action-item register: copy as a
// plain list (for an email) or download a CSV (for a tracker). Renders nothing
// when there are no items, so it never clutters a register-free report.
export function ActionItemsExport({
  items,
  slug,
}: {
  items: ArchiveActionItem[] | undefined;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!items || items.length === 0) return null;

  function copy() {
    navigator.clipboard?.writeText(actionItemsToText(items)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  function downloadCsv() {
    if (typeof document === "undefined") return;
    const blob = new Blob([actionItemsToCsv(items)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-actions.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">
        {items.length} action item{items.length === 1 ? "" : "s"}:
      </span>
      <button
        onClick={copy}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent"
      >
        {copied ? "Copied ✓" : "Copy list"}
      </button>
      <button
        onClick={downloadCsv}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-accent"
      >
        Download CSV
      </button>
    </div>
  );
}
