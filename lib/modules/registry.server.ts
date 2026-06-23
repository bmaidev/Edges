// Server registry: the logic half of each module (schema, computeView,
// handleAction). Lifted verbatim from the pre-registry getPublicState switch,
// buildAllocation/buildCoordinator, and the submit/allocate route guards.

import { z } from "zod";
import type { ContentItem, ContentType, Participant } from "@/lib/types";
import type {
  ModuleContext,
  ModuleKind,
  ModuleServerDef,
  Role,
  Visibility,
} from "./types";
import type {
  AllocateView,
  CaptureView,
  ContentView,
  CoordinatorView,
  LobbyView,
  ReadAroundView,
} from "./views";
// Fleet-built modules (research roadmap) — one self-contained def per file.
import { brainwriteModule } from "./defs/brainwrite.server";
import { marketplaceModule } from "./defs/marketplace.server";
import { redistributeModule } from "./defs/redistribute.server";
import { spectrogramModule } from "./defs/spectrogram.server";
import { gradientModule } from "./defs/gradient.server";
import { lightningModule } from "./defs/lightning.server";
import { fishbowlModule } from "./defs/fishbowl.server";
import { openspaceModule } from "./defs/openspace.server";
import { consultModule } from "./defs/consult.server";
import { devilModule } from "./defs/devil.server";
import { frictionModule } from "./defs/friction.server";
import { synthesisModule } from "./defs/synthesis.server";
import { needsModule } from "./defs/needs.server";
import { equityModule } from "./defs/equity.server";
import { preworkModule } from "./defs/prework.server";
import { worldcafeModule } from "./defs/worldcafe.server";
import { stationsModule } from "./defs/stations.server";
import { onetwofourModule } from "./defs/onetwofour.server";
import { twentyfive10Module } from "./defs/twentyfive10.server";
import { minspecsModule } from "./defs/minspecs.server";
import { personaModule } from "./defs/persona.server";
import { emptychairModule } from "./defs/emptychair.server";
import { issuemapModule } from "./defs/issuemap.server";
import { promptrelayModule } from "./defs/promptrelay.server";
import { builderModule } from "./defs/builder.server";
import { mediaModule } from "./defs/media.server";

const CONTENT_TYPES = ["case", "lens", "prompt", "argument", "note"] as const;

// ---- shared helpers (lifted from store.ts) --------------------------------

function vis(
  participant: Visibility,
  facilitator: Visibility,
  cohost: Visibility,
  projector: Visibility,
): Record<Role, Visibility> {
  // Admin sees whatever the facilitator sees.
  return { admin: facilitator, participant, facilitator, cohost, projector };
}

function substitute(text: string, me: Participant | null): string {
  const lens = me?.lens || "your lens";
  const side = me?.side || "your side";
  return text.replace(/\[LENS\]/g, lens).replace(/\[SIDE\]/g, side);
}

function visibleByTypes(
  items: ContentItem[],
  types?: ContentType[],
): ContentItem[] {
  if (!types) return items;
  return items.filter((c) => types.includes(c.type));
}

// ---- module: lobby --------------------------------------------------------

const lobby: ModuleServerDef = {
  id: "lobby",
  meta: { name: "Lobby", description: "Holding screen before the session starts." },
  schema: z.object({ label: z.string(), message: z.string().optional() }).passthrough(),
  defaultConfig: { label: "Lobby" },
  defaultVisibility: vis("visible", "hidden", "hidden", "visible"),
  capabilities: { acceptsActions: false, liveResults: false, needsTimer: false, projectable: true },
  computeView(ctx): LobbyView {
    return {
      message: (ctx.config.message as string) ?? "",
      present: ctx.participants.length,
    };
  },
};

// ---- module: content ------------------------------------------------------

const content: ModuleServerDef = {
  id: "content",
  meta: { name: "Content display", description: "Read-only markdown the facilitator pushes to the room." },
  schema: z
    .object({
      label: z.string(),
      contentHeading: z.string().optional(),
      showContentTypes: z.array(z.enum(CONTENT_TYPES)).optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Content" },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: false, liveResults: false, needsTimer: false, projectable: true },
  computeView(ctx): ContentView {
    const types = ctx.config.showContentTypes as ContentType[] | undefined;
    const items = visibleByTypes(ctx.visibleContent, types);
    const pulseKey =
      items.reduce((m, c) => Math.max(m, c.addedAt), 0) + items.length;
    return {
      heading: ctx.config.contentHeading as string | undefined,
      items,
      pulseKey,
    };
  },
};

// ---- module: capture ------------------------------------------------------

const capture: ModuleServerDef = {
  id: "capture",
  meta: { name: "Capture", description: "Mic + textarea. Collects short text submissions." },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string(),
      prompt2: z.string().optional(),
      placeholder: z.string().optional(),
      placeholder2: z.string().optional(),
      timerSeconds: z.number().optional(),
      multiSubmit: z.boolean().optional(),
      tagWith: z.enum(["lens", "side"]).optional(),
      // "anonymous" strips the handle from stored submissions, so even the
      // facilitator's raw view can't attribute who said what (off-the-record).
      anonymity: z.enum(["named", "anonymous"]).optional(),
      // Optional deck of constraints the facilitator can inject mid-phase.
      constraintDeck: z.array(z.string()).optional(),
      contentHeading: z.string().optional(),
      showContentTypes: z.array(z.enum(CONTENT_TYPES)).optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Capture", prompt: "" },
  defaultVisibility: vis("visible", "visible", "visible", "hidden"),
  capabilities: { acceptsActions: true, liveResults: false, needsTimer: true, projectable: false },
  async computeView(ctx): Promise<CaptureView> {
    const types = ctx.config.showContentTypes as ContentType[] | undefined;
    const deck = ctx.config.constraintDeck as string[] | undefined;
    let activeConstraint: string | null = null;
    if (deck && deck.length) {
      const votes = await ctx.store.readVotes(ctx.phase.id);
      activeConstraint = (votes["__constraint__"] as string) ?? null;
    }
    return {
      prompt: substitute((ctx.config.prompt as string) ?? "", ctx.me),
      prompt2: ctx.config.prompt2
        ? substitute(ctx.config.prompt2 as string, ctx.me)
        : undefined,
      placeholder: ctx.config.placeholder as string | undefined,
      placeholder2: ctx.config.placeholder2 as string | undefined,
      multiSubmit: Boolean(ctx.config.multiSubmit),
      referenceItems: types ? visibleByTypes(ctx.visibleContent, types) : [],
      referenceHeading: ctx.config.contentHeading as string | undefined,
      activeConstraint,
      constraintDeck: deck,
    };
  },
  async handleAction(ctx, action) {
    // Facilitator-only: drop (or clear) a live constraint for this phase.
    if (action.type === "injectConstraint") {
      if (ctx.role === "participant") return { ok: false, reason: "forbidden" };
      const c = String(action.payload?.constraint ?? "").trim();
      await ctx.store.castVote(ctx.phase.id, "__constraint__", c || null);
      return { ok: true };
    }
    const text = String(action.payload?.text ?? "").trim();
    if (!text) return { ok: false, reason: "empty" };
    if (text.length > 2000) return { ok: false, reason: "too long" };
    // Resolve handle + tag from the participant record where possible.
    let handle =
      typeof action.handle === "string" && action.handle.trim()
        ? action.handle.trim().slice(0, 40)
        : "Anonymous";
    let tag: string | null = null;
    if (ctx.me) {
      handle = ctx.me.handle;
      const tagWith = ctx.config.tagWith as "lens" | "side" | undefined;
      if (tagWith === "lens") tag = ctx.me.lens ?? null;
      else if (tagWith === "side") tag = ctx.me.side ?? null;
    }
    if (ctx.config.anonymity === "anonymous") handle = "Anonymous";
    await ctx.store.addSubmission(handle, text, ctx.phase.id, tag, action.token);
    return { ok: true };
  },
};

// ---- module: allocate -----------------------------------------------------

const allocate: ModuleServerDef = {
  id: "allocate",
  meta: { name: "Self-allocation", description: "Participants claim a lens or a side; live counts, optional cap." },
  schema: z
    .object({
      label: z.string(),
      allocate: z.object({
        kind: z.enum(["lens", "side"]),
        cap: z.number().optional(),
        optionsFromContentType: z.enum(CONTENT_TYPES).optional(),
        fixedOptions: z.array(z.string()).optional(),
        header: z.string(),
      }),
    })
    .passthrough(),
  defaultConfig: {
    label: "Pick",
    allocate: { kind: "side", fixedOptions: ["A", "B"], header: "Pick one." },
  },
  defaultVisibility: vis("visible", "visible", "visible", "hidden"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  computeView(ctx): AllocateView {
    const a = ctx.config.allocate as {
      kind: "lens" | "side";
      cap?: number;
      optionsFromContentType?: ContentType;
      fixedOptions?: string[];
      header: string;
    };
    let options: { name: string; subtitle?: string }[] = [];
    if (a.fixedOptions) options = a.fixedOptions.map((n) => ({ name: n }));
    else if (a.optionsFromContentType)
      options = ctx.visibleContent
        .filter((c) => c.type === a.optionsFromContentType)
        .map((c) => ({ name: c.title, subtitle: c.body }));

    const counts: Record<string, number> = {};
    options.forEach((o) => (counts[o.name] = 0));
    for (const p of ctx.participants) {
      const v = a.kind === "lens" ? p.lens : p.side;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    const mine =
      (a.kind === "lens" ? ctx.me?.lens : ctx.me?.side) ?? null;
    return { header: a.header, kind: a.kind, options, counts, mine, cap: a.cap };
  },
  async handleAction(ctx, action) {
    const a = ctx.config.allocate as { kind: "lens" | "side"; cap?: number };
    const choice = String(action.payload?.choice ?? "");
    if (!action.token || !choice) return { ok: false, reason: "missing" };
    return ctx.store.allocate(action.token, a.kind, choice, a.cap);
  },
};

// ---- module: coordinator --------------------------------------------------

const coordinator: ModuleServerDef = {
  id: "coordinator",
  meta: { name: "Coordinator", description: "Tells each person their pair or triad." },
  schema: z
    .object({
      label: z.string(),
      coordinator: z.object({
        kind: z.enum(["lens-triad", "pair"]),
        message: z.string(),
      }),
    })
    .passthrough(),
  defaultConfig: {
    label: "Coordinate",
    coordinator: { kind: "pair", message: "You're paired with [PARTNER]." },
  },
  defaultVisibility: vis("visible", "visible", "visible", "hidden"),
  capabilities: { acceptsActions: false, liveResults: false, needsTimer: false, projectable: false },
  computeView(ctx): CoordinatorView {
    const c = ctx.config.coordinator as {
      kind: "lens-triad" | "pair";
      message: string;
    };
    const me = ctx.me;
    if (!me) return { kind: c.kind, message: c.message };
    if (c.kind === "pair") {
      const idx = ctx.participants.findIndex((p) => p.token === me.token);
      const partnerIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const partner = ctx.participants[partnerIdx];
      if (idx === -1 || !partner)
        return { kind: c.kind, message: c.message, unpaired: true };
      return {
        kind: c.kind,
        message: c.message.replace(/\[PARTNER\]/g, partner.handle),
      };
    }
    const members = ctx.participants
      .filter((p) => p.lens && p.lens === me.lens && p.token !== me.token)
      .map((p) => p.handle);
    const message = c.message
      .replace(/\[LENS\]/g, me.lens ?? "your lens")
      .replace(/\[MEMBERS\]/g, members.join(", ") || "—");
    return { kind: c.kind, message, members };
  },
};

// ---- module: readaround ---------------------------------------------------

const readaround: ModuleServerDef = {
  id: "readaround",
  meta: { name: "Read-around", description: "Facilitator paces through submissions or patterns, live." },
  schema: z
    .object({
      label: z.string(),
      readaround: z.object({
        source: z.enum(["submissions", "patterns"]),
        sourcePhaseId: z.string().optional(),
      }),
    })
    .passthrough(),
  defaultConfig: {
    label: "Read-around",
    readaround: { source: "patterns" },
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: false, liveResults: true, needsTimer: false, projectable: true },
  computeView(ctx): ReadAroundView {
    const r = ctx.config.readaround as {
      source: "submissions" | "patterns";
      sourcePhaseId?: string;
    };
    if (r.source === "submissions") {
      const subs = ctx.submissions
        .filter((s) => s.phaseId === r.sourcePhaseId)
        .sort((a, b) => a.createdAt - b.createdAt);
      const idx = Math.min(
        ctx.state.readaroundIndex,
        Math.max(0, subs.length - 1),
      );
      const cur = subs[idx];
      return {
        index: idx,
        total: subs.length,
        item: cur ? { text: cur.text, tag: cur.tag } : null,
      };
    }
    const idx = Math.min(
      ctx.state.readaroundIndex,
      Math.max(0, ctx.patterns.length - 1),
    );
    const cur = ctx.patterns[idx];
    return {
      index: idx,
      total: ctx.patterns.length,
      item: cur ? { text: cur.name } : null,
    };
  },
};

// ---- module: close --------------------------------------------------------

const close: ModuleServerDef = {
  id: "close",
  meta: { name: "Close", description: "End-of-session message." },
  schema: z.object({ label: z.string() }).passthrough(),
  defaultConfig: { label: "Close" },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: false, liveResults: false, needsTimer: false, projectable: true },
  computeView(ctx) {
    const mine = ctx.me
      ? ctx.submissions
          .filter((s) => s.token && s.token === ctx.me!.token)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((s) => ({ text: s.text, tag: s.tag ?? null }))
      : [];
    return { ended: ctx.state.ended, yourContributions: mine };
  },
};

// ---- module: poll (single/multi choice) -----------------------------------

const poll: ModuleServerDef = {
  id: "poll",
  meta: { name: "Poll", description: "Single or multiple choice over a fixed option set, with live results." },
  schema: z
    .object({
      label: z.string(),
      question: z.string(),
      options: z.array(z.string()).min(2),
      multi: z.boolean().optional(),
      reveal: z.enum(["live", "onAdvance"]).optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Poll", question: "", options: ["Yes", "No"] },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const options: string[] = c.options ?? [];
    const multi = Boolean(c.multi);
    const reveal = c.reveal ?? "live";
    const votes = await ctx.store.readVotes(ctx.phase.id);
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
    const show = reveal === "live" || ctx.role !== "participant";
    const raw = ctx.me ? votes[ctx.me.token] : null;
    const mine =
      raw == null
        ? null
        : Array.isArray(raw)
          ? raw.filter((x): x is string => typeof x === "string")
          : [String(raw)];
    return {
      question: c.question ?? "",
      options,
      multi,
      total,
      counts: show ? counts : null,
      mine,
    };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const c = ctx.config as Record<string, any>;
    const multi = Boolean(c.multi);
    const choice = action.payload?.choice;
    const choices = action.payload?.choices;
    let value: string | string[];
    if (multi && Array.isArray(choices))
      value = choices.filter((x): x is string => typeof x === "string");
    else if (typeof choice === "string") value = multi ? [choice] : choice;
    else return { ok: false, reason: "missing" };
    await ctx.store.castVote(ctx.phase.id, action.token, value);
    return { ok: true };
  },
};

// ---- module: dotvote (budget voting) ---------------------------------------

const dotvote: ModuleServerDef = {
  id: "dotvote",
  meta: { name: "Dot voting", description: "Spend a budget of dots across options to prioritise." },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string().optional(),
      options: z.array(z.string()).min(2),
      dots: z.number().int().positive(),
    })
    .passthrough(),
  defaultConfig: { label: "Dot vote", options: ["A", "B", "C"], dots: 3 },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const options: string[] = c.options ?? [];
    const dots: number = c.dots ?? 3;
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const counts: Record<string, number> = {};
    options.forEach((o) => (counts[o] = 0));
    for (const v of Object.values(votes)) {
      const map = (v ?? {}) as Record<string, number>;
      for (const [opt, n] of Object.entries(map))
        if (opt in counts) counts[opt] += Number(n) || 0;
    }
    const mine = ((ctx.me ? votes[ctx.me.token] : null) ?? {}) as Record<string, number>;
    const used = Object.values(mine).reduce((s, n) => s + (Number(n) || 0), 0);
    return { prompt: c.prompt ?? "", options, dots, counts, mine, remaining: Math.max(0, dots - used) };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const c = ctx.config as Record<string, any>;
    const dots: number = c.dots ?? 3;
    const options: string[] = c.options ?? [];
    const choice = String(action.payload?.choice ?? "");
    const delta = action.payload?.delta === -1 ? -1 : 1;
    if (!options.includes(choice)) return { ok: false, reason: "bad option" };
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const mine = ((votes[action.token] as Record<string, number>) ?? {}) || {};
    const used = Object.values(mine).reduce((s, n) => s + (Number(n) || 0), 0);
    if (delta === 1 && used >= dots) return { ok: false, reason: "no dots left" };
    mine[choice] = Math.max(0, (Number(mine[choice]) || 0) + delta);
    await ctx.store.castVote(ctx.phase.id, action.token, mine);
    return { ok: true };
  },
};

// ---- module: rank (Borda) --------------------------------------------------

const rank: ModuleServerDef = {
  id: "rank",
  meta: { name: "Ranking", description: "Drag items into priority order; aggregated by Borda count." },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string().optional(),
      items: z.array(z.string()).min(2),
    })
    .passthrough(),
  defaultConfig: { label: "Rank", items: ["First", "Second", "Third"] },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const items: string[] = c.items ?? [];
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const score: Record<string, number> = {};
    items.forEach((i) => (score[i] = 0));
    for (const v of Object.values(votes)) {
      const order = Array.isArray(v) ? (v as string[]) : [];
      order.forEach((item, idx) => {
        if (item in score) score[item] += items.length - idx;
      });
    }
    const results = items
      .map((item) => ({ item, score: score[item] }))
      .sort((a, b) => b.score - a.score);
    const mine = (ctx.me ? (votes[ctx.me.token] as string[]) : null) ?? null;
    return { prompt: c.prompt ?? "", items, results, mine };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const order = action.payload?.order;
    if (!Array.isArray(order)) return { ok: false, reason: "missing order" };
    await ctx.store.castVote(
      ctx.phase.id,
      action.token,
      order.filter((x): x is string => typeof x === "string"),
    );
    return { ok: true };
  },
};

// ---- module: scale (rating sliders) ----------------------------------------

const scale: ModuleServerDef = {
  id: "scale",
  meta: { name: "Scale", description: "Rate one or more statements on a numeric scale; shows the mean." },
  schema: z
    .object({
      label: z.string(),
      statements: z.array(z.string()).min(1),
      min: z.number().optional(),
      max: z.number().optional(),
      labels: z.tuple([z.string(), z.string()]).optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Scale", statements: ["Statement"], min: 1, max: 5 },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const statements: string[] = c.statements ?? [];
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const sums = statements.map(() => 0);
    const counts = statements.map(() => 0);
    for (const v of Object.values(votes)) {
      const vals = Array.isArray(v) ? (v as number[]) : [];
      vals.forEach((n, i) => {
        if (i < statements.length && typeof n === "number") {
          sums[i] += n;
          counts[i]++;
        }
      });
    }
    const stats = statements.map((_, i) => ({
      mean: counts[i] ? Math.round((sums[i] / counts[i]) * 10) / 10 : 0,
      count: counts[i],
    }));
    const mine = (ctx.me ? (votes[ctx.me.token] as number[]) : null) ?? null;
    return {
      statements,
      min: c.min ?? 1,
      max: c.max ?? 5,
      labels: c.labels,
      stats,
      mine,
    };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const values = action.payload?.values;
    if (!Array.isArray(values)) return { ok: false, reason: "missing values" };
    await ctx.store.castVote(
      ctx.phase.id,
      action.token,
      values.map((n) => Number(n) || 0),
    );
    return { ok: true };
  },
};

// ---- module: wordcloud -----------------------------------------------------

const wordcloud: ModuleServerDef = {
  id: "wordcloud",
  meta: { name: "Word cloud", description: "Collect short words; render a live frequency cloud." },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string(),
      maxWords: z.number().int().positive().optional(),
    })
    .passthrough(),
  defaultConfig: { label: "Word cloud", prompt: "", maxWords: 3 },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const words = await ctx.store.readWords(ctx.phase.id);
    const freq: Record<string, number> = {};
    for (const w of words) {
      const norm = w.word.trim().toLowerCase();
      if (norm) freq[norm] = (freq[norm] ?? 0) + 1;
    }
    const cloud = Object.entries(freq)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 60);
    const mine = ctx.me
      ? words.filter((w) => w.token === ctx.me!.token).map((w) => w.word)
      : [];
    return { prompt: c.prompt ?? "", words: cloud, mine };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const c = ctx.config as Record<string, any>;
    const maxWords: number = c.maxWords ?? 3;
    const existing = (await ctx.store.readWords(ctx.phase.id)).filter(
      (w) => w.token === action.token,
    ).length;
    const incoming = Array.isArray(action.payload?.words)
      ? (action.payload!.words as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : typeof action.payload?.word === "string"
        ? [action.payload!.word as string]
        : [];
    let added = 0;
    for (const w of incoming) {
      if (existing + added >= maxWords) break;
      const clean = w.trim().slice(0, 40);
      if (clean) {
        await ctx.store.addWord(ctx.phase.id, action.token, clean);
        added++;
      }
    }
    return { ok: added > 0, reason: added > 0 ? undefined : "limit" };
  },
};

// ---- module: qna (questions + upvoting) ------------------------------------

const qna: ModuleServerDef = {
  id: "qna",
  meta: { name: "Q&A + upvoting", description: "Crowd questions, surfaced by upvotes — for AMAs and town-halls." },
  schema: z
    .object({ label: z.string(), prompt: z.string().optional() })
    .passthrough(),
  defaultConfig: { label: "Q&A", prompt: "Ask a question" },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    // Questions are submissions for this phase; upvotes are a per-token list of
    // question ids (one hash entry per voter).
    const questions = ctx.submissions.filter((s) => s.phaseId === ctx.phase.id);
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const counts: Record<string, number> = {};
    for (const v of Object.values(votes)) {
      const ids = Array.isArray(v) ? (v as string[]) : [];
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    }
    const myUpvotes: string[] = ctx.me
      ? ((votes[ctx.me.token] as string[]) ?? [])
      : [];
    const list = questions
      .map((q) => ({
        id: q.id,
        text: q.text,
        votes: counts[q.id] ?? 0,
        mine: myUpvotes.includes(q.id),
      }))
      .sort((a, b) => b.votes - a.votes || 0);
    return { prompt: (ctx.config.prompt as string) ?? "", questions: list };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    if (action.type === "ask") {
      const text = String(action.payload?.text ?? "").trim();
      if (!text) return { ok: false, reason: "empty" };
      const handle = ctx.me?.handle ?? "Anonymous";
      await ctx.store.addSubmission(handle, text.slice(0, 280), ctx.phase.id, null, action.token);
      return { ok: true };
    }
    if (action.type === "upvote") {
      const id = String(action.payload?.questionId ?? "");
      if (!id) return { ok: false, reason: "missing" };
      const votes = await ctx.store.readVotes(ctx.phase.id);
      const mine = ((votes[action.token] as string[]) ?? []).slice();
      const idx = mine.indexOf(id);
      if (idx === -1) mine.push(id);
      else mine.splice(idx, 1); // toggle
      await ctx.store.castVote(ctx.phase.id, action.token, mine);
      return { ok: true };
    }
    return { ok: false, reason: "unknown action" };
  },
};

// ---- module: matrix (2x2 plotting) -----------------------------------------

const matrix: ModuleServerDef = {
  id: "matrix",
  meta: { name: "2×2 matrix", description: "Plot items by two criteria (e.g. impact vs. effort) into quadrants." },
  schema: z
    .object({
      label: z.string(),
      prompt: z.string().optional(),
      xLabel: z.tuple([z.string(), z.string()]).optional(),
      yLabel: z.tuple([z.string(), z.string()]).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .passthrough(),
  defaultConfig: {
    label: "2×2",
    prompt: "Add an item and place it",
    xLabel: ["low effort", "high effort"],
    yLabel: ["low impact", "high impact"],
    min: 0,
    max: 10,
  },
  defaultVisibility: vis("visible", "visible", "visible", "visible"),
  capabilities: { acceptsActions: true, liveResults: true, needsTimer: false, projectable: true },
  async computeView(ctx) {
    const c = ctx.config as Record<string, any>;
    const votes = await ctx.store.readVotes(ctx.phase.id);
    const items = Object.values(votes)
      .map((v) => v as { text: string; x: number; y: number })
      .filter((v) => v && typeof v.text === "string");
    const mine = (ctx.me ? votes[ctx.me.token] : null) as
      | { text: string; x: number; y: number }
      | null;
    return {
      prompt: c.prompt ?? "",
      xLabel: c.xLabel ?? ["low", "high"],
      yLabel: c.yLabel ?? ["low", "high"],
      min: c.min ?? 0,
      max: c.max ?? 10,
      items,
      mine: mine ?? null,
    };
  },
  async handleAction(ctx, action) {
    if (!action.token) return { ok: false, reason: "missing" };
    const text = String(action.payload?.text ?? "").trim();
    const x = Number(action.payload?.x);
    const y = Number(action.payload?.y);
    if (!text || Number.isNaN(x) || Number.isNaN(y))
      return { ok: false, reason: "missing" };
    await ctx.store.castVote(ctx.phase.id, action.token, {
      text: text.slice(0, 60),
      x,
      y,
    });
    return { ok: true };
  },
};

// ---- registry -------------------------------------------------------------

// Concrete-config modules (defs/*) declare ModuleServerDef<TheirConfig>; the
// registry stores them uniformly, so the value type is widened to <any>.
export const SERVER_MODULES: Record<ModuleKind, ModuleServerDef<any>> = {
  lobby,
  content,
  media: mediaModule,
  capture,
  allocate,
  coordinator,
  readaround,
  close,
  poll,
  dotvote,
  rank,
  scale,
  wordcloud,
  qna,
  matrix,
  brainwrite: brainwriteModule,
  marketplace: marketplaceModule,
  redistribute: redistributeModule,
  spectrogram: spectrogramModule,
  gradient: gradientModule,
  lightning: lightningModule,
  fishbowl: fishbowlModule,
  openspace: openspaceModule,
  consult: consultModule,
  devil: devilModule,
  friction: frictionModule,
  synthesis: synthesisModule,
  needs: needsModule,
  equity: equityModule,
  prework: preworkModule,
  worldcafe: worldcafeModule,
  stations: stationsModule,
  onetwofour: onetwofourModule,
  twentyfive10: twentyfive10Module,
  minspecs: minspecsModule,
  persona: personaModule,
  emptychair: emptychairModule,
  issuemap: issuemapModule,
  promptrelay: promptrelayModule,
  builder: builderModule,
};

export function getServerModule(id: ModuleKind): ModuleServerDef | null {
  return SERVER_MODULES[id] ?? null;
}

// readaround needs a server-side readaround source; readaround/submissions also
// needs the full submissions list even for participants. The store passes
// submissions only when the role is allowed to see raw data — but read-around
// items are explicitly surfaced to the room, so the store passes a curated
// submissions list for readaround phases regardless of role (see getRoleState).
export const READAROUND_NEEDS_SUBMISSIONS = true;
