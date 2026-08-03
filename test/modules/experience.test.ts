import { describe, expect, it } from "vitest";
import { MODULE_EXPERIENCE, canFeedForward } from "@/lib/modules/experience";
import {
  SERVER_MODULES,
  effectiveGatherSource,
} from "@/lib/modules/registry.server";
import type { ModuleKind, Role } from "@/lib/types";

const ROLES: Role[] = [
  "admin",
  "facilitator",
  "cohost",
  "participant",
  "projector",
];

describe("module experience contract", () => {
  const kinds = Object.keys(SERVER_MODULES) as ModuleKind[];

  it("gives every registered module a complete novice-to-master profile", () => {
    expect(Object.keys(MODULE_EXPERIENCE).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      const profile = MODULE_EXPERIENCE[kind];
      expect(["starter", "guided", "advanced"], kind).toContain(
        profile.complexity,
      );
      expect(profile.input.trim().length, `${kind} input`).toBeGreaterThan(12);
      expect(profile.output.trim().length, `${kind} output`).toBeGreaterThan(
        12,
      );
      expect(
        profile.watchFor.trim().length,
        `${kind} watch-out`,
      ).toBeGreaterThan(20);
    }
  });

  it("keeps action capabilities, handlers, roles, and defaults coherent", () => {
    for (const kind of kinds) {
      const definition = SERVER_MODULES[kind];
      expect(Boolean(definition.handleAction), `${kind} action contract`).toBe(
        definition.capabilities.acceptsActions,
      );
      for (const role of ROLES) {
        expect(
          ["hidden", "visible", "masked"],
          `${kind} visibility for ${role}`,
        ).toContain(definition.defaultVisibility[role]);
      }
      const parsed = definition.schema.safeParse(definition.defaultConfig);
      expect(
        parsed.success,
        `${kind} default config: ${parsed.success ? "" : parsed.error.message}`,
      ).toBe(true);
    }
  });

  it("only advertises configured text outputs when their capture is enabled", () => {
    expect(canFeedForward("worldcafe", { captureNotes: false })).toBe(false);
    expect(canFeedForward("worldcafe", { captureNotes: true })).toBe(true);
    expect(canFeedForward("stations", { captureNotes: false })).toBe(false);
    expect(canFeedForward("onetwofour", { captureShared: false })).toBe(false);
    expect(canFeedForward("fishbowl", { allowQuestions: false })).toBe(false);
    expect(canFeedForward("builder")).toBe(true);
    expect(canFeedForward("capture")).toBe(true);
    expect(canFeedForward("poll")).toBe(false);
  });

  it("only exposes response counts when a structured method is capturing", () => {
    expect(effectiveGatherSource("worldcafe", { captureNotes: false })).toBe(
      "none",
    );
    expect(effectiveGatherSource("worldcafe", { captureNotes: true })).toBe(
      "submissions",
    );
    expect(effectiveGatherSource("stations", { captureNotes: false })).toBe(
      "none",
    );
    expect(effectiveGatherSource("onetwofour", { captureShared: false })).toBe(
      "none",
    );
    expect(effectiveGatherSource("fishbowl", { allowQuestions: false })).toBe(
      "none",
    );
  });
});
