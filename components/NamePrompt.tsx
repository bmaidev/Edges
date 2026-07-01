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

  // A quiet single-row bar, not a stacked card — it's a one-time optional nicety,
  // so it shouldn't claim prime space at the top of the console.
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-surface/40 px-3 py-1.5 text-sm">
      <span className="text-muted">
        Name yourself for the driving baton — a label only, never a login.
      </span>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 40))}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") markAsked();
        }}
        placeholder="Your name"
        className="min-w-[7rem] flex-1 rounded-md border border-border bg-bg/60 px-2.5 py-1 focus:border-accent focus:outline-none"
      />
      <button
        onClick={save}
        disabled={!draft.trim()}
        className="rounded-md border border-accent/50 px-2.5 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
      >
        Save
      </button>
      <button
        onClick={markAsked}
        className="px-1 text-xs text-muted hover:text-white"
      >
        Skip
      </button>
    </div>
  );
}
