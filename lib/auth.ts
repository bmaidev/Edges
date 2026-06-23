// Role → capability mapping and the room-scoped gate used by host routes.

import { resolveRole } from "./rooms";
import type { Role } from "./types";

export type Capability =
  | "configure" // change room config / template (admin only)
  | "advance" // change phase
  | "timer" // start/clear timers
  | "inject" // push content
  | "curate" // create/edit/reorder patterns, edit/delete submissions
  | "readaround" // pace the read-around
  | "reassign" // manually move a participant's allocation
  | "cluster" // run AI cluster assist
  | "viewRaw" // see raw submissions / participants
  | "end"; // end + wipe the session

const ALL: Capability[] = [
  "configure",
  "advance",
  "timer",
  "inject",
  "curate",
  "readaround",
  "reassign",
  "cluster",
  "viewRaw",
  "end",
];

// Co-host is a reduced facilitator: can drive the room, but not end it,
// reconfigure it, or manually reassign people.
const COHOST: Capability[] = [
  "advance",
  "timer",
  "inject",
  "curate",
  "readaround",
  "cluster",
  "viewRaw",
];

export const CAPABILITIES: Record<Role, Set<Capability>> = {
  admin: new Set(ALL),
  facilitator: new Set(ALL.filter((c) => c !== "configure")),
  cohost: new Set(COHOST),
  projector: new Set<Capability>(),
  participant: new Set<Capability>(),
};

export function roleHasCapability(role: Role, cap: Capability): boolean {
  return CAPABILITIES[role].has(cap);
}

// Resolve the caller's role in a room and check a capability in one step.
// Returns the role on success so callers can audit/log.
export async function requireCapability(
  slug: string,
  code: string | null | undefined,
  cap: Capability,
): Promise<{ ok: boolean; role: Role | null }> {
  const role = await resolveRole(slug, code);
  if (!role) return { ok: false, role: null };
  return { ok: roleHasCapability(role, cap), role };
}
