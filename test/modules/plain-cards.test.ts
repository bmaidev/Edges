import { describe, expect, it } from "vitest";
import {
  MODULE_CARDS,
  getCard,
  PRODUCES_ROOM_TEXT,
  producesRoomText,
  promptOf,
} from "@/lib/modules/cards";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B6 — the plain-language card catalog must stay in lock-step with the module
// registry. `satisfies Record<ModuleKind, PlainCard>` enforces this at compile
// time; this is the runtime backstop (count-agnostic, so it never goes stale).

describe("card catalog ↔ registry", () => {
  it("every registered module has a non-empty card", () => {
    for (const id of Object.keys(SERVER_MODULES) as ModuleKind[]) {
      const card = getCard(id);
      expect(card, `missing card for ${id}`).toBeTruthy();
      expect(card.whatItIs.length).toBeGreaterThan(0);
      expect(card.bestFor.length).toBeGreaterThan(0);
      expect(card.roomDoes.length).toBeGreaterThan(0);
    }
  });

  it("has no card for a module that isn't registered", () => {
    for (const id of Object.keys(MODULE_CARDS)) {
      expect(SERVER_MODULES[id as ModuleKind], `orphan card ${id}`).toBeTruthy();
    }
  });

  it("keeps cards tight (soft length caps)", () => {
    for (const card of Object.values(MODULE_CARDS)) {
      expect(card.whatItIs.length).toBeLessThanOrEqual(80);
      expect(card.bestFor.length).toBeLessThanOrEqual(80);
      expect(card.roomDoes.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("producesRoomText", () => {
  it("is true for exactly the canonical producer set", () => {
    const producers = (Object.keys(SERVER_MODULES) as ModuleKind[]).filter(producesRoomText);
    expect(producers.sort()).toEqual([...PRODUCES_ROOM_TEXT].sort());
  });
  it("a consumer like readaround is NOT a producer", () => {
    expect(producesRoomText("readaround")).toBe(false);
    expect(producesRoomText("capture")).toBe(true);
  });
});

describe("promptOf", () => {
  it("prefers prompt, falls back to label, then empty", () => {
    expect(promptOf({ prompt: "What matters?", label: "Ideas" })).toBe("What matters?");
    expect(promptOf({ label: "Ideas" })).toBe("Ideas");
    expect(promptOf({})).toBe("");
    expect(promptOf(undefined)).toBe("");
  });
});
