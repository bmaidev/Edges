"use client";

import { use } from "react";
import { HostConsole } from "@/components/HostConsole";
import { A11yProvider } from "@/components/A11yProvider";

// C1 — the Facilitate cockpit is a MODE of the host console (same auth, same
// poll, same authoritative-apply cmd path), so privacy + role gating are
// inherited by construction. Opt in via this route; HostConsole renders the
// cockpit instead of the tabbed console.
export default function FacilitatePage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const p = use(params);
  return (
    <A11yProvider>
      <HostConsole apiBase={`/api/r/${p.room}`} roomName={`Room ${p.room}`} cockpit />
    </A11yProvider>
  );
}
