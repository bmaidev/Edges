// AI cluster assist, room-scoped. Sends the current phase's submissions to
// Claude and returns suggested named clusters. Gated by ANTHROPIC_API_KEY.

import { getState, listSubmissions } from "./store";
import { aiAvailable, asData, capItems, generateJSON, topicLine } from "./ai";
import type { ClusterSuggestion } from "./types";

function normalise(parsed: unknown): ClusterSuggestion[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (c) => c && typeof c.name === "string" && Array.isArray(c.submissionIds),
    )
    .map((c) => ({
      name: String(c.name).slice(0, 60),
      submissionIds: c.submissionIds.filter(
        (id: unknown) => typeof id === "string",
      ),
    }));
}

export async function suggestClusters(
  roomId: string,
): Promise<{ ok: boolean; clusters: ClusterSuggestion[]; status: number }> {
  if (!aiAvailable()) return { ok: false, clusters: [], status: 404 };

  const state = await getState(roomId);
  const all = await listSubmissions(roomId);
  const scoped = all.filter((s) => s.phaseId === state.phaseId);
  const { kept } = capItems(scoped.length ? scoped : all, 150);
  const submissions = kept.map((s) => ({ id: s.id, text: s.text, tag: s.tag }));
  if (submissions.length === 0) return { ok: true, clusters: [], status: 200 };

  const res = await generateJSON<unknown>({
    label: "cluster",
    tier: "fast",
    shape: "array",
    system:
      "You help a facilitator cluster short workshop submissions. " +
      "Return JSON only — no markdown, no commentary, no code fences.",
    user: `${topicLine(state.topic)}You will receive a list of submissions. Return 3 to 5 clusters that capture the patterns underneath them. Cluster names must be ≤5 words, sentence case, plain English. Group every submission into exactly one cluster. Do not invent content. Do not add commentary.

${asData("submissions", JSON.stringify(submissions, null, 2))}

Return JSON only, in this shape:
[
  { "name": "Pattern name here", "submissionIds": ["..."] }
]`,
  });
  if (!res.ok) return { ok: false, clusters: [], status: 502 };
  return { ok: true, clusters: normalise(res.data), status: 200 };
}
