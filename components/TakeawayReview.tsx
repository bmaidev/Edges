"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Modal } from "@/components/ui";
import { Button as UiButton } from "@/components/ui/button";
import type { Cmd } from "@/components/HostConsole";
import type { FacilitatorState } from "@/lib/types";

// F3 — review & curate the take-away the room keeps, BEFORE the irreversible
// publish-and-end. Fetches a server-true preview (the shared body only — never
// anyone else's raw text), shows an anonymity badge, and lets the host leave
// individual action items out. "Publish & end" carries the same exclusions.
type Preview = {
  participantCount: number;
  submissionCount: number;
  patterns: string[];
  report: { summary: string; themes: { title: string }[] } | null;
};
type Meta = { anonymousPhaseCount: number; excludedContributionCount: number };

export function TakeawayReview({
  state,
  apiBase,
  code,
  cmd,
}: {
  state: FacilitatorState;
  apiBase: string;
  code: string;
  cmd: Cmd;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const items = state.actionItems ?? [];

  async function load() {
    setBusy(true);
    setOpen(true);
    setExcluded(new Set());
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "previewTakeaway", code }),
      });
      const d = await res.json().catch(() => ({}));
      setPreview(d.preview ?? null);
      setMeta(d.meta ?? null);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setExcluded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <UiButton variant="secondary" onClick={load} className="w-full justify-center">
        <Eye /> Review what the room keeps
      </UiButton>
      {open && (
        <Modal title="The take-away — review & curate" onClose={() => setOpen(false)}>
          {busy && !preview ? (
            <p className="text-sm text-muted">Preparing the recap…</p>
          ) : !preview ? (
            <p className="text-sm text-[#ff8a8a]">Couldn&apos;t build the preview.</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              <p className="text-xs text-muted">
                This is exactly what each participant keeps. Their own contributions are
                added privately, per person — you only see the shared body.
              </p>

              {meta && meta.anonymousPhaseCount > 0 && (
                <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
                  🙈 {meta.anonymousPhaseCount} anonymous phase
                  {meta.anonymousPhaseCount === 1 ? "" : "s"} — those {meta.excludedContributionCount}{" "}
                  contribution{meta.excludedContributionCount === 1 ? "" : "s"} are kept private and
                  never enter the recap.
                </p>
              )}

              {preview.report?.summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Summary</p>
                  <p className="mt-1 text-white/90">{preview.report.summary}</p>
                </div>
              )}

              {items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Action items <span className="text-muted/60">(uncheck to leave out)</span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {items.map((a) => (
                      <li key={a.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!excluded.has(a.id)}
                          onChange={() => toggle(a.id)}
                        />
                        <span className={excluded.has(a.id) ? "text-muted line-through" : ""}>
                          {a.text}
                          {a.ownerName ? ` — ${a.ownerName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-muted">
                {preview.participantCount} people · {preview.submissionCount} contributions ·{" "}
                {preview.patterns.length} themes curated
              </p>

              <div className="mt-1 flex gap-2">
                <UiButton
                  variant="danger"
                  onClick={() => {
                    cmd("end", { excludeActionItems: Array.from(excluded) });
                    setOpen(false);
                  }}
                >
                  Publish &amp; end session
                </UiButton>
                <UiButton variant="ghost" onClick={() => setOpen(false)}>
                  Keep going
                </UiButton>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
