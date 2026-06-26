import { describe, expect, it } from "vitest";
import { countCopy } from "@/lib/modules/lobby-copy";

// E1 — the lobby count copy is shared by the phone lobby and the projector
// LobbyScreen so they can never drift. "Joined-ever" framing (no live-presence
// claim) and a warm first-arriver message.
describe("lobby countCopy", () => {
  it("reassures the first arriver (0 or 1)", () => {
    expect(countCopy(0)).toBe("You're first — others are arriving");
    expect(countCopy(1)).toBe("You're first — others are arriving");
  });

  it("counts the room from two upward, without reflow-breaking growth", () => {
    expect(countCopy(2)).toBe("2 in the room");
    expect(countCopy(17)).toBe("17 in the room");
    expect(countCopy(120)).toBe("120 in the room");
  });
});
