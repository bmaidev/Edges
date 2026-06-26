"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { ReportDocument } from "@/lib/report/ReportDocument";
import { reportToMarkdown } from "@/lib/report/markdown";
import type { FacilitatorState } from "@/lib/types";
import type { RoomArchive } from "@/lib/rooms";

// F1 — the client-ready handover. Builds the branded report from the LIVE session
// (no wipe), previews it, and exports as print-to-PDF or copy-markdown. Posts to
// the host route DIRECTLY (not the shared cmd(), which only applies a rev'd state
// and would drop the returned archive).
export function HandoverPanel({
  state,
  apiBase,
  code,
}: {
  state: FacilitatorState;
  apiBase: string;
  code: string;
}) {
  const [archive, setArchive] = useState<RoomArchive | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "buildReport", code }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.archive) {
        setArchive(d.archive);
        setOpen(true);
      } else {
        setErr(d.error ?? "Couldn't build the report.");
      }
    } catch {
      setErr("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function copyMarkdown() {
    if (!archive) return;
    navigator.clipboard?.writeText(reportToMarkdown(archive)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setErr("Couldn't copy."),
    );
  }

  const branding = {
    logoUrl: state.branding?.logoUrl,
    headline: state.branding?.headline,
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Client-ready handover
      </h2>
      <p className="text-sm text-muted">
        Build a branded report of the session so far — the synthesis, themes,
        decisions and next steps. Individual responses aren&apos;t included.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={build} disabled={busy}>
          {busy ? "Building…" : archive ? "Rebuild report" : "Build handover report"}
        </Button>
        {archive && (
          <Button variant="ghost" onClick={() => setOpen(true)}>
            View / export
          </Button>
        )}
      </div>
      {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}

      {open && archive && (
        <Modal title="Handover report" onClose={() => setOpen(false)}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button variant="ghost" onClick={copyMarkdown}>
              {copied ? "Copied ✓" : "Copy as Markdown"}
            </Button>
          </div>
          <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-[#f3f3f5] p-3">
            <ReportDocument archive={archive} branding={branding} />
          </div>
        </Modal>
      )}
    </section>
  );
}
