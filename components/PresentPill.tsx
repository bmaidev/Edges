"use client";

// E2 — the present-mode control for the projector wall. A single corner pill that
// enters/exits fullscreen + wake-lock, auto-hiding with the rest of the chrome
// after a few seconds of stillness. Projector-only; never rendered to a phone.

export function PresentPill({
  active,
  cinema,
  hidden,
  onToggle,
}: {
  active: boolean;
  cinema: boolean;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 transition-opacity duration-500 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* When fullscreen was denied we letterbox instead — tell the operator how
          to get the real thing. Dismisses with the rest of the chrome. */}
      {active && cinema && (
        <span className="rounded-md bg-bg/80 px-2.5 py-1 text-xs text-muted backdrop-blur">
          Press F11 for true fullscreen
        </span>
      )}
      <button
        onClick={onToggle}
        aria-pressed={active}
        className="rounded-full border border-border bg-bg/80 px-4 py-2 text-sm text-muted backdrop-blur transition-colors hover:border-accent hover:text-white"
      >
        {active ? "Exit present" : "⤢ Present"}
      </button>
    </div>
  );
}
