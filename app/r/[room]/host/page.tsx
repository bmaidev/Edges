"use client";

import { use } from "react";
import { HostConsole } from "@/components/HostConsole";
import { A11yProvider } from "@/components/A11yProvider";

export default function HostPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return (
    <A11yProvider>
      {/* Compatibility alias: old Host bookmarks now open the same single
          Facilitator portal and reliable live cockpit as /facilitate. */}
      <HostConsole
        apiBase={`/api/r/${p.room}`}
        roomName={`Room ${p.room}`}
        initialSurface="live"
      />
    </A11yProvider>
  );
}
