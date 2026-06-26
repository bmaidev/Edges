import type { RunSheet } from "@/lib/types";

// B3 — the reserved config key under which a phase's facilitator-private run-sheet
// is nested. No module schema may own this key (all module schemas are
// `.passthrough()`, asserted by test), so it round-trips untouched through
// setPhases without a module ever reading it.
export const RUNSHEET_KEY = "runsheet";

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

// Read the run-sheet out of a phase config (facilitator side only).
export function extractRunsheet(
  config: Record<string, unknown> | null | undefined,
): RunSheet | null {
  const r = config?.[RUNSHEET_KEY];
  return r && typeof r === "object" ? (r as RunSheet) : null;
}

// True when a run-sheet actually has content (so empty objects don't show a panel).
export function hasRunsheet(rs: RunSheet | null): boolean {
  return Boolean(rs && (rs.script?.trim() || rs.talkingPoints?.trim() || rs.contingency?.trim()));
}
