"use client";

import { ButtonHTMLAttributes, useState } from "react";

// Small, calm UI primitives. Sentence case everywhere, generous tap targets.

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150 ease-out active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 px-5 py-3 text-base";
  const variants: Record<string, string> = {
    // Accent CTA with a soft themeable glow that lifts on hover.
    primary:
      "bg-accent text-bg shadow-[0_8px_28px_-12px_rgb(var(--c-accent)/0.85)] hover:shadow-[0_12px_34px_-10px_rgb(var(--c-accent)/0.95)] hover:brightness-[1.04] active:brightness-95",
    ghost:
      "bg-surface/80 text-white border border-border backdrop-blur-sm hover:border-accent/50 hover:bg-surface active:bg-[#1d264c]",
    danger:
      "bg-transparent text-[#ff8a8a] border border-[#5a2a2a] hover:bg-[#2a1a1a]",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function PhaseBar({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-border px-5 py-3 text-sm text-muted">
      {label}
    </div>
  );
}

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
      {children}
    </main>
  );
}

// A calm, on-brand modal to replace native confirm()/alert().
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

// Click-to-edit text: shows value with an "edit" affordance; edits in a styled
// textarea with Save/Cancel — replaces single-line native prompt().
export function InlineEdit({
  value,
  onSave,
  multiline = true,
  label = "edit",
}: {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing)
    return (
      <button
        className="text-xs text-muted underline"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {label}
      </button>
    );
  return (
    <div className="mt-2 flex flex-col gap-2">
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(8, draft.split("\n").length + 1)}
          className="w-full rounded-lg border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none"
          autoFocus
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          autoFocus
        />
      )}
      <div className="flex gap-2">
        <Button
          className="!px-3 !py-1 !text-sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          className="!px-3 !py-1 !text-sm"
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
