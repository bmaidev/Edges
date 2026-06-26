import type { RoomArchive } from "@/lib/rooms";

// F1 — the report as portable Markdown (paste into a doc / email / wiki).
// Synthesis only: no raw submission text or handles, matching ReportDocument.
export function reportToMarkdown(a: RoomArchive): string {
  const r = a.report;
  const out: string[] = [
    `# ${a.name || a.sessionName || "Session report"}`,
    "",
    `${a.participantCount} ${a.participantCount === 1 ? "person" : "people"} · ${a.submissions.length} ${a.submissions.length === 1 ? "contribution" : "contributions"}`,
    "",
  ];
  if (r?.summary) out.push(r.summary, "");
  if (r?.themes?.length) {
    out.push("## Themes");
    for (const t of r.themes) out.push(`- **${t.title}**${t.detail ? ` — ${t.detail}` : ""}`);
    out.push("");
  }
  const list = (title: string, items?: string[]) => {
    if (!items?.length) return;
    out.push(`## ${title}`);
    for (const it of items) out.push(`- ${it}`);
    out.push("");
  };
  list("Decisions", r?.decisions);
  list("Open tensions", r?.tensions);
  list("Next steps", r?.nextSteps);
  if (a.patterns.length) {
    out.push("## Patterns", a.patterns.map((p) => `- ${p.name}`).join("\n"), "");
  }
  return out.join("\n").trim() + "\n";
}
