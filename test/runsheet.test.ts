import { describe, expect, it } from "vitest";
import {
  addParticipant,
  endSession,
  getFacilitatorState,
  getPublicState,
  getState,
  replaceState,
  setPhases,
} from "@/lib/store";
import { RUNSHEET_KEY, stripRunsheet } from "@/lib/modules/runsheet";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind, SessionState } from "@/lib/types";

// B3 — facilitator run-sheet. The LEAK tests are the load-bearing invariant:
// facilitator-private notes must NEVER reach a participant or the projector.

const SCRIPT = "SENTINEL_SCRIPT_open-with-the-why";
const POINTS = "SENTINEL_POINTS_keep-it-tight";

const phases: SessionState["phases"] = [
  {
    id: "p1",
    moduleId: "capture",
    config: {
      label: "Ideas",
      prompt: "Go big",
      timerSeconds: 300,
      [RUNSHEET_KEY]: { script: SCRIPT, talkingPoints: POINTS, contingency: "nudge if quiet" },
    },
  },
  { id: "p2", moduleId: "close", config: { label: "Wrap up" } },
];
async function seed(room: string) {
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
    room,
  );
  await addParticipant("a", "Ada", room);
}

describe("LEAK GATE: the run-sheet never reaches the room", () => {
  it("a participant's ENTIRE public state contains no run-sheet text (config + view + sequence)", async () => {
    const room = "rs-leak-p";
    await seed(room);
    const pub = await getPublicState("a", room, "participant");
    const json = JSON.stringify(pub);
    expect(json).not.toContain(SCRIPT);
    expect(json).not.toContain(POINTS);
    expect(json).not.toContain(RUNSHEET_KEY);
  });

  it("the projector's entire public state contains no run-sheet text", async () => {
    const room = "rs-leak-proj";
    await seed(room);
    const json = JSON.stringify(await getPublicState(null, room, "projector"));
    expect(json).not.toContain(SCRIPT);
    expect(json).not.toContain(POINTS);
  });

  it("stripping preserves every other config field (label, timerSeconds, prompt)", async () => {
    const room = "rs-preserve";
    await seed(room);
    const pub = await getPublicState("a", room, "participant");
    const cfg = pub.config as Record<string, unknown> | null;
    expect(cfg?.label).toBe("Ideas");
    expect(cfg?.timerSeconds).toBe(300);
    expect(cfg?.prompt).toBe("Go big");
    expect(cfg && RUNSHEET_KEY in cfg).toBe(false);
  });
});

describe("the facilitator DOES get the run-sheet", () => {
  it("getFacilitatorState exposes runsheets[phaseId] + a next-phase peek", async () => {
    const room = "rs-fac";
    await seed(room);
    const fs = await getFacilitatorState(room);
    expect(fs.runsheets?.p1?.script).toBe(SCRIPT);
    expect(fs.runsheets?.p1?.talkingPoints).toBe(POINTS);
    expect(fs.nextPeek).toBe("Wrap up"); // next phase's label while on p1
    // the facilitator's active config keeps the run-sheet (not stripped)
    expect((fs.config as unknown as Record<string, unknown>)[RUNSHEET_KEY]).toBeTruthy();
  });
});

describe("reserved-key contract + lifecycle", () => {
  it("no module schema rejects a nested runsheet (all passthrough)", () => {
    for (const id of Object.keys(SERVER_MODULES) as ModuleKind[]) {
      const def = SERVER_MODULES[id];
      const cfg = { ...def.defaultConfig, [RUNSHEET_KEY]: { script: "x" } };
      expect(def.schema.safeParse(cfg).success, `${id} drops runsheet`).toBe(true);
    }
  });

  it("setPhases round-trips the run-sheet in state", async () => {
    const room = "rs-roundtrip";
    await setPhases(phases, "T", room);
    const st = await getState(room);
    const p1 = st.phases!.find((p) => p.id === "p1")!;
    expect((p1.config[RUNSHEET_KEY] as { script: string }).script).toBe(SCRIPT);
  });

  it("endSession wipes the phases (and thus the run-sheets)", async () => {
    const room = "rs-wipe";
    await seed(room);
    await endSession(room);
    const fs = await getFacilitatorState(room);
    expect(fs.runsheets ?? {}).toEqual({});
  });

  it("stripRunsheet is a pure delete-one-key (preserves the rest)", () => {
    const out = stripRunsheet({ label: "x", timerSeconds: 60, [RUNSHEET_KEY]: { script: "s" } });
    expect(out).toEqual({ label: "x", timerSeconds: 60 });
  });
});
