"use client";

import { Button, Modal } from "@/components/ui";

// C3 — a calm, accent (NOT danger) confirm for a data-clearing recovery action.
// Never says "delete" or "wipe". A zero-count phase takes the soft path — no
// alarming "clear N responses", just a reassuring re-run.
export function ConfirmSheet({
  title,
  count,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  count: number;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const soft = count === 0;
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm leading-relaxed text-muted">
        {soft
          ? "Nothing's been collected here yet — this just re-runs the phase fresh."
          : `This clears the ${count} ${
              count === 1 ? "response" : "responses"
            } on this phase so you can run it clean. The room's other phases are untouched, and this can't be undone.`}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Keep them
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
