import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

// F3 — .ics export of dated action items.

describe("buildIcs", () => {
  it("returns null when nothing has a due date", () => {
    expect(buildIcs([{ text: "no date" }])).toBeNull();
    expect(buildIcs([])).toBeNull();
  });

  it("emits an all-day VEVENT per dated item", () => {
    const ics = buildIcs(
      [
        { text: "Book the venue", ownerName: "Sam", due: "2026-06-30" },
        { text: "no date — skipped" },
      ],
      "Offsite",
    )!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("X-WR-CALNAME:Offsite");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260630");
    expect(ics).toContain("SUMMARY:Book the venue");
    expect(ics).toContain("DESCRIPTION:Owner: Sam");
    expect(ics).toContain("END:VCALENDAR");
    // exactly one VEVENT (the undated item is excluded)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    // CRLF line endings per RFC 5545
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("escapes special characters in the summary", () => {
    const ics = buildIcs([{ text: "Ship A, B; then C", due: "2026-01-02" }])!;
    expect(ics).toContain("SUMMARY:Ship A\\, B\\; then C");
  });
});
