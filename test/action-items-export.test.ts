import { describe, expect, it } from "vitest";
import {
  actionItemsToCsv,
  actionItemsToText,
  type ArchiveActionItem,
} from "@/lib/report/action-items";

// F2 — send-after export of the archived action-item register (Copy list / CSV).

const ITEMS: ArchiveActionItem[] = [
  { text: "Draft the one-pager", ownerName: "Dana", due: "2026-07-01", status: "open" },
  { text: 'Email "the board", now', status: "done" },
];

describe("actionItemsToCsv", () => {
  it("emits a header + one row per item with RFC-4180 escaping", () => {
    const csv = actionItemsToCsv(ITEMS);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Task,Owner,Due,Status");
    expect(lines[1]).toBe("Draft the one-pager,Dana,2026-07-01,open");
    // commas + quotes inside a cell are quoted and doubled
    expect(lines[2]).toBe('"Email ""the board"", now",,,done');
  });

  it("an empty register is a valid header-only file", () => {
    expect(actionItemsToCsv([])).toBe("Task,Owner,Due,Status");
    expect(actionItemsToCsv(undefined)).toBe("Task,Owner,Due,Status");
  });
});

describe("actionItemsToText", () => {
  it("renders a pasteable list with owner / due / done annotations", () => {
    const txt = actionItemsToText(ITEMS);
    expect(txt).toBe(
      "- Draft the one-pager — Dana (due 2026-07-01)\n" +
        '- Email "the board", now [done]',
    );
  });

  it("is empty for no items", () => {
    expect(actionItemsToText([])).toBe("");
  });
});
