"use client";

// Client renderers for the "media" module (presentation screen).
//
// projector: the current card, full-bleed (image fills, video embeds).
// participant: a calm "eyes up front" with the slide title + position.
// facilitator: a deck builder — upload slides (images, or a PDF that is split
//   into page images right here in the browser via pdf.js), add videos by URL,
//   reorder/remove, and advance the room. The deck is pushed to the server as a
//   whole list (setDeck); the on-screen slide is moved with next/prev/setIndex.

import { useState } from "react";
import { Button } from "@/components/ui";
import { useSend, useSyncedState } from "../render-kit";
import type { Renderer } from "../render-kit";
import type { Role } from "../types";
import type { MediaCard, MediaView } from "./media.server";

const newId = () => globalThis.crypto.randomUUID();

// ---- video embedding -------------------------------------------------------

function youTubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i);
  return m ? m[1] : null;
}
function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? m[1] : null;
}
function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

function VideoEmbed({ url, big }: { url: string; big?: boolean }) {
  const yt = youTubeId(url);
  const vm = vimeoId(url);
  const frame = "h-full w-full";
  if (yt)
    return (
      <iframe
        className={frame}
        src={`https://www.youtube.com/embed/${yt}`}
        title="Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  if (vm)
    return (
      <iframe
        className={frame}
        src={`https://player.vimeo.com/video/${vm}`}
        title="Video"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  if (isDirectVideo(url))
    return <video className="h-full w-full" src={url} controls playsInline />;
  // Last resort: embed the URL directly.
  return <iframe className={frame} src={url} title="Video" allowFullScreen />;
}

// ---- projector -------------------------------------------------------------

const MediaProjector: Renderer = ({ view }) => {
  const v = view as MediaView;
  if (!v.card)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-black p-12 text-center">
        <p className="text-2xl text-white/40">Nothing on screen yet</p>
      </div>
    );
  return (
    <div className="relative flex flex-1 items-center justify-center bg-black">
      {v.card.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.card.url}
          alt={v.card.title ?? "Slide"}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="aspect-video w-full max-w-[1600px]">
          <VideoEmbed url={v.card.url} big />
        </div>
      )}
    </div>
  );
};

// ---- participant -----------------------------------------------------------

const MediaParticipant: Renderer = ({ view }) => {
  const v = view as MediaView;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="h-12 w-12 rounded-full bg-accent/15" />
      <p className="text-lg leading-relaxed text-white/90">Eyes up front</p>
      {v.card?.title && (
        <p className="max-w-xs text-sm leading-relaxed text-muted">{v.card.title}</p>
      )}
      {v.total > 0 && (
        <p className="text-xs uppercase tracking-wide text-muted">
          {v.index + 1} of {v.total}
        </p>
      )}
    </div>
  );
};

// ---- facilitator (deck builder) -------------------------------------------

const MediaFacilitator: Renderer = ({ view, act, upload }) => {
  const v = view as MediaView;
  const serverDeck = v.deck ?? [];
  const [deck, setDeck] = useSyncedState<MediaCard[]>(
    serverDeck,
    serverDeck.map((c) => c.id).join(","),
  );
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { status, send } = useSend(act);

  async function pushDeck(next: MediaCard[]) {
    setDeck(next);
    await act({ type: "setDeck", payload: { deck: next } });
  }

  // Turn a PDF into one image card per page, entirely in the browser, so the
  // projector only ever shows images. Worker is version-matched to avoid the
  // classic pdf.js "API version does not match Worker version" break.
  async function addPdf(file: File): Promise<MediaCard[]> {
    if (!upload) return [];
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    const base = file.name.replace(/\.pdf$/i, "");
    const cards: MediaCard[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      setBusy(`Converting ${base} — page ${p} of ${doc.numPages}…`);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const cctx = canvas.getContext("2d");
      if (!cctx) continue;
      await page.render({ canvas, canvasContext: cctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.85),
      );
      if (!blob) continue;
      const url = await upload(new File([blob], `${base}-p${p}.jpg`, { type: "image/jpeg" }));
      if (url) cards.push({ id: newId(), kind: "image", url, title: `${base} · p${p}` });
    }
    return cards;
  }

  async function onFiles(files: FileList | null) {
    if (!files || !upload) return;
    const added: MediaCard[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          added.push(...(await addPdf(file)));
        } else if (file.type.startsWith("image/")) {
          setBusy(`Uploading ${file.name}…`);
          const url = await upload(file);
          if (url) added.push({ id: newId(), kind: "image", url, title: file.name });
        }
      }
      if (added.length) await pushDeck([...deck, ...added]);
    } catch {
      setBusy("Upload failed — try again.");
      setTimeout(() => setBusy(null), 2500);
      return;
    }
    setBusy(null);
  }

  function addVideo() {
    const url = videoUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    pushDeck([...deck, { id: newId(), kind: "video", url, title: "Video" }]);
    setVideoUrl("");
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= deck.length) return;
    const next = deck.slice();
    [next[i], next[j]] = [next[j], next[i]];
    pushDeck(next);
  }
  function remove(i: number) {
    pushDeck(deck.filter((_, k) => k !== i));
  }

  const uploadable = Boolean(upload);

  return (
    <div className="flex flex-col gap-4">
      {/* On-screen position + advance */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {v.total > 0 ? `On screen: ${v.index + 1} of ${v.total}` : "Deck is empty"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => send({ type: "prev" })}
            disabled={v.index <= 0}
          >
            ← Prev
          </Button>
          <Button
            onClick={() => send({ type: "next" })}
            disabled={v.total === 0 || v.index >= v.total - 1}
          >
            Next →
          </Button>
        </div>
      </div>

      {/* Add media */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
        <label className="text-xs uppercase tracking-wide text-muted">Add slides</label>
        {uploadable ? (
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => onFiles(e.target.files)}
            className="text-sm text-white/80 file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-1.5 file:text-sm file:text-white/90"
          />
        ) : (
          <p className="text-xs text-muted">
            Uploads aren&apos;t available here — open the host console to load slides.
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          Images, or a PDF (each page becomes a slide). Export slide decks to PDF
          first.
        </p>
        <div className="mt-1 flex gap-2">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Paste a YouTube / Vimeo / video URL"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-white placeholder:text-muted"
          />
          <Button variant="ghost" onClick={addVideo} disabled={!videoUrl.trim()}>
            Add
          </Button>
        </div>
        {busy && <p className="text-xs text-accent">{busy}</p>}
      </div>

      {/* Deck list */}
      {deck.length === 0 ? (
        <p className="text-sm text-muted">No slides yet — add some above.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {deck.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center gap-2 rounded-lg border p-2 ${
                i === v.index ? "border-accent bg-accent/10" : "border-border bg-surface"
              }`}
            >
              <button
                onClick={() => act({ type: "setIndex", payload: { index: i } })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title="Show on screen"
              >
                <span className="w-6 shrink-0 text-xs text-muted tabular-nums">{i + 1}</span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted">
                  {c.kind}
                </span>
                <span className="truncate text-sm text-white/90">{c.title ?? c.url}</span>
              </button>
              <div className="flex shrink-0 gap-1">
                <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </IconBtn>
                <IconBtn
                  label="Move down"
                  onClick={() => move(i, 1)}
                  disabled={i === deck.length - 1}
                >
                  ↓
                </IconBtn>
                <IconBtn label="Remove" onClick={() => remove(i)}>
                  ×
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}
      {status === "error" && (
        <p className="text-xs text-[#ff8a8a]">Couldn&apos;t advance — try again.</p>
      )}
    </div>
  );
};

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-md border border-border text-sm text-white/80 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export const mediaRenderers: Partial<Record<Role, Renderer>> = {
  participant: MediaParticipant,
  projector: MediaProjector,
  facilitator: MediaFacilitator,
};
