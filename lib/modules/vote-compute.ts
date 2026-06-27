// B2 (Wave 3) — faithfulness. The vote modules' view-shaping lived inline in each
// computeView AND was re-hand-authored in the in-builder sample factory, so the
// preview could silently drift from the real view. These PURE shapers are the
// single source of truth: `computeView` calls them with REAL votes, the sample
// factory calls them with SYNTHETIC votes. Same code → the preview can't lie.
//
// Input is the raw votes hash (token -> stored value) exactly as the store returns
// it, plus the phase config + the caller's identity/role — nothing from the store,
// so they're trivially testable and run client-side for the preview.

import type { Role } from "../types";
import type { PollView } from "./views";

type Cfg = Record<string, unknown>;

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ---- poll (single / multi choice) -----------------------------------------

export function pollView(
  config: Cfg,
  votes: Record<string, unknown>,
  meToken: string | null,
  role: Role,
): PollView {
  const options = strArray(config.options);
  const multi = Boolean(config.multi);
  const reveal = config.reveal === "onAdvance" ? "onAdvance" : "live";

  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));
  let total = 0;
  for (const v of Object.values(votes)) {
    const arr = Array.isArray(v) ? v : [v];
    let counted = false;
    for (const opt of arr)
      if (typeof opt === "string" && opt in counts) {
        counts[opt]++;
        counted = true;
      }
    if (counted) total++;
  }

  const show = reveal === "live" || role !== "participant";
  const raw = meToken ? votes[meToken] : null;
  const mine =
    raw == null
      ? null
      : Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === "string")
        : [String(raw)];

  return {
    question: typeof config.question === "string" ? config.question : "",
    options,
    multi,
    total,
    counts: show ? counts : null,
    mine,
  };
}

// A plausible synthetic votes hash for the preview: a gentle descending
// distribution across the options, plus the caller's own pick under "me" so the
// preview shows the "you voted" affordance. Deterministic (no RNG).
export function samplePollVotes(
  options: string[],
  multi: boolean,
): Record<string, unknown> {
  const dist = [3, 2, 1, 1];
  const votes: Record<string, unknown> = {};
  let t = 0;
  options.forEach((opt, i) => {
    for (let k = 0; k < (dist[i % dist.length] ?? 1); k++) {
      votes[`s${t++}`] = multi ? [opt] : opt;
    }
  });
  if (options.length) votes["me"] = multi ? [options[0]] : options[0];
  return votes;
}
