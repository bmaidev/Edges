"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { ReportDocument } from "@/lib/report/ReportDocument";
import { ReportCurator } from "@/components/ReportCurator";
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
  const [curating, setCurating] = useState(false);

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

  const [linkCopied, setLinkCopied] = useState(false);
  function copyLink() {
    if (!archive?.reportToken || typeof window === "undefined") return;
    const slug = apiBase.replace("/api/r/", "");
    const url = `${window.location.origin}/r/${slug}/report?k=${archive.reportToken}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      },
      () => setErr("Couldn't copy the link."),
    );
  }

  const branding = {
    logoUrl: state.branding?.logoUrl,
    headline: state.branding?.headline,
  };

  // F1 — honest signal: when AI is unavailable the report is the AI-free
  // structural digest (counts + the facilitator's curated pattern names), not a
  // synthesis. Say so plainly so a sparse report never reads as a failure.
  const isStructural = archive?.report?.kind === "structural";

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
      {isStructural && (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          AI synthesis is off, so this is a <strong>structural digest</strong> —
          contribution counts and your grouped pattern names, faithful to the
          data. Set an <code>ANTHROPIC_API_KEY</code> to enable a written summary,
          themes, tensions and next steps.
        </p>
      )}

      {open && archive && (
        <Modal title="Handover report" onClose={() => setOpen(false)}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.print()}>Print / Save as PDF</Button>
            <Button variant="ghost" onClick={copyMarkdown}>
              {copied ? "Copied ✓" : "Copy as Markdown"}
            </Button>
            {archive.reportToken && (
              <Button variant="ghost" onClick={copyLink}>
                {linkCopied ? "Link copied ✓" : "Copy shareable link"}
              </Button>
            )}
            {/* F1 — toggle inline curation (glance, fix, send). */}
            {archive.report && (
              <Button variant="ghost" onClick={() => setCurating((v) => !v)}>
                {curating ? "Done curating" : "✎ Curate"}
              </Button>
            )}
          </div>
          {curating ? (
            <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-border p-3">
              <ReportCurator archive={archive} apiBase={apiBase} code={code} onUpdate={setArchive} />
            </div>
          ) : (
            <>
              {isStructural && (
                <p className="mt-3 text-xs text-muted">
                  Structural digest (AI synthesis off) — counts and your grouped
                  pattern names.
                </p>
              )}
              <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg bg-[#f3f3f5] p-3">
                <ReportDocument archive={archive} branding={branding} />
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
