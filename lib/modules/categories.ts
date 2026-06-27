// B6 — the canonical grouping of methods into scannable categories, shared by the
// builder palette AND the /help method reference so the two can never drift. The
// registry itself is flat; this is purely presentational ordering.

import type { ModuleKind } from "@/lib/types";

export const MODULE_CATEGORIES: { label: string; kinds: ModuleKind[] }[] = [
  { label: "Structure", kinds: ["lobby", "content", "media", "ambient", "actions", "close"] },
  { label: "Capture & surface", kinds: ["capture", "prework", "readaround"] },
  {
    label: "Group & dialogue",
    kinds: ["allocate", "coordinator", "onetwofour", "worldcafe", "stations", "consult", "fishbowl", "openspace"],
  },
  {
    label: "Vote & prioritise",
    kinds: ["poll", "dotvote", "rank", "scale", "gradient", "marketplace", "matrix", "spectrogram", "twentyfive10", "minspecs"],
  },
  { label: "Ideate & critique", kinds: ["brainwrite", "redistribute", "lightning", "qna", "wordcloud"] },
  {
    label: "AI synthesis",
    kinds: ["devil", "friction", "synthesis", "needs", "persona", "emptychair", "issuemap", "promptrelay", "builder"],
  },
  { label: "Analytics", kinds: ["equity"] },
];
