import { describe, expect, it } from "vitest";
import { rosterRows } from "@/components/RoomRoster";
import type { Participant } from "@/lib/types";

// D4 — the host roster: live/quiet partition + join order. Pure, content-free.

const p = (handle: string, joinedAt: number): Participant =>
  ({ token: handle, handle, joinedAt }) as Participant;

describe("rosterRows", () => {
  it("sorts by join order (earliest first), latecomers at the bottom", () => {
    const rows = rosterRows([p("Cy", 300), p("Ada", 100), p("Bo", 200)], []);
    expect(rows.map((r) => r.handle)).toEqual(["Ada", "Bo", "Cy"]);
  });

  it("marks a participant quiet when their handle is in dropped, with the since gap", () => {
    const rows = rosterRows(
      [p("Ada", 100), p("Bo", 200)],
      [{ handle: "Bo", since: 40_000 }],
    );
    expect(rows.find((r) => r.handle === "Ada")).toMatchObject({ quiet: false, since: null });
    expect(rows.find((r) => r.handle === "Bo")).toMatchObject({ quiet: true, since: 40_000 });
  });

  it("is empty with no participants", () => {
    expect(rosterRows([], [])).toEqual([]);
    expect(rosterRows(undefined, undefined)).toEqual([]);
  });
});
