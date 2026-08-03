import { describe, expect, it } from "vitest";
import { builderFieldInventory } from "@/components/BuilderApp";
import { SERVER_MODULES } from "@/lib/modules/registry.server";
import type { ModuleKind } from "@/lib/types";

describe("builder generated configuration form", () => {
  it("renders every registered schema field without falling back to JSON", () => {
    for (const moduleId of Object.keys(SERVER_MODULES) as ModuleKind[]) {
      const fields = builderFieldInventory(moduleId);
      expect(fields.length, `${moduleId} fields`).toBeGreaterThan(0);
      expect(
        fields.filter((field) => field.kind === "unsupported"),
        moduleId,
      ).toEqual([]);
    }
  });

  it("recognises the rich field shapes that make expert configuration usable", () => {
    expect(builderFieldInventory("poll")).toContainEqual({
      path: "options",
      kind: "stringList",
    });
    expect(builderFieldInventory("content")).toContainEqual({
      path: "showContentTypes",
      kind: "enumList",
    });
    expect(builderFieldInventory("scale")).toContainEqual({
      path: "labels",
      kind: "stringTuple",
    });
    expect(builderFieldInventory("persona")).toContainEqual({
      path: "personas",
      kind: "objectList",
    });
    expect(builderFieldInventory("allocate")).toContainEqual({
      path: "allocate.fixedOptions",
      kind: "stringList",
    });
  });
});
