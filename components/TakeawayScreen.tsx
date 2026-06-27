"use client";

import { useState } from "react";
import { buildIcs } from "@/lib/ics";
import type { TakeawayPayload } from "@/lib/types";

// F3 — the recap a participant keeps. Handle-free synthesis only (no raw
// responses). Shared by the in-app end screen (warm path) and the token-gated
// public page (cold path / QR). Available for 24h, then it self-destructs.
export function TakeawayScreen({
  takeaway: t,
  shareUrl,
}: {
  takeaway: TakeawayPayload;
  shareUrl?: string;
}) {
  const r = t.report;
  const [copied, setCopied] = useState(false);
  const title = t.branding?.headline || t.name || t.sessionName || "Session recap";

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // F3 — download dated action items as a calendar file.
  const ics = buildIcs(t.actionItems ?? [], title);
  function addToCalendar() {
    if (!ics) return;
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "session-actions.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6">
      <header>
        {t.branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.branding.logoUrl} alt="" className="mb-3 max-h-10 object-contain" />
        )}
        <h1 className="font-display text-2xl font-semibold leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          Your recap · {t.participantCount} {t.participantCount === 1 ? "person" : "people"} ·{" "}
          {t.submissionCount} {t.submissionCount === 1 ? "contribution" : "contributions"}
        </p>
      </header>

      {r?.summary && <p className="leading-relaxed text-white/90">{r.summary}</p>}

      <Block title="Themes" show={!!r?.themes?.length}>
        <ul className="space-y-1.5">
          {r?.themes?.map((th, i) => (
            <li key={i}>
              <span className="font-medium">{th.title}</span>
              {th.detail ? <span className="text-muted"> — {th.detail}</span> : null}
            </li>
          ))}
        </ul>
      </Block>
      <List title="Decisions" items={r?.decisions} />
      <List title="Open questions" items={r?.tensions} />
      <List title="Next steps" items={r?.nextSteps} />

      {t.actionItems && t.actionItems.length > 0 && (
        <Block title="Action items" show>
          <ul className="space-y-1">
            {t.actionItems.map((a, i) => (
              <li key={i} className={a.status === "done" ? "text-muted line-through" : ""}>
                {a.text}
                {(a.ownerName || a.due) && (
                  <span className="text-muted">
                    {" — "}
                    {[a.ownerName, a.due ? `due ${a.due}` : null].filter(Boolean).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {t.patterns.length > 0 && (
        <Block title="Patterns" show>
          <p className="text-muted">{t.patterns.join(" · ")}</p>
        </Block>
      )}

      {t.yourContributions && t.yourContributions.length > 0 && (
        <Block title="What you contributed" show>
          <ul className="space-y-1.5">
            {t.yourContributions.map((c, i) => (
              <li key={i} className="border-l-2 border-accent/40 pl-3">
                <span className="text-white/90">{c.text}</span>
                <span className="block text-xs text-muted">{c.phaseLabel}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {shareUrl && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            onClick={copy}
            className="rounded-lg border border-accent px-3 py-2 text-sm text-accent hover:bg-accent/10"
          >
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
          <a
            href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Your session recap: ${shareUrl}`)}`}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-accent"
          >
            Email it to yourself
          </a>
          {/* F3 — keep a copy: the browser print dialog saves it to PDF. */}
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-accent"
          >
            Save / print
          </button>
          {ics && (
            <button
              onClick={addToCalendar}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-accent"
            >
              Add actions to calendar
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        This recap is the synthesis only — individual responses aren&apos;t shown.
        It&apos;s available for 24 hours, then it&apos;s gone for good.
      </p>
    </div>
  );
}

function Block({
  title,
  show,
  children,
}: {
  title: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-accent">{title}</h2>
      {children}
    </section>
  );
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <Block title={title} show>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((it, i) => (
          <li key={i} className="leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
    </Block>
  );
}
