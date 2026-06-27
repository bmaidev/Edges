"use client";

import type { CofacSensitivity } from "@/lib/cofac";

type Cmd = (command: string, args?: Record<string, unknown>) => Promise<Response>;

// C7 full — the lead's co-facilitator controls (Session tab, facilitator/admin
// only). A one-tap off-switch and a calm→keen eagerness dial. Reflects the live
// values from FacilitatorState; each change rides the `cofacToggle` host command.
const LEVELS: { id: CofacSensitivity; label: string; hint: string }[] = [
  { id: "calm", label: "Calm", hint: "rarely speaks up" },
  { id: "standard", label: "Standard", hint: "balanced" },
  { id: "keen", label: "Keen", hint: "more attentive" },
];

export function CofacSettings({
  enabled,
  sensitivity,
  cmd,
}: {
  enabled: boolean;
  sensitivity: CofacSensitivity;
  cmd: Cmd;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Co-facilitator</h3>
          <p className="text-xs text-muted">
            Gentle, content-free nudges on timing + response — never about anyone.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void cmd("cofacToggle", { enabled: e.target.checked })}
          />
          {enabled ? "On" : "Off"}
        </label>
      </div>
      {enabled && (
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => void cmd("cofacToggle", { sensitivity: l.id })}
              title={l.hint}
              aria-pressed={sensitivity === l.id}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                sensitivity === l.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
