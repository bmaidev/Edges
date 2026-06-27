import { describe, expect, it } from "vitest";
import { presentOwnerHandles } from "@/components/ActionItemsPanel";
import type { Participant } from "@/lib/types";

// F2 — the action-item owner tap-list: distinct, non-empty handles of people in
// the room, sorted, content-free (handles only).

const p = (handle: string, token = handle): Participant =>
  ({ token, handle, joinedAt: 0 }) as Participant;

describe("presentOwnerHandles", () => {
  it("returns distinct, trimmed, alphabetically-sorted handles", () => {
    const out = presentOwnerHandles([p("Cy"), p("Ada"), p("Bo")]);
    expect(out).toEqual(["Ada", "Bo", "Cy"]);
  });

  it("dedupes repeated handles (two tabs, same name) and drops blanks", () => {
    const out = presentOwnerHandles([
      p("Ada", "t1"),
      p("Ada", "t2"),
      p("  ", "t3"),
      p("", "t4"),
    ]);
    expect(out).toEqual(["Ada"]);
  });

  it("is empty for no participants", () => {
    expect(presentOwnerHandles(undefined)).toEqual([]);
    expect(presentOwnerHandles([])).toEqual([]);
  });
});
