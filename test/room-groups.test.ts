import { describe, expect, it } from "vitest";
import { groupRooms } from "@/lib/room-groups";

// A5 — the "My workshops" grouping. Pure, content-free.

const r = (status: string, endedAt?: number) => ({ status, lastRun: endedAt ? { endedAt } : null });

describe("groupRooms", () => {
  it("splits into live / drafts / recent", () => {
    const g = groupRooms([r("live"), r("draft"), r("archived", 100), r("live")]);
    expect(g.live).toHaveLength(2);
    expect(g.drafts).toHaveLength(1);
    expect(g.recent).toHaveLength(1);
  });

  it("orders recent by most-recently-ended first", () => {
    const a = r("archived", 100);
    const b = r("archived", 300);
    const c = r("archived", 200);
    expect(groupRooms([a, b, c]).recent).toEqual([b, c, a]);
  });

  it("drafts is the catch-all so an unknown status never vanishes", () => {
    const g = groupRooms([r("draft"), r("mystery"), r("live")]);
    expect(g.drafts).toHaveLength(2); // draft + mystery
    expect(g.live).toHaveLength(1);
  });
});
