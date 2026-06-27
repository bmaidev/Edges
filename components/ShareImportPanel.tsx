"use client";

import { useState } from "react";

// B4 — paste a shared design code, see a READ-ONLY preview (decoded + zod-
// revalidated server-side, nothing saved), then commit it to the library. The
// import write needs the admin passcode (the library is global); the preview is
// open to any host so they can vet a code before asking the lead to import it.
type Preview = {
  name: string;
  meta?: { description?: string; tag?: string; origin?: string } | null;
  phases: { id: string; moduleId: string; label: string }[];
};

export function ShareImportPanel({
  apiBase,
  code,
  onImported,
}: {
  apiBase: string;
  code: string;
  onImported: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(command: string, body: Record<string, unknown>) {
    const res = await fetch(`${apiBase}/host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, code, ...body }),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function doPreview() {
    setErr(null);
    setPreview(null);
    if (!shareCode.trim()) return;
    setBusy(true);
    const { data } = await post("previewImport", { shareCode: shareCode.trim() });
    setBusy(false);
    if (data.ok) setPreview(data as Preview);
    else setErr(data.error ?? "Couldn't read that design code.");
  }

  async function doImport() {
    setErr(null);
    setBusy(true);
    const { data } = await post("importDesign", { shareCode: shareCode.trim() });
    setBusy(false);
    if (data.ok) {
      setShareCode("");
      setPreview(null);
      setOpen(false);
      onImported(data.name ?? "Imported design");
    } else {
      setErr(data.error ?? "Importing to the library needs the admin passcode.");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted hover:border-accent"
      >
        ⇩ Import a shared design…
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white/80">Import a shared design</span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-white">
          close
        </button>
      </div>
      <textarea
        value={shareCode}
        onChange={(e) => {
          setShareCode(e.target.value);
          setPreview(null);
          setErr(null);
        }}
        placeholder="Paste a design code here…"
        rows={2}
        className="resize-none rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[11px] focus:border-accent focus:outline-none"
      />
      {err && <p className="text-[#ff8a8a]">{err}</p>}
      {preview && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-2.5">
          <p className="font-semibold text-white/90">{preview.name}</p>
          {preview.meta?.origin && (
            <p className="text-muted">from {preview.meta.origin}</p>
          )}
          <ol className="mt-1 list-inside list-decimal text-muted">
            {preview.phases.slice(0, 8).map((p) => (
              <li key={p.id} className="truncate">{p.label}</li>
            ))}
            {preview.phases.length > 8 && <li>+{preview.phases.length - 8} more</li>}
          </ol>
        </div>
      )}
      <div className="flex gap-2">
        {!preview ? (
          <button
            onClick={doPreview}
            disabled={busy || !shareCode.trim()}
            className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-accent disabled:opacity-30"
          >
            {busy ? "Reading…" : "Preview"}
          </button>
        ) : (
          <button
            onClick={doImport}
            disabled={busy}
            className="rounded-lg border border-accent bg-accent/20 px-3 py-1.5 text-accent disabled:opacity-30"
          >
            {busy ? "Importing…" : "Add to my templates"}
          </button>
        )}
      </div>
      <p className="text-muted/70">
        Importing to the shared library needs the admin passcode.
      </p>
    </div>
  );
}
