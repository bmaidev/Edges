"use client";

import { useState } from "react";

// A1/A5 — the shared "reveal a raw passcode" affordance. The link IS the key on
// every share surface, so the plaintext code is the demoted fallback: hidden
// behind "Show code", then shown monospace with a one-tap copy. Extracted so the
// reveal looks and behaves identically wherever a raw code is surfaced
// (RoomAccessCard rows, the create/duplicate cards, any future legacy-room view).
export function PasscodeReveal({
  code,
  label = "code",
}: {
  code: string;
  label?: string;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the revealed code is still selectable */
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((s) => !s)}
        className="text-xs text-muted underline decoration-dotted"
      >
        {shown ? `Hide ${label}` : `Show ${label}`}
      </button>
      {shown && (
        <>
          <code className="break-all font-mono text-xs text-muted">{code}</code>
          <button
            type="button"
            onClick={copy}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-white/80 hover:border-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </>
      )}
    </span>
  );
}
