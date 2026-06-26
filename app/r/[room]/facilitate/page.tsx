"use client";

import { use } from "react";
import { HostConsole } from "@/components/HostConsole";

// C1 — the Facilitate cockpit is a MODE of the host console (same auth, same
// poll, same authoritative-apply cmd path), so privacy + role gating are
// inherited by construction. Opt in via this route; HostConsole renders the
// cockpit instead of the tabbed console.
export default function FacilitatePage({
  params,
}: {
  params: Promise<{ room: string }> | { room: string };
}) {
  const p = params instanceof Promise ? use(params) : params;
  return (
    <HostConsole apiBase={`/api/r/${p.room}`} roomName={`Room ${p.room}`} cockpit />
  );
}
