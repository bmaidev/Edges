import { beforeAll, describe, expect, it } from "vitest";
import { resolveAttribution } from "@/lib/modules/attribution";
import {
  addParticipant,
  getPublicState,
  replaceState,
} from "@/lib/store";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind, SessionState } from "@/lib/types";

// D1 — honest per-phase attribution. The invariant: never overclaim anonymity.
const ADMIN = "test-super-admin-d1";
beforeAll(() => {
  process.env.ADMIN_PASSCODE = ADMIN;
});

describe("resolveAttribution (pure)", () => {
  it("display-only phases are 'none'", () => {
    expect(resolveAttribution("lobby", "none")).toBe("none");
    expect(resolveAttribution(null, "none")).toBe("none");
  });
  it("modules that show the handle to the room are 'named'", () => {
    expect(resolveAttribution("lightning", "votes")).toBe("named");
    expect(resolveAttribution("onetwofour", "submissions")).toBe("named");
  });
  it("other gather modules are 'facilitators-only' (NEVER claims anonymity from facilitators)", () => {
    expect(resolveAttribution("capture", "submissions")).toBe("facilitators-only");
    expect(resolveAttribution("poll", "votes")).toBe("facilitators-only");
    expect(resolveAttribution("consult", "submissions")).toBe("facilitators-only");
  });
  it("an anonymous capture is still 'facilitators-only', never a stronger claim", () => {
    // the facilitator state still carries submissions + token→handle, so a
    // "not even facilitators" claim would be false — and must never appear.
    expect(resolveAttribution("capture", "submissions")).not.toBe("none");
    expect(["named", "facilitators-only"]).toContain(
      resolveAttribution("capture", "submissions"),
    );
  });
});

describe("getPublicState surfaces attribution per phase", () => {
  async function on(slug: string, moduleId: ModuleKind, config: Record<string, unknown>) {
    const phases: SessionState["phases"] = [{ id: "p1", moduleId, config }];
    await replaceState(
      {
        mode: null,
        sessionName: "T",
        phases,
        phaseId: "p1",
        timerEndsAt: null,
        timerRemainingMs: null,
        readaroundIndex: 0,
        topic: "",
        ended: false,
      },
      slug,
    );
    await addParticipant("a", "Ada", slug);
    return getPublicState("a", slug, "participant");
  }
  it("capture → facilitators-only; lightning → named; close → none", async () => {
    expect((await on("d1-cap", "capture", { label: "Ideas", prompt: "Go" })).attribution).toBe("facilitators-only");
    expect((await on("d1-lt", "lightning", { label: "Talks" })).attribution).toBe("named");
    expect((await on("d1-cl", "close", { label: "Close" })).attribution).toBe("none");
  });
});

describe("every action-accepting module resolves to a real regime", () => {
  it("named or facilitators-only, never none, for gather modules", () => {
    for (const id of Object.keys(SERVER_MODULES) as ModuleKind[]) {
      const gs = SERVER_MODULES[id].capabilities.gatherSource;
      const a = resolveAttribution(id, gs);
      if (gs === "none") expect(a).toBe("none");
      else expect(a === "named" || a === "facilitators-only").toBe(true);
    }
  });
});
