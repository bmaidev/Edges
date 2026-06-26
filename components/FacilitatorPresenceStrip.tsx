"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/presence";
import type { HostPresence } from "@/lib/types";

// C5 — a glanceable "who else is driving" strip for the host cockpit. Shows the
// live co-facilitators (dot + name/role), with the current operator able to set
// their own display name inline. Renders nothing when you're solo — co-
// facilitation chrome should be invisible until there's actually a co-host.
export function FacilitatorPresenceStrip({
  presence,
  myId,
  myName,
  onRename,
}: {
  presence: HostPresence[];
  myId: string;
  myName: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(myName);

  // Solo (just me, or nobody resolved yet) → no chrome.
  const others = presence.filter((p) => p.presenceId !== myId);
  if (others.length === 0 && !editing) {
    // Still offer a quiet "name yourself" affordance once a name is unset, so a
    // co-host who joins later sees a real name — but no full strip while solo.
    return null;
  }

  const label = (p: HostPresence) =>
    p.presenceId === myId
      ? myName || "You"
      : p.name || roleLabel(p.role);

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface/60 px-2.5 py-1.5 text-xs"
      role="status"
      aria-live="polite"
    >
      <span className="text-muted">Driving together:</span>
      {presence.map((p) => (
        <span
          key={p.presenceId}
          className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 ${
            p.presenceId === myId ? "bg-accent/15 text-accent" : "bg-bg/60 text-white/80"
          }`}
          title={roleLabel(p.role)}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          {label(p)}
          {p.role === "cohost" && (
            <span className="text-[10px] uppercase tracking-wide text-muted">co</span>
          )}
        </span>
      ))}
      {/* rename yourself */}
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(draft.trim());
            setEditing(false);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            className="w-28 rounded border border-border bg-bg px-2 py-0.5 text-xs focus:border-accent focus:outline-none"
          />
          <button className="rounded border border-border px-2 py-0.5 hover:border-accent">
            Save
          </button>
        </form>
      ) : (
        <button
          onClick={() => {
            setDraft(myName);
            setEditing(true);
          }}
          className="text-muted underline hover:text-white"
        >
          {myName ? "rename" : "name yourself"}
        </button>
      )}
    </div>
  );
}
