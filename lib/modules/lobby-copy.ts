// Shared lobby count copy, used by BOTH the phone lobby renderer and the
// projector LobbyScreen so the two can never drift. The count is "joined-ever"
// (participants don't expire within the 24h TTL), so the framing is "in the
// room" / "arriving" — never a live-presence claim.
export function countCopy(present: number): string {
  return present <= 1
    ? "You're first — others are arriving"
    : `${present} in the room`;
}
