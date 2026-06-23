// Module: media (presentation screen).
//
// Shows a deck of slides + videos on the projector between activities, advanced
// by the facilitator. The runtime is intentionally dumb: a deck is a flat list
// of image and video cards. PowerPoint/Keynote/PDF decks are converted to page
// images CLIENT-SIDE at upload time (see media.client.tsx, pdf.js), so the
// projector never renders a PDF — it only ever shows an <img> or an embedded
// video. That keeps playback bulletproof.
//
// State lives in votes (never config alone), so a facilitator can load/reorder
// the deck live:
//   votes["__deck__"]  = MediaCard[]  (seeded from config.cards if unset)
//   votes["__index__"] = number       (the slide currently on screen, default 0)
// Mutations are facilitator-only and serialised through ctx.store.withLock so a
// double-tapped "Next" can't skip a slide.

import { z } from "zod";
import type { ModuleServerDef } from "../types";

// ---- view shapes (exported; consumed by media.client.tsx) -----------------

export interface MediaCard {
  id: string;
  kind: "image" | "video";
  url: string;
  title?: string;
}

// participant + projector see only the current card; facilitator also gets the
// full deck so the console can manage it.
export interface MediaView {
  label?: string;
  card: MediaCard | null;
  index: number;
  total: number;
  deck?: MediaCard[]; // facilitator/cohost/admin only
}

export interface MediaConfig {
  label: string;
  cards?: MediaCard[];
}

const cardSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "video"]),
  url: z.string(),
  title: z.string().optional(),
});

const MAX_CARDS = 300;

function readDeck(votes: Record<string, unknown>, config: MediaConfig): MediaCard[] {
  const fromVotes = votes["__deck__"];
  if (Array.isArray(fromVotes)) return fromVotes as MediaCard[];
  return config.cards ?? [];
}

function readIndex(votes: Record<string, unknown>): number {
  const i = votes["__index__"];
  return typeof i === "number" && Number.isFinite(i) ? i : 0;
}

function clampIndex(i: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, Math.floor(i)), total - 1);
}

// Accept only http(s) URLs (Blob uploads + pasted embeds) — never javascript:/
// data: URIs that could execute when rendered.
function safeUrl(u: unknown): boolean {
  return typeof u === "string" && /^https?:\/\//i.test(u) && u.length <= 2000;
}

export const mediaModule: ModuleServerDef<MediaConfig> = {
  id: "media",
  meta: {
    name: "Presentation",
    description:
      "Show slides (PDF/images) and videos on the room screen between activities, advanced by the facilitator.",
  },
  schema: z
    .object({
      label: z.string(),
      cards: z.array(cardSchema).optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Presentation" },
  defaultVisibility: vis(),
  capabilities: {
    acceptsActions: true,
    liveResults: false,
    needsTimer: false,
    projectable: true,
  },
  async computeView(ctx) {
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const config = ctx.config as unknown as MediaConfig;
    const deck = readDeck(votes, config);
    const index = clampIndex(readIndex(votes), deck.length);
    const view: MediaView = {
      label: config.label,
      card: deck[index] ?? null,
      index,
      total: deck.length,
    };
    // Only the facilitator-side roles need the whole deck (to manage it).
    if (ctx.role !== "participant" && ctx.role !== "projector") {
      view.deck = deck;
    }
    return view;
  },
  async handleAction(ctx, action) {
    // Every media action is facilitator-driven (load/advance the deck).
    if (ctx.role === "participant")
      return { ok: false, reason: "forbidden" };

    if (action.type === "setDeck") {
      const raw = action.payload?.deck;
      if (!Array.isArray(raw)) return { ok: false, reason: "no deck" };
      if (raw.length > MAX_CARDS) return { ok: false, reason: "too many slides" };
      // Validate + sanitise every card before it can reach the room screen.
      const deck: MediaCard[] = [];
      for (const c of raw) {
        const parsed = cardSchema.safeParse(c);
        if (!parsed.success || !safeUrl(parsed.data.url)) continue;
        deck.push({
          id: parsed.data.id,
          kind: parsed.data.kind,
          url: parsed.data.url,
          title: parsed.data.title?.slice(0, 200),
        });
      }
      await ctx.store.castVote(ctx.phase.id, "__deck__", deck);
      // Keep the on-screen index in range after an edit.
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const idx = clampIndex(readIndex(votes), deck.length);
      await ctx.store.castVote(ctx.phase.id, "__index__", idx);
      return { ok: true };
    }

    if (action.type === "setIndex" || action.type === "next" || action.type === "prev") {
      const res = await ctx.store.withLock(`media:${ctx.phase.id}`, async () => {
        const votes = await ctx.store.readVotes(ctx.phase.id);
        const deck = readDeck(votes, ctx.config as unknown as MediaConfig);
        const cur = clampIndex(readIndex(votes), deck.length);
        const target =
          action.type === "next"
            ? cur + 1
            : action.type === "prev"
              ? cur - 1
              : Number(action.payload?.index ?? cur);
        await ctx.store.castVote(ctx.phase.id, "__index__", clampIndex(target, deck.length));
      });
      return res.ok ? { ok: true } : { ok: false, reason: "One moment." };
    }

    return { ok: false, reason: "unknown action" };
  },
};

// Local copy of the registry's visibility helper (admin mirrors facilitator).
// Everyone can see the presentation screen; the facilitator also drives it.
function vis() {
  const v = "visible" as const;
  return { admin: v, participant: v, facilitator: v, cohost: v, projector: v };
}
