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
  | "rehearse" // B5 — dry-run a built session in an isolated shadow room
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
  "rehearse",
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
  "rehearse",
];

export const CAPABILITIES: Record<Role, Set<Capability>> = {
  admin: new Set(ALL),
  // A2: the Facilitator (magic-link) role runs the WHOLE room — it now holds
  // `configure`, so launching a custom build (setPhases) no longer 403s. This
  // makes facilitator capability-equal to admin; the per-room admin tier is kept
  // but vestigial (no Owner portal in this slice).
  facilitator: new Set(ALL),
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
