import { describe, expect, it } from "vitest";
import { getServerModule } from "@/lib/modules/registry.server";
import type { LobbyView } from "@/lib/modules/views";
import type { ModuleContext } from "@/lib/modules/types";
import type { Participant } from "@/lib/types";

// lobby.computeView is a pure read of ctx.participants — no store/votes touched.
// Hand-build a minimal ctx with just the fields it reads (config.message,
// participants) and assert `present` mirrors the participant count.
function mkCtx(participants: Participant[]): ModuleContext {
  return {
    roomId: "room-x",
    role: "participant",
    phase: { id: "p-lobby", moduleId: "lobby", config: { label: "Lobby" } },
    config: { label: "Lobby", message: "hi" },
    participants,
    // unused by lobby.computeView
    state: {} as ModuleContext["state"],
    visibleContent: [],
    patterns: [],
    submissions: [],
    me: null,
    store: {} as ModuleContext["store"],
  };
}

function mkParticipant(i: number): Participant {
  return { token: `t${i}`, handle: `P${i}`, joinedAt: i };
}

describe("lobby module", () => {
  it("reports present === participant count", async () => {
    const lobby = getServerModule("lobby")!;
    for (const n of [0, 1, 5]) {
      const parts = Array.from({ length: n }, (_, i) => mkParticipant(i));
      const view = (await lobby.computeView(mkCtx(parts))) as LobbyView;
      expect(view.present).toBe(n);
    }
  });

  it("passes the configured message through", async () => {
    const lobby = getServerModule("lobby")!;
    const view = (await lobby.computeView(mkCtx([]))) as LobbyView;
    expect(view.message).toBe("hi");
  });
});
