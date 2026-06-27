import { describe, expect, it } from "vitest";
import {
  applyReportEdit,
  normalizeReportMeta,
  type ReportEdit,
} from "@/lib/report-edit";
import { createRoom, editReport, getDb, setReportMeta } from "@/lib/rooms";
import type { RoomArchive } from "@/lib/rooms";
import type { SessionReport } from "@/lib/types";

// F1 — inline report curation. Pure applier + safe-by-default sharing meta.

const REPORT: SessionReport = {
  summary: "The room converged on trust as the unlock.",
  themes: [
    { title: "Trust", detail: "named again and again" },
    { title: "Speed", detail: "feared as a trade-off" },
  ],
  tensions: ["Move fast vs. get it right", "Centralise vs. delegate"],
  decisions: ["Ship behind a flag"],
  nextSteps: ["Draft a charter", "Pick owners", "Set a review date"],
  generatedAt: 0,
};

describe("applyReportEdit", () => {
  it("edits the summary", () => {
    const r = applyReportEdit(REPORT, { kind: "summary", text: "New summary" });
    expect(r.summary).toBe("New summary");
  });

  it("renames a theme's title and/or detail, leaving others untouched", () => {
    const r = applyReportEdit(REPORT, { kind: "renameTheme", index: 0, title: "Trust & safety" });
    expect(r.themes[0]).toEqual({ title: "Trust & safety", detail: "named again and again" });
    expect(r.themes[1]).toEqual(REPORT.themes[1]);
  });

  it("drops a tension / decision / step / theme by index", () => {
    expect(applyReportEdit(REPORT, { kind: "dropTension", index: 0 }).tensions).toEqual([
      "Centralise vs. delegate",
    ]);
    expect(applyReportEdit(REPORT, { kind: "dropStep", index: 1 }).nextSteps).toEqual([
      "Draft a charter",
      "Set a review date",
    ]);
    expect(applyReportEdit(REPORT, { kind: "dropTheme", index: 1 }).themes).toHaveLength(1);
  });

  it("reorders next-steps by a valid permutation", () => {
    const r = applyReportEdit(REPORT, { kind: "reorderSteps", order: [2, 0, 1] });
    expect(r.nextSteps).toEqual(["Set a review date", "Draft a charter", "Pick owners"]);
  });

  it("rejects a malformed reorder (wrong length / dupes / OOB) — list unchanged", () => {
    expect(applyReportEdit(REPORT, { kind: "reorderSteps", order: [0, 1] }).nextSteps).toEqual(
      REPORT.nextSteps,
    );
    expect(applyReportEdit(REPORT, { kind: "reorderSteps", order: [0, 0, 1] }).nextSteps).toEqual(
      REPORT.nextSteps,
    );
    expect(applyReportEdit(REPORT, { kind: "reorderSteps", order: [0, 1, 9] }).nextSteps).toEqual(
      REPORT.nextSteps,
    );
  });

  it("an out-of-range drop is a no-op, never a throw", () => {
    expect(applyReportEdit(REPORT, { kind: "dropTension", index: 99 }).tensions).toEqual(
      REPORT.tensions,
    );
  });

  it("does not mutate the input report", () => {
    const before = JSON.stringify(REPORT);
    applyReportEdit(REPORT, { kind: "dropStep", index: 0 } as ReportEdit);
    expect(JSON.stringify(REPORT)).toBe(before);
  });
});

describe("normalizeReportMeta", () => {
  it("defaults to off-the-record (no quotes, anonymous)", () => {
    expect(normalizeReportMeta(undefined)).toEqual({ showQuotes: false, attribution: "anonymous" });
    expect(normalizeReportMeta({})).toEqual({ showQuotes: false, attribution: "anonymous" });
  });
  it("honours explicit opt-ins only", () => {
    expect(normalizeReportMeta({ showQuotes: true, attribution: "named" })).toEqual({
      showQuotes: true,
      attribution: "named",
    });
    // garbage attribution → anonymous
    expect(normalizeReportMeta({ attribution: "everyone" }).attribution).toBe("anonymous");
  });
});

describe("editReport / setReportMeta (durable archive round-trip)", () => {
  async function seededRoom() {
    const { room } = await createRoom("Rep", "Topic");
    const archive: RoomArchive = {
      slug: room.slug,
      name: "Rep",
      archivedAt: 0,
      sessionName: null,
      sequence: [],
      patterns: [],
      submissions: [],
      content: [],
      participantCount: 0,
      report: { ...REPORT },
    };
    await getDb().set(`rooms:archive:${room.slug}`, archive);
    return room.slug;
  }

  it("editReport patches the report in place and persists it", async () => {
    const slug = await seededRoom();
    const after = await editReport(slug, { kind: "dropTension", index: 0 });
    expect(after?.report?.tensions).toEqual(["Centralise vs. delegate"]);
    // persisted (a fresh read sees it)
    const reread = await getDb().get<RoomArchive>(`rooms:archive:${slug}`);
    expect(reread?.report?.tensions).toEqual(["Centralise vs. delegate"]);
  });

  it("setReportMeta stores normalized sharing prefs", async () => {
    const slug = await seededRoom();
    const after = await setReportMeta(slug, { showQuotes: true, attribution: "bogus" });
    expect(after?.reportMeta).toEqual({ showQuotes: true, attribution: "anonymous" });
  });

  it("editReport on a room with no archive is a calm no-op", async () => {
    const { room } = await createRoom("Empty", "Topic");
    expect(await editReport(room.slug, { kind: "summary", text: "x" })).toBeNull();
  });
});
