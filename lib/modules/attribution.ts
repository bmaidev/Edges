import type { ModuleKind } from "@/lib/types";

// D1 — the HONEST per-phase attribution regime, so a participant always knows
// where their response goes. Four provable states (plus "none" for display-only):
//   named             — shown to the room with the participant's name
//   facilitators-only — room sees it anonymised; facilitators still see who
//   anonymous-strict  — the token is stripped at write, so NO ONE (not even the
//                       facilitators) can link the response to a person
// We never claim a stronger anonymity than the system actually delivers: the
// strict claim is true ONLY because the write path drops the token (see capture's
// handleAction), so there is no token→handle link to follow.
export type Attribution =
  | "named"
  | "facilitators-only"
  | "anonymous-strict"
  | "none";

// Modules whose CLIENT renderer actually displays the participant's handle to the
// whole room (verified against lib/modules/defs/*.client.tsx). Everything else
// that gathers shows responses anonymised to the room — facilitators can still
// see who said what, but the room cannot.
const NAMED_TO_ROOM = new Set<ModuleKind>(["lightning", "onetwofour"]);

// The per-phase anonymity setting a config may carry (capture & kin). "anonymous"
// strips the displayed handle; "anonymous-strict" additionally strips the token
// at write so the link itself never exists.
export type AnonymitySetting = "named" | "anonymous" | "anonymous-strict";

export function resolveAttribution(
  moduleId: ModuleKind | null,
  gatherSource: "none" | "submissions" | "votes",
  anonymity?: AnonymitySetting,
): Attribution {
  if (!moduleId || gatherSource === "none") return "none";
  // Strict wins regardless of module: the token is gone, so the room AND the
  // facilitators are blind to who said it.
  if (anonymity === "anonymous-strict") return "anonymous-strict";
  return NAMED_TO_ROOM.has(moduleId) ? "named" : "facilitators-only";
}
