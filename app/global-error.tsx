"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors in the root layout itself. It replaces
// the whole document, so it must render its own <html>/<body>. Kept dependency-
// free and inline-styled because the normal styling tree may not have mounted.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`[global] ${error.message}${error.digest ? ` (${error.digest})` : ""}`);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "2rem",
          textAlign: "center",
          background: "#0b1020",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ fontSize: "1.5rem" }}>Something went wrong.</p>
        <p style={{ maxWidth: "24rem", color: "#9aa3c0", lineHeight: 1.6 }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={reset}
          style={{
            border: "1px solid #6b7cff",
            background: "rgba(107,124,255,0.1)",
            color: "#aab4ff",
            borderRadius: "0.75rem",
            padding: "0.625rem 1.25rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
