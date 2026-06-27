"use client";

import { useEffect, useState } from "react";

// C5 — a one-time, non-blocking prompt for this operator's display name. Asked
// once per device (an "asked" flag in localStorage), and only when no name is
// set yet — so a returning facilitator who already named themselves in another
// room is never asked again (the name itself is the cross-room fallback, stored
// by usePresence). Skippable: the baton just falls back to a role label.
const ASKED_KEY = "edges_host_name_asked";

export function NamePrompt({
  name,
  onSubmit,
}: {
  name: string;
  onSubmit: (name: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (name) return; // already named (this device, any room) — never ask
    try {
      if (localStorage.getItem(ASKED_KEY) === "1") return;
    } catch {
      /* no storage — ask in-memory once */
    }
    setShow(true);
  }, [name]);

  if (!show || name) return null;

  function markAsked() {
    try {
      localStorage.setItem(ASKED_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  function save() {
    const clean = draft.trim().slice(0, 40);
    if (clean) onSubmit(clean);
    markAsked();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
      <p className="text-muted">
        What should we call you? Co-hosts will see this name on the driving baton
        — it&apos;s a label only, never a login.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 40))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") markAsked();
          }}
          placeholder="Your name"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 focus:border-accent focus:outline-none"
        />
        <button
          onClick={save}
          disabled={!draft.trim()}
          className="rounded-lg border border-accent px-3 py-2 text-accent hover:bg-accent/10 disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={markAsked} className="rounded-lg px-3 py-2 text-muted hover:text-white">
          Not now
        </button>
      </div>
    </div>
  );
}
