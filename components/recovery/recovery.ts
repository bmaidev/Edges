import type { FacilitatorState } from "@/lib/types";

// C3 — pure, content-free counters for the recovery confirm copy ("this clears N
// responses"). Vote counts exclude reserved `__*__` pseudo-tokens so a marker
// never inflates the number the facilitator sees.

export function phaseAnswerCount(
  submissions: { phaseId: string }[],
  phaseId: string,
): number {
  return submissions.filter((s) => s.phaseId === phaseId).length;
}

export function phaseVoteCount(voteFields: string[], phaseId: string): number {
  const prefix = `${phaseId}::`;
  return voteFields.filter(
    (f) => f.startsWith(prefix) && !f.slice(prefix.length).startsWith("__"),
  ).length;
}

// Best-effort "responses on the CURRENT phase" from the facilitator state, for
// the confirm sheet. Submissions are enumerable client-side; for vote phases the
// C2 participation `responded` (already marker-free) is the responder count.
export function currentPhaseResponseCount(s: FacilitatorState): number {
  if (!s.phaseId) return 0;
  const subs = phaseAnswerCount(s.submissions ?? [], s.phaseId);
  const voters = s.participation?.responded ?? 0;
  return Math.max(subs, voters);
}

// Does this phase collect responses (so Reset is meaningful)?
export function isCollectingPhase(s: FacilitatorState): boolean {
  return (
    s.participation != null ||
    (s.submissions?.some((x) => x.phaseId === s.phaseId) ?? false)
  );
}

// C3 — "ghost data": this phase already holds stored submissions, yet NONE of the
// current roster produced them (the C2 responder count is 0). That mismatch means
// the answers are leftovers from an earlier run/session — they'd surface to the
// room as-is on the next reveal. We flag it (content-free: just the count) so the
// facilitator can reset to a clean phase before that happens. Returns 0 when the
// phase looks live (responders present) or holds nothing.
export function ghostDataCount(s: FacilitatorState): number {
  if (!s.phaseId) return 0;
  const stored = phaseAnswerCount(s.submissions ?? [], s.phaseId);
  if (stored <= 0) return 0;
  const responded = s.participation?.responded ?? 0;
  return responded === 0 ? stored : 0;
}
