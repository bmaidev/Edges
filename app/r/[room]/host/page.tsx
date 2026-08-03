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
      <HostConsole apiBase={`/api/r/${p.room}`} roomName={`Room ${p.room}`} />
    </A11yProvider>
  );
}
