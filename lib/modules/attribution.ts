import type { ModuleKind } from "@/lib/types";

// D1 — the HONEST per-phase attribution regime, so a participant always knows
// whether their response is shown to the room with their name, or kept to the
// facilitators. Two provable states only (plus "none" for display-only phases):
// we never claim a stronger anonymity than the system actually delivers (the
// facilitator state still carries submissions + the token→handle map, so a
// "not even the facilitators" claim would be false — and is deliberately absent).
export type Attribution = "named" | "facilitators-only" | "none";

// Modules whose CLIENT renderer actually displays the participant's handle to the
// whole room (verified against lib/modules/defs/*.client.tsx). Everything else
// that gathers shows responses anonymised to the room — facilitators can still
// see who said what, but the room cannot.
const NAMED_TO_ROOM = new Set<ModuleKind>(["lightning", "onetwofour"]);

export function resolveAttribution(
  moduleId: ModuleKind | null,
  gatherSource: "none" | "submissions" | "votes",
): Attribution {
  if (!moduleId || gatherSource === "none") return "none";
  return NAMED_TO_ROOM.has(moduleId) ? "named" : "facilitators-only";
}
