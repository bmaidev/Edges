import { z } from "zod";
import type { RunSheet } from "@/lib/types";

// B3 — the reserved config key under which a phase's facilitator-private run-sheet
// is nested. No module schema may own this key (all module schemas are
// `.passthrough()`, asserted by test), so it round-trips untouched through
// setPhases without a module ever reading it.
export const RUNSHEET_KEY = "runsheet";

// B3 — the run-sheet shape, validated on read so a hand-edited / imported config
// can't smuggle a malformed run-sheet to the facilitator surface. talkingPoints is
// a discrete string[] (each a bullet); legacy single-string values are coerced.
export const runSheetSchema = z
  .object({
    script: z.string().optional(),
    talkingPoints: z.array(z.string()).optional(),
    contingency: z.string().optional(),
  })
  .passthrough();

// Coerce a legacy/raw run-sheet: talkingPoints as a newline string → string[].
function coerce(raw: Record<string, unknown>): Record<string, unknown> {
  if (typeof raw.talkingPoints === "string") {
    return {
      ...raw,
      talkingPoints: raw.talkingPoints
        .split("\n")
        .map((s) => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean),
    };
  }
  return raw;
}

// Remove the run-sheet from a phase config on the way to a non-facilitator role.
// A clone + delete of ONLY this key (never an allowlist), so every other config
// field — label, timerSeconds, prompt, … — is preserved exactly.
export function stripRunsheet(
  config: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!config || typeof config !== "object") return config;
  if (!(RUNSHEET_KEY in config)) return config;
  const clone = { ...config };
  delete clone[RUNSHEET_KEY];
  return clone;
}

// Read + validate the run-sheet out of a phase config (facilitator side only).
// Coerces a legacy string talkingPoints, then zod-validates; an invalid run-sheet
// degrades to null rather than reaching the facilitator malformed.
export function extractRunsheet(
  config: Record<string, unknown> | null | undefined,
): RunSheet | null {
  const r = config?.[RUNSHEET_KEY];
  if (!r || typeof r !== "object") return null;
  const parsed = runSheetSchema.safeParse(coerce(r as Record<string, unknown>));
  return parsed.success ? (parsed.data as RunSheet) : null;
}

// True when a run-sheet actually has content (so empty objects don't show a panel).
export function hasRunsheet(rs: RunSheet | null): boolean {
  return Boolean(
    rs &&
      (rs.script?.trim() ||
        rs.talkingPoints?.some((t) => t.trim()) ||
        rs.contingency?.trim()),
  );
}
