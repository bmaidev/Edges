import Link from "next/link";

// 404 boundary for unknown routes (including stale room/screen links once a
// session has ended and been wiped).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg p-8 text-center text-white">
      <p className="font-display text-2xl">Nothing here.</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        This link may be wrong, or the session it pointed to has ended and been
        cleared.
      </p>
      <Link
        href="/"
        className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:border-accent"
      >
        Go home
      </Link>
    </div>
  );
}
