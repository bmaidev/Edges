"use client";

import { use, useEffect, useState } from "react";
import { LobbyScreen } from "@/components/LobbyScreen";
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
  const [title, setTitle] = useState<string | undefined>(undefined);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/r/${p.room}`);
    fetch(`/api/r/${p.room}/state?role=projector`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setBranding(d.branding ?? null);
        setTitle(d.topic ?? undefined);
      })
      .catch(() => {});
  }, [p.room]);

  // Static door variant: same lobby surface as the projector, but no live count
  // (this page fetches once and doesn't poll — a "live" number would freeze).
  return (
    <LobbyScreen
      variant="portrait"
      branding={branding}
      title={title}
      joinUrl={joinUrl}
      present={0}
      countVisible={false}
      timerEndsAt={null}
    />
  );
}
