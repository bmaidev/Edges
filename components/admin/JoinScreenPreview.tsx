"use client";

import { QRCodeSVG } from "qrcode.react";
import type { ThemeDraft } from "./ThemePanel";

// A faithful, palette-accurate preview of what attendees see at the door
// (mirrors /r/[room]/qr): logo · headline · QR · tagline, rendered with the
// draft palette via inline styles (so it doesn't depend on the room layout's
// CSS-var injection). What the facilitator brands here is what the room sees.
export function JoinScreenPreview({
  theme,
  joinUrl,
  title,
}: {
  theme: ThemeDraft;
  joinUrl?: string;
  title?: string;
}) {
  const p = theme.palette;
  return (
    <div
      className="rounded-xl border p-5"
      style={{ backgroundColor: p.bg, borderColor: p.border, color: "#fff" }}
    >
      <p className="text-[10px] uppercase tracking-wide" style={{ color: p.muted }}>
        What people see at the door
      </p>
      <div className="mt-4 flex flex-col items-center gap-3 text-center">
        {theme.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={theme.logoUrl}
            alt=""
            className="max-h-16 max-w-[55%] object-contain"
          />
        )}
        <p className="font-display text-xl font-semibold leading-tight">
          {theme.headline || title || "Scan to join"}
        </p>
        <span className="rounded-xl bg-white p-2">
          <QRCodeSVG value={joinUrl || "https://edges.example/r/preview"} size={92} />
        </span>
        <p className="max-w-[16rem] text-xs leading-relaxed" style={{ color: p.muted }}>
          {theme.tagline || "No app, no code — just pick a name, or stay anonymous."}
        </p>
      </div>
    </div>
  );
}
