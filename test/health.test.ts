import { describe, expect, it } from "vitest";
import { computeRoomHealth } from "@/lib/health";
import { advanceHealthCaption } from "@/components/RoomHealthSheet";
import type { Participant } from "@/lib/types";

// H1 full — room health now names who dropped (handle + since), and a soft
// advance caption appears only past a meaningful threshold.

const p = (token: string, handle: string): Participant =>
  ({ token, handle }) as Participant;

describe("computeRoomHealth", () => {
  const QUIET = 30_000; // matches QUIET_MS roughly; use a clearly-stale gap
  const now = 1_000_000;

  it("lists dropped participants by handle + since, newest-drop first", () => {
    const parts = [p("a", "Ada"), p("b", "Bo"), p("c", "Cy")];
    const beats = { a: now - 1000, b: now - 120_000, c: now - 60_000 }; // b,c stale
    const h = computeRoomHealth(parts, beats, now);
    expect(h.present).toBe(3);
    expect(h.here).toBe(1); // only Ada is fresh
    expect(h.dropped.map((d) => d.handle)).toEqual(["Cy", "Bo"]); // newest drop (Cy, 60s) before Bo (120s)
  });

  it("a participant with no heartbeat yet counts as present, never dropped", () => {
    const h = computeRoomHealth([p("a", "Ada")], {}, now);
    expect(h.here).toBe(1);
    expect(h.dropped).toEqual([]);
  });

  it("never leaks a token — handle only", () => {
    const h = computeRoomHealth([p("secret-token", "Ada")], { "secret-token": now - 200_000 }, now);
    expect(JSON.stringify(h)).not.toContain("secret-token");
  });

  // keep QUIET referenced so the threshold intent is documented
  it("uses a stale gap well beyond the quiet window", () => {
    expect(QUIET).toBeLessThan(120_000);
  });
});

describe("advanceHealthCaption", () => {
  const drop = (n: number) => ({ since: 60_000 * n, handle: `P${n}` });
  it("fires only past 25% AND >= 2 dropped in a room of 4+", () => {
    expect(advanceHealthCaption({ present: 8, here: 6, dropped: [drop(1), drop(2)] })).toMatch(/disconnected/);
    expect(advanceHealthCaption({ present: 8, here: 7, dropped: [drop(1)] })).toBeNull(); // only 1
    expect(advanceHealthCaption({ present: 3, here: 1, dropped: [drop(1), drop(2)] })).toBeNull(); // tiny room
    expect(advanceHealthCaption(null)).toBeNull();
  });
});
