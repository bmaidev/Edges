"use client";

import { RUNSHEET_KEY, extractRunsheet } from "@/lib/modules/runsheet";
import type { RunSheet } from "@/lib/types";

// B3 — author a phase's facilitator-private run-sheet in the builder. Nested in
// the phase config under RUNSHEET_KEY (round-trips untouched; stripped before any
// participant/projector ever sees the config).
export function RunSheetSection({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const rs = extractRunsheet(config) ?? {};
  const hasContent = Boolean(
    rs.script || (rs.talkingPoints?.length ?? 0) > 0 || rs.contingency,
  );

  function set(patch: Partial<RunSheet>) {
    const next: RunSheet = { ...rs, ...patch };
    onChange({ ...config, [RUNSHEET_KEY]: next });
  }

  const field =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none";

  return (
    <details className="mt-3 rounded-lg border border-border/60 bg-bg/40 p-2" open={hasContent}>
      <summary className="cursor-pointer text-xs font-medium text-muted">
        🎙 Run-sheet <span className="text-muted/70">(private — only you see this)</span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Script — what to say / do</span>
          <textarea
            rows={2}
            value={rs.script ?? ""}
            onChange={(e) => set({ script: e.target.value })}
            placeholder="“We're going to spend 6 minutes capturing ideas — no wrong answers…”"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Talking points <span className="text-muted/70">(one per line)</span></span>
          <textarea
            rows={2}
            value={(rs.talkingPoints ?? []).join("\n")}
            onChange={(e) => set({ talkingPoints: e.target.value.split("\n") })}
            placeholder={"reinforce the prompt\ncall out the timer"}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">If it goes quiet…</span>
          <textarea
            rows={2}
            value={rs.contingency ?? ""}
            onChange={(e) => set({ contingency: e.target.value })}
            placeholder="Seed one example, then re-ask. Nudge the room."
            className={field}
          />
        </label>
      </div>
    </details>
  );
}
