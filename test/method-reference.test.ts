import { describe, expect, it } from "vitest";
import { MODULE_CATEGORIES } from "@/lib/modules/categories";
import { getCard } from "@/lib/modules/cards";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

// B6 — the shared category grouping + live method reference. The load-bearing
// invariant: it covers EVERY real module exactly once, and each has a card triple,
// so the /help reference can never drift from the builder palette.

describe("MODULE_CATEGORIES", () => {
  const categorised = MODULE_CATEGORIES.flatMap((c) => c.kinds);

  it("lists every registered module exactly once", () => {
    const all = (Object.keys(SERVER_MODULES) as ModuleKind[]).sort();
    expect([...categorised].sort()).toEqual(all);
    // no duplicates
    expect(new Set(categorised).size).toBe(categorised.length);
  });

  it("every categorised module has a real card triple (no empty cells)", () => {
    for (const k of categorised) {
      const card = getCard(k);
      expect(card.whatItIs.length, k).toBeGreaterThan(0);
      expect(card.bestFor.length, k).toBeGreaterThan(0);
      expect(card.roomDoes.length, k).toBeGreaterThan(0);
    }
  });
});
