import { describe, expect, it } from "vitest";
import { phaseNav, type SequenceItem } from "@/lib/sequence";

// E2 — phaseNav is the shared nav maths behind the presenter ribbon and the host
// PhaseStepper. It must match the old inline stepper logic 1:1.

const seq: SequenceItem[] = [
  { id: "a", label: "Open", moduleId: "capture" },
  { id: "b", label: "Diverge", moduleId: "capture" },
  { id: "c", label: "Converge", moduleId: "poll" },
];

describe("phaseNav", () => {
  it("empty sequence → safe zeros", () => {
    const n = phaseNav([], "x");
    expect(n.total).toBe(0);
    expect(n.index).toBe(-1);
    expect(n.current).toBeNull();
    expect(n.prev).toBeNull();
    expect(n.next).toBeNull();
    expect(n.phases).toEqual([]);
  });

  it("null/undefined sequence is treated as empty", () => {
    expect(phaseNav(null, "a").total).toBe(0);
    expect(phaseNav(undefined, "a").total).toBe(0);
  });

  it("single phase: no prev, no next", () => {
    const n = phaseNav([seq[0]], "a");
    expect(n.index).toBe(0);
    expect(n.current?.id).toBe("a");
    expect(n.prev).toBeNull();
    expect(n.next).toBeNull();
    expect(n.current?.status).toBe("current");
  });

  it("first phase: next set, prev null", () => {
    const n = phaseNav(seq, "a");
    expect(n.index).toBe(0);
    expect(n.prev).toBeNull();
    expect(n.next?.id).toBe("b");
    expect(n.phases.map((p) => p.status)).toEqual([
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("middle phase: prev + next, statuses split done/current/upcoming", () => {
    const n = phaseNav(seq, "b");
    expect(n.index).toBe(1);
    expect(n.prev?.id).toBe("a");
    expect(n.next?.id).toBe("c");
    expect(n.phases.map((p) => p.status)).toEqual([
      "done",
      "current",
      "upcoming",
    ]);
  });

  it("last phase: prev set, next null", () => {
    const n = phaseNav(seq, "c");
    expect(n.index).toBe(2);
    expect(n.prev?.id).toBe("b");
    expect(n.next).toBeNull();
    expect(n.phases.map((p) => p.status)).toEqual(["done", "done", "current"]);
  });

  it("null phaseId → index -1, all upcoming (lobby)", () => {
    const n = phaseNav(seq, null);
    expect(n.index).toBe(-1);
    expect(n.current).toBeNull();
    expect(n.next).toBeNull();
    expect(n.phases.every((p) => p.status === "upcoming")).toBe(true);
  });

  it("unknown phaseId behaves like null", () => {
    const n = phaseNav(seq, "zzz");
    expect(n.index).toBe(-1);
    expect(n.current).toBeNull();
    expect(n.phases.every((p) => p.status === "upcoming")).toBe(true);
  });

  it("parity with the old PhaseStepper prev/next/done maths", () => {
    // Old: idx=findIndex; prev=idx>0?[idx-1]:null; next=idx>=0&&idx<len-1?[idx+1]:null;
    // done=idx>=0 && i<idx; current=i===idx.
    for (const pid of ["a", "b", "c", null, "zzz"]) {
      const idx = pid ? seq.findIndex((p) => p.id === pid) : -1;
      const prev = idx > 0 ? seq[idx - 1] : null;
      const next = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
      const n = phaseNav(seq, pid);
      expect(n.index).toBe(idx);
      expect(n.prev?.id ?? null).toBe(prev?.id ?? null);
      expect(n.next?.id ?? null).toBe(next?.id ?? null);
      n.phases.forEach((p, i) => {
        const expected = idx >= 0 && i < idx ? "done" : i === idx ? "current" : "upcoming";
        expect(p.status).toBe(expected);
      });
    }
  });
});
