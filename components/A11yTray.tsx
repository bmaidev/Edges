"use client";

import { useState } from "react";
import { SCALES, type A11yPrefs } from "@/lib/a11y/prefs";

// D2 — the floating "Aa" accessibility control. Keyboard-operable, labelled, and
// honest: a one-line note that nothing here leaves the device.
export function A11yTray({
  prefs,
  update,
}: {
  prefs: A11yPrefs;
  update: (p: Partial<A11yPrefs>) => void;
}) {
  const [open, setOpen] = useState(false);
  const sizeLabel = (s: number) => (s === 1 ? "A" : s === 1.25 ? "A+" : "A++");

  return (
    <>
      <button
        type="button"
        aria-label="Accessibility options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="safe-bottom fixed bottom-4 left-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-white shadow-lg"
      >
        Aa
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Accessibility options"
          className="fixed bottom-16 left-4 z-50 w-64 rounded-xl border border-border bg-surface p-4 shadow-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Accessibility
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Only on this device — never shared with the room.
          </p>

          <div className="mt-3">
            <span className="text-xs text-white/80">Text size</span>
            <div className="mt-1 flex gap-1">
              {SCALES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={prefs.scale === s}
                  onClick={() => update({ scale: s })}
                  className={`flex-1 rounded border px-2 py-1.5 text-xs ${
                    prefs.scale === s
                      ? "border-accent text-accent"
                      : "border-border text-muted"
                  }`}
                >
                  {sizeLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <Toggle label="High contrast" on={prefs.contrast} onToggle={() => update({ contrast: !prefs.contrast })} />
          <Toggle label="Reduce motion" on={prefs.reduceMotion} onToggle={() => update({ reduceMotion: !prefs.reduceMotion })} />
          <Toggle label="Readable font" on={prefs.readable} onToggle={() => update({ readable: !prefs.readable })} />
        </div>
      )}
    </>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="mt-3 flex w-full items-center justify-between text-sm text-white/90"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
