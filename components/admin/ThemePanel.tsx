"use client";

import { useState } from "react";

import { ContrastStrip } from "@/components/admin/ContrastStrip";

export const PALETTE_KEYS = ["bg", "surface", "accent", "muted", "border"] as const;
export const PALETTE_DEFAULTS: Record<string, string> = {
  bg: "#0F1A35",
  surface: "#1A2247",
  accent: "#E8B14A",
  muted: "#A8ADE9",
  border: "#2A3454",
};
const PALETTE_LABELS: Record<string, string> = {
  bg: "Background",
  surface: "Cards",
  accent: "Highlight",
  muted: "Secondary text",
  border: "Lines",
};

export interface ThemeDraft {
  palette: Record<string, string>;
  logoUrl: string;
  headline: string;
  tagline: string;
}

export const EMPTY_THEME: ThemeDraft = {
  palette: { ...PALETTE_DEFAULTS },
  logoUrl: "",
  headline: "",
  tagline: "",
};

// Is a draft different from the defaults (so the parent knows whether to PATCH)?
export function themeIsCustom(t: ThemeDraft): boolean {
  return Boolean(
    t.logoUrl.trim() ||
      t.headline.trim() ||
      t.tagline.trim() ||
      PALETTE_KEYS.some((k) => t.palette[k] !== PALETTE_DEFAULTS[k]),
  );
}

// Serialize a draft into the RoomTheme shape the PATCH endpoint expects.
export function themeForPatch(t: ThemeDraft) {
  return {
    palette: t.palette,
    logoUrl: t.logoUrl.trim() || undefined,
    headline: t.headline.trim() || undefined,
    tagline: t.tagline.trim() || undefined,
  };
}

// A controlled branding editor — palette pickers + logo upload + headline +
// tagline. Owns no save; the parent (RoomCard or the wizard) decides what to do
// with the draft. Extracted from RoomCard so both reuse one implementation.
export function ThemePanel({
  code,
  value,
  onChange,
}: {
  code: string;
  value: ThemeDraft;
  onChange: (next: ThemeDraft) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/upload?code=${encodeURIComponent(code)}`, {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (res.ok && d.url) onChange({ ...value, logoUrl: d.url });
      else setUploadErr(d.error ?? "Upload failed.");
    } catch {
      setUploadErr("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {PALETTE_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <input
              type="color"
              value={value.palette[k]}
              onChange={(e) =>
                onChange({ ...value, palette: { ...value.palette, [k]: e.target.value } })
              }
            />
            {PALETTE_LABELS[k]}
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...value, palette: { ...PALETTE_DEFAULTS } })}
          className="text-xs text-muted underline"
        >
          Reset colours
        </button>
      </div>

      {/* D2 — live AA contrast read-out for the chosen palette (advisory). */}
      <ContrastStrip palette={value.palette} />

      <div className="flex items-center gap-3">
        {value.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={value.logoUrl}
            alt="logo preview"
            className="h-12 w-12 shrink-0 rounded-lg border border-border object-contain"
          />
        )}
        <div className="flex flex-1 flex-col gap-1">
          <input
            value={value.logoUrl}
            onChange={(e) => onChange({ ...value, logoUrl: e.target.value })}
            placeholder="Logo image URL (or upload below)"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
              className="text-xs file:mr-2 file:rounded file:border-0 file:bg-accent/20 file:px-2 file:py-1 file:text-accent"
            />
            {uploading && <span>Uploading…</span>}
            {value.logoUrl && !uploading && <span className="text-accent">✓ set</span>}
          </label>
          {uploadErr && <span className="text-xs text-[#ff8a8a]">{uploadErr}</span>}
        </div>
      </div>

      <input
        value={value.headline}
        onChange={(e) => onChange({ ...value, headline: e.target.value })}
        placeholder="Big headline — e.g. “Welcome, beautiful nerds 🛸”"
        maxLength={80}
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <input
        value={value.tagline}
        onChange={(e) => onChange({ ...value, tagline: e.target.value })}
        placeholder="Tagline / surprise line under the QR"
        maxLength={140}
        className="rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
    </div>
  );
}
