"use client";

import { use } from "react";
import { HostConsole } from "@/components/HostConsole";
import { A11yProvider } from "@/components/A11yProvider";

// The single Facilitator portal. It opens in the reliable live cockpit and keeps
// planning/settings as an in-place view over the same auth and state subscription.
export default function FacilitatePage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return (
    <A11yProvider>
      <HostConsole
        apiBase={`/api/r/${p.room}`}
        roomName={`Room ${p.room}`}
        initialSurface="live"
      />
    </A11yProvider>
  );
}
