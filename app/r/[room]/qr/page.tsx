"use client";

import { use, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { RoomBranding } from "@/lib/types";

// Standalone full-screen join QR for a room — for the door, a side screen, or
// printing. It only shows the PUBLIC participant join link (/r/<room>), so it
// needs no passcode. Workshop members scan, pick a name (or stay anonymous),
// and they're in. Per-room branding (logo + custom copy + colours) is applied —
// colours come from the room layout's CSS variables; logo/copy are fetched here.
export default function RoomQrPage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  const p = params instanceof Promise ? use(params) : params;
  const [joinUrl, setJoinUrl] = useState("");
  const [branding, setBranding] = useState<RoomBranding | null>(null);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/r/${p.room}`);
    fetch(`/api/r/${p.room}/state?role=projector`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBranding(d.branding ?? null))
      .catch(() => {});
  }, [p.room]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-10 text-center">
      {branding?.logoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={branding.logoUrl}
          alt=""
          className="max-h-32 max-w-[60vw] object-contain"
        />
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-white">
        {branding?.headline || "Scan to join"}
      </h1>
      <div className="rounded-3xl bg-white p-8">
        {joinUrl ? (
          <QRCodeSVG value={joinUrl} size={320} />
        ) : (
          <div className="h-[320px] w-[320px]" />
        )}
      </div>
      <p className="break-all font-mono text-lg text-muted">{joinUrl}</p>
      <p className="max-w-md text-base text-muted">
        {branding?.tagline ||
          "No app and no passcode — just pick a name, or stay anonymous. Your raw notes are only ever seen by the facilitators."}
      </p>
    </main>
  );
}
