// F2 — export the captured action-item register from an archived session, so the
// facilitator can SEND it after the room is gone (paste into an email, or import
// the CSV into a tracker). Pure + content-free of participant submissions — the
// register is the facilitator's own decisions/owners/actions, never raw answers.

import type { RoomArchive } from "@/lib/rooms";

export type ArchiveActionItem = NonNullable<RoomArchive["actionItems"]>[number];

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC-4180-ish CSV: Task, Owner, Due, Status. Always emits the header so an empty
// register is still a valid (header-only) file rather than a confusing blank.
export function actionItemsToCsv(items: ArchiveActionItem[] | undefined): string {
  const head = ["Task", "Owner", "Due", "Status"];
  const rows = (items ?? []).map((a) => [
    csvCell(a.text),
    csvCell(a.ownerName ?? ""),
    csvCell(a.due ?? ""),
    a.status === "done" ? "done" : "open",
  ]);
  return [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// A human-pasteable plain-text list: "- Task — Owner (due 2026-07-01) [done]".
export function actionItemsToText(items: ArchiveActionItem[] | undefined): string {
  return (items ?? [])
    .map((a) => {
      const parts = [a.text];
      if (a.ownerName) parts.push(`— ${a.ownerName}`);
      if (a.due) parts.push(`(due ${a.due})`);
      if (a.status === "done") parts.push("[done]");
      return `- ${parts.join(" ")}`;
    })
    .join("\n");
}
