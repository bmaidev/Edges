"use client";

import { useEffect } from "react";

// C3 — a low-profile, auto-dismissing grace window after a phase move. The 12s
// is for a NAVIGATION mistake (a mis-tapped Advance/Back/jump); it restores the
// position and re-queues any content the move released — it does not resurrect
// cleared answers.
export function UndoToast({
  label,
  onUndo,
  onDismiss,
}: {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 12_000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="flex items-center justify-center gap-3 border-b border-accent/20 bg-accent/10 px-4 py-2 text-center text-sm">
      <span className="text-muted">
        Moved to <span className="text-white/90">{label}</span>.
      </span>
      <button
        onClick={onUndo}
        className="font-medium text-accent underline hover:no-underline"
      >
        Undo
      </button>
    </div>
  );
}
