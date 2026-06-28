// Role → capability mapping and the room-scoped gate used by host routes.

import { resolveRole } from "./rooms";
import { resolveWorkspace, type WorkspaceRole } from "./workspaces";
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

// Phase A — the admin-portal gate, workspace-aware. Resolves a code to the
// workspace it administers: the env super-admin → the default workspace (and may
// TARGET any workspace via `requestedWorkspaceId`); a workspace admin code → its
// own workspace only (a mismatched request is ignored, never honoured). Replaces
// the bare `checkSuperAdmin` gate on every /api/admin route so the data those
// routes read/write can be scoped to `workspaceId`.
export async function resolveAdminContext(
  code: string | null | undefined,
  requestedWorkspaceId?: string | null,
): Promise<{
  ok: boolean;
  workspaceId: string;
  isSuperAdmin: boolean;
  // Phase C — the role this code holds in the workspace, and (for a named
  // member) who they are. Owner-only routes (member management) check `role`;
  // `memberId`/`memberName` drive room attribution.
  role: WorkspaceRole | null;
  memberId: string | null;
  memberName: string | null;
}> {
  const { workspaceId, isSuperAdmin, role, memberId, memberName } =
    await resolveWorkspace(code);
  if (!workspaceId)
    return {
      ok: false,
      workspaceId: "",
      isSuperAdmin: false,
      role: null,
      memberId: null,
      memberName: null,
    };
  const effective =
    isSuperAdmin && requestedWorkspaceId ? requestedWorkspaceId : workspaceId;
  return { ok: true, workspaceId: effective, isSuperAdmin, role, memberId, memberName };
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
