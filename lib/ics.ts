// F3 — build an iCalendar (.ics) from a session's action items so a participant
// can drop their commitments straight into a calendar. Pure + dependency-free;
// only items with a due date become all-day events.

interface IcsItem {
  text: string;
  ownerName?: string;
  due?: string; // yyyy-mm-dd
}

// RFC 5545 text escaping: backslash, semicolon, comma, and newlines.
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Returns an .ics document, or null when nothing has a due date.
export function buildIcs(items: IcsItem[], calName = "Session actions"): string | null {
  const dated = items.filter((a) => a.due && /^\d{4}-\d{2}-\d{2}$/.test(a.due));
  if (dated.length === 0) return null;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edges//Recap//EN",
    `X-WR-CALNAME:${esc(calName)}`,
  ];
  dated.forEach((a, i) => {
    const date = a.due!.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:edges-action-${i}-${date}@edges`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${esc(a.text)}`,
      ...(a.ownerName ? [`DESCRIPTION:${esc(`Owner: ${a.ownerName}`)}`] : []),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
