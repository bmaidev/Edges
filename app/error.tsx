"use client";

import { useEffect } from "react";

// Route-level boundary: catches errors thrown while rendering a page subtree
// and offers a recovery without a full reload. Next.js renders this in place of
// the segment that threw.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[route] ${error.message}${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg p-8 text-center text-white">
      <p className="font-display text-2xl">Something went sideways.</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        The page hit an unexpected error. Trying again usually clears it — your
        session is safe.
      </p>
      <button
        onClick={reset}
        className="rounded-xl border border-accent bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent transition-colors active:bg-accent/20"
      >
        Try again
      </button>
    </div>
  );
}
