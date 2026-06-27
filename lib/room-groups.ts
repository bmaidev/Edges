// A5 — "My workshops" grouping for the admin rooms list: Live now / Drafts /
// Recent, so a facilitator running several sessions can find the live one at a
// glance and re-open a recent archive. Pure + content-free (status + end time
// only) → unit-tested; the page renders each non-empty group under a header.

export interface GroupableRoom {
  status?: "draft" | "live" | "archived" | string;
  lastRun?: { endedAt: number } | null;
}

export interface RoomGroups<T> {
  live: T[]; // status "live"
  drafts: T[]; // status "draft" (set up, not yet launched)
  recent: T[]; // status "archived", newest-ended first
}

export function groupRooms<T extends GroupableRoom>(rooms: T[]): RoomGroups<T> {
  const live = rooms.filter((r) => r.status === "live");
  const recent = rooms
    .filter((r) => r.status === "archived")
    .sort((a, b) => (b.lastRun?.endedAt ?? 0) - (a.lastRun?.endedAt ?? 0));
  // Drafts is the catch-all (draft + any unknown status) so no room ever vanishes.
  const drafts = rooms.filter((r) => r.status !== "live" && r.status !== "archived");
  return { live, drafts, recent };
}
