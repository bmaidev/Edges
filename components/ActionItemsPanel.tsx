"use client";

import { useState } from "react";
import { Button, InlineEdit } from "@/components/ui";
import type { Cmd } from "@/components/HostConsole";
import type { FacilitatorState } from "@/lib/types";

// F2 — the always-on action-item register. Capture decisions/owners/actions live
// during ANY phase; they persist across advances and flow into the handover.
// Uses the shared cmd() because `actionItem` returns the authoritative rev'd
// state, so adds/edits show instantly and a stale poll can't clobber them.
export function ActionItemsPanel({
  state,
  cmd,
}: {
  state: FacilitatorState;
  cmd: Cmd;
}) {
  const items = state.actionItems ?? [];
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  function add() {
    const t = text.trim();
    if (!t) return;
    cmd("actionItem", {
      op: { kind: "add", text: t, ownerName: owner.trim() || undefined, due: due || undefined },
    });
    setText("");
    setOwner("");
    setDue("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Action items
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {items.length > 0 && (
            <span className="text-muted">
              {items.filter((a) => a.status === "open").length} open · {items.length} total
            </span>
          )}
          {items.length > 0 && (
            <button
              onClick={() =>
                cmd("actionItem", { op: { kind: "promote", on: !state.actionItemsPromoted } })
              }
              className={`underline ${state.actionItemsPromoted ? "text-accent" : "text-muted"}`}
            >
              {state.actionItemsPromoted ? "✓ on the big screen" : "Show on big screen"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Capture a decision or action…"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Owner"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none sm:w-28"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted focus:border-accent focus:outline-none"
        />
        <Button onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted">
          Nothing yet — capture commitments as they surface; they&apos;ll appear in
          the handover report.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const overdue = a.status === "open" && a.due && a.due < today;
            return (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2"
              >
                <button
                  aria-label={a.status === "done" ? "Mark open" : "Mark done"}
                  onClick={() =>
                    cmd("actionItem", {
                      op: { kind: "setStatus", id: a.id, status: a.status === "done" ? "open" : "done" },
                    })
                  }
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                    a.status === "done"
                      ? "border-accent bg-accent text-bg"
                      : "border-border"
                  }`}
                >
                  {a.status === "done" ? "✓" : ""}
                </button>
                <div className="flex-1">
                  <span className={a.status === "done" ? "text-muted line-through" : ""}>
                    <InlineEdit
                      value={a.text}
                      onSave={(t) =>
                        cmd("actionItem", { op: { kind: "update", id: a.id, text: t } })
                      }
                    />
                  </span>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                    {a.ownerName && <span>· {a.ownerName}</span>}
                    {a.due && (
                      <span className={overdue ? "text-[#ffd27a]" : ""}>
                        due {a.due}
                        {overdue ? " · overdue" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  aria-label="Delete"
                  onClick={() => cmd("actionItem", { op: { kind: "remove", id: a.id } })}
                  className="shrink-0 text-xs text-muted hover:text-[#ff8a8a]"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
