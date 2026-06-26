import type { RoomArchive } from "@/lib/rooms";

// F1 — the branded, client-ready handover. A pure presentational render of the
// session synthesis on a light document surface (reads well on screen, in
// print-to-PDF, and pasted into a doc). Privacy: it renders the SYNTHESIS only —
// never raw submission text or handles. `.report-print` is the print target.
export function ReportDocument({
  archive,
  branding,
}: {
  archive: RoomArchive;
  branding?: { logoUrl?: string; accent?: string; headline?: string };
}) {
  const r = archive.report;
  const accent = branding?.accent || "#4f46e5";
  const title = branding?.headline || archive.name || archive.sessionName || "Session report";
  const date = new Date(archive.archivedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="report-print mx-auto max-w-2xl rounded-xl bg-white px-8 py-10 text-[#1a1a1a] shadow-sm"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <header className="border-b pb-5" style={{ borderColor: "#e5e5e5" }}>
        {branding?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="mb-4 max-h-12 object-contain" />
        )}
        <h1 className="text-3xl font-semibold leading-tight" style={{ color: accent }}>
          {title}
        </h1>
        <p className="mt-2 text-sm text-[#666]">
          {archive.participantCount} {archive.participantCount === 1 ? "person" : "people"}
          {" · "}
          {archive.submissions.length}{" "}
          {archive.submissions.length === 1 ? "contribution" : "contributions"}
          {" · "}
          {date}
        </p>
      </header>

      {r?.summary && <p className="mt-6 text-base leading-relaxed">{r.summary}</p>}

      <Section title="Themes" accent={accent} show={!!r?.themes?.length}>
        <ul className="space-y-2">
          {r?.themes?.map((t, i) => (
            <li key={i}>
              <span className="font-semibold">{t.title}</span>
              {t.detail ? <span className="text-[#444]"> — {t.detail}</span> : null}
            </li>
          ))}
        </ul>
      </Section>

      <ListSection title="Decisions" accent={accent} items={r?.decisions} />
      <ListSection title="Open tensions" accent={accent} items={r?.tensions} />
      <ListSection title="Next steps" accent={accent} items={r?.nextSteps} />

      {archive.patterns.length > 0 && (
        <Section title="Patterns the facilitator grouped" accent={accent} show>
          <p className="text-[#444]">{archive.patterns.map((p) => p.name).join(" · ")}</p>
        </Section>
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-[#999]" style={{ borderColor: "#e5e5e5" }}>
        Generated from the contributions in this session. Individual responses are not reproduced.
      </footer>
    </div>
  );
}

function Section({
  title,
  accent,
  show,
  children,
}: {
  title: string;
  accent: string;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return null;
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ListSection({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items?: string[];
}) {
  if (!items?.length) return null;
  return (
    <Section title={title} accent={accent} show>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((it, i) => (
          <li key={i} className="leading-relaxed">
            {it}
          </li>
        ))}
      </ul>
    </Section>
  );
}
