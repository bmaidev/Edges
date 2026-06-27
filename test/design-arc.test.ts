import { describe, expect, it } from "vitest";
import { enforceArc } from "@/lib/design";
import type { PhaseInstance } from "@/lib/types";

// B7 — enforceArc deterministically guarantees a lobby-first / close-last arc,
// whatever the AI transform returned (a "make it shorter" pass must never drop
// the open or the close).

const p = (id: string, moduleId: string): PhaseInstance =>
  ({ id, moduleId: moduleId as PhaseInstance["moduleId"], config: { label: id } });

const kinds = (phases: PhaseInstance[]) => phases.map((x) => x.moduleId);

describe("enforceArc", () => {
  it("leaves an already well-formed arc unchanged", () => {
    const arc = [p("l", "lobby"), p("c1", "capture"), p("x", "close")];
    expect(kinds(enforceArc(arc))).toEqual(["lobby", "capture", "close"]);
  });

  it("prepends a lobby when missing", () => {
    const out = enforceArc([p("c1", "capture"), p("x", "close")]);
    expect(out[0].moduleId).toBe("lobby");
    expect(out[out.length - 1].moduleId).toBe("close");
  });

  it("appends a close when missing", () => {
    const out = enforceArc([p("l", "lobby"), p("c1", "capture")]);
    expect(out[out.length - 1].moduleId).toBe("close");
  });

  it("re-adds BOTH when a shorter transform dropped them", () => {
    const out = enforceArc([p("c1", "capture"), p("v", "poll")]);
    expect(kinds(out)).toEqual(["lobby", "capture", "poll", "close"]);
  });

  it("moves a misplaced lobby to the front and close to the end", () => {
    const out = enforceArc([p("c1", "capture"), p("l", "lobby"), p("x", "close"), p("v", "poll")]);
    expect(out[0].moduleId).toBe("lobby");
    expect(out[out.length - 1].moduleId).toBe("close");
  });

  it("keeps phase ids unique after synthesising open/close", () => {
    const out = enforceArc([p("c1", "capture")]);
    const ids = out.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("an empty design stays empty", () => {
    expect(enforceArc([])).toEqual([]);
  });
});
