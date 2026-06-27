"use client";

// Client registry: the renderer half of each module, keyed by ModuleKind and
// Role. Renderers are pure functions of the server-computed view data plus an
// action dispatcher. Lifted from the original app/page.tsx screen components.

import { useState } from "react";
import { VoiceTextarea } from "@/components/VoiceTextarea";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui";
import type { ModuleKind, Role } from "./types";
import {
  Bars,
  StatusLine,
  StickyAction,
  useSend,
  useSyncedState,
} from "./render-kit";
import type { ClientModule, Renderer } from "./render-kit";
import { countCopy } from "./lobby-copy";
import type {
  AllocateView,
  CaptureView,
  CloseView,
  ContentView,
  CoordinatorView,
  DotVoteView,
  LobbyView,
  MatrixView,
  PollView,
  QnaView,
  RankView,
  ReadAroundView,
  ScaleView,
  WordCloudView,
} from "./views";
// Fleet-built module renderers (research roadmap).
import { brainwriteRenderers } from "./defs/brainwrite.client";
import { marketplaceRenderers } from "./defs/marketplace.client";
import { redistributeRenderers } from "./defs/redistribute.client";
import { spectrogramRenderers } from "./defs/spectrogram.client";
import { gradientRenderers } from "./defs/gradient.client";
import { lightningRenderers } from "./defs/lightning.client";
import { fishbowlRenderers } from "./defs/fishbowl.client";
import { openspaceRenderers } from "./defs/openspace.client";
import { consultRenderers } from "./defs/consult.client";
import { devilRenderers } from "./defs/devil.client";
import { frictionRenderers } from "./defs/friction.client";
import { synthesisRenderers } from "./defs/synthesis.client";
import { needsRenderers } from "./defs/needs.client";
import { equityRenderers } from "./defs/equity.client";
import { preworkRenderers } from "./defs/prework.client";
import { worldcafeRenderers } from "./defs/worldcafe.client";
import { stationsRenderers } from "./defs/stations.client";
import { onetwofourRenderers } from "./defs/onetwofour.client";
import { twentyfive10Renderers } from "./defs/twentyfive10.client";
import { minspecsRenderers } from "./defs/minspecs.client";
import { personaRenderers } from "./defs/persona.client";
import { emptychairRenderers } from "./defs/emptychair.client";
import { issuemapRenderers } from "./defs/issuemap.client";
import { promptrelayRenderers } from "./defs/promptrelay.client";
import { builderRenderers } from "./defs/builder.client";
import { mediaRenderers } from "./defs/media.client";
import { ambientRenderers } from "./defs/ambient.client";

// RendererProps/Renderer and the shared feedback helpers now live in
// ./render-kit so per-module files can import the same contract.

// ---- lobby ----------------------------------------------------------------

const LobbyRenderer: Renderer = ({ view }) => {
  const v = view as LobbyView;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="h-16 w-16 rounded-full bg-accent animate-pulseSoft" />
      <p className="max-w-xs text-lg leading-relaxed text-white/90">{v.message}</p>
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="inline-block h-2 w-2 animate-pulseSoft rounded-full bg-accent" />
        {countCopy(v.present ?? 0)}
      </p>
    </div>
  );
};

// ---- content --------------------------------------------------------------

const ContentRenderer: Renderer = ({ view, pulse }) => {
  const v = view as ContentView;
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {pulse && (
        <p className="animate-fadeInUp rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
          The facilitator just added something.
        </p>
      )}
      {v.heading && <h2 className="text-lg font-semibold">{v.heading}</h2>}
      {v.items.length === 0 ? (
        <p className="mt-8 text-center text-muted">Waiting for the facilitator…</p>
      ) : (
        v.items.map((c) => (
          <article
            key={c.id}
            className={`rounded-xl border bg-surface p-4 transition-colors ${
              pulse ? "border-accent" : "border-border"
            }`}
          >
            {c.title && c.title !== "(untitled)" && (
              <h3 className="mb-2 text-base font-semibold">{c.title}</h3>
            )}
            <Markdown text={c.body} />
          </article>
        ))
      )}
    </div>
  );
};

const ContentProjector: Renderer = ({ view }) => {
  const v = view as ContentView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 p-12">
      {v.heading && <h2 className="text-3xl font-semibold">{v.heading}</h2>}
      {v.items.map((c) => (
        <article key={c.id} className="text-2xl leading-relaxed">
          {c.title && c.title !== "(untitled)" && (
            <h3 className="mb-2 font-semibold">{c.title}</h3>
          )}
          <Markdown text={c.body} />
        </article>
      ))}
    </div>
  );
};

// ---- capture --------------------------------------------------------------

const CaptureRenderer: Renderer = ({ view, act, token, phaseId }) => {
  const v = view as CaptureView;
  const twoPart = Boolean(v.prompt2);
  const [text, setText] = useState("");
  const [text2, setText2] = useState("");
  // H1 — persist the in-progress answer so a reload/crash never loses it.
  const draftKey = `edges_draft:${token}:${phaseId}`;
  const { status, setStatus } = useSend(act);
  const [lastPayloads, setLastPayloads] = useState<string[]>([]);
  const [sharedCount, setSharedCount] = useState(0);

  // Submit honestly: only confirm once the write actually lands; offer retry.
  async function sendAll(payloads: string[]) {
    setStatus("sending");
    let allOk = true;
    for (const t of payloads) {
      const ok = await act({ type: "submit", payload: { text: t } });
      if (!ok) allOk = false;
    }
    setStatus(allOk ? "sent" : "error");
    if (allOk) {
      setSharedCount((n) => n + payloads.length);
      setTimeout(() => setStatus("idle"), 1800);
    }
  }

  function submit() {
    const payloads: string[] = [];
    if (twoPart) {
      const a = text.trim();
      const b = text2.trim();
      if (!a && !b) return;
      if (a) payloads.push(`[Chart] ${a}`);
      if (b) payloads.push(`[Reality] ${b}`);
    } else {
      if (!text.trim()) return;
      payloads.push(text.trim());
    }
    setLastPayloads(payloads);
    setText("");
    setText2("");
    sendAll(payloads);
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        {v.activeConstraint && (
          <p className="animate-fadeInUp rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
            New constraint: {v.activeConstraint}
          </p>
        )}
        {v.referenceItems.length > 0 && (
          <details className="rounded-xl border border-border bg-surface p-3 text-sm">
            <summary className="cursor-pointer text-muted">
              {v.referenceHeading ?? "Reference"} ({v.referenceItems.length})
            </summary>
            <div className="mt-3 space-y-3">
              {v.referenceItems.map((c) => (
                <div key={c.id}>
                  {c.title && c.title !== "(untitled)" && (
                    <p className="font-medium">{c.title}</p>
                  )}
                  <Markdown text={c.body} />
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="text-lg font-medium leading-snug">{v.prompt}</p>
        <VoiceTextarea
          value={text}
          onChange={setText}
          placeholder={v.placeholder}
          draftKey={draftKey}
        />
        {twoPart && (
          <>
            <p className="mt-2 text-lg font-medium leading-snug">{v.prompt2}</p>
            <VoiceTextarea
              value={text2}
              onChange={setText2}
              placeholder={v.placeholder2}
              draftKey={`${draftKey}:2`}
            />
          </>
        )}
        <StatusLine
          status={status}
          sentLabel={v.multiSubmit ? "Sent. You can send more." : "Sent."}
          onRetry={() => sendAll(lastPayloads)}
        />
        {v.multiSubmit && sharedCount > 0 && status !== "sending" && (
          <p className="text-center text-xs text-muted">
            You&apos;ve shared {sharedCount} this round.
          </p>
        )}
      </div>
      <StickyAction
        label={v.multiSubmit && sharedCount > 0 ? "Send another" : "Send"}
        disabled={twoPart ? !text.trim() && !text2.trim() : !text.trim()}
        onClick={submit}
      />
    </>
  );
};

// Facilitator surface for capture: inject/clear a constraint from the deck.
const CaptureFacilitator: Renderer = ({ view, act }) => {
  const v = view as CaptureView;
  const deck = v.constraintDeck ?? [];
  if (deck.length === 0)
    return (
      <p className="text-sm text-muted">
        No constraint deck configured for this phase.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        Drop a constraint into the room mid-flight to spark new thinking.
      </p>
      {v.activeConstraint && (
        <p className="rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
          Live: {v.activeConstraint}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {deck.map((c) => (
          <button
            key={c}
            onClick={() => act({ type: "injectConstraint", payload: { constraint: c } })}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${
              v.activeConstraint === c
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface"
            }`}
          >
            {c}
          </button>
        ))}
        {v.activeConstraint && (
          <button
            onClick={() => act({ type: "injectConstraint", payload: { constraint: "" } })}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

// ---- allocate -------------------------------------------------------------

const AllocateRenderer: Renderer = ({ view, act }) => {
  const v = view as AllocateView;
  const [err, setErr] = useState<string | null>(null);
  const mine = v.mine;

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-base leading-snug text-white/90">{v.header}</p>
      {v.options.length === 0 && (
        <p className="text-muted">Waiting for the facilitator to add options…</p>
      )}
      <div className="flex flex-col gap-3">
        {v.options.map((o, i) => {
          const count = v.counts[o.name] ?? 0;
          const isMine = mine === o.name;
          const full = Boolean(v.cap && count >= v.cap && !isMine);
          return (
            <button
              key={o.name}
              disabled={full}
              aria-pressed={isMine}
              onClick={async () => {
                setErr(null);
                const ok = await act({ type: "allocate", payload: { choice: o.name } });
                if (!ok) setErr("That group just filled up — pick another.");
              }}
              className={`min-h-[96px] rounded-xl border p-4 text-left transition-colors disabled:opacity-50 ${
                isMine
                  ? "border-accent bg-accent/10"
                  : full
                    ? "border-border bg-surface"
                    : "border-border bg-surface active:bg-[#222b54]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-medium">{o.name}</span>
                <span className="text-xs text-muted">
                  {full && <span className="mr-2 text-[#ff8a8a]">Full</span>}
                  {count}
                  {v.cap ? ` / ${v.cap}` : ""}
                </span>
              </div>
              {o.subtitle && <p className="mt-1 text-sm text-muted">{o.subtitle}</p>}
              {v.kind === "lens" && isMine && (
                <p className="mt-2 text-xs text-accent">Your lens. Your triad: {i + 1}.</p>
              )}
            </button>
          );
        })}
      </div>
      {mine && (
        <p className="text-sm text-accent">
          {v.kind === "side"
            ? `You're on the ${mine} side. Find the others.`
            : `Your lens: ${mine}.`}
        </p>
      )}
      {err && <p className="text-sm text-[#ff8a8a]">{err}</p>}
    </div>
  );
};

const AllocateProjector: Renderer = ({ view }) => {
  const v = view as AllocateView;
  const max = Math.max(1, ...Object.values(v.counts));
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 p-12">
      <h2 className="text-3xl font-semibold">{v.header}</h2>
      {v.options.map((o) => {
        const count = v.counts[o.name] ?? 0;
        return (
          <div key={o.name} className="flex items-center gap-4">
            <span className="w-48 text-2xl">{o.name}</span>
            <div className="h-8 flex-1 rounded bg-surface">
              <div
                className="h-8 rounded bg-accent transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-10 text-right text-2xl">{count}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---- coordinator ----------------------------------------------------------

const CoordinatorRenderer: Renderer = ({ view }) => {
  const v = view as CoordinatorView;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      {v.kind === "pair" && v.unpaired ? (
        <p className="max-w-xs text-lg leading-relaxed text-white/90">
          You don&apos;t have a pair yet — join another pair to make a three.
        </p>
      ) : (
        <p className="max-w-sm text-lg leading-relaxed text-white/90">{v.message}</p>
      )}
      {v.members && v.members.length > 0 && (
        <p className="text-sm text-muted">With: {v.members.join(", ")}</p>
      )}
    </div>
  );
};

// ---- readaround -----------------------------------------------------------

const ReadAroundRenderer: Renderer = ({ view }) => {
  const v = view as ReadAroundView;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      {!v || v.total === 0 || !v.item ? (
        <p className="text-muted">The facilitator will pace through these shortly.</p>
      ) : (
        <>
          {v.item.tag && (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              {v.item.tag}
            </span>
          )}
          <p key={v.index} className="max-w-md animate-fadeInUp text-xl leading-relaxed">
            {v.item.text}
          </p>
          <p className="text-xs text-muted">
            {v.index + 1} of {v.total}
          </p>
        </>
      )}
    </div>
  );
};

const ReadAroundProjector: Renderer = ({ view }) => {
  const v = view as ReadAroundView;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      {v.item ? (
        <>
          {v.item.tag && <span className="text-xl text-muted">{v.item.tag}</span>}
          <p key={v.index} className="max-w-4xl animate-fadeInUp text-4xl leading-relaxed">
            {v.item.text}
          </p>
          <p className="text-lg text-muted">
            {v.index + 1} of {v.total}
          </p>
        </>
      ) : (
        <p className="text-2xl text-muted">…</p>
      )}
    </div>
  );
};

// ---- close ----------------------------------------------------------------

const CloseRenderer: Renderer = ({ view }) => {
  const v = view as CloseView;
  const [copied, setCopied] = useState(false);
  if (v.ended) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center animate-riseIn">
        <p className="font-display max-w-xs text-2xl leading-relaxed text-white/90">
          Session closed. Nothing was kept. See you next time.
        </p>
      </div>
    );
  }
  const contributions = v.yourContributions;
  // Group by tag so the keepsake reads like a story, not a flat dump.
  const groups = new Map<string, { text: string }[]>();
  for (const c of contributions) {
    const k = c.tag || "Your notes";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ text: c.text });
  }
  function copyAll() {
    const text = contributions.map((c) => `• ${c.text}`).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      () => {},
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-5 p-6 animate-riseIn">
      <div>
        <p className="font-display text-2xl font-semibold tracking-tight">
          Thanks for being here.
        </p>
        {contributions.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            You contributed {contributions.length} thing
            {contributions.length === 1 ? "" : "s"} today.
          </p>
        )}
      </div>
      {contributions.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
            <span className="text-xs text-muted">
              Yours to keep — screenshot, or
            </span>
            <Button
              variant="ghost"
              className="!px-3 !py-1 !text-xs"
              onClick={copyAll}
            >
              {copied ? "Copied ✓" : "Copy my takeaways"}
            </Button>
          </div>
          {Array.from(groups.entries()).map(([tag, items]) => (
            <div key={tag} className="flex flex-col gap-2">
              {groups.size > 1 && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {tag}
                </h3>
              )}
              {items.map((c, i) => (
                <div
                  key={i}
                  className="animate-fadeInUp rounded-xl border border-border bg-surface px-4 py-3 [animation-fill-mode:both]"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                >
                  <span className="text-sm leading-relaxed">{c.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- poll -----------------------------------------------------------------

const PollRenderer: Renderer = ({ view, act }) => {
  const v = view as PollView;
  const mine = v.mine ?? [];
  const { status, send } = useSend(act);
  function pick(o: string) {
    if (v.multi) {
      const next = mine.includes(o) ? mine.filter((x) => x !== o) : [...mine, o];
      send({ type: "vote", payload: { choices: next } });
    } else {
      send({ type: "vote", payload: { choice: o } });
    }
  }
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">{v.question}</p>
      <div className="flex flex-col gap-3">
        {v.options.map((o) => {
          const isMine = mine.includes(o);
          return (
            <button
              key={o}
              aria-pressed={isMine}
              onClick={() => pick(o)}
              className={`min-h-[60px] rounded-xl border p-4 text-left transition-colors ${
                isMine ? "border-accent bg-accent/10" : "border-border bg-surface active:bg-[#222b54]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-base">
                  {o}
                  {isMine && <span className="ml-2 text-xs text-accent">your pick</span>}
                </span>
                {v.counts && (
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {v.total ? Math.round(((v.counts[o] ?? 0) / v.total) * 100) : 0}%
                  </span>
                )}
              </div>
              {/* When revealed, a quiet share bar under each option. */}
              {v.counts && (
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-bg/60">
                  <div
                    className="h-1.5 rounded bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: `${v.total ? ((v.counts[o] ?? 0) / v.total) * 100 : 0}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* Confirmation independent of whether results are revealed. */}
      {status === "error" ? (
        <StatusLine status={status} />
      ) : mine.length > 0 ? (
        <p className="text-center text-xs text-accent">
          Your answer is in{v.multi ? "" : " — tap another to change it"}.
          {v.multi && mine.length > 1 ? ` (${mine.length} selected)` : ""}
        </p>
      ) : null}
      {v.counts && <p className="text-center text-xs text-muted">{v.total} responded</p>}
    </div>
  );
};

const PollProjector: Renderer = ({ view }) => {
  const v = view as PollView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 p-12">
      <h2 className="font-display text-3xl font-semibold tracking-tight">{v.question}</h2>
      <div className="text-2xl">
        <Bars counts={v.counts ?? {}} options={v.options} showLead />
      </div>
      <p className="text-lg text-muted">{v.total} responded</p>
    </div>
  );
};

// ---- dotvote --------------------------------------------------------------

const DotVoteRenderer: Renderer = ({ view, act }) => {
  const v = view as DotVoteView;
  // Optimistic local copy so taps respond instantly; resyncs from the server.
  const [mine, setMine] = useSyncedState<Record<string, number>>(
    v.mine,
    JSON.stringify(v.mine),
  );
  const { status, setStatus } = useSend(act);
  const used = Object.values(mine).reduce((s, n) => s + (n || 0), 0);
  const remaining = Math.max(0, v.dots - used);

  async function bump(o: string, delta: 1 | -1) {
    const cur = mine[o] ?? 0;
    if (delta === 1 && remaining <= 0) return;
    if (delta === -1 && cur <= 0) return;
    setMine({ ...mine, [o]: Math.max(0, cur + delta) }); // optimistic
    setStatus("sending");
    const ok = await act({ type: "dot", payload: { choice: o, delta } });
    setStatus(ok ? "idle" : "error");
    if (!ok) setMine({ ...mine }); // revert on failure
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {v.prompt && <p className="text-lg font-medium leading-snug">{v.prompt}</p>}
      <p className="text-sm text-accent">
        Dots left: {remaining} of {v.dots}
      </p>
      <div className="flex flex-col gap-3">
        {v.options.map((o) => (
          <div key={o} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="flex-1 text-base">{o}</span>
            <span className="w-8 text-center text-accent">{mine[o] ?? 0}</span>
            <div className="flex gap-2">
              <button
                aria-label={`Remove a dot from ${o}`}
                className="h-11 w-11 rounded-lg border border-border text-xl disabled:opacity-30"
                disabled={(mine[o] ?? 0) <= 0}
                onClick={() => bump(o, -1)}
              >
                −
              </button>
              <button
                aria-label={`Add a dot to ${o}`}
                className="h-11 w-11 rounded-lg border border-border text-xl disabled:opacity-30"
                disabled={remaining <= 0}
                onClick={() => bump(o, 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <StatusLine status={status === "sent" ? "idle" : status} />
    </div>
  );
};

const DotVoteProjector: Renderer = ({ view }) => {
  const v = view as DotVoteView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 p-12 text-2xl">
      {v.prompt && <h2 className="text-3xl font-semibold">{v.prompt}</h2>}
      <Bars counts={v.counts} options={v.options} />
    </div>
  );
};

// ---- rank -----------------------------------------------------------------

const RankRenderer: Renderer = ({ view, act }) => {
  const v = view as RankView;
  // Re-sync if the server's item set or my saved order changes identity.
  const [order, setOrder] = useSyncedState<string[]>(
    v.mine ?? v.items,
    JSON.stringify([v.items, v.mine]),
  );
  const { status, send } = useSend(act);
  const submitted = Boolean(v.mine);
  function move(i: number, dir: -1 | 1) {
    const t = i + dir;
    if (t < 0 || t >= order.length) return;
    const next = [...order];
    [next[i], next[t]] = [next[t], next[i]];
    setOrder(next);
  }
  return (
    <>
      <div className="flex flex-1 flex-col gap-4 p-6 pb-6">
        {v.prompt && <p className="text-lg font-medium leading-snug">{v.prompt}</p>}
        <div className="flex flex-col gap-2">
          {order.map((item, i) => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <span className="w-6 text-center text-accent">{i + 1}</span>
              <span className="flex-1 text-base">{item}</span>
              <div className="flex flex-col">
                <button
                  aria-label={`Move ${item} up`}
                  className="flex h-9 w-11 items-center justify-center text-muted disabled:opacity-25"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ▲
                </button>
                <button
                  aria-label={`Move ${item} down`}
                  className="flex h-9 w-11 items-center justify-center text-muted disabled:opacity-25"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>
        <StatusLine
          status={status}
          sentLabel="Ranking submitted — adjust and submit again to change."
        />
      </div>
      <StickyAction
        label={submitted ? "Update ranking" : "Submit ranking"}
        onClick={() => send({ type: "rank", payload: { order } })}
      />
    </>
  );
};

const RankProjector: Renderer = ({ view }) => {
  const v = view as RankView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-3 p-12 text-2xl">
      {(v.results ?? []).map((r, i) => (
        <div key={r.item} className="flex items-center gap-4">
          <span className="w-8 text-accent">{i + 1}</span>
          <span className="flex-1">{r.item}</span>
          <span className="text-muted">{r.score}</span>
        </div>
      ))}
    </div>
  );
};

// ---- scale ----------------------------------------------------------------

const ScaleRenderer: Renderer = ({ view, act }) => {
  const v = view as ScaleView;
  const [vals, setVals] = useSyncedState<number[]>(
    v.mine ?? v.statements.map(() => Math.round((v.min + v.max) / 2)),
    JSON.stringify([v.statements, v.mine]),
  );
  const { status, send } = useSend(act);
  const submitted = Boolean(v.mine);
  const lo = v.labels?.[0] ?? String(v.min);
  const hi = v.labels?.[1] ?? String(v.max);
  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-6 pb-6">
        {v.statements.map((st, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p id={`scale-st-${i}`} className="text-base">
              {st}
            </p>
            <input
              type="range"
              min={v.min}
              max={v.max}
              value={vals[i] ?? Math.round((v.min + v.max) / 2)}
              aria-labelledby={`scale-st-${i}`}
              aria-valuetext={`${vals[i]} (${lo} to ${hi})`}
              onChange={(e) => {
                const n = [...vals];
                n[i] = Number(e.target.value);
                setVals(n);
              }}
              className="h-6 w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-muted">
              <span>{lo}</span>
              <span className="text-accent">{vals[i]}</span>
              <span>{hi}</span>
            </div>
            {/* Smart read: you vs the room (the mean is already in the view). */}
            {submitted && v.stats?.[i] && v.stats[i].count > 0 && (
              <p className="text-xs text-muted">
                You: <span className="text-accent">{vals[i]}</span> · Room avg:{" "}
                {v.stats[i].mean}
                {typeof vals[i] === "number" &&
                  (vals[i] > v.stats[i].mean
                    ? " — you're above the room"
                    : vals[i] < v.stats[i].mean
                      ? " — you're below the room"
                      : " — right on the room")}
              </p>
            )}
          </div>
        ))}
        <StatusLine
          status={status}
          sentLabel="Submitted — adjust and submit again to change."
        />
      </div>
      <StickyAction
        label={submitted ? "Update" : "Submit"}
        onClick={() => send({ type: "scale", payload: { values: vals } })}
      />
    </>
  );
};

const ScaleProjector: Renderer = ({ view }) => {
  const v = view as ScaleView;
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 p-12 text-2xl">
      {v.statements.map((st, i) => {
        const stat = v.stats?.[i];
        const pct = stat && v.max > v.min ? ((stat.mean - v.min) / (v.max - v.min)) * 100 : 0;
        return (
          <div key={i} className="flex flex-col gap-1">
            <span>{st}</span>
            <div className="relative h-6 rounded bg-surface">
              <div className="absolute top-0 h-6 w-1 bg-accent" style={{ left: `${pct}%` }} />
            </div>
            <span className="text-sm text-muted">mean {stat?.mean ?? 0} · {stat?.count ?? 0} votes</span>
          </div>
        );
      })}
    </div>
  );
};

// ---- wordcloud ------------------------------------------------------------

const WordCloudRenderer: Renderer = ({ view, act }) => {
  const v = view as WordCloudView;
  const [word, setWord] = useState("");
  const { status, setStatus } = useSend(act);
  // Optimistic: show the just-added word immediately, merge with server "mine".
  const [optimistic, setOptimistic] = useState<string[]>([]);
  const mine = Array.from(new Set([...v.mine, ...optimistic]));

  async function add() {
    const w = word.trim();
    if (!w) return;
    setOptimistic((prev) => [...prev, w]);
    setWord("");
    setStatus("sending");
    const ok = await act({ type: "word", payload: { word: w } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
    else setOptimistic((prev) => prev.filter((x) => x !== w)); // revert
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">{v.prompt}</p>
      <div className="flex gap-2">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="A word or short phrase…"
          aria-label="Add a word"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
        />
        <Button onClick={add}>Add</Button>
      </div>
      {status === "error" ? (
        <StatusLine status={status} onRetry={add} />
      ) : mine.length > 0 ? (
        <p className="text-xs text-muted">You added: {mine.join(", ")}</p>
      ) : null}
      <WordCloudView_ words={v.words} />
    </div>
  );
};

function WordCloudView_({ words }: { words: { text: string; count: number }[] }) {
  const max = Math.max(1, ...words.map((w) => w.count));
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {words.map((w) => (
        <span
          key={w.text}
          style={{ fontSize: `${0.9 + (w.count / max) * 1.8}rem` }}
          className={w.count >= max ? "text-accent" : "text-white/85"}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}

const WordCloudProjector: Renderer = ({ view }) => {
  const v = view as WordCloudView;
  const max = Math.max(1, ...v.words.map((w) => w.count));
  return (
    <div className="flex flex-1 flex-wrap content-center items-baseline justify-center gap-x-6 gap-y-2 p-12">
      {v.words.length === 0 ? (
        <p className="text-2xl text-muted">{v.prompt}</p>
      ) : (
        v.words.map((w) => (
          <span
            key={w.text}
            style={{ fontSize: `${1.5 + (w.count / max) * 4}rem` }}
            className={w.count >= max ? "text-accent" : "text-white/85"}
          >
            {w.text}
          </span>
        ))
      )}
    </div>
  );
};

// ---- qna ------------------------------------------------------------------

const QnaRenderer: Renderer = ({ view, act }) => {
  const v = view as QnaView;
  const [q, setQ] = useState("");
  const { status, setStatus } = useSend(act);

  async function ask() {
    const text = q.trim();
    if (!text) return;
    setQ("");
    setStatus("sending");
    const ok = await act({ type: "ask", payload: { text } });
    setStatus(ok ? "sent" : "error");
    if (ok) setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <p className="text-lg font-medium leading-snug">{v.prompt}</p>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a question…"
          aria-label="Ask a question"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
        />
        <Button onClick={ask}>Ask</Button>
      </div>
      {status === "error" && <StatusLine status={status} onRetry={ask} />}
      <div className="flex flex-col gap-2">
        {v.questions.length === 0 ? (
          <p className="text-sm text-muted">No questions yet — ask the first.</p>
        ) : (
          v.questions.map((qq) => (
            <div
              key={qq.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <button
                aria-label={qq.mine ? "Remove your upvote" : "Upvote"}
                aria-pressed={qq.mine}
                onClick={() => act({ type: "upvote", payload: { questionId: qq.id } })}
                className={`flex h-12 w-12 flex-col items-center justify-center rounded-lg border text-xs ${
                  qq.mine ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
                }`}
              >
                <span>▲</span>
                <span>{qq.votes}</span>
              </button>
              <span className="flex-1 text-sm">{qq.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const QnaProjector: Renderer = ({ view }) => {
  const v = view as QnaView;
  return (
    <div className="flex flex-1 flex-col gap-3 p-12 text-2xl">
      {v.questions.slice(0, 12).map((qq) => (
        <div key={qq.id} className="flex items-center gap-4">
          <span className="w-12 text-right text-accent">{qq.votes}</span>
          <span className="flex-1">{qq.text}</span>
        </div>
      ))}
    </div>
  );
};

// ---- matrix (2x2) ---------------------------------------------------------

const MatrixRenderer: Renderer = ({ view, act }) => {
  const v = view as MatrixView;
  const mid = Math.round((v.min + v.max) / 2);
  const [text, setText] = useState("");
  const [x, setX] = useState(v.mine?.x ?? mid);
  const [y, setY] = useState(v.mine?.y ?? mid);
  const { status, send } = useSend(act);

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 p-6 pb-6">
        <p className="text-lg font-medium leading-snug">{v.prompt}</p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your item…"
          aria-label="Item to place"
          className="rounded-xl border border-border bg-surface px-4 py-3 placeholder:text-muted/80 focus:border-accent focus:outline-none"
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            {v.xLabel[0]} ←→ {v.xLabel[1]}
          </p>
          <input
            type="range"
            min={v.min}
            max={v.max}
            value={x}
            aria-label={`${v.xLabel[0]} to ${v.xLabel[1]}`}
            onChange={(e) => setX(Number(e.target.value))}
            className="h-6 w-full accent-accent"
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            {v.yLabel[0]} ←→ {v.yLabel[1]}
          </p>
          <input
            type="range"
            min={v.min}
            max={v.max}
            value={y}
            aria-label={`${v.yLabel[0]} to ${v.yLabel[1]}`}
            onChange={(e) => setY(Number(e.target.value))}
            className="h-6 w-full accent-accent"
          />
        </div>
        <MatrixPlot v={v} ghost={{ x, y }} />
        <p className="text-center text-xs text-muted">
          The ringed dot is where you&apos;ll land — drag the sliders, then place it.
        </p>
        <StatusLine status={status} sentLabel="Placed." />
      </div>
      <StickyAction
        label={v.mine ? "Update placement" : "Place it"}
        disabled={!text.trim()}
        onClick={() => send({ type: "plot", payload: { text: text.trim(), x, y } })}
      />
    </>
  );
};

function MatrixPlot({ v, ghost }: { v: MatrixView; ghost?: { x: number; y: number } }) {
  const span = v.max - v.min || 1;
  const pos = (n: number) => ((n - v.min) / span) * 100;
  return (
    <div className="relative aspect-square w-full rounded-xl border border-border bg-surface">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-border" />
      {/* Live "you'll land here" ghost following the two sliders. */}
      {ghost && (
        <div
          className="absolute z-10 h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-accent bg-accent/25 transition-all duration-150"
          style={{ left: `${pos(ghost.x)}%`, bottom: `${pos(ghost.y)}%` }}
          title="You'll land here"
        />
      )}
      {v.items.map((it, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 translate-y-1/2 rounded-full bg-accent/80 px-2 py-0.5 text-[10px] text-bg"
          style={{ left: `${pos(it.x)}%`, bottom: `${pos(it.y)}%` }}
          title={it.text}
        >
          {it.text}
        </div>
      ))}
    </div>
  );
}

const MatrixProjector: Renderer = ({ view }) => {
  const v = view as MatrixView;
  const span = v.max - v.min || 1;
  const pos = (n: number) => ((n - v.min) / span) * 100;
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="relative aspect-square h-full max-h-[80vh] rounded-xl border border-border bg-surface">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-border" />
        {/* All four poles, on the edge midpoints so the quadrants read clearly. */}
        <span className="absolute left-1/2 top-2 -translate-x-1/2 text-sm text-muted">{v.yLabel[1]}</span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm text-muted">{v.yLabel[0]}</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted">{v.xLabel[0]}</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted">{v.xLabel[1]}</span>
        {v.items.map((it, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 translate-y-1/2 rounded-full bg-accent/80 px-3 py-1 text-sm text-bg"
            style={{ left: `${pos(it.x)}%`, bottom: `${pos(it.y)}%` }}
          >
            {it.text}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- registry -------------------------------------------------------------

export const CLIENT_MODULES: Record<ModuleKind, ClientModule> = {
  lobby: { renderers: { participant: LobbyRenderer, projector: LobbyRenderer } },
  content: {
    renderers: { participant: ContentRenderer, projector: ContentProjector },
  },
  media: { renderers: mediaRenderers },
  ambient: { renderers: ambientRenderers },
  capture: {
    renderers: { participant: CaptureRenderer, facilitator: CaptureFacilitator },
  },
  allocate: {
    renderers: { participant: AllocateRenderer, projector: AllocateProjector },
  },
  coordinator: { renderers: { participant: CoordinatorRenderer } },
  readaround: {
    renderers: { participant: ReadAroundRenderer, projector: ReadAroundProjector },
  },
  close: { renderers: { participant: CloseRenderer, projector: CloseRenderer } },
  poll: { renderers: { participant: PollRenderer, projector: PollProjector } },
  dotvote: { renderers: { participant: DotVoteRenderer, projector: DotVoteProjector } },
  rank: { renderers: { participant: RankRenderer, projector: RankProjector } },
  scale: { renderers: { participant: ScaleRenderer, projector: ScaleProjector } },
  wordcloud: {
    renderers: { participant: WordCloudRenderer, projector: WordCloudProjector },
  },
  qna: { renderers: { participant: QnaRenderer, projector: QnaProjector } },
  matrix: { renderers: { participant: MatrixRenderer, projector: MatrixProjector } },
  brainwrite: { renderers: brainwriteRenderers },
  marketplace: { renderers: marketplaceRenderers },
  redistribute: { renderers: redistributeRenderers },
  spectrogram: { renderers: spectrogramRenderers },
  gradient: { renderers: gradientRenderers },
  lightning: { renderers: lightningRenderers },
  fishbowl: { renderers: fishbowlRenderers },
  openspace: { renderers: openspaceRenderers },
  consult: { renderers: consultRenderers },
  devil: { renderers: devilRenderers },
  friction: { renderers: frictionRenderers },
  synthesis: { renderers: synthesisRenderers },
  needs: { renderers: needsRenderers },
  equity: { renderers: equityRenderers },
  prework: { renderers: preworkRenderers },
  worldcafe: { renderers: worldcafeRenderers },
  stations: { renderers: stationsRenderers },
  onetwofour: { renderers: onetwofourRenderers },
  twentyfive10: { renderers: twentyfive10Renderers },
  minspecs: { renderers: minspecsRenderers },
  persona: { renderers: personaRenderers },
  emptychair: { renderers: emptychairRenderers },
  issuemap: { renderers: issuemapRenderers },
  promptrelay: { renderers: promptrelayRenderers },
  builder: { renderers: builderRenderers },
};

export function getClientRenderer(
  moduleId: ModuleKind,
  role: Role,
): Renderer | null {
  return CLIENT_MODULES[moduleId]?.renderers[role] ?? null;
}
